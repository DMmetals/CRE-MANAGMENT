import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { rowVersion } from '../enquiries/update-service.js';
import {
  saveQuotation,
  selectQuotationRows,
  type QuotationSaveInput,
} from './save-quotation.js';
const calls = vi.hoisted(() => ({
  values: vi.fn(),
  sheets: vi.fn(),
  batch: vi.fn(),
  upload: vi.fn(),
  folder: vi.fn(),
  render: vi.fn(),
}));
vi.mock('../enquiries/lock.js', () => ({
  withCreationLock: (action: () => Promise<unknown>) => action(),
}));
vi.mock('../google/sheets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../google/sheets.js')>();
  return {
    ...actual,
    SheetsService: class {
      values = calls.values;
      sheets = calls.sheets;
      batch = calls.batch;
    },
  };
});
vi.mock('./drive.js', () => ({
  uploadPdf: calls.upload,
  checkPdfFolder: calls.folder,
}));
vi.mock('./pdf.js', () => ({ renderPdf: calls.render }));
const env = parseEnv({
  NODE_ENV: 'test',
  ENABLE_SHEET_WRITES: 'true',
  CRR_SPREADSHEET_ID: 'crr-sheet',
  NBD_SPREADSHEET_ID: 'nbd-sheet',
  QUOTATION_PDF_FOLDER_ID: 'pdf-folder',
});
function fixture(type: 'CRR' | 'NBD' = 'CRR') {
  const headers = Array<string>(44).fill('');
  headers[1] = 'Enquiry No.';
  headers[10] = 'SKU';
  headers[23] = 'Rate';
  headers[25] = 'Quote Link';
  headers[42] = 'DB_ID';
  headers[43] = 'LAST_EDIT_TS';
  const make = (id: string, enq: string, sku: string) => {
    const row = Array<string>(44).fill('');
    row[1] = enq;
    row[10] = sku;
    row[42] = id;
    row[43] = '2026-10-07T09:00:00.000Z';
    return row;
  };
  const enquiryNo = type === 'CRR' ? 'C/1/26-27' : 'N/1/26-27';
  const first = make('id-one', enquiryNo, '1-1250-COIL-2B-304');
  const second = make('id-two', enquiryNo, '2-1250-COIL-2B-304');
  const unrelated = make(
    'id-other',
    enquiryNo.replace('/1/', '/2/'),
    first[10]!,
  );
  const rows = [
    ...Array.from({ length: 6 }, () => [] as string[]),
    headers,
    first,
    second,
    unrelated,
  ];
  const input: QuotationSaveInput = {
    type,
    enquiryNo,
    company: 'DM',
    materials: [first, second].map((r, i) => ({
      id: r[42]!,
      sku: r[10]!,
      updatedAt: r[43]!,
      version: rowVersion(r),
      rate: i === 0 ? 227 : 445,
    })),
  };
  return { rows, input };
}
beforeEach(() => {
  vi.clearAllMocks();
  calls.sheets.mockResolvedValue([
    { sheetId: 1, title: 'FMS', gridProperties: { rowCount: 100 } },
    { sheetId: 2, title: 'CRE Audit Log' },
  ]);
  calls.batch.mockResolvedValue(undefined);
  calls.folder.mockResolvedValue(undefined);
  calls.render.mockResolvedValue(Buffer.from('%PDF-example'));
  calls.upload.mockResolvedValue({
    id: 'file-id',
    url: 'https://drive.google.com/file/d/file-id/view',
  });
});
describe('quotation persistence', () => {
  it.each(['CRR', 'NBD'] as const)(
    'updates only selected %s enquiry/SKU rows in X and Z with their own rates',
    async (type) => {
      const { rows, input } = fixture(type);
      calls.values.mockResolvedValue(rows);
      const result = await saveQuotation(env, input, 'edited quotation HTML');
      expect(calls.batch).toHaveBeenCalledOnce();
      const [sheet, requests] = calls.batch.mock.calls[0]!;
      expect(sheet).toBe(type === 'CRR' ? 'crr-sheet' : 'nbd-sheet');
      const cells = requests
        .filter((r: Record<string, unknown>) => r.updateCells)
        .map(
          (r: {
            updateCells: {
              start: { rowIndex: number; columnIndex: number };
              rows: { values: { userEnteredValue: unknown }[] }[];
            };
          }) => ({
            row: r.updateCells.start.rowIndex,
            column: r.updateCells.start.columnIndex,
            value: r.updateCells.rows[0]!.values[0]!.userEnteredValue,
          }),
        );
      expect(cells).toEqual(
        expect.arrayContaining([
          { row: 7, column: 23, value: { numberValue: 227 } },
          { row: 8, column: 23, value: { numberValue: 445 } },
          { row: 7, column: 25, value: { stringValue: result.url } },
          { row: 8, column: 25, value: { stringValue: result.url } },
        ]),
      );
      expect(cells).toHaveLength(6);
      expect(
        cells.every((r: { row: number }) => r.row === 7 || r.row === 8),
      ).toBe(true);
      expect(calls.render).toHaveBeenCalledWith(env, 'edited quotation HTML');
      expect(calls.upload.mock.calls[0]![3]).toBe(result.pdf);
      expect(result.updatedRows).toBe(2);
    },
  );
  it('resolves a unique historical enquiry/SKU without trusting a submitted row number', () => {
    const { rows, input } = fixture();
    rows[7]![42] = '';
    input.materials = [
      {
        ...input.materials[0]!,
        id: 'CRR:row:999',
        version: rowVersion(rows[7]!),
      },
    ];
    expect(selectQuotationRows(input, rows, rows, 7, 8).selected[0]!.i).toBe(7);
    rows.push([...rows[7]!]);
    expect(() => selectQuotationRows(input, rows, rows, 7, 8)).toThrow(
      'uniquely',
    );
  });
  it('blocks stale values before uploading', async () => {
    const { rows, input } = fixture();
    rows[7]![23] = '99';
    calls.values.mockResolvedValue(rows);
    await expect(saveQuotation(env, input, 'html')).rejects.toThrow(
      'updated by another user',
    );
    expect(calls.upload).not.toHaveBeenCalled();
    expect(calls.batch).not.toHaveBeenCalled();
  });
  it('protects formulas in the selected write cells', async () => {
    const { rows, input } = fixture();
    rows[7]![25] = '=HYPERLINK("https://example.com","PDF")';
    input.materials[0]!.version = rowVersion(rows[7]!);
    calls.values.mockResolvedValue(rows);
    await expect(saveQuotation(env, input, 'html')).rejects.toThrow(
      'formula-managed',
    );
    expect(calls.upload).not.toHaveBeenCalled();
  });
  it('rejects a changed column mapping', () => {
    const { rows, input } = fixture();
    rows[6]![23] = '';
    rows[6]![24] = 'Rate';
    expect(() => selectQuotationRows(input, rows, rows, 7, 8)).toThrow(
      'column X',
    );
  });
  it('does not write rates or links when folder access fails', async () => {
    const { rows, input } = fixture();
    calls.values.mockResolvedValue(rows);
    calls.folder.mockRejectedValueOnce(new Error('Share the PDF folder'));
    await expect(saveQuotation(env, input, 'html')).rejects.toThrow(
      'Share the PDF folder',
    );
    expect(calls.render).not.toHaveBeenCalled();
    expect(calls.batch).not.toHaveBeenCalled();
  });
  it('does not overwrite changes made during upload', async () => {
    const { rows, input } = fixture();
    calls.values.mockImplementation(async () => rows.map((r) => [...r]));
    calls.upload.mockImplementationOnce(async () => {
      rows[7]![23] = '500';
      return {
        id: 'file-id',
        url: 'https://drive.google.com/file/d/file-id/view',
      };
    });
    await expect(saveQuotation(env, input, 'html')).rejects.toThrow(
      'Sheet update was not confirmed',
    );
    expect(calls.batch).not.toHaveBeenCalled();
  });
  it('blocks all side effects when writes are disabled', async () => {
    const { input } = fixture();
    await expect(
      saveQuotation({ ...env, ENABLE_SHEET_WRITES: 'false' }, input, 'html'),
    ).rejects.toThrow('Enable Sheet writes');
    expect(calls.values).not.toHaveBeenCalled();
    expect(calls.upload).not.toHaveBeenCalled();
  });
});
