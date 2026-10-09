import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { O2DPOService } from './po-upload.js';
const env = parseEnv({
  NODE_ENV: 'development',
  LOG_LEVEL: 'silent',
  ENABLE_SHEET_WRITES: 'true',
  DEV_AUTH_BYPASS: 'true',
});
afterEach(() => vi.restoreAllMocks());
function payload(size = 10, type = 'PO') {
  const boundary = 'test-po-boundary';
  const fields = { enquiryNo: 'C/1/26-27', srNo: '1', type, version: 'v1' };
  return {
    boundary,
    body: Buffer.concat([
      ...Object.entries(fields).map(([name, value]) =>
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="copy.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-`,
      ),
      Buffer.alloc(size, 65),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
describe('PO multipart endpoint', () => {
  it.each(['PO', 'REVISED_PO'])(
    'passes exact identity, type and bytes for %s to the upload service',
    async (type) => {
      const spy = vi
        .spyOn(O2DPOService.prototype, 'save')
        .mockResolvedValue({
          url: 'https://drive.google.com/file/d/fixture/view',
          column: type === 'PO' ? 25 : 26,
          row: undefined,
          refreshRequired: true,
          type: type as 'PO' | 'REVISED_PO',
        });
      const app = buildApp(env);
      try {
        const { boundary, body } = payload(10, type);
        const response = await app.inject({
          method: 'POST',
          url: '/api/o2d/fbd/rows/selected-row/po',
          headers: {
            'content-type': `multipart/form-data; boundary=${boundary}`,
          },
          payload: body,
        });
        expect(response.statusCode).toBe(200);
        expect(spy).toHaveBeenCalledWith(
          'FBD',
          'selected-row',
          { enquiryNo: 'C/1/26-27', srNo: '1', type, version: 'v1' },
          expect.objectContaining({
            name: 'copy.pdf',
            mimeType: 'application/pdf',
            content: expect.any(Buffer),
          }),
        );
      } finally {
        await app.close();
      }
    },
  );
  it('rejects files over 10 MB before calling Drive', async () => {
    const spy = vi.spyOn(O2DPOService.prototype, 'save');
    const app = buildApp(env);
    try {
      const { boundary, body } = payload(10 * 1024 * 1024);
      const response = await app.inject({
        method: 'POST',
        url: '/api/o2d/fbd/rows/selected-row/po',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('10 MB');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('retains the existing write gate for uploads', async () => {
    const spy = vi.spyOn(O2DPOService.prototype, 'save');
    const app = buildApp({ ...env, ENABLE_SHEET_WRITES: 'false' });
    try {
      const { boundary, body } = payload();
      const response = await app.inject({
        method: 'POST',
        url: '/api/o2d/fbd/rows/selected-row/po',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('SHEET_WRITES_DISABLED');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
