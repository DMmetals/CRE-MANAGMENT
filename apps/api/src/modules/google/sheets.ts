import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
export class SheetsService {
  private auth;
  constructor(
    private env: Env,
    write = false,
  ) {
    this.auth = new GoogleAuth({
      ...(env.GOOGLE_APPLICATION_CREDENTIALS
        ? { keyFile: env.GOOGLE_APPLICATION_CREDENTIALS }
        : {
            credentials: {
              client_email: env.GOOGLE_CLIENT_EMAIL,
              private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
          }),
      scopes: [
        write
          ? 'https://www.googleapis.com/auth/spreadsheets'
          : 'https://www.googleapis.com/auth/spreadsheets.readonly',
      ],
    });
  }
  async values(
    id: string,
    tab: string,
    mode: 'FORMULA' | 'FORMATTED_VALUE' = 'FORMATTED_VALUE',
  ) {
    const range = `'${tab.replace(/'/g, "''")}'`;
    const r = await this.auth.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueRenderOption=${mode}`,
      method: 'GET',
      timeout: this.env.GOOGLE_TIMEOUT_MS,
      retry: false,
    });
    return (
      z
        .object({
          values: z
            .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
            .optional(),
        })
        .parse(r.data).values ?? []
    ).map((row) => row.map(String));
  }
  async sheets(id: string) {
    const r = await this.auth.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`,
      method: 'GET',
      timeout: this.env.GOOGLE_TIMEOUT_MS,
      retry: false,
    });
    return z
      .object({
        sheets: z.array(
          z.object({
            properties: z.object({
              sheetId: z.number(),
              title: z.string(),
              gridProperties: z.object({ rowCount: z.number() }),
            }),
          }),
        ),
      })
      .parse(r.data)
      .sheets.map((s) => s.properties);
  }
  async batch(id: string, requests: Record<string, unknown>[]) {
    if (this.env.ENABLE_SHEET_WRITES !== 'true')
      throw new BusinessError(
        403,
        'SHEET_WRITES_DISABLED',
        'Set ENABLE_SHEET_WRITES=true to enable writes.',
      );
    await this.auth.request({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`,
      method: 'POST',
      data: { requests },
      timeout: this.env.GOOGLE_TIMEOUT_MS,
      retry: false,
    });
  }
}
export function cellWrite(
  sheetId: number,
  rowIndex: number,
  columnIndex: number,
  value: string | number,
) {
  return {
    updateCells: {
      start: { sheetId, rowIndex, columnIndex },
      rows: [
        {
          values: [
            {
              userEnteredValue:
                typeof value === 'number'
                  ? { numberValue: value }
                  : { stringValue: value },
            },
          ],
        },
      ],
      fields: 'userEnteredValue',
    },
  };
}
export function auditRequests(
  sheets: { sheetId: number; title: string }[],
  action: string,
  entries: string[][],
) {
  const existing = sheets.find((s) => s.title === 'CRE Audit Log');
  const id = existing?.sheetId ?? Math.max(...sheets.map((s) => s.sheetId)) + 1;
  const rows = entries.map((entry) => [
    new Date().toISOString(),
    'local-development-user',
    action,
    ...entry,
  ]);
  if (!existing)
    rows.unshift([
      'timestamp',
      'user',
      'action',
      'record',
      'field',
      'oldValue',
      'newValue',
    ]);
  return [
    ...(existing
      ? []
      : [
          { addSheet: { properties: { sheetId: id, title: 'CRE Audit Log' } } },
        ]),
    {
      appendCells: {
        sheetId: id,
        rows: rows.map((row) => ({
          values: row.map((value) => ({
            userEnteredValue: { stringValue: value },
          })),
        })),
        fields: 'userEnteredValue',
      },
    },
  ];
}
