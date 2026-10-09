import { dateSerial } from '@cre/shared';
import type { O2DPurchase, O2DRow } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
import { cellWrite } from '../google/sheets.js';
import { normalizeO2DHeader } from './headers.js';
import { formulaColumns, type O2DSnapshot } from './repository.js';
import { O2DValidationReader } from './workflow.js';

export const purchaseDateHeaders = [
  'purchase target date',
  'jindal expected date',
  'job work expected date',
  'revised crdd',
];
export const purchaseDefaults = {
  approval: ['Approved', 'Hold', 'Cancelled'],
  remarks: [
    'Awaiting for LC',
    'Awaiting for Customer Confirmation',
    'Awaiting for Payment',
    'Hold by DineshJi',
    'Hold by Salesperson',
    'Order cancel by Client',
    'Awaiting for Jindal Material',
    'Payment Received',
    'Awaiting for Amended PO',
    'Received Jindal material',
    'Order Short Closed',
    "Excess Sold with Buyer's Confirmation",
    'Awaiting Part Load Vehicle',
    'Awaiting for Customer Vehicle',
    'Hold by Vikrambhai',
    'ORDER HOLD BY CUSTOMER',
    'AWAITING FOR MUMBAI INCOMING MATERIAL',
    'ORDER NOT BOOK IN JINDAL',
    'AWAITING FOR CUTTER CONFIRMATION',
    'No Issues \u2013 Proceed',
    'AWAITING FOR JINDAL YARD MATERIAL',
    'AWAITING FOR YASH REPLY',
  ],
  final: [
    'Closed',
    'Cancelled',
    'Short closed',
    "Excess sold with buyer's consent",
    'Partly closed, Party cancelled',
    'Order Amended',
    'Order Shift to MUM',
    'Order Shift to CHN',
    'Dispatch from delhi',
    'DOUBLE ENTRY',
  ],
};
export function purchaseLayout(snapshot: O2DSnapshot) {
  const all = snapshot.headerMap.columns;
  const start = snapshot.headerMap.requireColumn('Planned D') + 1;
  const end = snapshot.headerMap.requireColumn('Move status') + 1;
  const fields = all.filter(
    (c) => c.column >= start && c.column <= end && c.header.trim(),
  );
  const column = (...names: string[]) => {
    const found = fields.filter((c) =>
      names.some((n) => normalizeO2DHeader(c.header) === normalizeO2DHeader(n)),
    );
    if (found.length !== 1)
      throw new BusinessError(
        409,
        'PURCHASE_LAYOUT_CHANGED',
        `Cannot uniquely map ${names[0]} in Purchase. Refresh and check the Sheet headers.`,
      );
    return found[0]!.column;
  };
  const finalStatusColumn = column('Status', 'Final Order Status');
  const dispatchLinkColumn = column('Dispatch Order link');
  const statusPairs = [
    [column('Status D'), column('Actual D')],
    [column('Status G'), column('Actual G')],
    [column('Status PR'), column('Actual PR')],
    [
      finalStatusColumn,
      column('Final Status Timestamp', 'Final Status TImestam[p'),
    ],
  ] as const;
  return {
    columns: fields.map((f) => f.column),
    dateColumns: purchaseDateHeaders.map((h) => column(h)),
    readOnlyColumns: fields
      .filter(
        (f) =>
          /^(planned|actual|time delay|final status time)/i.test(
            f.header.trim(),
          ) || f.column === dispatchLinkColumn,
      )
      .map((f) => f.column),
    finalStatusColumn,
    dispatchLinkColumn,
    statusPairs,
    defaultDropdowns: {
      [column('Status PR')]: purchaseDefaults.approval,
      [column('Remarks/ Challenges')]: purchaseDefaults.remarks,
      [finalStatusColumn]: purchaseDefaults.final,
    },
    dropdownColumns: [
      column('Status D'),
      column('Status G'),
      column('Status PR'),
      column('Remarks/ Challenges'),
      finalStatusColumn,
      ...fields
        .filter((f) => normalizeO2DHeader(f.header) === 'material status sg')
        .map((f) => f.column),
    ],
  };
}
export class O2DPurchaseReader {
  constructor(
    private env: Env,
    private validation = new O2DValidationReader(env),
  ) {}
  async read(snapshot: O2DSnapshot, rowNumber: number): Promise<O2DPurchase> {
    const layout = purchaseLayout(snapshot);
    const sheetOptions = await this.validation.readColumns(
      snapshot,
      rowNumber,
      layout.dropdownColumns,
    );
    return {
      columns: layout.columns,
      readOnlyColumns: layout.readOnlyColumns,
      dateColumns: layout.dateColumns,
      finalStatusColumn: layout.finalStatusColumn,
      dispatchLinkColumn: layout.dispatchLinkColumn,
      // Actual cell validation is authoritative. Defaults are only for absent validation.
      dropdowns: { ...layout.defaultDropdowns, ...sheetOptions },
      writesEnabled: this.env.ENABLE_SHEET_WRITES === 'true',
    };
  }
}
/** Sheet serials are local wall-clock values, not UTC instants. */
export function purchaseTimestamp(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return (
    dateSerial(`${value('year')}-${value('month')}-${value('day')}`)! +
    (Number(value('hour')) * 3600 +
      Number(value('minute')) * 60 +
      Number(value('second'))) /
      86400
  );
}
export function purchaseActualWrite(
  snapshot: O2DSnapshot,
  row: O2DRow,
  statusColumn: number,
  newValue: string | number,
  now: Date,
) {
  const pair = purchaseLayout(snapshot).statusPairs.find(
    ([status]) => status === statusColumn,
  );
  if (!pair || !String(newValue).trim()) return;
  const status = row.fields.find((f) => f.column === statusColumn)!;
  const actual = row.fields.find((f) => f.column === pair[1])!;
  if (status.value.trim() || actual.value.trim()) return;
  // Formula-backed Actual cells remain entirely under the Sheet's control.
  if (
    snapshot.formulas[row.rowNumber - 1]?.[actual.column - 1]?.startsWith(
      '=',
    ) ||
    formulaColumns(snapshot).has(actual.column - 1)
  )
    return;
  if (actual.protected)
    throw new BusinessError(
      403,
      'PURCHASE_ACTUAL_PROTECTED',
      `${actual.header} is protected. The status was not saved; allow the service account to update this timestamp.`,
    );
  if (!snapshot.timeZone)
    throw new BusinessError(
      409,
      'SHEET_TIMEZONE_REQUIRED',
      'The spreadsheet timezone could not be read. Retry before saving a status.',
    );
  const serial = purchaseTimestamp(now, snapshot.timeZone);
  const write = cellWrite(
    snapshot.source.sheetId,
    row.rowNumber - 1,
    actual.column - 1,
    serial,
  );
  Object.assign(write.updateCells.rows[0]!.values[0]!, {
    userEnteredFormat: {
      numberFormat: { type: 'DATE_TIME', pattern: 'dd/MM/yyyy HH:mm:ss' },
    },
  });
  write.updateCells.fields = 'userEnteredValue,userEnteredFormat.numberFormat';
  return { write, field: actual, value: serial };
}
