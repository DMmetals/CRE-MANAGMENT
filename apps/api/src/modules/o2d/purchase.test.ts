import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dateSerial } from '@cre/shared';
import { parseEnv } from '../../config/env.js';
import { O2DUpdateService } from './updates.js';
import { purchaseFixture } from './purchase-fixture.js';
import { mapO2DRows } from './repository.js';
import { O2DPurchaseReader, purchaseTimestamp } from './purchase.js';
import { O2DValidationReader } from './workflow.js';

const googleRequest = vi.hoisted(() => vi.fn());
vi.mock('../google/auth.js', () => ({
  createGoogleAuth: () => ({ request: googleRequest }),
}));
beforeEach(() => googleRequest.mockReset());
const env = parseEnv({ NODE_ENV: 'test', ENABLE_SHEET_WRITES: 'true' });
const instant = new Date('2026-10-08T20:00:00Z');
function setup(branch: 'FBD' | 'MUM' = 'FBD') {
  const { snapshot, settings, workflow } = purchaseFixture(branch);
  const commit = vi.fn(async (_snapshot, requests) => {
    for (const { updateCells } of requests) {
      if (!updateCells || updateCells.start.sheetId !== 0) continue;
      const { rowIndex, columnIndex } = updateCells.start;
      const value = updateCells.rows[0].values[0].userEnteredValue;
      const saved = String(value.numberValue ?? value.stringValue);
      snapshot.values[rowIndex]![columnIndex] = saved;
      snapshot.formulas[rowIndex]![columnIndex] = saved;
    }
    snapshot.rows = mapO2DRows(snapshot);
  });
  const repository = {
    load: vi.fn(async () => snapshot),
    purchase: vi.fn(async () => settings),
    workflow: vi.fn(async () => workflow),
    commit,
  };
  const service = new O2DUpdateService(env, repository, () => instant);
  const input = (changes: { column: number; value: string | number }[]) => {
    const row = snapshot.rows[1]!;
    return {
      id: row.id,
      version: row.version,
      enquiryNo: row.enquiryNo,
      srNo: row.srNo,
      sku: row.sku,
      context: 'purchase' as const,
      changes,
    };
  };
  return { snapshot, settings, repository, service, input };
}
describe('Purchase exact-row workflow', () => {
  it.each(['FBD', 'MUM'] as const)(
    'saves only SR 2 / SKU-2, with dates and one-time Actuals in %s',
    async (branch) => {
      const { snapshot, service, input, repository } = setup(branch);
      const before = structuredClone(snapshot.values);
      const formulas = [...snapshot.formulas[7]!];
      await service.update(branch, [
        input([
          { column: 49, value: '2026-10-08' },
          { column: 50, value: '2026-10-09' },
          { column: 51, value: '2026-10-10' },
          { column: 52, value: '2026-10-11' },
          { column: 43, value: 'Approved' },
          { column: 47, value: 'Verified' },
          { column: 55, value: 'Approved' },
          { column: 68, value: 'Closed' },
        ]),
      ]);
      expect(snapshot.values[6]).toEqual(before[6]);
      expect(snapshot.values[8]).toEqual(before[8]);
      for (const col of [42, 46, 54, 69])
        expect(Number(snapshot.values[7]![col - 1])).toBe(
          purchaseTimestamp(instant, 'Asia/Calcutta'),
        );
      expect(
        snapshot.rows[1]!.fields.find((f) => f.column === 49)!.inputValue,
      ).toBe('2026-10-08');
      for (const col of [41, 44, 45, 48])
        expect(snapshot.formulas[7]![col - 1]).toBe(formulas[col - 1]);
      expect(snapshot.values[7]![135]).toBe('09/10/2026');
      expect(snapshot.values[7]![57]).toBe(''); // Step 9 Actual never set by ordinary Save.
      expect(snapshot.values[7]![58]).toBe(''); // No fake PDF link.
      const savedActual = snapshot.values[7]![41];
      await service.update(branch, [
        input([
          { column: 43, value: 'Hold' },
          { column: 49, value: '2026-10-12' },
        ]),
      ]);
      expect(snapshot.values[7]![41]).toBe(savedActual);
      expect(repository.commit).toHaveBeenCalledTimes(2);
    },
  );
  it('preserves existing Actuals, blank dates, unedited cells and exact final option spelling', async () => {
    const { snapshot, service, input } = setup();
    snapshot.values[7]![41] = '01/10/2026 12:00:00';
    snapshot.values[7]![49] = '09/10/2026';
    snapshot.formulas[7]![49] = String(dateSerial('2026-10-09'));
    snapshot.rows = mapO2DRows(snapshot);
    await service.update('FBD', [
      input([
        { column: 43, value: 'Approved' },
        { column: 50, value: '' },
        { column: 68, value: "Excess sold with buyer's consent" },
      ]),
    ]);
    expect(snapshot.values[7]![41]).toBe('01/10/2026 12:00:00');
    expect(snapshot.values[7]![49]).toBe('');
    expect(snapshot.values[7]![50]).toBe('');
    expect(snapshot.values[7]![67]).toBe("Excess sold with buyer's consent");
  });
  it('does not replace an Actual formula and rejects a protected non-formula Actual atomically', async () => {
    const { snapshot, service, input, repository } = setup();
    snapshot.formulas[7]![41] = '=IF(AQ8<>"",NOW(),"")';
    snapshot.rows = mapO2DRows(snapshot);
    await service.update('FBD', [input([{ column: 43, value: 'Approved' }])]);
    expect(snapshot.formulas[7]![41]).toBe('=IF(AQ8<>"",NOW(),"")');
    snapshot.protectedRanges = [
      {
        range: {
          sheetId: 0,
          startRowIndex: 7,
          endRowIndex: 8,
          startColumnIndex: 45,
          endColumnIndex: 46,
        },
        requestingUserCanEdit: false,
      },
    ];
    snapshot.rows = mapO2DRows(snapshot);
    repository.commit.mockClear();
    await expect(
      service.update('FBD', [input([{ column: 47, value: 'Verified' }])]),
    ).rejects.toMatchObject({ code: 'PURCHASE_ACTUAL_PROTECTED' });
    expect(repository.commit).not.toHaveBeenCalled();
    expect(snapshot.values[7]![46]).toBe('');
  });
  it('requires all three identity fields and rejects stale versions and another SKU', async () => {
    const { service, input, repository } = setup();
    const change = input([{ column: 49, value: '2026-10-08' }]);
    await expect(
      service.update('FBD', [{ ...change, sku: undefined }]),
    ).rejects.toMatchObject({ code: 'SKU_REQUIRED' });
    await expect(
      service.update('FBD', [{ ...change, sku: 'SKU-1' }]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    await expect(
      service.update('FBD', [{ ...change, version: 'old' }]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('rejects manual Step 9 Actual/link writes and invalid date/status values', async () => {
    const { service, input, repository } = setup();
    for (const column of [42, 46, 53, 54, 57, 58, 59, 60, 61, 62, 69])
      await expect(
        service.update('FBD', [input([{ column, value: 'manual' }])]),
      ).rejects.toMatchObject({ code: 'FIELD_READ_ONLY' });
    await expect(
      service.update('FBD', [input([{ column: 49, value: '2026-02-30' }])]),
    ).rejects.toMatchObject({ code: 'DATE_INVALID' });
    await expect(
      service.update('FBD', [input([{ column: 68, value: 'closed' }])]),
    ).rejects.toMatchObject({ code: 'OPTION_INVALID' });
    await expect(
      service.update('FBD', [input([{ column: 55, value: 'made up' }])]),
    ).rejects.toMatchObject({ code: 'OPTION_INVALID' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('does not timestamp unchanged statuses, reopening or an unrelated save', async () => {
    const { snapshot, service, input, repository } = setup();
    snapshot.values[7]![42] = 'Approved';
    snapshot.rows = mapO2DRows(snapshot);
    await service.update('FBD', [input([{ column: 43, value: 'Approved' }])]);
    expect(repository.commit).not.toHaveBeenCalled();
    await service.update('FBD', [input([{ column: 49, value: '2026-10-08' }])]);
    expect(snapshot.values[7]![41]).toBe('');
    expect(snapshot.values[7]![57]).toBe('');
  });
  it('detects changed dropdowns before committing and surfaces write failures', async () => {
    const { settings, service, input, repository } = setup();
    repository.purchase.mockResolvedValueOnce(settings).mockResolvedValueOnce({
      ...settings,
      dropdowns: { ...settings.dropdowns, 55: ['Hold'] },
    });
    await expect(
      service.update('FBD', [input([{ column: 55, value: 'Approved' }])]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    expect(repository.commit).not.toHaveBeenCalled();
    repository.purchase.mockResolvedValue(settings);
    repository.commit.mockRejectedValueOnce(
      new Error('Google Sheets write failed'),
    );
    await expect(
      service.update('FBD', [input([{ column: 55, value: 'Approved' }])]),
    ).rejects.toThrow('Google Sheets write failed');
  });
  it('uses the spreadsheet timezone across midnight without shifting date-only values', () => {
    expect(purchaseTimestamp(instant, 'Asia/Calcutta')).toBe(
      dateSerial('2026-10-09')! + 1.5 / 24,
    );
    expect(purchaseTimestamp(instant, 'America/New_York')).toBe(
      dateSerial('2026-10-08')! + 16 / 24,
    );
  });
  it('uses Sheet validation including additional choices, and fails closed on read errors', async () => {
    const { snapshot, settings } = setup();
    const validation = new O2DValidationReader(env);
    const read = vi.spyOn(validation, 'readColumns').mockResolvedValue({
      55: [...settings.dropdowns[55]!, 'Additional approval'],
      68: [...settings.dropdowns[68]!, 'Additional final'],
    });
    const reader = new O2DPurchaseReader(env, validation);
    const result = await reader.read(snapshot, 8);
    expect(result.dropdowns[55]).toContain('Cancelled');
    expect(result.dropdowns[55]).toContain('Additional approval');
    expect(result.dropdowns[68]).toContain('Additional final');
    expect(result.dropdowns[66]).toContain('No Issues \u2013 Proceed');
    expect(result.dispatchLinkColumn).toBe(59);
    expect(result.columns).not.toContain(136);
    read.mockRejectedValueOnce(new Error('Validation unavailable'));
    await expect(reader.read(snapshot, 8)).rejects.toThrow(
      'Validation unavailable',
    );
  });
});

describe('Purchase Sheet validation binding', () => {
  const list = (...options: string[]) => ({
    condition: {
      type: 'ONE_OF_LIST',
      values: options.map((userEnteredValue) => ({ userEnteredValue })),
    },
  });
  it('uses the exact row validation, including a range-backed dropdown', async () => {
    const { snapshot } = purchaseFixture();
    googleRequest
      .mockResolvedValueOnce({
        data: {
          sheets: [
            {
              data: [
                {
                  startRow: 6,
                  startColumn: 42,
                  rowData: [
                    {
                      values: [
                        { dataValidation: list('Different SR1 option') },
                      ],
                    },
                    {
                      values: [
                        {
                          dataValidation: list('Approved', 'Custom SR2 option'),
                        },
                      ],
                    },
                    {
                      values: [
                        { dataValidation: list('Different SR3 option') },
                      ],
                    },
                  ],
                },
                {
                  startRow: 7,
                  startColumn: 67,
                  rowData: [
                    {
                      values: [
                        {
                          dataValidation: {
                            condition: {
                              type: 'ONE_OF_RANGE',
                              values: [{ userEnteredValue: "='Options'!A2:A" }],
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: { values: [['Closed'], ['Additional final'], ['']] },
      });
    const result = await new O2DValidationReader(env).readColumns(
      snapshot,
      8,
      [43, 68],
    );
    expect(result[43]).toEqual(['Approved', 'Custom SR2 option']);
    expect(result[68]).toEqual(['Closed', 'Additional final']);
    expect(googleRequest.mock.calls[1]![0].url).toContain(
      encodeURIComponent("'Options'!A2:A"),
    );
  });
  it('refuses ambiguous fallback rules or unavailable validation instead of inventing choices', async () => {
    const { snapshot } = purchaseFixture();
    googleRequest.mockResolvedValueOnce({
      data: {
        sheets: [
          {
            data: [
              {
                startRow: 6,
                startColumn: 42,
                rowData: [
                  { values: [{ dataValidation: list('SR1 only') }] },
                  { values: [{}] },
                  { values: [{ dataValidation: list('SR3 only') }] },
                ],
              },
            ],
          },
        ],
      },
    });
    const reader = new O2DValidationReader(env);
    await expect(reader.readColumns(snapshot, 8, [43])).rejects.toMatchObject({
      code: 'O2D_VALIDATION_AMBIGUOUS',
    });
    googleRequest.mockRejectedValueOnce(new Error('Network failure'));
    await expect(reader.readColumns(snapshot, 8, [43])).rejects.toMatchObject({
      code: 'O2D_VALIDATION_UNAVAILABLE',
    });
  });
});
