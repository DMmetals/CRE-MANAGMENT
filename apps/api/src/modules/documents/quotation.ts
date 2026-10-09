import { escapeHtml as h } from './pdf.js';
export function quotationHtml(input: {
  company: string;
  companyAddress: string;
  companyGstin: string;
  enquiry: string;
  date: string;
  customer: string;
  address: string;
  gstin: string;
  purchaser: string;
  branch: string;
  rows: (string | number)[][];
  terms: Record<string, string>;
  notes: string;
}) {
  const headers = [
    'Thk',
    'Width',
    'Lgt',
    'Finish',
    'Grade',
    'Edge',
    'Qty',
    'Jindal Rate',
    'Unit',
  ];
  const rows = [...input.rows];
  while (rows.length < 12) rows.push(Array<string>(10).fill(''));
  const dm = input.company === 'D.M. Metalloys Pvt. Ltd.';
  const companyAddress =
    input.companyAddress ||
    (dm
      ? 'H.O. : 27, Gurjar Building, Office No. 1, Sadashiv Cross Lane, Girgaum, Mumbai- 400004.'
      : '');
  const contact = dm
    ? 'Tel.: 022 2389 2680, 2380 7083 / +91 9867675505 / sales@dmmetals.com/ www.dmmetals.com'
    : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date)
    ? new Date(input.date + 'T12:00:00Z')
        .toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
        .replaceAll(' ', '-')
    : input.date;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page{size:A4;margin:53pt 50pt 50pt}*{box-sizing:border-box}body{margin:0;color:#000;font:8pt Arial}.sheet{border-left:.6pt solid #444;border-right:.6pt solid #444;border-bottom:.6pt solid #444;padding-bottom:6pt}.top-space{height:16pt;border-top:.6pt solid #444}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{border:.6pt solid #444;padding:2pt;overflow-wrap:anywhere}h1{font:bold 17pt 'Times New Roman';margin:0;padding:3pt;background:#6d9eeb;text-align:center;border-top:.6pt solid #444;border-bottom:.6pt solid #444}.address,.contact{text-align:center;height:16pt;padding:3pt 0;border-bottom:.6pt solid #444}.contact{color:#1155cc;text-decoration:underline}.title{background:#6aa84f;text-align:center;font:bold 9pt 'Times New Roman';padding:3pt}.details td{height:16pt;font-weight:bold}.details .customer-address{height:31pt}.intro{height:46pt;padding:3pt 2pt;font-weight:bold;display:flex;flex-direction:column;justify-content:space-between}.materials{text-align:center;font:8pt 'Times New Roman'}.materials th{background:#e69138;height:24pt}.materials .description{background:#a4c2f4;height:16pt}.materials td{height:12.7pt;padding:1pt}.materials thead{display:table-header-group}tr{break-inside:avoid}.terms{padding:6pt 2pt 0;font:8pt 'Times New Roman';break-inside:avoid}.term{display:flex;min-height:17pt;align-items:flex-start}.term b{width:63pt;flex-shrink:0;font-weight:normal}.term:first-child{font-weight:bold}.term:first-child b{font-weight:bold}.term span{white-space:pre-wrap}footer{font-weight:bold;line-height:2;margin-top:20pt}
  </style></head><body><main class="sheet"><div class="top-space"></div><h1>${h(input.company || 'DRAFT - Company details required')}</h1><div class="address">${h(companyAddress)}</div><div class="contact">${h(contact)}</div><div class="title">Quotation</div>
  <table class="details"><colgroup><col style="width:13%"><col style="width:11%"><col style="width:21%"><col style="width:20%"><col style="width:7%"><col style="width:28%"></colgroup><tr><td colspan="2">Enq Number:</td><td style="font-weight:normal">${h(input.enquiry)}</td><td style="text-align:center">DATE:</td><td colspan="2" style="text-align:center">${h(date)}</td></tr><tr><td colspan="4">To,</td><td>Branch:</td><td style="text-align:center">${h(input.branch)}</td></tr><tr><td colspan="4">${h(input.customer)}</td><td>GSTIN:</td><td style="text-align:center">${h(input.gstin)}</td></tr><tr><td class="customer-address">Address:</td><td colspan="5">${h(input.address)}</td></tr></table>
  <div class="intro"><span>Kind Attn: ${h(input.purchaser)}</span><span>Dear Sir,</span><span>With reference to your enquiry we are pleased to submit our lowest quotation as under:</span></div>
  <table class="materials"><colgroup>${[13, 11, 10, 11, 10, 11, 7, 10, 8.5, 8.5].map((width) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr><th rowspan="2">Sr No.</th><th class="description" colspan="9">MATERIAL DESCRIPTION</th></tr><tr>${headers.map((v) => `<th>${v === 'Jindal Rate' ? 'Jindal<br>Rate' : h(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v, i) => `<td>${h(i === 8 && typeof v === 'number' ? v.toFixed(2) : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <section class="terms">${Object.entries(input.terms)
    .filter(
      ([key]) => !['Prepared by', 'Closing message', 'Sign-off'].includes(key),
    )
    .map(
      ([key, value]) =>
        `<div class="term"><b>${h(key)} :</b><span>${h(value)}</span></div>`,
    )
    .join(
      '',
    )}${input.notes ? `<div class="term"><b>Notes:</b><span>${h(input.notes)}</span></div>` : ''}<footer>${h(input.terms['Closing message'] ?? 'We trust you will find our above offer most competitive and await your valued order')}<br>${h(input.terms['Sign-off'] ?? 'Thanks & Regards,')}<br>${h(input.terms['Prepared by']?.trim() || 'Vikram Chandan')}</footer></section></main></body></html>`;
}
