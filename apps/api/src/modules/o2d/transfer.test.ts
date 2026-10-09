import { describe, expect, it, vi } from 'vitest';
import type { EnquiryMaterial, EnquiryType, O2DBranch } from '@cre/shared';
import { parseEnv } from '../../config/env.js';
import { O2DHeaderMap } from './headers.js';
import {
  mapO2DRows,
  type O2DRepository,
  type O2DSnapshot,
} from './repository.js';
import { O2DTransferService, type O2DTransferInput } from './transfer.js';
import { O2DSequenceService } from './sequence.js';
import { duplicateKey } from './duplicate.js';

const HEADERS = [
  'Sr no',
  'Enquiry No.',
  'Customer Name',
  'Sales Person',
  'Category',
  'PO Number',
  'PO Date',
  'SKU',
  'Thk',
  'Width',
  'Lgt',
  'Finish',
  'Grade',
  'Edge',
  'Nos',
  'Order Qty',
  'Balance Qty',
  'Order Rate',
  'Total Value',
  'LIMIT',
  'Payment Terms',
  'Order Receiving Date & Time',
  'Planned',
  'Actual',
  'PO PHOTO',
  'Rev PO Photo',
  'Time Delay',
  'Planned',
  'Actual',
  'Status',
  'Remarks/ Challenges',
];
const DESTINATIONS = {
  FBD: '1f0nOcCu4AaFl0DDzODv_mM8i4YYBaCD9lyixfd-DLyo',
  MUM: '1f9_splrR2pFkvtnLbKY2glGnidYMXxiSriNOJO6cH6A',
};
function fixture(
  type: EnquiryType = 'CRR',
  branch: O2DBranch = 'FBD',
  writes = false,
) {
  const enquiryNo = `${type === 'CRR' ? 'C' : 'N'}/245/26-27`;
  const input: O2DTransferInput = { type, branch, enquiryNo };
  const material: EnquiryMaterial = {
    id: 'material-1',
    rowNumber: 8,
    enquiryNo,
    date: '2026-10-01',
    customer: 'Fixture customer',
    salesPerson: 'Fixture salesperson',
    branch,
    state: '',
    purchaser: '',
    phone: '',
    email: '',
    materialType: 'Coil',
    sku: '3-1250-COIL-2B-304',
    edge: 'ME',
    qty: 999,
    orderQty: 10,
    orderDate: '2026-09-15',
    thickness: '3',
    width: '1250',
    length: 'COIL',
    finish: '2B',
    grade: '304',
    limit: '2',
    mode: 'Mail',
    rate: 174.5,
    status: 'Won',
    remarks: 'Validated',
    poNumber: 'PO-1',
    quoteUrl: null,
    orderId: '',
    updatedAt: '',
    version: 'source-v1',
  };
  const sourceRows = [material];
  const values: string[][] = [
    ...Array.from({ length: 5 }, () => [] as string[]),
    [...HEADERS],
  ];
  const formulas = structuredClone(values);
  let rowCount = 100;
  let protectedRanges: O2DSnapshot['protectedRanges'] = [];
  const snapshot = (): O2DSnapshot => {
    const result: O2DSnapshot = {
      branch,
      source: {
        id: DESTINATIONS[branch],
        tab: branch,
        header: 6,
        sheetId: 0,
        rowCount,
      },
      values: structuredClone(values),
      formulas: structuredClone(formulas),
      headerMap: new O2DHeaderMap(HEADERS),
      rows: [],
      protectedRanges: structuredClone(protectedRanges),
      sheets: [{ sheetId: 0, title: branch, gridProperties: { rowCount } }],
    };
    result.rows = mapO2DRows(result);
    return result;
  };
  const load = vi.fn(async () => snapshot());
  const commit = vi.fn(
    async (_snapshot: O2DSnapshot, requests: Record<string, unknown>[]) => {
      for (const request of requests) {
        if (request.appendDimension)
          rowCount += (request.appendDimension as { length: number }).length;
        if (!request.updateCells) continue;
        const update = request.updateCells as {
          start: { rowIndex: number; columnIndex: number };
          rows: {
            values: {
              userEnteredValue: { stringValue?: string; numberValue?: number };
            }[];
          }[];
        };
        const { rowIndex, columnIndex } = update.start;
        const cell = update.rows[0]!.values[0]!.userEnteredValue;
        values[rowIndex] ??= [];
        formulas[rowIndex] ??= [];
        values[rowIndex]![columnIndex] = String(
          cell.stringValue ?? cell.numberValue ?? '',
        );
        formulas[rowIndex]![columnIndex] = values[rowIndex]![columnIndex]!;
      }
    },
  );
  const enquiries = {
    findAll: vi.fn(async () => ({
      type,
      rows: structuredClone(sourceRows),
      fetchedAt: new Date().toISOString(),
    })),
  };
  const repository: O2DRepository = { load, commit };
  const env = parseEnv({
    NODE_ENV: 'test',
    ENABLE_SHEET_WRITES: writes ? 'true' : 'false',
  });
  const service = new O2DTransferService(env, enquiries, repository);
  const existing = (sr: string, sku = material.sku, enquiry = enquiryNo) => {
    const row = HEADERS.map(() => '');
    const fields: Record<string, string> = {
      'Sr no': sr,
      'Enquiry No.': enquiry,
      'Customer Name': material.customer,
      SKU: sku,
      Edge: material.edge,
      'Order Qty': String(material.orderQty),
      'PO Number': material.poNumber,
    };
    for (const [name, value] of Object.entries(fields))
      row[HEADERS.indexOf(name)] = value;
    values.push(row);
    formulas.push([...row]);
  };
  return {
    input,
    service,
    sourceRows,
    material,
    values,
    formulas,
    snapshot,
    load,
    commit,
    enquiries,
    existing,
    protect: (ranges: O2DSnapshot['protectedRanges']) => {
      protectedRanges = ranges;
    },
    resize: (count: number) => {
      rowCount = count;
    },
  };
}

