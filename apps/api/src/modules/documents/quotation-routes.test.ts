import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
const calls = vi.hoisted(() => ({
  find: vi.fn(),
  save: vi.fn(),
  customers: vi.fn(),
}));
vi.mock('../enquiries/repository.js', () => ({
  GoogleSheetsEnquiryRepository: class {
    findAll = calls.find;
  },
}));
vi.mock('../customers/service.js', () => ({
  customers: calls.customers,
  salesPersons: vi.fn(),
  validateSelections: vi.fn(),
}));
vi.mock('./save-quotation.js', () => ({ saveQuotation: calls.save }));
const env = parseEnv({
  NODE_ENV: 'development',
  DEV_AUTH_BYPASS: 'true',
  LOG_LEVEL: 'silent',
  ENABLE_SHEET_WRITES: 'true',
});
const input = {
  type: 'CRR',
  company: 'DM',
  enquiryNo: 'C/1/26-27',
  materials: [
    {
      id: 'one',
      sku: '1-1250-COIL-2B-304',
      version: 'snapshot',
      updatedAt: 'stamp',
      rate: 227,
    },
  ],
  terms: {
    Payment: '30 days',
    Delivery: 'Next week',
    'Prepared by': 'Vikram Chandan',
  },
};
let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  vi.clearAllMocks();
  calls.find.mockResolvedValue({
    type: 'CRR',
    rows: [
      {
        id: 'one',
        sku: input.materials[0]!.sku,
        version: 'snapshot',
        updatedAt: 'stamp',
        enquiryNo: input.enquiryNo,
        customer: 'Example',
        branch: 'FBD',
        qty: 10,
      },
    ],
  });
  calls.customers.mockResolvedValue([]);
  calls.save.mockResolvedValue({
    id: 'file',
    url: 'https://drive.google.com/file/d/file/view',
    pdf: Buffer.from('%PDF-saved'),
    updatedRows: 1,
  });
  app = buildApp(env);
});
afterEach(async () => {
  await app.close();
});
describe('quotation save/download route', () => {
  it('returns the persisted PDF and link after saving with edited terms', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/quotations/save-and-download',
      payload: input,
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('application/pdf');
    expect(r.headers['x-quotation-url']).toBe(
      'https://drive.google.com/file/d/file/view',
    );
    expect(r.headers['x-updated-rows']).toBe('1');
    expect(r.body).toBe('%PDF-saved');
    expect(calls.save.mock.calls[0]![2]).toContain('30 days');
    expect(calls.save.mock.calls[0]![2]).toContain('Next week');
  });
  it.each(['CRR', 'NBD'] as const)(
    'uses the matching %s customer address in preview and saved PDF content',
    async (type) => {
      calls.customers.mockResolvedValue([
        { customer: 'Other customer', address: 'Wrong customer address' },
        { customer: 'Example', address: '12 Industrial Road & Market' },
      ]);
      const payload = { ...input, type };
      const preview = await app.inject({
        method: 'POST',
        url: '/api/quotations/preview',
        payload,
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().data.html).toContain(
        '12 Industrial Road &amp; Market',
      );
      expect(preview.json().data.html).not.toContain('Wrong customer address');
      const saved = await app.inject({
        method: 'POST',
        url: '/api/quotations/save-and-download',
        payload,
      });
      expect(saved.statusCode).toBe(200);
      expect(calls.customers).toHaveBeenCalledWith(env, type);
      expect(calls.save.mock.calls[0]![2]).toContain(
        '12 Industrial Road &amp; Market',
      );
      expect(calls.save.mock.calls[0]![2]).not.toContain(
        'Wrong customer address',
      );
    },
  );
  it('returns an actionable error without a download when saving fails', async () => {
    calls.save.mockRejectedValueOnce(
      new BusinessError(
        403,
        'DRIVE_ACCESS_DENIED',
        'Share the quotation folder.',
      ),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/quotations/save-and-download',
      payload: input,
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toBe('Share the quotation folder.');
    expect(r.headers['x-quotation-url']).toBeUndefined();
  });
  it('keeps normal save responses free of binary PDF data', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/quotations/save',
      payload: input,
    });
    expect(r.json().data).toEqual({
      id: 'file',
      url: 'https://drive.google.com/file/d/file/view',
      updatedRows: 1,
    });
  });
  it('enforces the write gate on the new endpoint', async () => {
    await app.close();
    app = buildApp({ ...env, ENABLE_SHEET_WRITES: 'false' });
    const r = await app.inject({
      method: 'POST',
      url: '/api/quotations/save-and-download',
      payload: input,
    });
    expect(r.statusCode).toBe(403);
    expect(calls.save).not.toHaveBeenCalled();
  });
});
