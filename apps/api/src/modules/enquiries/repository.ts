import { BusinessError } from './creation.js';
import { rowVersion } from './update-service.js';
import { z } from 'zod';
import type {
  EnquiryType,
  EnquiryRegister,
  EnquiryMaterial,
} from '@cre/shared';
import type { Env } from '../../config/env.js';
import { googleSources } from '../../config/google.js';
import { createGoogleAuth } from '../google/auth.js';
import { mapHeaders, columnName, safeLink, numeric } from './headers.js';

export interface EnquiryRepository {
  findAll(type: EnquiryType, refresh?: boolean): Promise<EnquiryRegister>;
}
export class RegisterError extends BusinessError {
  constructor(message: string) {
    super(503, 'REGISTER_UNAVAILABLE', message);
  }
}
const valueSchema = z.object({
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .optional(),
});
export class GoogleSheetsEnquiryRepository implements EnquiryRepository {
  private auth;
  private cache = new Map<
    EnquiryType,
    { expires: number; data: EnquiryRegister }
  >();
  private pending = new Map<EnquiryType, Promise<EnquiryRegister>>();
  constructor(private env: Env) {
    this.auth = createGoogleAuth(env);
  }
  async findAll(type: EnquiryType, refresh = false): Promise<EnquiryRegister> {
    const cached = this.cache.get(type);
    if (!refresh && cached && cached.expires > Date.now()) return cached.data;
    const running = this.pending.get(type);
    if (running) return running;
    const task = this.load(type);
    this.pending.set(type, task);
    try {
      const data = await task;
      this.cache.set(type, { data, expires: Date.now() + 15000 });
      return data;
    } finally {
      this.pending.delete(type);
    }
  }
  private async load(type: EnquiryType): Promise<EnquiryRegister> {
    const source = googleSources(this.env).find((s) => s.type === type)!;
    const tab = `'${source.sheetName.replace(/'/g, "''")}'`;
    const root = `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}`;
    try {
      const result = await this.auth.request({
        url: `${root}/values/${encodeURIComponent(tab)}?valueRenderOption=FORMATTED_VALUE`,
        method: 'GET',
        timeout: this.env.GOOGLE_TIMEOUT_MS,
        retry: false,
      });
      const all = valueSchema.parse(result.data).values ?? [];
      const headers = (all[source.headerRow - 1] ?? []).map(String);
      const column = mapHeaders(headers);
      column('Enquiry No.', true);
      column('Customer Name', true);
      column('SKU', true);
      const quoteColumn = column('Quote Link');
      const links = new Map<number, string>();
      if (quoteColumn !== undefined && all.length >= source.dataStartRow) {
        const range = `${tab}!${columnName(quoteColumn)}${source.dataStartRow}:${columnName(quoteColumn)}${all.length}`;
        const response = await this.auth.request({
          url: `${root}?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=sheets(data(startRow,rowData(values(hyperlink,textFormatRuns(format(link(uri))),userEnteredValue(formulaValue,stringValue)))))`,
          method: 'GET',
          timeout: this.env.GOOGLE_TIMEOUT_MS,
          retry: false,
        });
        const grid = z
          .object({
            sheets: z
              .array(
                z.object({
                  data: z
                    .array(
                      z.object({
                        startRow: z.number().optional(),
                        rowData: z
                          .array(
                            z.object({
                              values: z
                                .array(
                                  z.object({
                                    hyperlink: z.string().optional(),
                                    textFormatRuns: z
                                      .array(
                                        z.object({
                                          format: z
                                            .object({
                                              link: z
                                                .object({ uri: z.string() })
                                                .optional(),
                                            })
                                            .optional(),
                                        }),
                                      )
                                      .optional(),
                                    userEnteredValue: z
                                      .object({
                                        formulaValue: z.string().optional(),
                                        stringValue: z.string().optional(),
                                      })
                                      .optional(),
                                  }),
                                )
                                .optional(),
                            }),
                          )
                          .optional(),
                      }),
                    )
                    .optional(),
                }),
              )
              .optional(),
          })
          .parse(response.data);
        for (const sheet of grid.sheets ?? [])
          for (const block of sheet.data ?? [])
            (block.rowData ?? []).forEach((row, i) => {
              const cell = row.values?.[0];
              const formula = cell?.userEnteredValue?.formulaValue ?? '';
              const candidate =
                cell?.hyperlink ??
                cell?.textFormatRuns?.find((run) => run.format?.link)?.format
                  ?.link?.uri ??
                /^=HYPERLINK\(\s*"([^"]+)"/i.exec(formula)?.[1] ??
                cell?.userEnteredValue?.stringValue;
              const url = candidate ? safeLink(candidate) : null;
              if (url)
                links.set(
                  (block.startRow ?? source.dataStartRow - 1) + i + 1,
                  url,
                );
            });
      }
      const rows: EnquiryMaterial[] = [];
      all.slice(source.dataStartRow - 1).forEach((values, index) => {
        const get = (name: string) => {
          const i = column(name);
          return i === undefined ? '' : String(values[i] ?? '').trim();
        };
        const enquiryNo = get('Enquiry No.');
        if (!enquiryNo) return;
        const rowNumber = source.dataStartRow + index;
        rows.push({
          version: rowVersion(values.map(String)),
          id: get('DB_ID') || `${type}:row:${rowNumber}`,
          rowNumber,
          enquiryNo,
          date: get('Date'),
          customer: get('Customer Name'),
          salesPerson: get('Sales Person'),
          branch: get('Branch'),
          state: get('State (Auto)'),
          purchaser: get('Purchaser Name (Auto)'),
          phone: get('Contact Number (Auto)'),
          email: get('Email Address (Auto)'),
          materialType: get('Material Type'),
          sku: get('SKU'),
          edge: get('Edge'),
          qty: numeric(get('Qty')),
          orderQty: numeric(get('Order Qty')),
          orderQtyRaw: get('Order Qty'),
          orderDate: get('Order Date'),
          thickness: get('THK'),
          width: get('WIDTH'),
          length: get('LGT'),
          finish: get('FINISH'),
          grade: get('GRADE'),
          limit: get('LIMIT'),
          mode: get('Enq Mode'),
          rate: numeric(get('Rate')),
          status: get('Won/ Loss') || 'Pending',
          remarks: get('Remarks'),
          poNumber: get('PO Number'),
          quoteUrl: links.get(rowNumber) ?? safeLink(get('Quote Link')),
          orderId: get('Order ID'),
          updatedAt: get('LAST_EDIT_TS'),
        });
      });
      return { type, rows, fetchedAt: new Date().toISOString() };
    } catch (error) {
      const failure = z
        .object({ response: z.object({ status: z.number() }).optional() })
        .safeParse(error);
      if (failure.success && failure.data.response?.status === 403)
        throw new BusinessError(
          403,
          'SPREADSHEET_ACCESS_DENIED',
          `Google denied access to the configured ${type} spreadsheet. Share that spreadsheet with the service-account email as Editor, then click Retry.`,
        );
      throw new RegisterError(
        'Unable to read the enquiry register. Check the spreadsheet connection and required headers.',
      );
    }
  }
}
