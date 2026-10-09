import { dateInputValue } from '@cre/shared';
import { O2DValidationReader } from './workflow.js';
import { O2DStepReader } from './steps.js';
import { O2DPurchaseReader, purchaseDateHeaders } from './purchase.js';
import type { O2DWorkflow, O2DPurchase, O2DStepLayout } from '@cre/shared';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { O2DBranch, O2DRow, O2DInvoiceBlock } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { createGoogleAuth } from '../google/auth.js';
import { SheetsService } from '../google/sheets.js';
import { BusinessError } from '../enquiries/creation.js';
import { numeric, safeLink } from '../enquiries/headers.js';
import { orderSource } from './config.js';
import { O2DHeaderMap, isBusinessEditable } from './headers.js';
const rangeSchema = z.object({
  sheetId: z.number().optional(),
  startRowIndex: z.number().optional(),
  endRowIndex: z.number().optional(),
  startColumnIndex: z.number().optional(),
  endColumnIndex: z.number().optional(),
});
const protectionSchema = z.object({
  range: rangeSchema.optional(),
  warningOnly: z.boolean().optional(),
  requestingUserCanEdit: z.boolean().optional(),
  unprotectedRanges: z.array(rangeSchema).optional(),
});
export type O2DProtectedRange = z.infer<typeof protectionSchema>;
const sheetSchema = z.object({
  properties: z.object({
    sheetId: z.number(),
    title: z.string(),
    gridProperties: z.object({ rowCount: z.number() }),
  }),
  protectedRanges: z.array(protectionSchema).optional(),
});
export interface O2DSnapshot {
  branch: O2DBranch;
  timeZone?: string;
  source: {
    id: string;
    tab: string;
    header: number;
    sheetId: number;
    rowCount: number;
  };
  values: string[][];
  formulas: string[][];
  headerMap: O2DHeaderMap;
  rows: O2DRow[];
  protectedRanges: O2DProtectedRange[];
  sheets: {
    sheetId: number;
    title: string;
    gridProperties: { rowCount: number };
  }[];
}
export interface O2DRepository {
  load(branch: O2DBranch): Promise<O2DSnapshot>;
  workflow?(snapshot: O2DSnapshot, rowNumber?: number): Promise<O2DWorkflow>;
  purchase?(snapshot: O2DSnapshot, rowNumber: number): Promise<O2DPurchase>;
  steps?(snapshot: O2DSnapshot, rowNumber?: number): Promise<O2DStepLayout>;
  commit(
    snapshot: O2DSnapshot,
    requests: Record<string, unknown>[],
  ): Promise<void>;
}
export function o2dRowId(
  source: O2DSnapshot['source'],
  rowNumber: number,
  enquiryNo: string,
  srNo: string,
) {
  return Buffer.from(
    JSON.stringify([source.id, source.sheetId, rowNumber, enquiryNo, srNo]),
  ).toString('base64url');
}
export function o2dRowVersion(values: string[], formulas: string[]) {
  return createHash('sha256')
    .update(JSON.stringify([values, formulas]))
    .digest('hex');
}
export function formulaColumns(
  snapshot: Pick<O2DSnapshot, 'source' | 'formulas'>,
) {
  const columns = new Set<number>();
  snapshot.formulas.forEach((row) =>
    row.forEach((v, c) => {
      // Preserve array output columns, including anchors embedded in headers or data rows.
      if (
        v.startsWith('=') &&
        /\b(?:ARRAYFORMULA|FILTER|QUERY|SEQUENCE)\s*\(/i.test(v)
      )
        columns.add(c);
    }),
  );
  return columns;
}
function rangeContains(
  range: z.infer<typeof rangeSchema>,
  sheetId: number,
  row: number,
  column: number,
) {
  return (
    (range.sheetId === undefined || range.sheetId === sheetId) &&
    row >= (range.startRowIndex ?? 0) &&
    row < (range.endRowIndex ?? Infinity) &&
    column >= (range.startColumnIndex ?? 0) &&
    column < (range.endColumnIndex ?? Infinity)
  );
}
export function isCellProtected(
  snapshot: O2DSnapshot,
  rowIndex: number,
  columnIndex: number,
  managedColumns = formulaColumns(snapshot),
) {
  if (
    snapshot.formulas[rowIndex]?.[columnIndex]?.startsWith('=') ||
    (rowIndex >= snapshot.source.header && managedColumns.has(columnIndex))
  )
    return true;
  return snapshot.protectedRanges.some(
    (p) =>
      !p.warningOnly &&
      p.requestingUserCanEdit !== true &&
      p.range &&
      rangeContains(p.range, snapshot.source.sheetId, rowIndex, columnIndex) &&
      !(p.unprotectedRanges ?? []).some((r) =>
        rangeContains(r, snapshot.source.sheetId, rowIndex, columnIndex),
      ),
  );
}
export function mapO2DRows(snapshot: O2DSnapshot): O2DRow[] {
  const { headerMap, source, values } = snapshot;
  const managedColumns = formulaColumns(snapshot);
  headerMap.requireColumn('Enquiry No.');
  headerMap.requireColumn('Sr no');
  headerMap.requireColumn('SKU');
  return values.slice(source.header).flatMap((row, index) => {
    const get = (name: string, occurrence?: number) => {
      const c = headerMap.findColumn(name, occurrence);
      return c === undefined ? '' : (row[c] ?? '').trim();
    };
    const enquiryNo = get('Enquiry No.');
    const srNo = get('Sr no');
    if (!enquiryNo && !get('Customer Name') && !get('SKU')) return [];
    const rowNumber = source.header + index + 1;
    const fields = headerMap.columns.map((column) => {
      const protectedCell = isCellProtected(
        snapshot,
        rowNumber - 1,
        column.column - 1,
        managedColumns,
      );
      return {
        ...column,
        value: row[column.column - 1] ?? '',
        ...(column.header.trim() === 'CRDD' ||
        purchaseDateHeaders.includes(column.header.trim().toLowerCase())
          ? {
              inputValue: dateInputValue(
                snapshot.formulas[rowNumber - 1]?.[
                  column.column - 1
                ]?.startsWith('=')
                  ? (row[column.column - 1] ?? '')
                  : (snapshot.formulas[rowNumber - 1]?.[column.column - 1] ??
                      row[column.column - 1] ??
                      ''),
              ),
            }
          : {}),
        protected: protectedCell,
        editable:
          !!enquiryNo &&
          !!srNo &&
          !protectedCell &&
          isBusinessEditable(column.header),
      };
    });
    const invoiceCount = headerMap.columns.filter(
      (c) => c.header.trim() === 'Planned Dispatch Date',
    ).length;
    const invoiceHistory: O2DInvoiceBlock[] = Array.from(
      { length: invoiceCount },
      (_, i) => ({
        occurrence: i + 1,
        plannedDispatchDate: get('Planned Dispatch Date', i + 1),
        qtyDispatched: numeric(get('Qty Dispatched', i + 1)),
        dispatchDate: get('Dispatch Date', i + 1),
        invoiceNo: get('Invoice No.', i + 1),
        invoiceDate: get('Invoice Date', i + 1),
        invoiceValue: numeric(get('Invoice Value', i + 1)),
        invoiceDueDate: get('Invoice Due Date', i + 1),
        fields: fields.filter((f) => f.section === `Invoice ${i + 1}`),
      }),
    );
    const link = get('Dispatch Order link');
    const linkFormula =
      snapshot.formulas[rowNumber - 1]?.[
        headerMap.findColumn('Dispatch Order link') ?? -1
      ] ?? '';
    return [
      {
        id: o2dRowId(source, rowNumber, enquiryNo, srNo),
        version: o2dRowVersion(row, snapshot.formulas[rowNumber - 1] ?? []),
        rowNumber,
        enquiryNo,
        srNo,
        customer: get('Customer Name'),
        salesPerson: get('Sales Person'),
        category: get('Category'),
        poNumber: get('PO Number'),
        poDate: get('PO Date'),
        sku: get('SKU'),
        thickness: get('Thk'),
        width: get('Width'),
        length: get('Lgt'),
        finish: get('Finish'),
        grade: get('Grade'),
        edge: get('Edge'),
        nos: numeric(get('Nos')),
        qty: numeric(get('Order Qty')),
        balance: numeric(get('Balance Qty')),
        rate: numeric(get('Order Rate')),
        totalValue: numeric(get('Total Value')),
        limit: get('LIMIT'),
        paymentTerms: get('Payment Terms'),
        receivingDate: get('Order Receiving Date & Time'),
        termsCondition: get('Terms & Condition'),
        sizeRateApproval: get('Size & Rate Approval'),
        materialStatus: get('Material Status'),
        lotNo: get('Lot NO.'),
        crdd: get('CRDD'),
        approval: get('PO Approval Status'),
        statusD: get('Status D'),
        statusG: get('Status G'),
        purchaseTargetDate: get('Purchase Target Date'),
        jindalExpectedDate: get('Jindal Expected Date'),
        jobWorkExpectedDate: get('Job Work Expected Date'),
        revisedCrdd: get('REVISED CRDD'),
        statusPr: get('Status PR'),
        dispatchLink:
          safeLink(link) ??
          safeLink(/^=HYPERLINK\(\s*"([^"]+)"/i.exec(linkFormula)?.[1] ?? ''),
        vehicleNumber: get('VEHICLE NUMBER'),
        transporter: get('TRASPOTER NAME'),
        remarks: get('Remarks/ Challenges'),
        status: get('Status', 2),
        processStatus: get('Status', 1),
        finalStatusTimestamp:
          get('Final Status Timestamp') || get('Final Status TImestam[p'),
        moveStatus: get('Move status'),
        fields,
        protectedFields: fields
          .filter((f) => f.protected)
          .map((f) => `${f.letter}: ${f.header.trim()}`),
        invoiceHistory,
      },
    ];
  });
}
export class GoogleSheetsO2DRepository implements O2DRepository {
  private sheets: SheetsService;
  private auth;
  constructor(private env: Env) {
    this.sheets = new SheetsService(env, true);
    this.auth = createGoogleAuth(env);
  }
  async load(branch: O2DBranch): Promise<O2DSnapshot> {
    const configured = orderSource(this.env, branch);
    try {
      const response = await this.auth.request({
        url: `https://sheets.googleapis.com/v4/spreadsheets/${configured.id}?fields=properties(timeZone),sheets(properties(sheetId,title,gridProperties(rowCount)),protectedRanges(range,warningOnly,requestingUserCanEdit,unprotectedRanges))`,
        method: 'GET',
        timeout: this.env.GOOGLE_TIMEOUT_MS,
        retry: false,
      });
      const meta = z
        .object({
          sheets: z.array(sheetSchema),
          properties: z.object({ timeZone: z.string() }).optional(),
        })
        .parse(response.data);
      const sheet = meta.sheets.find((s) => s.properties.sheetId === 0);
      if (!sheet)
        throw new BusinessError(
          409,
          'O2D_SHEET_MISSING',
          `The ${branch} spreadsheet has no gid=0 tab.`,
        );
      // Use the actual gid=0 title even if the tab was renamed after configuration.
      const source = {
        ...configured,
        tab: sheet.properties.title,
        sheetId: sheet.properties.sheetId,
        rowCount: sheet.properties.gridProperties.rowCount,
      };
      const [values, formulas] = await Promise.all([
        this.sheets.values(source.id, source.tab),
        this.sheets.values(source.id, source.tab, 'FORMULA'),
      ]);
      const headerMap = new O2DHeaderMap(values[source.header - 1] ?? []);
      for (const name of [
        'Sr no',
        'Enquiry No.',
        'Customer Name',
        'SKU',
        'Order Qty',
        'Order Rate',
        'Order Receiving Date & Time',
      ])
        headerMap.requireColumn(name);
      const snapshot: O2DSnapshot = {
        branch,
        timeZone: meta.properties?.timeZone,
        source,
        values,
        formulas,
        headerMap,
        rows: [],
        protectedRanges: sheet.protectedRanges ?? [],
        sheets: meta.sheets.map((s) => s.properties),
      };
      snapshot.rows = mapO2DRows(snapshot);
      return snapshot;
    } catch (error) {
      if (error instanceof BusinessError) throw error;
      const status = z
        .object({ response: z.object({ status: z.number() }).optional() })
        .safeParse(error);
      if (
        status.success &&
        [403, 404].includes(status.data.response?.status ?? 0)
      )
        throw new BusinessError(
          403,
          'O2D_ACCESS_DENIED',
          `The service account cannot read O2D ${branch}. Check access to its configured spreadsheet.`,
        );
      throw new BusinessError(
        503,
        'O2D_REGISTER_UNAVAILABLE',
        `Could not read O2D ${branch}. Check the Google Sheets connection and retry.`,
      );
    }
  }
  async workflow(snapshot: O2DSnapshot, rowNumber?: number) {
    return new O2DValidationReader(this.env).read(snapshot, rowNumber);
  }
  async purchase(snapshot: O2DSnapshot, rowNumber: number) {
    return new O2DPurchaseReader(this.env).read(snapshot, rowNumber);
  }
  async steps(snapshot: O2DSnapshot, rowNumber?: number) {
    return new O2DStepReader(this.env).read(snapshot, rowNumber);
  }
  async commit(snapshot: O2DSnapshot, requests: Record<string, unknown>[]) {
    if (requests.length) await this.sheets.batch(snapshot.source.id, requests);
  }
}
