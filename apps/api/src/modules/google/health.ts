import { z } from 'zod';
import { safeFailure } from './errors.js';
import type { GoogleHealth, SourceHealth } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { googleSources } from '../../config/google.js';
import { createGoogleAuth, hasGoogleCredentials } from './auth.js';
import { createMetadataCheck } from './metadata.js';

export type ReadSheets = (url: string) => Promise<unknown>;
const valuesSchema = z.object({
  values: z.array(z.array(z.unknown())).optional(),
});

export function createGoogleHealthCheck(env: Env, reader?: ReadSheets) {
  const auth = createGoogleAuth(env);
  const metadata = createMetadataCheck(env, reader);
  const read: ReadSheets =
    reader ??
    (async (url) => {
      const response = await auth.request({
        url,
        method: 'GET',
        timeout: env.GOOGLE_TIMEOUT_MS,
        retry: false,
      });
      return response.data;
    });
  let pending: Promise<GoogleHealth> | undefined;
  let cached: GoogleHealth | undefined;
  let expires = 0;
  async function check(): Promise<GoogleHealth> {
    const configured = hasGoogleCredentials(env);
    const sources = await Promise.all(
      googleSources(env).map(async (source): Promise<SourceHealth> => {
        if (!configured)
          return {
            type: source.type,
            status: 'error',
            code: 'GOOGLE_NOT_CONFIGURED',
            message:
              'Set GOOGLE_PROJECT_ID, GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in the backend environment.',
          };
        try {
          const range = `'${source.sheetName.replace(/'/g, "''")}'!${source.headerRow}:${source.headerRow}`;
          const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(source.spreadsheetId)}/values/${encodeURIComponent(range)}`;
          const data = valuesSchema.parse(await read(url));
          if (!data.values?.[0]?.some((value) => String(value).trim()))
            return {
              type: source.type,
              status: 'error',
              code: 'GOOGLE_HEADERS_EMPTY',
              message:
                'Spreadsheet is accessible, but the configured header row is empty.',
            };
          return {
            type: source.type,
            status: 'connected',
            message: 'FMS header row is readable.',
          };
        } catch (error) {
          return { type: source.type, status: 'error', ...safeFailure(error) };
        }
      }),
    );
    const o2d = (await metadata()).sources
      .filter((source) => source.type.startsWith('O2D_'))
      .map(({ type, status, message, code }) => ({
        type,
        status,
        message,
        code,
      }));
    return {
      readOnly: true,
      checkedAt: new Date().toISOString(),
      sources: [...sources, ...o2d],
    };
  }
  return async (): Promise<GoogleHealth> => {
    if (cached && Date.now() < expires) return cached;
    if (pending) return pending;
    pending = check();
    try {
      cached = await pending;
      expires = Date.now() + 15000;
      return cached;
    } finally {
      pending = undefined;
    }
  };
}
