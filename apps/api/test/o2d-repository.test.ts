import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { O2DHeaderMap } from '../src/modules/o2d/headers.js';
import {
  isCellProtected,
  mapO2DRows,
  o2dRowId,
  type O2DSnapshot,
} from '../src/modules/o2d/repository.js';
import { O2DService } from '../src/modules/o2d/service.js';
const schema = JSON.parse(
  readFileSync(
    new URL('../../../docs/O2D_SCHEMA_SNAPSHOT.json', import.meta.url),
    'utf8',
  ),
).workbooks[0] as {
  header: string[];
  headerFormulas: { column: number; formula: string }[];
};
function fixture() {
  const values: string[][] = Array.from({ length: 6 }, () => []);
  values[5] = [...schema.header];
  const formulas = structuredClone(values);
  for (const cell of schema.headerFormulas)
    formulas[5]![cell.column - 1] = cell.formula;
  const source = {
    id: 'fixture-only',
    tab: 'FBD',
    sheetId: 0,
    header: 6,
    rowCount: 998,
  };
  const snapshot: O2DSnapshot = {
    branch: 'FBD',
    source,
    values,
    formulas,
    headerMap: new O2DHeaderMap(schema.header),
    rows: [],
    protectedRanges: [],
    sheets: [{ sheetId: 0, title: 'FBD', gridProperties: { rowCount: 998 } }],
  };
  return snapshot;
}
function addRow(snapshot: O2DSnapshot, enquiry = 'C/245/26-27', sr = '1') {
  const row = Array<string>(140).fill('');
  const put = (header: string, value: string, occurrence?: number) => {
    row[snapshot.headerMap.requireColumn(header, occurrence)] = value;
  };
  put('Enquiry No.', enquiry);
  put('Sr no', sr);
  put('Customer Name', 'Fixture customer');
  put('SKU', 'Fixture SKU');
  snapshot.values.push(row);
  snapshot.formulas.push([...row]);
  return { put, row };
}
describe('O2D physical header resolution', () => {
  it('keeps every physical column, duplicates, whitespace and the unnamed spacer', () => {
    const headers = fixture().headerMap;
    expect(headers.columns).toHaveLength(140);
    expect(headers.requireColumn('planned', 1)).toBe(22);
    expect(headers.requireColumn('  planned  ', 2)).toBe(27);
    expect(headers.requireColumn('Status', 2)).toBe(67);
    expect(headers.requireColumn('Invoice No.', 10)).toBe(136);
    expect(headers.requireColumn('Status', undefined, 'Dispatch')).toBe(67);
    expect(headers.columns[64]!.header).toBe('');
    expect(() => headers.findColumn('Status')).toThrow('occurs 2 times');
    expect(() => headers.findColumn('SKU', 0)).toThrow('positive integer');
  });
  it('fails closed when an invoice block changes rather than shifting values', () => {
    const changed = [...schema.header];
    changed[80] = 'Unexpected field';
    expect(() => new O2DHeaderMap(changed)).toThrow(
      'Invoice section header changed',
    );
    expect(() => new O2DHeaderMap(schema.header.slice(0, -1))).toThrow(
      'incomplete',
    );
  });
});
describe('O2D formulas and row identity', () => {
  it('protects header ARRAYFORMULA spill cells even when the register is empty', () => {
    const snapshot = fixture();
    expect(isCellProtected(snapshot, 6, 16)).toBe(true);
    expect(isCellProtected(snapshot, 400, 18)).toBe(true);
    expect(isCellProtected(snapshot, 900, 70)).toBe(true);
    expect(isCellProtected(snapshot, 6, 15)).toBe(false);
  });
  it('honors protected ranges, editable exceptions and warning-only protection', () => {
    const snapshot = fixture();
    snapshot.protectedRanges.push({
      range: { sheetId: 0 },
      requestingUserCanEdit: false,
      unprotectedRanges: [
        {
          sheetId: 0,
          startRowIndex: 6,
          endRowIndex: 7,
          startColumnIndex: 20,
          endColumnIndex: 21,
        },
      ],
    });
    expect(isCellProtected(snapshot, 6, 20)).toBe(false);
    expect(isCellProtected(snapshot, 7, 20)).toBe(true);
    snapshot.protectedRanges[0]!.warningOnly = true;
    expect(isCellProtected(snapshot, 7, 20)).toBe(false);
  });
  it('uses enquiry/Sr and physical row identity without inventing missing numeric values', () => {
    const snapshot = fixture();
    const { put } = addRow(snapshot);
    put('Invoice No.', 'INV-2', 2);
    put('Qty Dispatched', '7', 2);
    put('Order Qty', '1,000');
    snapshot.rows = mapO2DRows(snapshot);
    const row = snapshot.rows[0]!;
    expect(row.enquiryNo).toBe('C/245/26-27');
    expect(row.srNo).toBe('1');
    expect(row.qty).toBe(1000);
    expect(row).not.toHaveProperty('orderNo');
    expect(row.nos).toBeNull();
    expect(row.rate).toBeNull();
    expect(row.totalValue).toBeNull();
    expect(row.invoiceHistory).toHaveLength(10);
    expect(row.invoiceHistory[1]!.invoiceNo).toBe('INV-2');
    expect(row.invoiceHistory[1]!.qtyDispatched).toBe(7);
    expect(row.fields.find((f) => f.column === 17)?.protected).toBe(true);
    expect(row.fields.find((f) => f.header === 'Enquiry No.')?.editable).toBe(
      false,
    );
    expect(row.fields.find((f) => f.header === 'Payment Terms')?.editable).toBe(
      true,
    );
    expect(row.id).toBe(o2dRowId(snapshot.source, 7, row.enquiryNo, row.srNo));
    expect(row.id).not.toBe(
      o2dRowId(snapshot.source, 8, row.enquiryNo, row.srNo),
    );
  });
  it('reports unique enquiries and identity collisions using real snapshot rows', async () => {
    const snapshot = fixture();
    addRow(snapshot);
    addRow(snapshot, 'C/245/26-27', '2');
    addRow(snapshot, 'N/88/26-27', '1');
    snapshot.rows = mapO2DRows(snapshot);
    const repo = { load: vi.fn().mockResolvedValue(snapshot), commit: vi.fn() };
    const service = new O2DService(
      parseEnv({ NODE_ENV: 'test', ENABLE_SHEET_WRITES: 'false' }),
      repo,
    );
    const result = await service.list('FBD');
    expect(result.identityVerified).toBe(true);
    expect(result.kpis.totalOrders).toBe(2);
    expect(result.kpis.totalMaterials).toBe(3);
    expect(result.kpis.totalOrderQty).toBe(0);
    snapshot.rows.push({ ...snapshot.rows[0]! });
    expect((await service.list('FBD')).identityVerified).toBe(false);
    expect(repo.commit).not.toHaveBeenCalled();
  });
});
