import { normalizeBranch } from '@cre/shared';
import { createHash } from 'node:crypto';
import type { EnquiryMaterial, EnquiryType, O2DBranch } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
import { withCreationLock } from '../enquiries/lock.js';
import {
  GoogleSheetsEnquiryRepository,
  type EnquiryRepository,
} from '../enquiries/repository.js';
import { auditRequests, cellWrite } from '../google/sheets.js';
import {
  GoogleSheetsO2DRepository,
  isCellProtected,
  type O2DRepository,
  type O2DSnapshot,
} from './repository.js';
import { O2DDuplicateService } from './duplicate.js';
import { O2DSequenceService } from './sequence.js';

export interface O2DTransferInput {
  type: EnquiryType;
  enquiryNo: string;
  branch?: O2DBranch;
  previewToken?: string;
}
export interface O2DPlannedRow {
  srNo: number;
  sourceId: string;
  rowNumber: number;
  fields: Record<string, string | number>;
}
export interface O2DTransferResult {
  eligible: boolean;
  normalizedBranch: O2DBranch;
  writesEnabled: boolean;
  blockingReasons: string[];
  materials: {
    id: string;
    enquiryNo: string;
    rawBranch: string;
    normalizedBranch: string;
    status: string;
    poNumberPresent: boolean;
    remarksPresent: boolean;
    qty: number | null;
    orderQty: number | null;
    resolvedTransferQty: number | null;
    rate: number | null;
  }[];
  duplicates: {
    id: string;
    enquiryNo: string;
    sku: string;
    edge: string;
    qty: number;
    poNumber: string;
  }[];
  enquiryNo: string;
  branch: O2DBranch;
  destination: O2DBranch;
  spreadsheetId: string;
  sheetName: string;
  transferred: number;
  skippedDuplicates: number;
  srNos: number[];
  rowsToInsert: O2DPlannedRow[];
  protectedFields: string[];
  previewToken: string;
}
export class O2DTransferError extends BusinessError {
  constructor(
    code: string,
    message: string,
    public protectedFields: string[],
  ) {
    super(409, code, message);
  }
}
interface TransferPlan {
  result: O2DTransferResult;
  snapshot: O2DSnapshot;
  requests: Record<string, unknown>[];
}
const normalize = (value: string) => value.trim();

