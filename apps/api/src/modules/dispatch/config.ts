import type { DispatchCompany, O2DBranch } from '@cre/shared';
import type { Env } from '../../config/env.js';
// Verified from Dispatch_Order_2091_2026-10-05_113529.pdf (FBD) and
// Dispatch_Order_48_2026-07-28_122059.pdf (MUM); never use legacy workbook IDs.
export function dispatchCompany(env: Env, branch: O2DBranch): DispatchCompany {
  return {
    companyName: env.DM_COMPANY_NAME || 'D.M. Metalloys Pvt. Ltd.',
    companyHO:
      env.DM_COMPANY_ADDRESS ||
      'H.O. : 27, Gurjar Building, Office No. 1, Sadashiv Cross Lane, Girgaum, Mumbai - 400004.',
    companyContact:
      'Tel.: 022 2389 2680, 2380 7083 / +91 9867875505 / sales@dmmetals.com / www.dmmetals.com',
    batch: branch === 'FBD' ? 'FARIDABAD' : 'MAHARASHTRA',
    companyGSTIN:
      env[`DISPATCH_${branch}_GSTIN`] ||
      (branch === 'FBD' ? '06AADCD4951F1ZU' : '27AADCD4951F1ZQ'),
    dispatchFromAddress:
      env[`DISPATCH_${branch}_ADDRESS`] ||
      (branch === 'FBD'
        ? 'PROPERTY NO 688,Faridabad ,SECTOR 59, LOHA MANDI URBAN ESTATE,\nFARIDABAD 121001 (Haryana)'
        : 'DM Address: Plot no 1439,KCW ,Kalamboli steel market, Navi Mumbai 410218'),
    bankDetails: 'M/s. D. M. Metalloys Pvt. Ltd.',
    bankName: 'STATE BANK OF INDIA',
    accountNo: '36998510522',
    branchName: 'GIRGAON',
  };
}
export const dispatchTerms =
  '1) Goods once sold cannot be taken back.\n2) Our responsibility ceases on delivery of goods to carriers.\n3) Payment requested by Cross & Order Cheque/Draft.\n4) Interest will be charged 30% per annum if the amount of the invoice is not paid on due date.';
export const dispatchFooter =
  "This is a Computer Generated Document and Doesn't Require Signature";
