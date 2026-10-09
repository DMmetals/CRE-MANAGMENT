import { normalizeBranch } from '@cre/shared';
import type { O2DBranch, O2DData, O2DMeta } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { SheetsService } from '../google/sheets.js';
import { BusinessError } from '../enquiries/creation.js';
import {
  GoogleSheetsO2DRepository,
  formulaColumns,
  type O2DRepository,
} from './repository.js';
export { orderSource } from './config.js';
export type Branch = O2DBranch;
export class O2DService {
  constructor(
    private env: Env,
    private repository: O2DRepository = new GoogleSheetsO2DRepository(env),
  ) {}
  async list(branch: O2DBranch): Promise<O2DData> {
    const snapshot = await this.repository.load(branch);
    const keys = snapshot.rows.map((r) =>
      JSON.stringify([r.enquiryNo, r.srNo]),
    );
    const identityVerified =
      snapshot.rows.every((r) => r.enquiryNo && /^[1-9]\d*$/.test(r.srNo)) &&
      new Set(keys).size === keys.length;
    return {
      branch,
      rows: snapshot.rows,
      fetchedAt: new Date().toISOString(),
      identityVerified,
      warning: identityVerified
        ? null
        : 'Some rows have a missing or duplicate Enquiry No. + Sr no identity. Resolve these cells in the Sheet before editing those rows.',
      kpis: {
        totalOrders: new Set(
          snapshot.rows.map((r) => r.enquiryNo).filter(Boolean),
        ).size,
        totalMaterials: snapshot.rows.length,
        totalOrderQty: snapshot.rows.reduce((sum, r) => sum + (r.qty ?? 0), 0),
        totalBalanceQty: snapshot.rows.reduce(
          (sum, r) => sum + (r.balance ?? 0),
          0,
        ),
      },
    };
  }
  async meta(branch: O2DBranch, rowId?: string): Promise<O2DMeta> {
    const snapshot = await this.repository.load(branch);
    return {
      branch,
      spreadsheetId: snapshot.source.id,
      sheetId: snapshot.source.sheetId,
      sheetName: snapshot.source.tab,
      headerRow: snapshot.source.header,
      columns: snapshot.headerMap.columns,
      duplicateHeaders: snapshot.headerMap.duplicateHeaders,
      identity: 'Enquiry No. + Sr no',
      formulaColumns: [...formulaColumns(snapshot)].map((i) => i + 1),
      ...(await this.workflowMeta(snapshot, rowId)),
    };
  }
  private async workflowMeta(
    snapshot: Awaited<ReturnType<O2DRepository['load']>>,
    rowId?: string,
  ) {
    const row = rowId ? snapshot.rows.find((r) => r.id === rowId) : undefined;
    if (rowId && !row)
      throw new BusinessError(
        409,
        'ROW_CHANGED',
        'The material moved. Refresh the O2D register.',
      );
    const workflow = await this.repository.workflow?.(snapshot, row?.rowNumber);
    const stepLayout = await this.repository.steps?.(snapshot, row?.rowNumber);
    return {
      ...(workflow ? { workflow, dropdowns: workflow.dropdowns } : {}),
      ...(stepLayout ? { stepLayout, ...(row ? { row } : {}) } : {}),
    };
  }
  async purchase(branch: O2DBranch, rowId: string) {
    const snapshot = await this.repository.load(branch);
    const row = snapshot.rows.find((r) => r.id === rowId);
    if (!row)
      throw new BusinessError(
        409,
        'ROW_CHANGED',
        'The material moved. Refresh the O2D register.',
      );
    const purchase = await this.repository.purchase?.(snapshot, row.rowNumber);
    if (!purchase)
      throw new BusinessError(
        503,
        'PURCHASE_SETTINGS_UNAVAILABLE',
        'Purchase settings could not be loaded.',
      );
    return purchase;
  }
  async enquiry(branch: O2DBranch, enquiryNo: string) {
    const data = await this.list(branch);
    return {
      ...data,
      rows: data.rows.filter((r) => r.enquiryNo === enquiryNo),
    };
  }
  async activity(branch: O2DBranch, enquiryNo: string, srNo?: string) {
    const snapshot = await this.repository.load(branch);
    const audit = snapshot.sheets.find((s) => s.title === 'CRE Audit Log');
    if (!audit) return [];
    const values = await new SheetsService(this.env).values(
      snapshot.source.id,
      audit.title,
    );
    return values
      .slice(1)
      .filter((r) =>
        srNo
          ? r[3] === `${enquiryNo}|${srNo}`
          : (r[3] ?? '').startsWith(`${enquiryNo}|`),
      )
      .map((r) => ({
        timestamp: r[0] ?? '',
        user: r[1] ?? '',
        action: r[2] ?? '',
        record: r[3] ?? '',
        field: r[4] ?? '',
        oldValue: r[5] ?? '',
        newValue: r[6] ?? '',
      }));
  }
}
export async function loadOrders(env: Env, branch: Branch) {
  return new O2DService(env).list(branch);
}
export function assertTransfer(
  rows: { status: string; poNumber: string; remarks: string; branch: string }[],
) {
  if (!rows.length)
    throw new BusinessError(
      400,
      'NO_MATERIALS',
      'Select at least one material.',
    );
  if (rows.some((r) => r.status.trim().toLowerCase() !== 'won'))
    throw new BusinessError(400, 'NOT_WON', 'Only Won materials can transfer.');
  if (rows.some((r) => !r.poNumber.trim()))
    throw new BusinessError(
      400,
      'PO_REQUIRED',
      'PO Number is required before transferring to O2D.',
    );
  if (rows.some((r) => !r.remarks.trim()))
    throw new BusinessError(
      400,
      'REMARKS_REQUIRED',
      'Remarks are required before transferring to O2D.',
    );
  if (
    new Set(rows.map((r) => normalizeBranch(r.branch))).size !== 1 ||
    !['FBD', 'MUM'].includes(normalizeBranch(rows[0]!.branch))
  )
    throw new BusinessError(
      400,
      'BRANCH_MISMATCH',
      'Transfer one supported branch at a time.',
    );
}
export function duplicateKey(row: {
  enquiryNo: string;
  sku: string;
  edge: string;
  qty: number | null;
  poNumber: string;
}) {
  return JSON.stringify([
    row.enquiryNo.trim(),
    row.sku.trim(),
    row.edge.trim(),
    row.qty,
    row.poNumber.trim(),
  ]);
}