describe('O2D transfer preview and validation', () => {
  it.each([
    ['CRR', 'FBD'],
    ['CRR', 'MUM'],
    ['NBD', 'FBD'],
    ['NBD', 'MUM'],
  ] as const)(
    'routes %s / %s by branch and preserves source category without writing',
    async (type, branch) => {
      const f = fixture(type, branch);
      const preview = await f.service.preview(f.input);
      expect(preview).toMatchObject({
        destination: branch,
        sheetName: branch,
        spreadsheetId: DESTINATIONS[branch],
        enquiryNo: f.input.enquiryNo,
        transferred: 1,
        skippedDuplicates: 0,
        srNos: [1],
      });
      expect(preview.rowsToInsert[0]!.fields).toMatchObject({
        Category: type,
        'Enquiry No.': f.input.enquiryNo,
        'Order Rate': 174.5,
        'Order Qty': 10,
        'Balance Qty': 10,
      });
      expect(preview.rowsToInsert[0]!.fields).not.toHaveProperty('Order No');
      expect(preview).not.toHaveProperty('orderNo');
      expect(f.commit).not.toHaveBeenCalled();
    },
  );
  it('leaves Nos, PO Date, Payment Terms, Total Value, enquiry Remarks and future workflow cells untouched', async () => {
    const f = fixture();
    const before = structuredClone(f.sourceRows);
    const preview = await f.service.preview(f.input);
    const fields = preview.rowsToInsert[0]!.fields;
    for (const field of [
      'Nos',
      'PO Date',
      'Payment Terms',
      'Total Value',
      'Remarks/ Challenges',
      'Planned',
      'Actual',
      'Status',
      'PO PHOTO',
    ])
      expect(fields).not.toHaveProperty(field);
    const timestamp = String(fields['Order Receiving Date & Time']);
    expect(Date.now() - Date.parse(timestamp)).toBeLessThan(5000);
    expect(timestamp).not.toBe(f.material.date);
    expect(f.sourceRows).toEqual(before);
  });
  it.each([
    ['poNumber', '', 'PO Number is required before transferring to O2D.'],
    ['remarks', '', 'Remarks are required before transferring to O2D.'],
  ] as const)(
    'rejects blank %s with the exact validation message',
    async (key, value, message) => {
      const f = fixture();
      f.material[key] = value;
      await expect(f.service.preview(f.input)).rejects.toMatchObject({
        statusCode: 400,
        message,
      });
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.load).not.toHaveBeenCalled();
    },
  );
  it('rejects non-Won direct calls and ignores Loss rows in mixed enquiries', async () => {
    const f = fixture();
    f.material.status = 'Loss';
    await expect(f.service.preview(f.input)).rejects.toMatchObject({
      statusCode: 400,
      code: 'NOT_WON',
    });
    f.sourceRows.push({
      ...f.material,
      id: 'won-2',
      sku: 'SKU-2',
      status: 'Won',
    });
    const preview = await f.service.preview(f.input);
    expect(preview.rowsToInsert.map((row) => row.sourceId)).toEqual(['won-2']);
  });
  it('derives the branch from FMS and only transfers eligible rows for that destination', async () => {
    const f = fixture();
    f.material.branch = 'MUM';
    await expect(f.service.preview(f.input)).rejects.toMatchObject({
      code: 'BRANCH_MISMATCH',
    });
    f.material.branch = 'Faridabad';
    f.sourceRows.push({ ...f.material, id: 'other-branch', branch: 'Mumbai' });
    f.sourceRows.push({ ...f.material, id: 'incomplete', remarks: '' });
    const preview = await f.service.preview(f.input);
    expect(preview.rowsToInsert.map((row) => row.sourceId)).toEqual([
      'material-1',
    ]);
    await expect(
      f.service.preview({ type: f.input.type, enquiryNo: f.input.enquiryNo }),
    ).rejects.toMatchObject({ code: 'MULTIPLE_BRANCHES' });
  });
  it.each([null, undefined])(
    'uses Qty when Order Qty is blank (%s)',
    async (orderQty) => {
      const f = fixture('CRR', 'FBD', true);
      f.material.branch = 'Faridabad';
      f.material.status = ' WON ';
      f.material.orderQty = orderQty;
      f.material.qty = 5000;
      const input = { type: f.input.type, enquiryNo: f.input.enquiryNo };
      const preview = await f.service.preview(input);
      expect(preview).toMatchObject({
        eligible: true,
        normalizedBranch: 'FBD',
        destination: 'FBD',
        blockingReasons: [],
      });
      expect(preview.rowsToInsert[0]!.fields).toMatchObject({
        'Order Qty': 5000,
        'Balance Qty': 5000,
        Category: 'CRR',
      });
      expect(preview.rowsToInsert[0]!.fields).not.toHaveProperty('Nos');
      expect(preview.materials[0]).toMatchObject({
        rawBranch: 'Faridabad',
        normalizedBranch: 'FBD',
        resolvedTransferQty: 5000,
      });
      await f.service.transfer({
        ...input,
        previewToken: preview.previewToken,
      });
      expect((await f.service.preview(input)).skippedDuplicates).toBe(1);
    },
  );
  it.each([0, -5, Number.NaN])(
    'does not replace a populated invalid Order Qty (%s)',
    async (orderQty) => {
      const f = fixture();
      f.material.orderQty = orderQty;
      await expect(f.service.preview(f.input)).rejects.toMatchObject({
        code: 'ORDER_QTY_REQUIRED',
      });
    },
  );
  it('rejects invalid text Order Qty, missing fallback Qty, and unsupported branches', async () => {
    const f = fixture();
    f.material.orderQty = null;
    f.material.orderQtyRaw = 'invalid';
    await expect(f.service.preview(f.input)).rejects.toMatchObject({
      code: 'ORDER_QTY_REQUIRED',
    });
    f.material.orderQtyRaw = '';
    f.material.qty = null;
    await expect(f.service.preview(f.input)).rejects.toMatchObject({
      code: 'ORDER_QTY_REQUIRED',
    });
    f.material.branch = 'XYZ';
    await expect(
      f.service.preview({ type: f.input.type, enquiryNo: f.input.enquiryNo }),
    ).rejects.toThrow('Unsupported branch: XYZ.');
  });
  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid quotation Rate (%s)',
    async (rate) => {
      const f = fixture();
      f.material.rate = rate;
      await expect(f.service.preview(f.input)).rejects.toMatchObject({
        code: 'ORDER_RATE_REQUIRED',
      });
    },
  );
  it('enforces the write gate while allowing previews', async () => {
    const f = fixture();
    await expect(f.service.preview(f.input)).resolves.toMatchObject({
      transferred: 1,
    });
    await expect(f.service.transfer(f.input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'SHEET_WRITES_DISABLED',
    });
    expect(f.commit).not.toHaveBeenCalled();
  });
});