export function resolvedTransferQty(row: EnquiryMaterial) {
  if (row.orderQtyRaw?.trim() && row.orderQty == null) return null;
  return row.orderQty ?? row.qty;
}
function selectWon(rows: EnquiryMaterial[], input: O2DTransferInput) {
  const enquiry = rows.filter(
    (row) => normalize(row.enquiryNo) === normalize(input.enquiryNo),
  );
  if (!enquiry.length)
    throw new BusinessError(
      404,
      'ENQUIRY_NOT_FOUND',
      'This enquiry no longer exists. Refresh the enquiry register.',
    );
  const won = enquiry.filter(
    (row) => row.status.trim().toUpperCase() === 'WON',
  );
  if (!won.length)
    throw new BusinessError(
      400,
      'NOT_WON',
      'Only Won materials can transfer to O2D.',
    );
  const eligible = won.filter(
    (row) => row.poNumber.trim() && row.remarks.trim(),
  );
  if (!eligible.length) {
    if (won.some((row) => !row.poNumber.trim()))
      throw new BusinessError(
        400,
        'PO_NUMBER_REQUIRED',
        'PO Number is required before transferring to O2D.',
      );
    throw new BusinessError(
      400,
      'REMARKS_REQUIRED',
      'Remarks are required before transferring to O2D.',
    );
  }
  const branches = [
    ...new Set(eligible.map((row) => normalizeBranch(row.branch))),
  ];
  const requested = input.branch ? normalizeBranch(input.branch) : undefined;
  if (requested && !branches.includes(requested))
    throw new BusinessError(
      400,
      'BRANCH_MISMATCH',
      'The requested destination does not match the eligible material branches in FMS.',
    );
  if (!requested && branches.length > 1)
    throw new BusinessError(
      400,
      'MULTIPLE_BRANCHES',
      'This enquiry contains multiple destination branches. Choose the FBD or MUM transfer action.',
    );
  const destination = requested ?? branches[0]!;
  if (destination !== 'FBD' && destination !== 'MUM')
    throw new BusinessError(
      400,
      'UNSUPPORTED_BRANCH',
      `Unsupported branch: ${destination || '(blank)'}.`,
    );
  const selected = eligible.filter(
    (row) => normalizeBranch(row.branch) === destination,
  );
  if (selected.some((row) => !row.customer.trim() || !row.sku.trim()))
    throw new BusinessError(
      400,
      'MATERIAL_DETAILS_REQUIRED',
      'Customer Name and SKU are required for every transferred material.',
    );
  if (new Set(selected.map((row) => row.customer.trim())).size !== 1)
    throw new BusinessError(
      400,
      'CUSTOMER_MISMATCH',
      'Transferred materials for an enquiry must belong to the same customer.',
    );
  if (
    selected.some((row) => {
      const qty = resolvedTransferQty(row);
      return qty == null || !Number.isFinite(qty) || qty <= 0;
    })
  )
    throw new BusinessError(
      400,
      'ORDER_QTY_REQUIRED',
      'Enter a positive Order Qty, or a positive Qty when Order Qty is blank.',
    );
  if (
    selected.some(
      (row) => row.rate == null || !Number.isFinite(row.rate) || row.rate < 0,
    )
  )
    throw new BusinessError(
      400,
      'ORDER_RATE_REQUIRED',
      'Save a valid quotation Rate in FMS for every transferred material.',
    );
  return { selected, branch: destination as O2DBranch };
}

/** FORMULA rendering preserves editable inputs and avoids volatile displayed formula results. */
function stateToken(
  input: O2DTransferInput,
  source: EnquiryMaterial[],
  snapshot: O2DSnapshot,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        type: input.type,
        enquiryNo: input.enquiryNo.trim(),
        branch: input.branch,
        source,
        destination: snapshot.source,
        headers: snapshot.headerMap.columns,
        cells: snapshot.formulas,
        protectedRanges: snapshot.protectedRanges,
      }),
    )
    .digest('hex');
}

