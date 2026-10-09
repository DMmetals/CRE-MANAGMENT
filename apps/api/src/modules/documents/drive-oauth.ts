import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
import {
  DRIVE_SCOPE,
  readOAuthClient,
  storeUserCredentials,
} from './drive-auth.js';
import { checkPdfFolder } from './drive.js';

export function driveOAuthRoutes(app: FastifyInstance, env: Env) {
  const pending = new Map<
    string,
    {
      expires: number;
      client: OAuth2Client;
      clientId: string;
      clientSecret: string;
      verifier: string;
      redirect: string;
    }
  >();
  const redirect = `http://127.0.0.1:${env.PORT}/api/drive/oauth/callback`;
  function local(request: FastifyRequest) {
    if (
      env.NODE_ENV !== 'development' ||
      env.DEV_AUTH_BYPASS !== 'true' ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)
    )
      throw new BusinessError(
        403,
        'AUTH_REQUIRED',
        'Drive connection setup is available only in the local development workspace.',
      );
  }
  app.get('/api/drive/status', async (request, reply) => {
    local(request);
    reply.header('Cache-Control', 'no-store');
    try {
      const folder = await checkPdfFolder(env, env.QUOTATION_PDF_FOLDER_ID);
      return {
        success: true,
        data: {
          state: 'ready',
          message: 'Google Drive is ready for quotation PDFs.',
          folderName: folder.name,
        },
      };
    } catch (error) {
      const message =
        error instanceof BusinessError
          ? error.message
          : 'Unable to check the Drive connection. Retry in a moment.';
      if (
        error instanceof BusinessError &&
        [
          'DRIVE_USER_SIGNIN_REQUIRED',
          'DRIVE_SIGNIN_EXPIRED',
          'DRIVE_CREDENTIALS_INVALID',
        ].includes(error.code)
      ) {
        try {
          const client = await readOAuthClient(env);
          return {
            success: true,
            data: {
              state: client ? 'sign-in-required' : 'setup-required',
              message: client
                ? 'Connect the Google account that can upload to your PDF folder.'
                : 'Google sign-in needs an OAuth client file. See docs/GOOGLE_DRIVE_SIGN_IN.md for the one-time administrator setup.',
            },
          };
        } catch {
          return {
            success: true,
            data: {
              state: 'setup-required',
              message:
                'The Google sign-in client file is invalid. Check the local administrator setup.',
            },
          };
        }
      }
      return { success: true, data: { state: 'error', message } };
    }
  });
  app.post('/api/drive/connect', async (request, reply) => {
    local(request);
    reply.header('Cache-Control', 'no-store');
    if (
      !request.headers['content-type']?.startsWith('application/json') ||
      !request.headers.origin ||
      ![env.FRONTEND_URL, 'http://127.0.0.1:5173'].includes(
        request.headers.origin,
      )
    )
      throw new BusinessError(
        403,
        'ORIGIN_DENIED',
        'Start Google sign-in from the local quotation page.',
      );
    const config = await readOAuthClient(env);
    if (!config)
      throw new BusinessError(
        409,
        'DRIVE_OAUTH_CLIENT_REQUIRED',
        'Add the Google OAuth client JSON as credentials/drive-oauth-client.json, then retry Connect Google Drive.',
      );
    if (config.kind === 'web' && !config.redirect_uris?.includes(redirect))
      throw new BusinessError(
        409,
        'DRIVE_REDIRECT_REQUIRED',
        `Add ${redirect} to this OAuth client's authorized redirect URIs.`,
      );
    const now = Date.now();
    for (const [key, value] of pending)
      if (value.expires < now) pending.delete(key);
    if (pending.size >= 10)
      throw new BusinessError(
        429,
        'SIGNIN_BUSY',
        'Several sign-ins are already pending. Finish one or retry in ten minutes.',
      );
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const client = new OAuth2Client(
      config.client_id,
      config.client_secret,
      redirect,
    );
    pending.set(state, {
      expires: now + 10 * 60 * 1000,
      client,
      clientId: config.client_id,
      clientSecret: config.client_secret,
      verifier,
      redirect,
    });
    return {
      success: true,
      data: {
        url: client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent select_account',
          scope: [DRIVE_SCOPE],
          state,
          code_challenge: challenge,
          code_challenge_method: CodeChallengeMethod.S256,
        }),
      },
    };
  });
  app.get(
    '/api/drive/oauth/callback',
    { logLevel: 'silent' },
    async (request, reply) => {
      local(request);
      reply
        .header('Cache-Control', 'no-store')
        .header('Referrer-Policy', 'no-referrer');
      const query = z
        .object({
          state: z.string().min(1),
          code: z.string().optional(),
          error: z.string().optional(),
        })
        .safeParse(request.query);
      if (!query.success)
        throw new BusinessError(
          400,
          'SIGNIN_INVALID',
          'This sign-in callback is invalid. Start again from the quotation page.',
        );
      const attempt = pending.get(query.data.state);
      pending.delete(query.data.state);
      if (!attempt || attempt.expires < Date.now())
        throw new BusinessError(
          400,
          'SIGNIN_EXPIRED',
          'This sign-in session expired or was already used. Start again from the quotation page.',
        );
      if (query.data.error || !query.data.code)
        throw new BusinessError(
          400,
          'SIGNIN_CANCELLED',
          'Google sign-in was cancelled. You can close this window and try again.',
        );
      let tokens;
      try {
        tokens = (
          await attempt.client.getToken({
            code: query.data.code,
            codeVerifier: attempt.verifier,
            redirect_uri: attempt.redirect,
          })
        ).tokens;
      } catch {
        throw new BusinessError(
          409,
          'SIGNIN_FAILED',
          'Google did not complete sign-in. Check the OAuth client setup and try again.',
        );
      }
      if (!tokens.refresh_token || !tokens.access_token)
        throw new BusinessError(
          409,
          'SIGNIN_OFFLINE_REQUIRED',
          'Google did not grant offline access. Start Connect Google Drive again and grant the requested permission.',
        );
      let scopes: string[];
      try {
        scopes = (await attempt.client.getTokenInfo(tokens.access_token))
          .scopes;
      } catch {
        throw new BusinessError(
          409,
          'SIGNIN_VERIFY_FAILED',
          'Could not verify the granted Drive permission. Start sign-in again.',
        );
      }
      if (!scopes.includes(DRIVE_SCOPE))
        throw new BusinessError(
          403,
          'DRIVE_SCOPE_REQUIRED',
          'Google Drive permission was not granted. Reconnect and grant the requested access.',
        );
      await storeUserCredentials(env, {
        type: 'authorized_user',
        client_id: attempt.clientId,
        client_secret: attempt.clientSecret,
        refresh_token: tokens.refresh_token,
      });
      return reply
        .type('text/html')
        .send(
          '<!doctype html><html><head><meta charset="utf-8"><title>Google Drive connected</title></head><body><h1>Google Drive connected</h1><p>You can close this window and return to your quotation. The app will now check access to the PDF folder.</p></body></html>',
        );
    },
  );
  app.addHook('onClose', async () => {
    pending.clear();
  });
}
