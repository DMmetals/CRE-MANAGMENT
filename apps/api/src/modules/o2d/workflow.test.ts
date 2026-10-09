import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dateInputValue, dateSerial } from '@cre/shared';
import { parseEnv } from '../../config/env.js';
import { O2DValidationReader, resolveWorkflowFields } from './workflow.js';
import { workflowFixture } from './workflow-fixture.js';
import { mapO2DRows } from './repository.js';
import { O2DUpdateService } from './updates.js';
const request = vi.hoisted(() => vi.fn());
vi.mock('../google/auth.js', () => ({ createGoogleAuth: () => ({ request }) }));
const env = parseEnv({ NODE_ENV: 'test', ENABLE_SHEET_WRITES: 'true' });
beforeEach(() => request.mockReset());
const list = (...values: string[]) => ({
  condition: {
    type: 'ONE_OF_LIST',
    values: values.map((userEnteredValue) => ({ userEnteredValue })),
  },
});
const grid = (data: unknown[]) => ({ data: { sheets: [{ data }] } });
describe('section-aware workflow metadata', () => {
  it.each(['FBD', 'MUM'] as const)(
    'maps actual sections independently of repeated headers in %s',
    (branch) => {
      const { snapshot } = workflowFixture(branch),
        fields = resolveWorkflowFields(snapshot);
      expect(fields.receiptPlanned.letter).toBe('W');
      expect(fields.step2Planned.letter).toBe('AB');
      expect(fields.step2Actual.letter).toBe('AC');
      expect(fields.orderVerification.letter).toBe('AD');
      expect(fields.step3Planned.letter).toBe('AF');
      expect(fields.crdd.letter).toBe('AL');
      snapshot.values[0]![27] = '';
      expect(() => resolveWorkflowFields(snapshot)).toThrow('Step 2');
    },
  );
  it('loads exact validation options and follows ONE_OF_RANGE without dropping extra values', async () => {
    const { snapshot } = workflowFixture();
    request
      .mockResolvedValueOnce(
        grid([
          {
            startRow: 6,
            startColumn: 33,
            rowData: [
              {
                values: [
                  {
                    dataValidation: list('Approved', 'Custom hold', 'Rejected'),
                  },
                  { dataValidation: list('Exact A', 'Exact B') },
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
          {
            startRow: 6,
            startColumn: 38,
            rowData: [
              {
                values: [
                  {
                    dataValidation: list(
                      'Approved',
                      'Hold',
                      'Cancelled',
                      'Extra approval',
                    ),
                  },
                ],
              },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce({
        data: {
          values: [
            ['Material In Stock (MUM)'],
            ['Special stock'],
            ['POP'],
            ['POP'],
            [''],
          ],
        },
      });
    const result = await new O2DValidationReader(env).read(snapshot);
    expect(result.dropdowns.materialStatus).toEqual([
      'Material In Stock (MUM)',
      'Special stock',
      'POP',
    ]);
    expect(result.dropdowns.termsCondition).toEqual([
      'Approved',
      'Custom hold',
      'Rejected',
    ]);
    expect(result.dropdowns.orderVerification).toEqual(['Verified', 'CANCEL']);
    expect(result.dropdownSources.materialStatus).toBe('sheet');
    expect(result.warnings).toEqual([]);
    expect(decodeURIComponent(request.mock.calls[0]![0].url)).toContain(
      "'Actual+FBD+tab'!AH7:AH100",
    );
    expect(decodeURIComponent(request.mock.calls[1]![0].url)).toContain(
      "'Options'!A2:A",
    );
  });
  it('uses supplied defaults only when validation is absent, never when Google fails', async () => {
    request.mockResolvedValueOnce(grid([]));
    const { snapshot } = workflowFixture();
    const reader = new O2DValidationReader(env);
    const result = await reader.read(snapshot);
    expect(result.dropdownSources.materialStatus).toBe('supplied-default');
    expect(result.dropdowns.materialStatus).toHaveLength(8);
    request.mockRejectedValueOnce(new Error('network'));
    await expect(reader.read(snapshot)).rejects.toMatchObject({
      code: 'O2D_VALIDATION_UNAVAILABLE',
    });
  });
  it('prefers exact-row rules and rejects ambiguous column rules for an unconfigured row', async () => {
    const { snapshot } = workflowFixture();
    request.mockResolvedValue(
      grid([
        {
          startRow: 6,
          startColumn: 33,
          rowData: [
            { values: [{ dataValidation: list('First') }] },
            { values: [{ dataValidation: list('Second') }] },
          ],
        },
      ]),
    );
    const reader = new O2DValidationReader(env);
    expect((await reader.read(snapshot, 8)).dropdowns.termsCondition).toEqual([
      'Second',
    ]);
    await expect(reader.read(snapshot, 9)).rejects.toMatchObject({
      code: 'O2D_VALIDATION_AMBIGUOUS',
    });
  });
});
describe('workflow writes', () => {
  function setup() {
    const { snapshot, workflow } = workflowFixture();
    const repository = {
      load: vi.fn().mockResolvedValue(snapshot),
      workflow: vi.fn().mockResolvedValue(workflow),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    const row = snapshot.rows[0]!;
    return {
      snapshot,
      workflow,
      repository,
      service: new O2DUpdateService(env, repository),
      input: {
        id: row.id,
        version: row.version,
        enquiryNo: row.enquiryNo,
        srNo: row.srNo,
        changes: [] as { column: number; value: string }[],
      },
    };
  }
  it('writes only changed manual cells, dates as numeric dates, and all named audit actions', async () => {
    const { snapshot, repository, service, input } = setup();
    await service.update('FBD', [
      {
        ...input,
        changes: [
          { column: 30, value: 'Verified' },
          { column: 34, value: 'Approved' },
          { column: 35, value: 'Hold' },
          { column: 36, value: 'POP' },
          { column: 37, value: 'LOT123, LOT456' },
          { column: 38, value: '2026-10-08' },
          { column: 39, value: 'Cancelled' },
          { column: 17, value: '999' },
        ],
      },
    ]);
    const requests = repository.commit.mock.calls[0]![1];
    const cells = requests.filter(
      (r: { updateCells?: { start: { sheetId: number } } }) =>
        r.updateCells?.start.sheetId === 0,
    );
    expect(
      cells.map(
        (r: {
          updateCells: { start: { columnIndex: number; rowIndex: number } };
        }) => [r.updateCells.start.rowIndex, r.updateCells.start.columnIndex],
      ),
    ).toEqual([29, 33, 34, 35, 36, 37, 38].map((c) => [6, c]));
    expect(cells[5].updateCells.rows[0].values[0]).toEqual({
      userEnteredValue: { numberValue: dateSerial('2026-10-08') },
      userEnteredFormat: {
        numberFormat: { type: 'DATE', pattern: 'dd/MM/yyyy' },
      },
    });
    const serialized = JSON.stringify(requests);
    for (const action of [
      'UPDATE_ORDER_VERIFICATION',
      'UPDATE_TERMS_CONDITION',
      'UPDATE_SIZE_RATE_APPROVAL',
      'UPDATE_MATERIAL_STATUS',
      'UPDATE_LOT_NO',
      'UPDATE_CRDD',
      'UPDATE_PO_APPROVAL_STATUS',
    ])
      expect(serialized).toContain(action);
    expect(serialized).toContain('local-development-user');
    expect(serialized).toContain('FBD');
    expect(snapshot.formulas[5]![16]).toContain('ARRAYFORMULA');
  });
  it('rejects invalid dropdown options, invalid dates and raw PO link edits', async () => {
    const { repository, service, input } = setup();
    for (const [column, value, code] of [
      [30, 'approved', 'OPTION_INVALID'],
      [34, 'arbitrary', 'OPTION_INVALID'],
      [38, '2026-02-30', 'DATE_INVALID'],
      [25, 'https://example.com', 'FIELD_READ_ONLY'],
    ] as const) {
      await expect(
        service.update('FBD', [{ ...input, changes: [{ column, value }] }]),
      ).rejects.toMatchObject({ code });
    }
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('revalidates Sheet options immediately before writing', async () => {
    const { repository, workflow, service, input } = setup();
    repository.workflow
      .mockResolvedValueOnce(workflow)
      .mockResolvedValueOnce({
        ...workflow,
        dropdowns: { ...workflow.dropdowns, termsCondition: ['Different'] },
      });
    await expect(
      service.update('FBD', [
        { ...input, changes: [{ column: 34, value: 'Approved' }] },
      ]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('detects new formulas before committing a dropdown edit', async () => {
    const { repository, snapshot, service, input } = setup();
    const latest = structuredClone({ ...snapshot, headerMap: undefined });
    const changed = { ...latest, headerMap: snapshot.headerMap };
    changed.formulas[6]![33] = '=IF(A7, "Approved", "")';
    changed.rows = mapO2DRows(changed);
    repository.load
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(changed);
    await expect(
      service.update('FBD', [
        { ...input, changes: [{ column: 34, value: 'Approved' }] },
      ]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
});
describe('calendar dates', () => {
  it('round-trips Indian formatted dates and Sheets serials without timezone drift', () => {
    expect(dateInputValue('08/10/2026')).toBe('2026-10-08');
    expect(dateInputValue(String(dateSerial('2026-10-08')))).toBe('2026-10-08');
    expect(dateSerial('2026-02-30')).toBeNull();
    expect(dateInputValue('30/02/2026')).toBe('');
    expect(dateSerial('2024-02-29')).not.toBeNull();
  });
});
