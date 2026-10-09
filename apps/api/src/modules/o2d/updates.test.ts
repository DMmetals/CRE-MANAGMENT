import { describe, it, expect, vi } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { O2DHeaderMap } from './headers.js';
import { mapO2DRows, type O2DSnapshot } from './repository.js';
import { O2DUpdateService } from './updates.js';
const env = parseEnv({ NODE_ENV: 'test', ENABLE_SHEET_WRITES: 'false' });
function fixture() {
  const values = [
    ['Sr no', 'Enquiry No.', 'SKU', 'Payment Terms', 'Balance Qty', 'Nos'],
    ['1', 'C/1/26-27', 'A', 'Advance', '10', ''],
  ];
  const snapshot: O2DSnapshot = {
    branch: 'FBD',
    source: {
      id: 'test-only',
      tab: 'FBD',
      header: 1,
      sheetId: 0,
      rowCount: 100,
    },
    values,
    formulas: [
      values[0]!.map((v, i) => (i === 4 ? '=ARRAYFORMULA(A2:A)' : v)),
      [...values[1]!],
    ],
    headerMap: new O2DHeaderMap(values[0]!),
    rows: [],
    protectedRanges: [],
    sheets: [{ sheetId: 0, title: 'FBD', gridProperties: { rowCount: 100 } }],
  };
  snapshot.rows = mapO2DRows(snapshot);
  const row = snapshot.rows[0]!;
  return {
    snapshot,
    update: {
      id: row.id,
      version: row.version,
      enquiryNo: row.enquiryNo,
      srNo: row.srNo,
      changes: [{ column: 4, value: '30 days' }],
    },
  };
}
describe('O2D cell updates', () => {
  it('denies writes with the switch off before reading the repository', async () => {
    const repository = { load: vi.fn(), commit: vi.fn() };
    await expect(
      new O2DUpdateService(env, repository).update('FBD', [fixture().update]),
    ).rejects.toMatchObject({ code: 'SHEET_WRITES_DISABLED' });
    expect(repository.load).not.toHaveBeenCalled();
  });
  it('batches permitted cells with audit while returning protected fields', async () => {
    const { snapshot, update } = fixture();
    const repository = {
      load: vi.fn().mockResolvedValue(snapshot),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    const result = await new O2DUpdateService(
      { ...env, ENABLE_SHEET_WRITES: 'true' },
      repository,
    ).update('FBD', [
      { ...update, changes: [...update.changes, { column: 5, value: 999 }] },
    ]);
    expect(result.updatedRows).toBe(1);
    expect(result.protectedFields[0]).toContain('Balance Qty');
    expect(repository.commit).toHaveBeenCalledTimes(1);
    const requests = repository.commit.mock.calls[0]![1] as {
      updateCells?: { start: { columnIndex: number; sheetId: number } };
    }[];
    expect(
      requests
        .filter((r) => r.updateCells?.start.sheetId === snapshot.source.sheetId)
        .map((r) => r.updateCells!.start.columnIndex),
    ).toEqual([3]);
  });
  it('revalidates enquiry and serial identity and detects concurrent changes', async () => {
    const { snapshot, update } = fixture();
    const changed = {
      ...snapshot,
      rows: snapshot.rows.map((r) => ({ ...r, version: 'changed' })),
    };
    const repository = {
      load: vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockResolvedValueOnce(changed),
      commit: vi.fn(),
    };
    await expect(
      new O2DUpdateService(
        { ...env, ENABLE_SHEET_WRITES: 'true' },
        repository,
      ).update('FBD', [update]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('does not retarget a moved material row or permit identity edits', async () => {
    const { snapshot, update } = fixture();
    const repository = {
      load: vi.fn().mockResolvedValue(snapshot),
      commit: vi.fn(),
    };
    const service = new O2DUpdateService(
      { ...env, ENABLE_SHEET_WRITES: 'true' },
      repository,
    );
    await expect(
      service.update('FBD', [{ ...update, srNo: '2' }]),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    await expect(
      service.update('FBD', [
        { ...update, changes: [{ column: 2, value: 'C/other' }] },
      ]),
    ).rejects.toMatchObject({ code: 'FIELD_READ_ONLY' });
    expect(repository.commit).not.toHaveBeenCalled();
  });
});