function formulaManaged(
  snapshot: O2DSnapshot,
  rowIndex: number,
  columnIndex: number,
) {
  if (snapshot.formulas[rowIndex]?.[columnIndex]?.startsWith('=')) return true;
  return snapshot.formulas.slice(0, rowIndex + 1).some((row) => {
    const formula = row[columnIndex] ?? '';
    return (
      formula.startsWith('=') &&
      /\b(?:ARRAYFORMULA|FILTER|QUERY|SEQUENCE)\s*\(/i.test(formula)
    );
  });
}

/** Reuse empty template rows, but never write into a row containing manual business data. */
function insertionStart(snapshot: O2DSnapshot) {
  let start = snapshot.source.header;
  for (const row of snapshot.rows) start = Math.max(start, row.rowNumber);
  for (
    let index = snapshot.source.header;
    index < Math.max(snapshot.values.length, snapshot.formulas.length);
    index += 1
  ) {
    const row = snapshot.formulas[index] ?? snapshot.values[index] ?? [];
    if (
      row.some(
        (value, column) =>
          value.trim() !== '' &&
          !value.startsWith('=') &&
          !formulaManaged(snapshot, index, column),
      )
    )
      start = Math.max(start, index + 1);
  }
  return start;
}

export class O2DTransferService {
  private enquiries: EnquiryRepository;
  private repository: O2DRepository;
  private duplicate = new O2DDuplicateService();
  private sequence = new O2DSequenceService();

  constructor(
    private env: Env,
    enquiries?: EnquiryRepository,
    repository?: O2DRepository,
  ) {
    this.enquiries = enquiries ?? new GoogleSheetsEnquiryRepository(env);
    this.repository = repository ?? new GoogleSheetsO2DRepository(env);
  }

  /** Always read-only, including when sheet writes are disabled. */
  async preview(input: O2DTransferInput): Promise<O2DTransferResult> {
    return (await this.prepare(input)).result;
  }

  async transfer(input: O2DTransferInput): Promise<O2DTransferResult> {
    if (this.env.ENABLE_SHEET_WRITES !== 'true')
      throw new BusinessError(
        403,
        'SHEET_WRITES_DISABLED',
        'Sheet writes are disabled. Transfer preview remains available.',
      );
    return withCreationLock(async () => {
      const first = await this.prepare(input);
      if (
        input.previewToken &&
        input.previewToken !== first.result.previewToken
      )
        throw new BusinessError(
          409,
          'O2D_PREVIEW_STALE',
          'The enquiry or destination changed after preview. Refresh the preview and confirm the updated transfer.',
        );
      if (!first.result.transferred) return first.result;
      // Re-read just before the single batch: manual Sheet edits do not share our local lock.
      const current = await this.prepare(input);
      if (current.result.previewToken !== first.result.previewToken)
        throw new BusinessError(
          409,
          'O2D_PREVIEW_STALE',
          'The enquiry or destination changed during validation. Refresh the preview before transferring.',
        );
      try {
        await this.repository.commit(current.snapshot, current.requests);
      } catch (error) {
        if (error instanceof BusinessError) throw error;
        throw new BusinessError(
          503,
          'O2D_TRANSFER_UNCONFIRMED',
          'The transfer result could not be confirmed. Refresh the O2D register and preview this enquiry again before retrying; duplicate materials will be skipped.',
        );
      }
      return current.result;
    });
  }

  private async prepare(input: O2DTransferInput): Promise<TransferPlan> {
    if (
      !['CRR', 'NBD'].includes(input.type) ||
      (input.branch !== undefined &&
        !['FBD', 'MUM'].includes(normalizeBranch(input.branch))) ||
      !input.enquiryNo.trim()
    )
      throw new BusinessError(
        400,
        'INVALID_TRANSFER',
        'Select a valid enquiry and destination branch.',
      );
    const register = await this.enquiries.findAll(input.type, true);
    const selection = selectWon(register.rows, input);
    const branch = selection.branch;
    const selected = selection.selected.map((row) => ({
      ...row,
      orderQty: resolvedTransferQty(row)!,
    }));
    const snapshot = await this.repository.load(branch);
    const { fresh, skippedDuplicates, duplicates } = this.duplicate.selectNew(
      snapshot.rows,
      selected.map((row) => ({ ...row, qty: row.orderQty! })),
    );
    const srNos = this.sequence.nextSerials(
      input.enquiryNo,
      snapshot.rows,
      fresh.length,
    );
    const start = insertionStart(snapshot);
    const requests: Record<string, unknown>[] = [];
    const protectedFields = new Set<string>();
    const rowsToInsert: O2DPlannedRow[] = [];
    const timestamp = new Date().toISOString();
    const requiredHeaders = [
      'Sr no',
      'Enquiry No.',
      'Customer Name',
      'Sales Person',
      'Category',
      'PO Number',
      'SKU',
      'Thk',
      'Width',
      'Lgt',
      'Finish',
      'Grade',
      'Edge',
      'Order Qty',
      'Balance Qty',
      'Order Rate',
      'LIMIT',
      'Order Receiving Date & Time',
    ];
    for (const name of requiredHeaders) snapshot.headerMap.requireColumn(name);
    if (fresh.length && start + fresh.length > snapshot.source.rowCount)
      requests.push({
        appendDimension: {
          sheetId: snapshot.source.sheetId,
          dimension: 'ROWS',
          length: start + fresh.length - snapshot.source.rowCount,
        },
      });
    for (const [index, row] of fresh.entries()) {
      const target = start + index;
      const fields: Record<string, string | number> = {
        'Sr no': srNos[index]!,
        'Enquiry No.': row.enquiryNo.trim(),
        'Customer Name': row.customer,
        'Sales Person': row.salesPerson,
        Category: input.type,
        'PO Number': row.poNumber,
        SKU: row.sku,
        Thk: row.thickness ?? '',
        Width: row.width ?? '',
        Lgt: row.length ?? '',
        Finish: row.finish ?? '',
        Grade: row.grade ?? '',
        Edge: row.edge,
        'Order Qty': row.orderQty!,
        'Balance Qty': row.orderQty!,
        'Order Rate': row.rate!,
        LIMIT: row.limit,
        'Order Receiving Date & Time': timestamp,
      };
      for (const [name, value] of Object.entries(fields)) {
        const column = snapshot.headerMap.requireColumn(name);
        if (
          name === 'Balance Qty' &&
          formulaManaged(snapshot, target, column)
        ) {
          delete fields[name];
          protectedFields.add(name);
          continue;
        }
        if (
          formulaManaged(snapshot, target, column) ||
          isCellProtected(snapshot, target, column)
        ) {
          protectedFields.add(name);
          throw new O2DTransferError(
            'O2D_FORMULA_PROTECTED',
            `Cannot transfer: ${name} is formula-managed or protected in destination row ${target + 1}. Its cell was not overwritten.`,
            [...protectedFields],
          );
        }
        if (
          (snapshot.values[target]?.[column] ?? '').trim() ||
          (snapshot.formulas[target]?.[column] ?? '').trim()
        )
          throw new BusinessError(
            409,
            'O2D_DESTINATION_OCCUPIED',
            'The planned destination row contains data. Refresh the transfer preview.',
          );
        requests.push(
          cellWrite(snapshot.source.sheetId, target, column, value),
        );
      }
      for (const column of snapshot.headerMap.columns)
        if (isCellProtected(snapshot, target, column.column - 1))
          protectedFields.add(column.header || column.letter);
      rowsToInsert.push({
        srNo: srNos[index]!,
        sourceId: row.id,
        rowNumber: target + 1,
        fields,
      });
    }
    if (fresh.length)
      requests.push(
        ...auditRequests(
          snapshot.sheets,
          'TRANSFER_TO_O2D',
          fresh.map((row, index) => [
            `${row.enquiryNo.trim()}|${srNos[index]!}`,
            'Material',
            '',
            `${input.type}: ${row.sku}`,
          ]),
        ),
      );
    return {
      snapshot,
      requests,
      result: {
        enquiryNo: input.enquiryNo.trim(),
        branch,
        destination: branch,
        normalizedBranch: branch,
        eligible: true,
        writesEnabled: this.env.ENABLE_SHEET_WRITES === 'true',
        blockingReasons: [],
        materials: selection.selected.map((row) => ({
          id: row.id,
          enquiryNo: row.enquiryNo,
          rawBranch: row.branch,
          normalizedBranch: branch,
          status: row.status,
          poNumberPresent: !!row.poNumber.trim(),
          remarksPresent: !!row.remarks.trim(),
          qty: row.qty,
          orderQty: row.orderQty ?? null,
          resolvedTransferQty: resolvedTransferQty(row),
          rate: row.rate,
        })),
        duplicates: duplicates.map((row) => ({
          id: row.id,
          enquiryNo: row.enquiryNo,
          sku: row.sku,
          edge: row.edge,
          qty: row.orderQty!,
          poNumber: row.poNumber,
        })),
        spreadsheetId: snapshot.source.id,
        sheetName: snapshot.source.tab,
        transferred: fresh.length,
        skippedDuplicates,
        srNos,
        rowsToInsert,
        protectedFields: [...protectedFields],
        previewToken: stateToken({ ...input, branch }, register.rows, snapshot),
      },
    };
  }
}
