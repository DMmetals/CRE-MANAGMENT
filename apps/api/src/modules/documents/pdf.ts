import puppeteer from 'puppeteer-core';
import type { Env } from '../../config/env.js';
export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}
export function documentHtml(
  title: string,
  company: string,
  address: string,
  gstin: string,
  customer: string,
  reference: string,
  headers: string[],
  rows: (string | number)[][],
  notes: string,
) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:16mm}body{font:11px Arial;color:#182f49}header{border-bottom:3px solid #163857;padding-bottom:18px}h1{font-size:24px;margin:0 0 8px}h2{font-size:17px}p{line-height:1.6;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:25px 0}th,td{border:1px solid #bfc9d5;padding:8px;text-align:left}th{background:#edf2f7}tr{break-inside:avoid}footer{margin-top:30px;border-top:1px solid #bfc9d5;padding-top:12px;color:#62758e}</style></head><body><header><h1>${escapeHtml(company || 'DRAFT ? company details not configured')}</h1><p>${escapeHtml(address)}<br>GSTIN: ${escapeHtml(gstin || 'Not configured')}</p></header><h2>${escapeHtml(title)}</h2><p>Reference: ${escapeHtml(reference)}<br>Customer: ${escapeHtml(customer)}</p><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>${escapeHtml(notes)}</p><footer>Generated from CRE enquiry and order management</footer></body></html>`;
}
export async function renderPdf(env: Env, html: string) {
  const browser = await puppeteer.launch({
    executablePath: env.PDF_BROWSER_PATH,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.url().startsWith('about:') || r.url().startsWith('data:'))
        void r.continue();
      else void r.abort();
    });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally {
    await browser.close();
  }
}
