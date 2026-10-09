import type { Env } from '../../config/env.js';
import type { EnquiryType } from '@cre/shared';
import { withCreationLock } from '../enquiries/lock.js';
import { BusinessError } from '../enquiries/creation.js';
import { rowVersion } from '../enquiries/update-service.js';
import { mapHeaders } from '../enquiries/headers.js';
import { googleSources } from '../../config/google.js';
import { SheetsService, cellWrite, auditRequests } from '../google/sheets.js';
import { uploadPdf, checkPdfFolder } from './drive.js';
import { renderPdf } from './pdf.js';
import { quotationCompany } from './profile.js';
export interface QuotationSaveInput {
  type: EnquiryType;
  enquiryNo: string;
  company: 'DM' | 'MM';
  materials: {
    id: string;
    sku: string;
    version: string;
    updatedAt: string;
    rate: number;
  }[];
}
export function selectQuotationRows(
  input: QuotationSaveInput,
  rows: string[][],
  displayed: string[][],
  headerRow: number,
  startRow: number,
) {
  const col = mapHeaders(rows[headerRow - 1] ?? []);
  const idCol = col('DB_ID', true)!;
  const enqCol = col('Enquiry No.', true)!;
  const skuCol = col('SKU', true)!;
  const rateCol = col('Rate', true)!;
  const quoteCol = col('Quote Link', true)!;
  const tsCol = col('LAST_EDIT_TS', true)!;
  if (rateCol !== 23 || quoteCol !== 25)
    throw new BusinessError(
      409,
      'QUOTATION_COLUMNS_CHANGED',
      'The FMS headers must have Rate in column X and Quote Link in column Z. No quotation was saved.',
    );
  if (
    !input.materials.length ||
    new Set(input.materials.map((m) => m.id)).size !== input.materials.length
  )
    throw new BusinessError(
      400,
      'DUPLICATE_MATERIAL',
      'Select each quotation material once.',
    );
  const selected = input.materials.map((m) => {
    if (!Number.isFinite(m.rate) || m.rate < 0)
      throw new BusinessError(
        400,
        'RATE_REQUIRED',
        'Enter a valid rate for each quotation material.',
      );
    const matches = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r, i }) =>
          i >= startRow - 1 &&
          r[enqCol]?.trim() === input.enquiryNo &&
          r[skuCol]?.trim() === m.sku,
      );
    // Historical records without DB_ID may be resolved only by an unambiguous
    // enquiry + SKU and an unchanged snapshot, never by the browser row number.
    const stable = !m.id.startsWith(`${input.type}:row:`);
    const candidates = stable
      ? matches.filter(({ r }) => r[idCol]?.trim() === m.id)
      : matches;
    if (candidates.length !== 1 || (!stable && candidates[0]!.r[idCol]?.trim()))
      throw new BusinessError(
        409,
        'ROW_MATCH_REQUIRED',
        'Enquiry number and SKU must identify the selected material uniquely. Refresh and resolve duplicate or changed rows before saving.',
      );
    const row = candidates[0]!;
    if (
      rowVersion(displayed[row.i] ?? []) !== m.version ||
      (row.r[tsCol] ?? '').trim() !== m.updatedAt
    )
      throw new BusinessError(
        409,
        'ROW_CHANGED',
        'This record has been updated by another user. Refresh before saving.',
      );
    if ([rateCol, quoteCol, tsCol].some((c) => row.r[c]?.startsWith('=')))
      throw new BusinessError(
        409,
        'FORMULA_PROTECTED',
        'Rate, Quote Link or LAST_EDIT_TS is formula-managed. No Sheet values were changed.',
      );
    return { ...row, rate: m.rate, id: m.id };
  });
  if (new Set(selected.map((r) => r.i)).size !== selected.length)
    throw new BusinessError(
      400,
      'DUPLICATE_MATERIAL',
      'Select each quotation material once.',
    );
  return { selected, rateCol, quoteCol, tsCol };
}
export function saveQuotation(
  env: Env,
  input: QuotationSaveInput,
  html: string,
) {
  return withCreationLock(async () => {
    if (env.ENABLE_SHEET_WRITES !== 'true')
      throw new BusinessError(
        403,
        'SHEET_WRITES_DISABLED',
        'Enable Sheet writes before saving a quotation.',
      );
    quotationCompany(env, input.company);
    const source = googleSources(env).find((s) => s.type === input.type)!;
    const service = new SheetsService(env, true);
    const read = async () => {
      const [rows, displayed, metadata] = await Promise.all([
        service.values(source.spreadsheetId, source.sheetName, 'FORMULA'),
        service.values(source.spreadsheetId, source.sheetName),
        service.sheets(source.spreadsheetId),
      ]);
      const sheet = metadata.find((s) => s.title === source.sheetName);
      if (!sheet)
        throw new BusinessError(
          409,
          'SHEET_MISSING',
          'The enquiry sheet is unavailable.',
        );
      return {
        ...selectQuotationRows(
          input,
          rows,
          displayed,
          source.headerRow,
          source.dataStartRow,
        ),
        metadata,
        sheet,
      };
    };
    await read();
    await checkPdfFolder(env, env.QUOTATION_PDF_FOLDER_ID);
    const pdf = await renderPdf(env, html);
    // Re-read after rendering: no file is uploaded for an already stale selection.
    await read();
    const file = await uploadPdf(
      env,
      env.QUOTATION_PDF_FOLDER_ID,
      `Quotation_${input.enquiryNo.replaceAll('/', '_')}.pdf`,
      pdf,
    );
    try {
      // Resolve current row positions again in case an external editor moved rows.
      const { selected, rateCol, quoteCol, tsCol, metadata, sheet } =
        await read();
      const requests: Record<string, unknown>[] = [];
      const audit: string[][] = [];
      const updatedAt = new Date().toISOString();
      for (const row of selected) {
        requests.push(
          cellWrite(sheet.sheetId, row.i, rateCol, row.rate),
          cellWrite(sheet.sheetId, row.i, quoteCol, file.url),
          cellWrite(sheet.sheetId, row.i, tsCol, updatedAt),
        );
        audit.push(
          [row.id, 'Rate', row.r[rateCol] ?? '', String(row.rate)],
          [row.id, 'Quote Link', row.r[quoteCol] ?? '', file.url],
        );
      }
      await service.batch(source.spreadsheetId, [
        ...requests,
        ...auditRequests(metadata, 'SAVE_QUOTATION', audit),
      ]);
      return { ...file, pdf, updatedRows: selected.length };
    } catch {
      throw new BusinessError(
        503,
        'PDF_SAVED_LINK_PENDING',
        `PDF was saved at ${file.url}, but its Sheet update was not confirmed. Review that file and refresh the register before retrying.`,
      );
    }
  });
}