describe('O2D safe batched transfer (synthetic repositories only)', () => {
  it('gives all materials the same enquiry and consecutive serials; repeat transfer skips every duplicate', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.sourceRows.push(
      { ...f.material, id: 'material-2', sku: 'SKU-B' },
      { ...f.material, id: 'material-3', sku: 'SKU-C' },
    );
    const preview = await f.service.preview(f.input);
    const result = await f.service.transfer({
      ...f.input,
      previewToken: preview.previewToken,
    });
    expect(result.srNos).toEqual([1, 2, 3]);
    expect(
      result.rowsToInsert.every(
        (row) => row.fields['Enquiry No.'] === f.input.enquiryNo,
      ),
    ).toBe(true);
    expect(f.commit).toHaveBeenCalledOnce();
    expect(
      f.commit.mock.calls[0]![1].some(
        (request) => 'insertDimension' in request,
      ),
    ).toBe(false);
    const repeated = await f.service.transfer(f.input);
    expect(repeated).toMatchObject({
      transferred: 0,
      skippedDuplicates: 3,
      srNos: [],
    });
    expect(f.commit).toHaveBeenCalledOnce();
  });
  it('continues Sr no from the existing enquiry maximum and does not count other enquiries', async () => {
    const f = fixture('NBD', 'MUM', true);
    f.existing('1', 'old-a');
    f.existing('3', 'old-b');
    f.existing('999', 'other', 'N/888/26-27');
    const result = await f.service.transfer(f.input);
    expect(result.srNos).toEqual([4]);
    f.sourceRows.push({ ...f.material, id: 'later', sku: 'later-sku' });
    expect(await f.service.transfer(f.input)).toMatchObject({
      transferred: 1,
      skippedDuplicates: 1,
      srNos: [5],
    });
  });
  it('skips duplicated signatures within the source request', async () => {
    const f = fixture();
    f.sourceRows.push({ ...f.material, id: 'duplicate-source' });
    expect(await f.service.preview(f.input)).toMatchObject({
      transferred: 1,
      skippedDuplicates: 1,
      srNos: [1],
    });
  });
  it('preserves header array formulas and derives initial balance without writing formula cells', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.formulas[5]![16] = '={"Balance Qty";ARRAYFORMULA(P7:P)}';
    f.formulas[5]![18] = '={"Total Value";ARRAYFORMULA(P7:P*R7:R*1.18)}';
    f.formulas[6] = [];
    f.formulas[6]![22] = '=IF(A7="","",NOW())';
    const result = await f.service.transfer(f.input);
    expect(result.rowsToInsert[0]!.rowNumber).toBe(7);
    expect(result.rowsToInsert[0]!.fields).not.toHaveProperty('Balance Qty');
    expect(result.protectedFields).toEqual(
      expect.arrayContaining(['Balance Qty', 'Total Value', 'Planned']),
    );
    expect(f.formulas[5]![16]).toContain('ARRAYFORMULA');
    expect(f.formulas[6]![22]).toContain('NOW()');
    expect(
      f.commit.mock.calls[0]![1].filter((r) => r.updateCells).every(
        (r) =>
          ![16, 18, 22].includes(
            (r.updateCells as { start: { columnIndex: number } }).start
              .columnIndex,
          ),
      ),
    ).toBe(true);
  });
  it('blocks a required formula cell and exposes protectedFields without writing', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.formulas[6] = [];
    f.formulas[6]![17] = '=100';
    await expect(f.service.transfer(f.input)).rejects.toMatchObject({
      code: 'O2D_FORMULA_PROTECTED',
      protectedFields: ['Order Rate'],
    });
    expect(f.commit).not.toHaveBeenCalled();
  });
  it('does not overwrite range protection or initialize blank protected balance without a formula', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.protect([
      {
        range: {
          sheetId: 0,
          startRowIndex: 6,
          endRowIndex: 7,
          startColumnIndex: 16,
          endColumnIndex: 17,
        },
        requestingUserCanEdit: false,
      },
    ]);
    await expect(f.service.transfer(f.input)).rejects.toMatchObject({
      code: 'O2D_FORMULA_PROTECTED',
      protectedFields: ['Balance Qty'],
    });
    expect(f.commit).not.toHaveBeenCalled();
  });
  it('appends after unrelated manual cells and leaves existing template formulas intact', async () => {
    const f = fixture();
    f.values[8] = [];
    f.formulas[8] = [];
    f.values[8]![30] = 'manual dispatch note';
    f.formulas[8]![30] = 'manual dispatch note';
    f.formulas[9] = [];
    f.formulas[9]![18] = '=P10*R10';
    expect((await f.service.preview(f.input)).rowsToInsert[0]!.rowNumber).toBe(
      10,
    );
  });
  it('extends grid capacity only when needed within the same batch', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.resize(6);
    await f.service.transfer(f.input);
    expect(f.commit.mock.calls[0]![1][0]).toEqual({
      appendDimension: { sheetId: 0, dimension: 'ROWS', length: 1 },
    });
    expect(f.commit).toHaveBeenCalledOnce();
  });
  it('rejects a stale preview after either source or destination changes', async () => {
    const f = fixture('CRR', 'FBD', true);
    const preview = await f.service.preview(f.input);
    f.material.rate = 200;
    await expect(
      f.service.transfer({ ...f.input, previewToken: preview.previewToken }),
    ).rejects.toMatchObject({ code: 'O2D_PREVIEW_STALE' });
    const next = await f.service.preview(f.input);
    f.existing('1', 'manual-added');
    await expect(
      f.service.transfer({ ...f.input, previewToken: next.previewToken }),
    ).rejects.toMatchObject({ code: 'O2D_PREVIEW_STALE' });
    expect(f.commit).not.toHaveBeenCalled();
  });
  it('revalidates external edits after acquiring the lock and before sending the batch', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.load.mockImplementationOnce(async () => {
      const first = f.snapshot();
      f.material.remarks = 'changed externally';
      return first;
    });
    await expect(f.service.transfer(f.input)).rejects.toMatchObject({
      code: 'O2D_PREVIEW_STALE',
    });
    expect(f.commit).not.toHaveBeenCalled();
  });
  it('does not automatically retry an uncertain batch result', async () => {
    const f = fixture('CRR', 'FBD', true);
    f.commit.mockRejectedValue(new Error('timeout'));
    await expect(f.service.transfer(f.input)).rejects.toMatchObject({
      statusCode: 503,
      code: 'O2D_TRANSFER_UNCONFIRMED',
    });
    expect(f.commit).toHaveBeenCalledOnce();
  });
  it('holds the shared local write lock during validation and commit', async () => {
    const f = fixture('CRR', 'FBD', true);
    let release!: () => void;
    let reached!: () => void;
    const firstReached = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.commit.mockImplementationOnce(async () => {
      reached();
      await gate;
    });
    const first = f.service.transfer(f.input);
    await firstReached;
    try {
      await expect(f.service.transfer(f.input)).rejects.toMatchObject({
        statusCode: 409,
        code: 'CREATE_BUSY',
      });
      expect(f.commit).toHaveBeenCalledOnce();
    } finally {
      release();
      await first;
    }
  });
});

describe('O2D serial and duplicate identities', () => {
  it.each([[''], ['x'], ['0'], ['1.5'], ['1', '1']])(
    'rejects invalid or conflicting existing material serials (%s)',
    (...serials) => {
      const sequence = new O2DSequenceService();
      expect(() =>
        sequence.nextSerials(
          'C/1',
          serials.map((srNo) => ({ enquiryNo: 'C/1', srNo })),
          1,
        ),
      ).toThrow();
    },
  );
  it('uses exact enquiry/SKU/edge/quantity/PO boundaries for duplicate matching', () => {
    const row = {
      enquiryNo: ' C/1 ',
      sku: 'SKU',
      edge: 'ME',
      qty: 10,
      poNumber: 'PO',
    };
    expect(duplicateKey(row)).toBe(duplicateKey({ ...row, enquiryNo: 'C/1' }));
    for (const changed of [
      { enquiryNo: 'C/2' },
      { sku: 'SKU-X' },
      { edge: 'SE' },
      { qty: 11 },
      { poNumber: 'PO-2' },
    ])
      expect(duplicateKey(row)).not.toBe(duplicateKey({ ...row, ...changed }));
  });
});
