import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import { createHash } from 'node:crypto';
import { buildApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
const calls = vi.hoisted(() => ({
  client: vi.fn(),
  store: vi.fn(),
  folder: vi.fn(),
}));
vi.mock('./drive-auth.js', () => ({
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive',
  readOAuthClient: calls.client,
  storeUserCredentials: calls.store,
}));
vi.mock('./drive.js', () => ({
  checkPdfFolder: calls.folder,
  uploadPdf: vi.fn(),
  uploadFile: vi.fn(),
  trashUploadedFile: vi.fn(),
}));
const scope = 'https://www.googleapis.com/auth/drive';
const env = parseEnv({
  NODE_ENV: 'development',
  DEV_AUTH_BYPASS: 'true',
  LOG_LEVEL: 'silent',
  ENABLE_SHEET_WRITES: 'false',
});
let app: ReturnType<typeof buildApp>;
function connect(origin = 'http://127.0.0.1:5173') {
  return app.inject({
    method: 'POST',
    url: '/api/drive/connect',
    headers: { origin, 'content-type': 'application/json' },
    payload: {},
  });
}
async function start() {
  const r = await connect();
  expect(r.statusCode).toBe(200);
  return new URL(r.json().data.url);
}
beforeEach(() => {
  vi.clearAllMocks();
  calls.client.mockResolvedValue({
    kind: 'installed',
    client_id: 'client-id',
    client_secret: 'client-secret',
  });
  calls.store.mockResolvedValue(undefined);
  calls.folder.mockRejectedValue(
    new BusinessError(409, 'DRIVE_USER_SIGNIN_REQUIRED', 'Connect user'),
  );
  app = buildApp(env);
});
afterEach(async () => {
  await app.close();
  vi.restoreAllMocks();
});
describe('local Drive sign-in', () => {
  it('requires client setup when only service-account credentials exist', async () => {
    calls.client.mockResolvedValue(null);
    const r = await app.inject('/api/drive/status');
    expect(r.json().data.state).toBe('setup-required');
    expect((await connect()).statusCode).toBe(409);
  });
  it('blocks sign-in from untrusted origins and remote clients', async () => {
    expect((await connect('https://evil.example')).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/drive/status',
          remoteAddress: '203.0.113.1',
        })
      ).statusCode,
    ).toBe(403);
    expect(calls.store).not.toHaveBeenCalled();
  });
  it('uses offline consent, full approved scope and PKCE with fresh state', async () => {
    const a = await start();
    const b = await start();
    expect(a.origin).toBe('https://accounts.google.com');
    expect(a.searchParams.get('scope')).toBe(scope);
    expect(a.searchParams.get('access_type')).toBe('offline');
    expect(a.searchParams.get('code_challenge_method')).toBe('S256');
    expect(a.searchParams.get('state')).not.toBe(b.searchParams.get('state'));
    expect(a.toString()).not.toContain('client-secret');
  });
  it('stores a refresh credential on callback without returning tokens, and rejects replay', async () => {
    const token = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockImplementation(async () => ({
        tokens: {
          refresh_token: 'refresh-secret',
          access_token: 'access-secret',
        },
        res: null,
      }));
    vi.spyOn(OAuth2Client.prototype, 'getTokenInfo').mockResolvedValue({
      scopes: [scope],
      expiry_date: Date.now() + 3600000,
      aud: 'client-id',
    });
    const url = await start();
    const state = url.searchParams.get('state')!;
    const r = await app.inject(
      `/api/drive/oauth/callback?state=${state}&code=auth-code`,
    );
    expect(r.statusCode).toBe(200);
    expect(calls.store).toHaveBeenCalledWith(env, {
      type: 'authorized_user',
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-secret',
    });
    expect(r.body).not.toContain('refresh-secret');
    expect(r.body).not.toContain('access-secret');
    expect(r.headers['cache-control']).toBe('no-store');
    const options = token.mock.calls[0]![0] as { codeVerifier: string };
    expect(
      createHash('sha256').update(options.codeVerifier).digest('base64url'),
    ).toBe(url.searchParams.get('code_challenge'));
    expect(
      (await app.inject(`/api/drive/oauth/callback?state=${state}&code=replay`))
        .statusCode,
    ).toBe(400);
    expect(calls.store).toHaveBeenCalledTimes(1);
  });
  it('rejects callbacks with missing, invalid or expired state', async () => {
    expect(
      (await app.inject('/api/drive/oauth/callback?code=test')).statusCode,
    ).toBe(400);
    expect(
      (await app.inject('/api/drive/oauth/callback?state=unknown&code=test'))
        .statusCode,
    ).toBe(400);
    const url = await start();
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 601000);
    expect(
      (
        await app.inject(
          `/api/drive/oauth/callback?state=${url.searchParams.get('state')}&code=test`,
        )
      ).json().error.code,
    ).toBe('SIGNIN_EXPIRED');
    expect(calls.store).not.toHaveBeenCalled();
  });
  it('does not save credentials after user cancellation', async () => {
    const url = await start();
    const r = await app.inject(
      `/api/drive/oauth/callback?state=${url.searchParams.get('state')}&error=access_denied`,
    );
    expect(r.json().error.code).toBe('SIGNIN_CANCELLED');
    expect(calls.store).not.toHaveBeenCalled();
  });
  it('rejects missing offline permission and missing Drive scope', async () => {
    vi.spyOn(OAuth2Client.prototype, 'getToken')
      .mockImplementationOnce(async () => ({
        tokens: { access_token: 'access' },
        res: null,
      }))
      .mockImplementationOnce(async () => ({
        tokens: { access_token: 'access', refresh_token: 'refresh' },
        res: null,
      }));
    vi.spyOn(OAuth2Client.prototype, 'getTokenInfo').mockResolvedValue({
      scopes: [],
      expiry_date: 0,
      aud: 'client-id',
    });
    for (const code of ['SIGNIN_OFFLINE_REQUIRED', 'DRIVE_SCOPE_REQUIRED']) {
      const url = await start();
      const r = await app.inject(
        `/api/drive/oauth/callback?state=${url.searchParams.get('state')}&code=code`,
      );
      expect(r.json().error.code).toBe(code);
    }
    expect(calls.store).not.toHaveBeenCalled();
  });
  it('reports a ready folder without exposing credentials', async () => {
    calls.folder.mockResolvedValue({
      name: 'Quotation PDFs',
      driveId: undefined,
    });
    const r = await app.inject('/api/drive/status');
    expect(r.json().data).toEqual({
      state: 'ready',
      message: 'Google Drive is ready for quotation PDFs.',
      folderName: 'Quotation PDFs',
    });
  });
});
