export type O2DBranch = 'FBD' | 'MUM';
export interface O2DColumn {
  column: number;
  letter: string;
  header: string;
  occurrence: number;
  section: string;
  meaning: string;
}
export interface O2DField extends O2DColumn {
  value: string;
  protected: boolean;
  editable: boolean;
  inputValue?: string;
}
export interface O2DInvoiceBlock {
  occurrence: number;
  plannedDispatchDate: string;
  qtyDispatched: number | null;
  dispatchDate: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceValue: number | null;
  invoiceDueDate: string;
  fields: O2DField[];
}
export interface O2DRow {
  id: string;
  version: string;
  rowNumber: number;
  enquiryNo: string;
  srNo: string;
  customer: string;
  salesPerson: string;
  category: string;
  poNumber: string;
  poDate: string;
  sku: string;
  thickness: string;
  width: string;
  length: string;
  finish: string;
  grade: string;
  edge: string;
  nos: number | null;
  qty: number | null;
  balance: number | null;
  rate: number | null;
  totalValue: number | null;
  limit: string;
  paymentTerms: string;
  receivingDate: string;
  termsCondition: string;
  sizeRateApproval: string;
  materialStatus: string;
  lotNo: string;
  crdd: string;
  approval: string;
  statusD: string;
  statusG: string;
  purchaseTargetDate: string;
  jindalExpectedDate: string;
  jobWorkExpectedDate: string;
  revisedCrdd: string;
  statusPr: string;
  dispatchLink: string | null;
  vehicleNumber: string;
  transporter: string;
  remarks: string;
  status: string;
  processStatus: string;
  finalStatusTimestamp: string;
  moveStatus: string;
  fields: O2DField[];
  protectedFields: string[];
  invoiceHistory: O2DInvoiceBlock[];
}
export interface O2DData {
  branch: O2DBranch;
  rows: O2DRow[];
  fetchedAt: string;
  identityVerified: boolean;
  warning: string | null;
  kpis: {
    totalOrders: number;
    totalMaterials: number;
    totalOrderQty: number;
    totalBalanceQty: number;
  };
}
export interface O2DMeta {
  branch: O2DBranch;
  spreadsheetId: string;
  sheetId: number;
  sheetName: string;
  headerRow: number;
  columns: O2DColumn[];
  duplicateHeaders: {
    header: string;
    columns: number[];
    occurrences: number;
  }[];
  identity: 'Enquiry No. + Sr no';
  formulaColumns: number[];
  workflow?: O2DWorkflow;
  dropdowns?: O2DDropdowns;
  stepLayout?: O2DStepLayout;
  row?: O2DRow;
}
export interface O2DTransferInput {
  type: 'CRR' | 'NBD';
  enquiryNo: string;
  branch?: O2DBranch;
}
export interface O2DCellChange {
  column: number;
  value: string | number;
}
export interface O2DRowUpdate {
  id: string;
  version: string;
  changes: O2DCellChange[];
}

export type O2DDropdownKey =
  | 'orderVerification'
  | 'termsCondition'
  | 'sizeRateApproval'
  | 'materialStatus'
  | 'poApprovalStatus';
export type O2DDropdowns = Record<O2DDropdownKey, string[]>;
export type O2DWorkflowKey =
  | O2DDropdownKey
  | 'receivingDate'
  | 'receiptPlanned'
  | 'receiptActual'
  | 'receiptDelay'
  | 'poCopy'
  | 'revisedPoCopy'
  | 'step2Planned'
  | 'step2Actual'
  | 'step2Delay'
  | 'step3Planned'
  | 'step3Actual'
  | 'step3Delay'
  | 'lotNo'
  | 'crdd';
export interface O2DWorkflow {
  fields: Record<O2DWorkflowKey, O2DColumn>;
  dropdowns: O2DDropdowns;
  dropdownSources: Record<
    O2DDropdownKey,
    'sheet' | 'supplied-default' | 'business-rule'
  >;
  warnings: string[];
  writesEnabled: boolean;
  uploadMaxBytes: number;
}

/** Purchase-only bindings; existing tab mappings and endpoints remain unchanged. */
export interface O2DPurchase {
  columns: number[];
  readOnlyColumns: number[];
  dateColumns: number[];
  dropdowns: Record<number, string[]>;
  finalStatusColumn: number;
  dispatchLinkColumn: number;
  writesEnabled: boolean;
}

export interface O2DStepField extends O2DField {
  key: string;
  label: string;
  rawValue: string | number | boolean | null;
  effectiveValue: string | number | boolean | null;
  formattedValue: string;
  formula: string | null;
  hasFormula: boolean;
  inputType: 'text' | 'date' | 'select' | 'po' | 'revised-po' | 'dispatch-link';
  validationOptions?: string[];
  validationSource?: 'sheet' | 'supplied-default';
}
export interface O2DWorkflowStep {
  key: string;
  stepNumber: number | null;
  title: string;
  who: string;
  how: string;
  sla: string;
  tab: 'Process Status' | 'Purchase' | 'Dispatch';
  headerRange: { startColumn: number; endColumn: number };
  fields: O2DStepField[];
}
export interface O2DStepLayout {
  steps: O2DWorkflowStep[];
  warnings: string[];
  writesEnabled: boolean;
  uploadMaxBytes: number;
}
