import { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { EnquiryType } from '@cre/shared';
import { createGoogleAuth } from '../google/auth.js';
import { SheetsService } from '../google/sheets.js';
import { googleSources } from '../../config/google.js';
import { mapHeaders, columnName } from '../enquiries/headers.js';
import { BusinessError } from '../enquiries/creation.js';
export const SALES_PERSON_FALLBACK = [
  'Naimish Patel',
  'Sourabh Dave',
  'Vikas Sood',
  'Sunil Gulati',
  'Rahul Kane',
  'Tanish Jain',
  'S.Bhowmick',
  'R.Jhonson',
  'Chennai',
  'SC.Priya',
];
export function partyRecords(rows: string[][]) {
  const column = mapHeaders(rows[0] ?? []);
  const result = new Map<
    string,
    {
      customer: string;
      address: string;
      gstin: string;
      state: string;
      purchaser: string;
      phone: string;
      email: string;
      branch: string;
      salesPerson: string;
    }
  >();
  for (const row of rows.slice(1)) {
    const customer = (row[0] ?? '').trim();
    if (!customer) continue;
    const get = (...names: string[]) => {
      for (const name of names) {
        const c = column(name);
        if (c !== undefined && row[c]?.trim()) return row[c]!.trim();
      }
      return '';
    };
    const key = customer.toLocaleLowerCase('en');
    if (result.has(key)) continue;
    result.set(key, {
      customer,
      // Customer master layout: customer name in A, quotation address in F.
      address: (row[5] ?? '').trim(),
      gstin: get('GSTIN', 'GST No'),
      state: get('State'),
      purchaser: get("Purchaser's Name", 'Purchaser Name'),
      phone: get('Contact number', 'Contact Number'),
      email: get("Purchaser's Mail Address", 'Email Address'),
      branch: get('Branch'),
      salesPerson: get('Sales Person', 'Sales Person Name'),
    });
  }
  return [...result.values()].sort((a, b) =>
    a.customer.localeCompare(b.customer, 'en', { sensitivity: 'base' }),
  );
}
export async function customers(env: Env, type: EnquiryType) {
  const source = googleSources(env).find((s) => s.type === type)!;
  return partyRecords(
    await new SheetsService(env).values(
      source.spreadsheetId,
      'New Party addition',
    ),
  );
}
export async function salesPersons(env: Env, type: EnquiryType) {
  const source = googleSources(env).find((s) => s.type === type)!;
  const auth = createGoogleAuth(env);
  const headerResponse = await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}/values/${encodeURIComponent(`'${source.sheetName}'!${source.headerRow}:${source.headerRow}`)}`,
    method: 'GET',
    timeout: env.GOOGLE_TIMEOUT_MS,
    retry: false,
  });
  const headers =
    z
      .object({ values: z.array(z.array(z.string())).optional() })
      .parse(headerResponse.data).values?.[0] ?? [];
  const c = mapHeaders(headers)('Sales Person', true)!;
  const range = `'${source.sheetName}'!${columnName(c)}${source.dataStartRow}:${columnName(c)}`;
  const r = await auth.request({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}?ranges=${encodeURIComponent(range)}&includeGridData=true&fields=sheets(data(rowData(values(dataValidation))))`,
    method: 'GET',
    timeout: env.GOOGLE_TIMEOUT_MS,
    retry: false,
  });
  const schema = z.object({
    sheets: z
      .array(
        z.object({
          data: z
            .array(
              z.object({
                rowData: z
                  .array(
                    z.object({
                      values: z
                        .array(
                          z.object({
                            dataValidation: z
                              .object({
                                condition: z.object({
                                  type: z.string(),
                                  values: z
                                    .array(
                                      z.object({
                                        userEnteredValue: z.string(),
                                      }),
                                    )
                                    .optional(),
                                }),
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
  });
  const data = schema.parse(r.data);
  const options = new Set<string>();
  for (const sheet of data.sheets ?? [])
    for (const block of sheet.data ?? [])
      for (const row of block.rowData ?? [])
        for (const cell of row.values ?? []) {
          const condition = cell.dataValidation?.condition;
          if (condition?.type === 'ONE_OF_LIST')
            for (const v of condition.values ?? [])
              if (v.userEnteredValue.trim())
                options.add(v.userEnteredValue.trim());
          if (condition?.type === 'ONE_OF_RANGE') {
            const value = condition.values?.[0]?.userEnteredValue.replace(
              /^=/,
              '',
            );
            if (value) {
              const match = /^'?([^']+?)'?!(.+)$/.exec(value);
              if (match) {
                const response = await auth.request({
                  url: `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}/values/${encodeURIComponent(value)}`,
                  method: 'GET',
                  timeout: env.GOOGLE_TIMEOUT_MS,
                  retry: false,
                });
                const values = z
                  .object({ values: z.array(z.array(z.string())).optional() })
                  .parse(response.data);
                for (const row of values.values ?? [])
                  for (const text of row)
                    if (text.trim()) options.add(text.trim());
              }
            }
          }
        }

  return {
    options: options.size ? [...options].sort() : SALES_PERSON_FALLBACK,
    source: options.size ? 'sheet-validation' : 'centralized-fallback',
  };
}
export async function validateSelections(
  env: Env,
  type: EnquiryType,
  customerName?: string,
  salesPerson?: string,
) {
  if (
    customerName !== undefined &&
    !(await customers(env, type)).some((c) => c.customer === customerName)
  )
    throw new BusinessError(
      400,
      'CUSTOMER_NOT_ALLOWED',
      'Select a customer from New Party addition.',
    );
  if (
    salesPerson !== undefined &&
    !(await salesPersons(env, type)).options.includes(salesPerson)
  )
    throw new BusinessError(
      400,
      'SALES_PERSON_NOT_ALLOWED',
      'Select a valid Sales Person from the dropdown.',
    );
}
