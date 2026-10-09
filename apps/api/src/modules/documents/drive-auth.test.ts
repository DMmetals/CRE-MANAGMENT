import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv, type Env } from '../../config/env.js';
import {
  DRIVE_SCOPE,
  getDriveAuth,
  readOAuthClient,
  readUserCredentials,
  storeUserCredentials,
} from './drive-auth.js';
const options = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor(value: unknown) {
      options(value);
    }
  },
}));
let directory: string;
let env: Env;
const credentials = {
  type: 'authorized_user' as const,
  client_id: 'test-client',
  client_secret: 'test-secret',
  refresh_token: 'test-refresh',
};
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), 'cre-drive-auth-test-'));
  env = parseEnv({
    NODE_ENV: 'test',
    GOOGLE_DRIVE_USER_CREDENTIALS: join(directory, 'user.json'),
    GOOGLE_DRIVE_OAUTH_CLIENT_FILE: join(directory, 'client.json'),
    GOOGLE_APPLICATION_CREDENTIALS: 'service-account.json',
  });
});
afterEach(async () => {
  for (const name of await readdir(directory))
    await unlink(join(directory, name));
  await rmdir(directory);
});
describe('Drive credential storage', () => {
  it('uses the explicitly approved scope with existing service credentials before sign-in', async () => {
    expect((await getDriveAuth(env)).userAuthenticated).toBe(false);
    expect(options).toHaveBeenCalledWith({
      keyFile: 'service-account.json',
      scopes: [DRIVE_SCOPE],
    });
  });
  it('stores user credentials atomically and uses them for subsequent uploads', async () => {
    await storeUserCredentials(env, credentials);
    expect(await readUserCredentials(env)).toEqual(credentials);
    expect((await getDriveAuth(env)).userAuthenticated).toBe(true);
    expect(options).toHaveBeenLastCalledWith({
      credentials,
      scopes: [DRIVE_SCOPE],
    });
    await storeUserCredentials(env, {
      ...credentials,
      refresh_token: 'replacement',
    });
    expect((await readUserCredentials(env))?.refresh_token).toBe('replacement');
    expect(await readdir(directory)).toEqual(['user.json']);
  });
  it('rejects a service-account key as an OAuth client', async () => {
    await writeFile(
      env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE,
      JSON.stringify({ type: 'service_account', private_key: 'never-output' }),
    );
    await expect(readOAuthClient(env)).rejects.toMatchObject({
      code: 'DRIVE_OAUTH_CLIENT_INVALID',
    });
  });
  it('loads a Desktop app client but never returns unrelated fields', async () => {
    await writeFile(
      env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE,
      JSON.stringify({
        installed: {
          client_id: 'id',
          client_secret: 'secret',
          auth_uri: 'https://untrusted.example',
          project_id: 'other',
        },
      }),
    );
    expect(await readOAuthClient(env)).toEqual({
      client_id: 'id',
      client_secret: 'secret',
      kind: 'installed',
    });
  });
  it('does not fall back to a different account if stored user credentials are corrupt', async () => {
    await writeFile(env.GOOGLE_DRIVE_USER_CREDENTIALS, '{}');
    await expect(getDriveAuth(env)).rejects.toMatchObject({
      code: 'DRIVE_CREDENTIALS_INVALID',
    });
    expect(options).not.toHaveBeenCalled();
  });
});
