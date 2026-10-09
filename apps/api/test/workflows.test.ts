import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { assertTransfer, duplicateKey } from '../src/modules/o2d/service.js';
import { escapeHtml, documentHtml } from '../src/modules/documents/pdf.js';
import { rowVersion } from '../src/modules/enquiries/update-service.js';
describe('workflow protections', () => {
  it('blocks all real write endpoints, including query-string attempts, before accessing Sheets', async () => {
    const app = buildApp(parseEnv({ NODE_ENV: 'test' }));
    try {
      for (const url of [
        '/api/enquiries',
        '/api/enquiries?x=/pdf',
        '/api/enquiries/CRR/batch-update',
        '/api/quotations/save',
        '/api/quotations/email',
        '/api/o2d/transfer',
        '/api/dispatch/save',
      ]) {
        const r = await app.inject({ method: 'POST', url, payload: {} });
        expect(r.statusCode).toBe(403);
        expect(r.json().error.code).toBe('SHEET_WRITES_DISABLED');
      }
      const edit = await app.inject({
        method: 'PATCH',
        url: '/api/enquiries/CRR/rows/example',
        payload: {},
      });
      expect(edit.json().error.code).toBe('SHEET_WRITES_DISABLED');
    } finally {
      await app.close();
    }
  });
  it('requires Won, PO, remarks and one supported branch', () => {
    const row = {
      status: 'Won',
      poNumber: 'PO1',
      remarks: 'Approved',
      branch: 'FBD',
    };
    expect(() => assertTransfer([row])).not.toThrow();
    expect(() => assertTransfer([{ ...row, status: 'Pending' }])).toThrow(
      'Only Won',
    );
    expect(() => assertTransfer([{ ...row, poNumber: '' }])).toThrow(
      'PO Number',
    );
    expect(() => assertTransfer([row, { ...row, branch: 'MUM' }])).toThrow(
      'one supported branch',
    );
  });
  it('distinguishes transfer materials and detects external row changes', () => {
    const row = {
      enquiryNo: 'C/1/26-27',
      sku: 'A',
      edge: 'ME',
      qty: 10,
      poNumber: 'PO',
    };
    expect(duplicateKey(row)).not.toBe(duplicateKey({ ...row, qty: 20 }));
    expect(rowVersion(['A', '10'])).not.toBe(rowVersion(['A', '11']));
  });
  it('escapes untrusted PDF content rather than evaluating markup', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    const html = documentHtml(
      'Quote',
      '',
      '',
      '',
      '<img src=x>',
      'R',
      ['SKU'],
      [['<script>']],
      '',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('DRAFT');
  });
});
