import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';
import { createGoogleHealthCheck } from '../src/modules/google/health.js';
import { SHEETS_READONLY_SCOPE } from '../src/config/google.js';

const env = parseEnv({ NODE_ENV: 'test' });
const configured = parseEnv({
  NODE_ENV: 'test',
  GOOGLE_PROJECT_ID: 'test-project',
  GOOGLE_CLIENT_EMAIL: 'test@example.com',
  GOOGLE_PRIVATE_KEY: 'test-only',
});

describe('Phase 1 health API', () => {
  it('is healthy without Google credentials, but Google health is unavailable', async () => {
    const app = buildApp(env);
    try {
      const health = await app.inject('/api/health');
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({
        success: true,
        data: { status: 'ok', phase: 1 },
      });
      const google = await app.inject('/api/health/google');
      expect(google.statusCode).toBe(503);
      expect(google.json().data.sources).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'CRR',
            code: 'GOOGLE_NOT_CONFIGURED',
          }),
          expect.objectContaining({
            type: 'NBD',
            code: 'GOOGLE_NOT_CONFIGURED',
          }),
        ]),
      );
      expect(google.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('reads both configured header ranges and coalesces concurrent checks', async () => {
    const read = vi.fn(async (url: string) =>
      url.includes('?fields=')
        ? { sheets: [{ properties: { sheetId: 0, title: 'FMS' } }] }
        : { values: [['Date', 'Enquiry No.']] },
    );
    const check = createGoogleHealthCheck(configured, read);
    const [first, second] = await Promise.all([check(), check()]);
    expect(first.sources.every((s) => s.status === 'connected')).toBe(true);
    expect(second).toEqual(first);
    expect(read).toHaveBeenCalledTimes(8);
    const urls = read.mock.calls.map((call) =>
      decodeURIComponent(String(call[0])),
    );
    expect(urls[0]).toContain(configured.CRR_SPREADSHEET_ID);
    expect(urls[1]).toContain(configured.NBD_SPREADSHEET_ID);
    expect(
      urls.slice(0, 2).every((url) => url.endsWith("/values/'FMS'!7:7")),
    ).toBe(true);
    await check();
    expect(read).toHaveBeenCalledTimes(8);
    expect(SHEETS_READONLY_SCOPE).toMatch(/spreadsheets\.readonly$/);
    const app = buildApp(env, check);
    try {
      expect((await app.inject('/api/health/google')).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('reports partial failures and never exposes raw upstream errors', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ values: [['Date']] })
      .mockRejectedValueOnce({
        response: { status: 403 },
        message: 'private-key-secret',
      });
    const result = await createGoogleHealthCheck(configured, read)();
    expect(result.sources[0]?.status).toBe('connected');
    expect(result.sources[1]?.code).toBe('GOOGLE_ACCESS_DENIED');
    expect(JSON.stringify(result)).not.toContain('private-key-secret');
  });

  it('reports empty header rows', async () => {
    const result = await createGoogleHealthCheck(configured, async () => ({
      values: [],
    }))();
    expect(
      result.sources
        .filter((s) => s.type === 'CRR' || s.type === 'NBD')
        .every((s) => s.code === 'GOOGLE_HEADERS_EMPTY'),
    ).toBe(true);
  });

  it('returns sanitized JSON for unknown routes and has no write endpoints', async () => {
    const app = buildApp(env);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/enquiries',
        payload: {},
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        success: false,
        error: { code: 'SHEET_WRITES_DISABLED' },
      });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await app.close();
    }
  });

  it('rejects invalid configuration and production auth bypass', () => {
    expect(() => parseEnv({ PORT: 'invalid' })).toThrow('PORT');
    expect(() =>
      parseEnv({ FMS_HEADER_ROW: '8', FMS_DATA_START_ROW: '7' }),
    ).toThrow('FMS_DATA_START_ROW');
    expect(() =>
      parseEnv({ NODE_ENV: 'production', DEV_AUTH_BYPASS: 'true' }),
    ).toThrow('DEV_AUTH_BYPASS');
  });
});
