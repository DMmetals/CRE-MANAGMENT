import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../src/config/env.js';
import { createMetadataCheck } from '../src/modules/google/metadata.js';
import { buildApp } from '../src/app.js';
const env = parseEnv({
  NODE_ENV: 'test',
  GOOGLE_PROJECT_ID: 'test',
  GOOGLE_CLIENT_EMAIL: 'test@example.com',
  GOOGLE_PRIVATE_KEY: 'not-real',
});
describe('read-only sheet metadata', () => {
  it('discovers all four sources without guessing O2D tabs or reading unconfigured rows', async () => {
    const read = vi.fn(async (url: string) =>
      url.includes('?fields=')
        ? {
            sheets: [
              { properties: { sheetId: 27, title: 'FMS' } },
              { properties: { sheetId: 99, title: 'Actual order tab' } },
            ],
          }
        : { values: [['Date', '', 'DB_ID']] },
    );
    const check = createMetadataCheck(env, read);
    const [data] = await Promise.all([check(), check()]);
    expect(data.sources).toHaveLength(4);
    expect(data.sources[0]?.headers).toEqual(['Date', '', 'DB_ID']);
    expect(data.sources[2]).toMatchObject({
      type: 'O2D_FBD',
      configuredTab: null,
      headerRow: null,
      headers: null,
      status: 'connected',
    });
    expect(data.sources[2]?.tabs[1]?.name).toBe('Actual order tab');
    expect(read).toHaveBeenCalledTimes(6);
    expect(
      read.mock.calls.filter(([url]) => url.includes('/values/')),
    ).toHaveLength(2);
    const app = buildApp(env, undefined, check);
    try {
      expect((await app.inject('/api/meta/sheets')).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
  it('reads exact configured O2D headers and escapes tab names', async () => {
    const configured = {
      ...env,
      O2D_FBD_SHEET_NAME: "Orders'2026",
      O2D_FBD_HEADER_ROW: 4,
    };
    const read = vi.fn(async (url: string) =>
      url.includes('?fields=')
        ? { sheets: [{ properties: { sheetId: 1, title: "Orders'2026" } }] }
        : { values: [['Order No', 'Sr No']] },
    );
    const result = await createMetadataCheck(configured, read)();
    expect(result.sources[2]?.headers).toEqual(['Order No', 'Sr No']);
    expect(
      read.mock.calls.some(([url]) =>
        decodeURIComponent(url).includes("'Orders''2026'!4:4"),
      ),
    ).toBe(true);
    expect(result.sources[0]?.code).toBe('GOOGLE_TAB_NOT_FOUND');
  });
  it('returns safe errors for missing credentials and does not contact Google', async () => {
    const read = vi.fn();
    const noCredentials = parseEnv({ NODE_ENV: 'test' });
    const data = await createMetadataCheck(noCredentials, read)();
    expect(
      data.sources.every((source) => source.code === 'GOOGLE_NOT_CONFIGURED'),
    ).toBe(true);
    expect(read).not.toHaveBeenCalled();
    const app = buildApp(noCredentials);
    try {
      expect((await app.inject('/api/meta/sheets')).statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
  it('accepts JSON key file configuration without inline secrets', async () => {
    const fileEnv = parseEnv({
      GOOGLE_APPLICATION_CREDENTIALS: 'C:/private/key.json',
    });
    const read = vi.fn(async () => ({
      sheets: [{ properties: { sheetId: 1, title: 'Other' } }],
    }));
    const data = await createMetadataCheck(fileEnv, read)();
    expect(data.sources[2]?.status).toBe('connected');
    expect(read).toHaveBeenCalledTimes(4);
  });
});
