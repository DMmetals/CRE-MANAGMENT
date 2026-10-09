import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { O2DService } from './service.js';
import { O2DTransferService } from './transfer.js';
const env = parseEnv({ NODE_ENV: 'test', ENABLE_SHEET_WRITES: 'false' });
afterEach(() => vi.restoreAllMocks());
describe('O2D API', () => {
  it('supports lowercase branch routes and filters by enquiry, without generated order numbers', async () => {
    const list = vi
      .spyOn(O2DService.prototype, 'list')
      .mockResolvedValue({
        branch: 'FBD',
        rows: [],
        fetchedAt: '',
        identityVerified: true,
        warning: null,
        kpis: {
          totalOrders: 0,
          totalMaterials: 0,
          totalOrderQty: 0,
          totalBalanceQty: 0,
        },
      });
    const app = buildApp(env);
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/o2d/fbd?enquiryNo=C%2F1%2F26-27&category=CRR',
      });
      expect(response.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith('FBD');
      expect(response.json().data).not.toHaveProperty('orderMappingVerified');
    } finally {
      await app.close();
    }
  });
  it('allows calculation previews with writes off but blocks the actual transfer and batch edit', async () => {
    const preview = vi
      .spyOn(O2DTransferService.prototype, 'preview')
      .mockRejectedValue(new Error('fixture preview called'));
    const app = buildApp(env);
    try {
      const payload = { type: 'CRR', branch: 'FBD', enquiryNo: 'C/1/26-27' };
      await app.inject({
        method: 'POST',
        url: '/api/o2d/transfer/preview',
        payload,
      });
      expect(preview).toHaveBeenCalledWith(payload);
      for (const url of ['/api/o2d/transfer', '/api/o2d/fbd/batch-update']) {
        const response = await app.inject({ method: 'POST', url, payload });
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('SHEET_WRITES_DISABLED');
      }
    } finally {
      await app.close();
    }
  });
});
