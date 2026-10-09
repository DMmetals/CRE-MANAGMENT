import { GoogleAuth } from 'google-auth-library';
import { readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const userSchema = z.object({
  type: z.literal('authorized_user'),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  refresh_token: z.string().min(1),
});
export type DriveUserCredentials = z.infer<typeof userSchema>;
export function userCredentialsPath(env: Env) {
  return resolve(
    root,
    env.GOOGLE_DRIVE_USER_CREDENTIALS || 'credentials/drive-user.json',
  );
}
async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return null;
    throw new BusinessError(
      409,
      'DRIVE_CREDENTIALS_INVALID',
      'The Google Drive credential file could not be read. Check the local sign-in setup.',
    );
  }
}
export async function readUserCredentials(env: Env) {
  const data = await readJson(userCredentialsPath(env));
  if (data === null) return null;
  const parsed = userSchema.safeParse(data);
  if (!parsed.success)
    throw new BusinessError(
      409,
      'DRIVE_CREDENTIALS_INVALID',
      'The saved Drive user credentials are invalid. Reconnect Google Drive.',
    );
  return parsed.data;
}
export async function storeUserCredentials(
  env: Env,
  credentials: DriveUserCredentials,
) {
  const safe = userSchema.parse(credentials);
  const path = userCredentialsPath(env);
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temporary, JSON.stringify(safe), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
const clientSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  redirect_uris: z.array(z.string()).optional(),
});
export async function readOAuthClient(env: Env) {
  const path = resolve(
    root,
    env.GOOGLE_DRIVE_OAUTH_CLIENT_FILE || 'credentials/drive-oauth-client.json',
  );
  const raw = await readJson(path);
  if (raw === null) return null;
  const parsed = z
    .object({
      installed: clientSchema.optional(),
      web: clientSchema.optional(),
    })
    .safeParse(raw);
  if (!parsed.success || (!parsed.data.installed && !parsed.data.web))
    throw new BusinessError(
      409,
      'DRIVE_OAUTH_CLIENT_INVALID',
      'Use a Google OAuth client JSON file (Desktop app or Web application), not a service-account key.',
    );
  return {
    ...(parsed.data.installed ?? parsed.data.web)!,
    kind: parsed.data.installed ? ('installed' as const) : ('web' as const),
  };
}
export async function getDriveAuth(env: Env) {
  const user = await readUserCredentials(env);
  return {
    userAuthenticated: !!user,
    auth: new GoogleAuth({
      ...(user
        ? { credentials: user }
        : env.GOOGLE_APPLICATION_CREDENTIALS
          ? { keyFile: env.GOOGLE_APPLICATION_CREDENTIALS }
          : {
              credentials: {
                client_email: env.GOOGLE_CLIENT_EMAIL,
                private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
              },
            }),
      scopes: [DRIVE_SCOPE],
    }),
  };
}
