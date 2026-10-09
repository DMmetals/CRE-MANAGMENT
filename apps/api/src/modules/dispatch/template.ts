import type { DispatchOrderDocument } from '@cre/shared';
import { escapeHtml } from '../documents/pdf.js';
function format(value: string, decimals: number) {
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: decimals === 3 ? 0 : decimals,
    maximumFractionDigits: decimals,
  });
}
function displayDate(value: string) {
  const [y, m, d] = value.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}
// Migrated from _doHtmlBuildPdfHtml_; one template serves browser, download, Drive and email.
export function dispatchHtml(data: DispatchOrderDocument) {
  const lineHtml = data.lines
    .map(
      (r) =>
        `<tr><td class="addr">${escapeHtml(r.lotNo)}</td><td>${escapeHtml(r.grade)}</td><td>${escapeHtml(r.finish)}</td><td class="center">${escapeHtml(r.thk)}</td><td class="center">${escapeHtml(r.wid)}</td><td class="center">${escapeHtml(r.lgt)}</td><td class="center">${escapeHtml(r.nos)}</td><td class="right">${format(r.qty, 3)}</td><td class="right">${format(r.unitPrice, 2)}</td><td class="right">${format(r.totalPrice, 2)}</td></tr>`,
    )
    .join('');
  const terms = data.termsText
    .split(/\r?\n/)
    .filter(Boolean)
    .map((t) => `<div>${escapeHtml(t)}</div>`)
    .join('');
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4 portrait;
    margin: 8mm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  html,
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #000;
    margin: 0;
    background: #ffffff !important;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    table-layout: fixed;
  }

  td,
  th {
    border: 1px solid #000;
    padding: 3px 4px;
    vertical-align: top;
    overflow-wrap: anywhere;
  }

  tr { break-inside: avoid; }
  .center {
    text-align: center;
  }

  .right {
    text-align: right;
  }

  .bold {
    font-weight: bold;
  }

  .orange {
    background-color: #e69138 !important;
    background: #e69138 !important;
    height: 13px;
  }

  .blue {
    background-color: #6d9eeb !important;
    background: #6d9eeb !important;
    font-weight: bold;
    text-align: center;
    font-size: 12px;
  }

  .head h1 {
    font-size: 15px;
    margin: 2px 0 0;
    text-decoration: underline;
  }

  .head div {
    font-size: 9px;
    line-height: 1.25;
  }

  .section {
    font-weight: bold;
    background-color: #f3f3f3 !important;
    background: #f3f3f3 !important;
  }

  .item-head th {
    background-color: #f6b26b !important;
    background: #f6b26b !important;
    font-weight: bold;
    text-align: center;
  }

  .footer {
    text-align: center;
    font-size: 10px;
  }

  .addr {
    white-space: pre-line;
    line-height: 1.3;
  }
</style>
</head>

