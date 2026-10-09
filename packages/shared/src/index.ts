export const enquiryTypes = ['CRR', 'NBD'] as const;
export type EnquiryType = (typeof enquiryTypes)[number];
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string }; data?: T };

export interface Health {
  status: 'ok';
  service: string;
  timestamp: string;
  phase: 1;
}
export interface SourceHealth {
  type: EnquiryType | 'O2D_FBD' | 'O2D_MUM';
  status: 'connected' | 'error';
  code?: string;
  message: string;
}
export interface GoogleHealth {
  readOnly: true;
  checkedAt: string;
  sources: SourceHealth[];
}

export interface SheetMetadataSource {
  type: SourceHealth['type'];
  status: 'connected' | 'error';
  message: string;
  code?: string;
  tabs: { id: number; name: string }[];
  configuredTab: string | null;
  headerRow: number | null;
  headers: string[] | null;
}
export interface SheetsMetadata {
  readOnly: true;
  checkedAt: string;
  sources: SheetMetadataSource[];
}

export interface EnquiryMaterial {
  id: string;
  rowNumber: number;
  enquiryNo: string;
  date: string;
  customer: string;
  salesPerson: string;
  branch: string;
  state: string;
  purchaser: string;
  phone: string;
  email: string;
  materialType: string;
  sku: string;
  edge: string;
  qty: number | null;
  orderQty?: number | null;
  orderQtyRaw?: string;
  orderDate?: string;
  thickness?: string;
  width?: string;
  length?: string;
  finish?: string;
  grade?: string;
  limit: string;
  mode: string;
  rate: number | null;
  status: string;
  remarks: string;
  poNumber: string;
  quoteUrl: string | null;
  orderId: string;
  updatedAt: string;
  version: string;
}
export interface EnquiryRegister {
  type: EnquiryType;
  rows: EnquiryMaterial[];
  fetchedAt: string;
}

export { createEnquirySchema, type CreateEnquiryInput } from './schemas.js';

export type {
  O2DBranch,
  O2DColumn,
  O2DField,
  O2DInvoiceBlock,
  O2DRow,
  O2DData,
  O2DMeta,
  O2DWorkflow,
  O2DPurchase,
  O2DStepField,
  O2DWorkflowStep,
  O2DStepLayout,
  O2DWorkflowKey,
  O2DDropdownKey,
  O2DDropdowns,
  O2DTransferInput,
  O2DCellChange,
  O2DRowUpdate,
} from './o2d.js';

export { normalizeBranch } from './branch.js';

export { dateInputValue, dateSerial } from './dates.js';

export type {
  DispatchCompany,
  DispatchOrderLine,
  DispatchOverrides,
  DispatchOrderDocument,
  DispatchMaterials,
  DispatchPreview,
  DispatchSaved,
} from './dispatch.js';
