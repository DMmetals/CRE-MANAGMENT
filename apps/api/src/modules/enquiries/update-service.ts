import { validateSelections } from '../customers/service.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import type { EnquiryType } from '@cre/shared';
import { googleSources } from '../../config/google.js';
import { SheetsService, cellWrite, auditRequests } from '../google/sheets.js';
import { withCreationLock } from './lock.js';
import { mapHeaders } from './headers.js';
import { BusinessError } from './creation.js';
export const editableHeaders = {
  customer: 'Customer Name',
  salesPerson: 'Sales Person',
  branch: 'Branch',
  sku: 'SKU',
  edge: 'Edge',
  qty: 'Qty',
  orderQty: 'Order Qty',
  limit: 'LIMIT',
  mode: 'Enq Mode',
  rate: 'Rate',
  status: 'Won/ Loss',
  remarks: 'Remarks',
  poNumber: 'PO Number',
} as const;
const changes = z
  .object({
    customer: z.string().trim().min(1).max(200).optional(),
    salesPerson: z.string().trim().min(1).max(100).optional(),
    branch: z.enum(['FBD', 'MUM']).optional(),
    sku: z.string().trim().min(1).max(200).optional(),
    edge: z.enum(['ME', 'TE']).optional(),
    qty: z.number().positive().optional(),
    orderQty: z.number().positive().optional(),
    limit: z.string().max(100).optional(),
    mode: z.enum(['Whatsapp', 'Mail']).optional(),
    rate: z.number().nonnegative().optional(),
    status: z.string().trim().min(1).max(50).optional(),
    remarks: z.string().max(2000).optional(),
    poNumber: z.string().max(200).optional(),
  })
  .strict();
export const updateSchema = z
  .object({ version: z.string().min(1), updatedAt: z.string(), changes })
  .strict();
export function rowVersion(row: string[]) {
  return createHash('sha256').update(JSON.stringify(row)).digest('hex');
}
export function updateEnquiries(
  env: Env,
  type: EnquiryType,
  updates: {
    id: string;
    version: string;
    updatedAt: string;
    changes: z.infer<typeof changes>;
  }[],
) {
  return withCreationLock(async () => {
    const source = googleSources(env).find((s) => s.type === type)!;
    const sheets = new SheetsService(env, true);
    const [formatted, formulas, metadata] = await Promise.all([
      sheets.values(source.spreadsheetId, source.sheetName),
      sheets.values(source.spreadsheetId, source.sheetName, 'FORMULA'),
      sheets.sheets(source.spreadsheetId),
    ]);
    const column = mapHeaders(formatted[source.headerRow - 1] ?? []);
    const idCol = column('DB_ID', true)!;
    const tsCol = column('LAST_EDIT_TS', true)!;
    const tab = metadata.find((s) => s.title === source.sheetName)!;
    const requests: Record<string, unknown>[] = [];
    const audit: string[][] = [];
    const results: { id: string; protectedFields: string[] }[] = [];
    for (const update of updates) {
      await validateSelections(
        env,
        type,
        update.changes.customer,
        update.changes.salesPerson,
      );
      const matches = formatted
        .map((r, i) => ({ r, i }))
        .filter(
          ({ r, i }) => i >= source.dataStartRow - 1 && r[idCol] === update.id,
        );
      if (matches.length !== 1)
        throw new BusinessError(
          409,
          'ROW_ID_REQUIRED',
          'This row needs a unique DB_ID before it can be edited. No rows were changed.',
        );
      const { r, i } = matches[0]!;
      if (
        rowVersion(r) !== update.version ||
        (r[tsCol] ?? '') !== update.updatedAt
      )
        throw new BusinessError(
          409,
          'CONFLICT',
          'This record has been updated by another user. Refresh before saving.',
        );
      if (formulas[i]?.[tsCol]?.startsWith('='))
        throw new BusinessError(
          409,
          'FORMULA_PROTECTED',
          'LAST_EDIT_TS is protected by a formula.',
        );
      const status = update.changes.status ?? r[column('Won/ Loss', true)!];
      if (
        status?.toLowerCase() === 'won' &&
        (!(update.changes.poNumber ?? r[column('PO Number', true)!])?.trim() ||
          !(update.changes.remarks ?? r[column('Remarks', true)!])?.trim())
      )
        throw new BusinessError(
          400,
          'WON_INFORMATION_REQUIRED',
          'Won materials require PO Number and Remarks.',
        );
      const protectedFields: string[] = [];
      let changed = false;
      for (const [key, value] of Object.entries(update.changes)) {
        const name = editableHeaders[key as keyof typeof editableHeaders];
        const c = column(name, true)!;
        if (formulas[i]?.[c]?.startsWith('=')) {
          protectedFields.push(key);
          continue;
        }
        requests.push(cellWrite(tab.sheetId, i, c, value));
        audit.push([update.id, name, r[c] ?? '', String(value)]);
        changed = true;
      }
      if (changed)
        requests.push(
          cellWrite(tab.sheetId, i, tsCol, new Date().toISOString()),
        );
      results.push({ id: update.id, protectedFields });
    }
    if (requests.length)
      await sheets.batch(source.spreadsheetId, [
        ...requests,
        ...auditRequests(metadata, 'UPDATE_ENQUIRY', audit),
      ]);
    return results;
  });
}
