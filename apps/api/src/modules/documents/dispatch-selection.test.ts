import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { DispatchOrderService } from '../dispatch/service.js';
import { dispatchFixture } from '../dispatch/fixture.js';
afterEach(() => vi.restoreAllMocks());
describe('dispatch HTTP selection and access', () => {
  it('supports branch endpoints and the legacy preview alias using the same model', async () => {
    const f = dispatchFixture();
    const original = DispatchOrderService.prototype.buildDocument;
    vi.spyOn(
      DispatchOrderService.prototype,
      'buildDocument',
    ).mockImplementation(async function (branch, input) {
      const s = f.service();
      return original.call(s, branch, input);
    });
    const app = buildApp(
      parseEnv({
        NODE_ENV: 'development',
        LOG_LEVEL: 'silent',
        ENABLE_SHEET_WRITES: 'true',
        DEV_AUTH_BYPASS: 'true',
      }),
    );
    try {
      for (const path of [
        '/api/dispatch/fbd/preview',
        '/api/dispatch/preview',
      ]) {
        const result = await app.inject({
          method: 'POST',
          url: path,
          payload: {
            ...(path === '/api/dispatch/preview' ? { branch: 'FBD' } : {}),
            enquiryNo: 'C/1/26-27',
            srNos: ['1', '3'],
          },
        });
        expect(result.statusCode).toBe(200);
        expect(result.json().data.document.selectedSrNos).toEqual(['1', '3']);
        expect(result.json().data.html).not.toContain('LOT-2');
      }
      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/dispatch/fbd/preview',
        payload: { enquiryNo: 'C/1/26-27', srNos: ['1', '1'] },
      });
      expect(duplicate.statusCode).toBe(409);
      const bad = await app.inject({
        method: 'POST',
        url: '/api/dispatch/delhi/preview',
        payload: { enquiryNo: 'C/1/26-27', srNos: ['1'] },
      });
      expect(bad.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
  it('keeps existing write authorization for save/email and validates recipients before service calls', async () => {
    const save = vi.spyOn(DispatchOrderService.prototype, 'save');
    const locked = buildApp(parseEnv({ NODE_ENV: 'test' }));
    try {
      for (const action of ['save', 'email'])
        expect(
          (
            await locked.inject({
              method: 'POST',
              url: `/api/dispatch/fbd/${action}`,
              payload: { enquiryNo: 'C/1/26-27', srNos: ['1'] },
            })
          ).statusCode,
        ).toBe(403);
      expect(save).not.toHaveBeenCalled();
    } finally {
      await locked.close();
    }
    const app = buildApp(
      parseEnv({
        NODE_ENV: 'development',
        LOG_LEVEL: 'silent',
        ENABLE_SHEET_WRITES: 'true',
        DEV_AUTH_BYPASS: 'true',
      }),
    );
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/dispatch/fbd/email',
            payload: {
              enquiryNo: 'C/1/26-27',
              srNos: ['1'],
              email: { to: 'not-email' },
            },
          })
        ).statusCode,
      ).toBe(400);
      expect(save).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
