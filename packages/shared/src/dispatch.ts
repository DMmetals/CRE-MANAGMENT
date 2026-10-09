import type { O2DBranch } from './o2d.js';
export interface DispatchCompany {
  companyName: string;
  companyHO: string;
  companyContact: string;
  batch: string;
  companyGSTIN: string;
  dispatchFromAddress: string;
  bankDetails: string;
  bankName: string;
  accountNo: string;
  branchName: string;
}
export interface DispatchOrderLine {
  srNo: string;
  sku: string;
  lotNo: string;
  grade: string;
  mt: string;
  finish: string;
  thk: string;
  wid: string;
  lgt: string;
  nos: string;
  qty: string;
  unitPrice: string;
  totalPrice: string;
}
export interface DispatchOverrides {
  date?: string;
  termsOfPayment?: string;
  poRefNo?: string;
  termsOfDelivery?: string;
  deliveryLocation?: string;
  shipToName?: string;
  shipToAddress?: string;
  shipGSTIN?: string;
  billToName?: string;
  billToAddress?: string;
  billGSTIN?: string;
  vehicleNumber?: string;
  transporterName?: string;
  otherCharges?: string | number;
  pkgLoading?: string | number;
  gstRate?: string | number;
  termsText?: string;
  footerText?: string;
}
export interface DispatchOrderDocument extends DispatchCompany {
  branch: O2DBranch;
  enquiryNo: string;
  selectedSrNos: string[];
  customer: string;
  date: string;
  termsOfPayment: string;
  poRefNo: string;
  termsOfDelivery: string;
  deliveryLocation: string;
  shipToName: string;
  shipToAddress: string;
  shipGSTIN: string;
  billToName: string;
  billToAddress: string;
  billGSTIN: string;
  vehicleNumber: string;
  transporterName: string;
  transporterGST: string;
  lines: DispatchOrderLine[];
  otherCharges: string;
  pkgLoading: string;
  gstRate: string;
  totalQty: string;
  goodsTotal: string;
  taxableTotal: string;
  gstAmount: string;
  grandTotal: string;
  termsText: string;
  footerText: string;
  sourceVersions: Record<string, string>;
  warnings: string[];
}
export interface DispatchMaterials {
  rows: {
    srNo: string;
    sku: string;
    customer: string;
    approved: boolean;
    approval: string;
    version: string;
  }[];
  transporters: { name: string; gstin: string }[];
  warnings: string[];
  company: DispatchCompany;
  emailReady: boolean;
  writesEnabled: boolean;
  emailTo: string;
}
export interface DispatchPreview {
  document: DispatchOrderDocument;
  html: string;
  fingerprint: string;
  filename: string;
}
export interface DispatchSaved {
  id: string;
  url: string;
  filename: string;
  updatedRows: number;
  emailSent?: boolean;
  messageId?: string;
  warnings?: string[];
}
