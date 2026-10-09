import { GoogleAuth } from 'google-auth-library';
import type { Env } from '../../config/env.js';
import { SHEETS_READONLY_SCOPE } from '../../config/google.js';

export function hasGoogleCredentials(env: Env) {
  return Boolean(
    env.GOOGLE_APPLICATION_CREDENTIALS ||
    (env.GOOGLE_PROJECT_ID &&
      env.GOOGLE_CLIENT_EMAIL &&
      env.GOOGLE_PRIVATE_KEY),
  );
}
export function createGoogleAuth(env: Env) {
  return new GoogleAuth({
    ...(env.GOOGLE_APPLICATION_CREDENTIALS
      ? { keyFile: env.GOOGLE_APPLICATION_CREDENTIALS }
      : {
          projectId: env.GOOGLE_PROJECT_ID,
          credentials: {
            client_email: env.GOOGLE_CLIENT_EMAIL,
            private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
        }),
    scopes: [SHEETS_READONLY_SCOPE],
  });
}
