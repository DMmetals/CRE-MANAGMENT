import { describe, it, expect, vi } from 'vitest';
import {
  createEnquiryService,
  type SheetsTransport,
} from '../src/modules/enquiries/create-service.js';
import { parseEnv } from '../src/config/env.js';
import { createEnquirySchema } from '@cre/shared';
const headers = [
  'Date',
  'Enquiry No.',
  'Customer Name',
  'Sales Person',
  'Branch',
  'Material Type',
  'SKU',
  'Edge',
  'Qty',
  'LIMIT',
  'Enq Mode',
  'Enquiry Noted Timestamp (Auto)',
  'DB_ID',
  'LAST_EDIT_TS',
];
describe('atomic Sheets creation transport', () => {
  it('sends one atomic batch with new rows, literal values and an audit entry without formula copies', async () => {
    const transport = vi.fn<SheetsTransport>(async (options) => {
      if (options.method === 'POST') return { data: {} };
      if (options.url.includes('/values/'))
        return { data: { values: [headers, ['', 'C/5/26-27']] } };
      return {
        data: {
          sheets: [
            {
              properties: {
                sheetId: 12,
                title: 'FMS',
                gridProperties: { rowCount: 100 },
              },
            },
          ],
        },
      };
    });
    const env = parseEnv({
      FMS_HEADER_ROW: '1',
      FMS_DATA_START_ROW: '2',
      NODE_ENV: 'test',
      ENABLE_SHEET_WRITES: 'true',
    });
    const input = createEnquirySchema.parse({
      type: 'CRR',
      requestId: '381eb375-b179-45d5-9e50-4334f377cb95',
      customerName: '=literal customer',
      salesPerson: 'Test',
      branch: 'FBD',
      materials: [
        {
          materialType: 'Sheet',
          sku: '1-1250-2500-2B-304',
          edge: 'ME',
          qty: 10,
          limit: '',
          mode: 'Whatsapp',
        },
      ],
    });
    await createEnquiryService(env, transport)(input);
    const writes = transport.mock.calls
      .map(([options]) => options)
      .filter((options) => options.method === 'POST');
    expect(writes).toHaveLength(1);
    const requests = writes[0]!.data!.requests;
    expect(requests).toContainEqual({
      insertDimension: {
        range: { sheetId: 12, dimension: 'ROWS', startIndex: 2, endIndex: 3 },
        inheritFromBefore: true,
      },
    });
    expect(requests.some((r) => Boolean(r.appendCells))).toBe(true);
    expect(
      requests
        .filter((r) => r.copyPaste)
        .map((r) => (r.copyPaste as { pasteType: string }).pasteType),
    ).toEqual(['PASTE_FORMAT', 'PASTE_DATA_VALIDATION']);
    expect(JSON.stringify(requests)).toContain(
      '"stringValue":"=literal customer"',
    );
    expect(JSON.stringify(requests)).not.toContain('formulaValue');
    expect(
      requests
        .filter((r) => r.updateCells)
        .every(
          (r) =>
            (r.updateCells as { start: { rowIndex: number } }).start
              .rowIndex === 2,
        ),
    ).toBe(true);
  });
});