<body>
<table>
  <colgroup>
    <col style="width:9%">
    <col style="width:10%">
    <col style="width:10%">
    <col style="width:7%">
    <col style="width:8%">
    <col style="width:8%">
    <col style="width:7%">
    <col style="width:12%">
    <col style="width:13%">
    <col style="width:16%">
  </colgroup>

  <tr>
    <td colspan="10" class="orange"></td>
  </tr>

  <tr>
    <td colspan="10" class="center head">
      <h1>${escapeHtml(data.companyName)}</h1>
      <div>${escapeHtml(data.companyHO)}</div>
      <div>${escapeHtml(data.companyContact)}</div>
    </td>
  </tr>

  <tr>
    <td colspan="10" class="blue">
      Dispatch Order
    </td>
  </tr>

  <tr>
    <td colspan="6"><b>Batch:</b> ${escapeHtml(data.batch)}</td>
    <td colspan="2"><b>Enquiry No:</b></td>
    <td colspan="2">${escapeHtml(data.enquiryNo)}</td>
  </tr>

  <tr>
    <td colspan="6"><b>GSTIN:</b> ${escapeHtml(data.companyGSTIN)}</td>
    <td colspan="2"><b>DATE</b></td>
    <td colspan="2">${escapeHtml(displayDate(data.date))}</td>
  </tr>

  <tr>
    <td colspan="6" rowspan="3">
      <b>Dispatch From Address:</b>
      <div class="addr">${escapeHtml(data.dispatchFromAddress)}</div>
    </td>
    <td colspan="2"><b>Terms of Payment:</b></td>
    <td colspan="2">${escapeHtml(data.termsOfPayment)}</td>
  </tr>

  <tr>
    <td colspan="2"><b>Ref No:</b></td>
    <td colspan="2">${escapeHtml(data.poRefNo)}</td>
  </tr>

  <tr>
    <td colspan="2"><b>Terms of Delivery:</b></td>
    <td colspan="2">${escapeHtml(data.termsOfDelivery)}</td>
  </tr>

  <tr>
    <td colspan="6" class="section">
      Consignee (Ship To)
    </td>
    <td colspan="2"><b>Delivery Location:</b></td>
    <td colspan="2">${escapeHtml(data.deliveryLocation)}</td>
  </tr>

  <tr>
    <td colspan="6"><b>${escapeHtml(data.shipToName)}</b></td>
    <td colspan="2" class="section">Bank Details:</td>
    <td colspan="2">${escapeHtml(data.bankDetails)}</td>
  </tr>

  <tr>
    <td colspan="6" rowspan="2" class="addr">${escapeHtml(data.shipToAddress)}</td>
    <td colspan="2"><b>Bank Name:</b></td>
    <td colspan="2">${escapeHtml(data.bankName)}</td>
  </tr>

  <tr>
    <td colspan="2"><b>Account No.:</b></td>
    <td colspan="2">${escapeHtml(data.accountNo)}</td>
  </tr>

  <tr>
    <td><b>GSTIN:</b></td>
    <td colspan="5">${escapeHtml(data.shipGSTIN)}</td>
    <td colspan="2"><b>Branch Name:</b></td>
    <td colspan="2">${escapeHtml(data.branchName)}</td>
  </tr>

  <tr>
    <td colspan="6" class="section">
      Buyer (Bill to)
    </td>
    <td colspan="2"><b>Vehicle Number:</b></td>
    <td colspan="2">${escapeHtml(data.vehicleNumber)}</td>
  </tr>

  <tr>
    <td colspan="6"><b>${escapeHtml(data.billToName)}</b></td><td colspan="2"><b>Transporter Name:</b></td><td colspan="2">${escapeHtml(data.transporterName)}</td>
  </tr>

  <tr>
    <td colspan="6" class="addr">${escapeHtml(data.billToAddress)}</td><td colspan="2"><b>Transporter GSTIN:</b></td><td colspan="2">${escapeHtml(data.transporterGST)}</td>
  </tr>

  <tr>
    <td><b>GSTIN:</b></td>
    <td colspan="9">${escapeHtml(data.billGSTIN)}</td>
  </tr>

  <tr class="item-head">
    <th>LOT NO.</th>
    <th>GRADE</th>
    <th>FINISH</th>
    <th>THK</th>
    <th>WID</th>
    <th>LGT</th>
    <th>NOS</th>
    <th>Qty (Kgs)</th>
    <th>Unit price</th>
    <th>Total price</th>
  </tr>

  ${lineHtml}

  <tr>
    <td colspan="7"></td>
    <td class="right bold">${format(data.totalQty, 3)} Kgs</td>
    <td></td>
    <td class="right bold">${format(data.goodsTotal, 2)}</td>
  </tr>

  <tr>
    <td colspan="8" rowspan="5">
      <b>Terms & Conditions :-</b><br><br>
      ${terms}
    </td>
    <td class="right">Other Charges</td>
    <td class="right">${format(data.otherCharges, 2)}</td>
  </tr>

  <tr>
    <td class="right">Pkg. & Loading Charges</td>
    <td class="right">${format(data.pkgLoading, 2)}</td>
  </tr>

  <tr>
    <td class="right bold">Total</td>
    <td class="right bold">${format(data.taxableTotal, 2)}</td>
  </tr>

  <tr>
    <td class="right">GST (${format(data.gstRate, 0)}%)</td>
    <td class="right">${format(data.gstAmount, 2)}</td>
  </tr>

  <tr>
    <td class="right bold">Rs.</td>
    <td class="right bold">${format(data.grandTotal, 2)}</td>
  </tr>

  <tr>
    <td colspan="10" class="footer">
      ${escapeHtml(data.footerText)}
    </td>
  </tr>
</table>
</body>
</html>`;
}
