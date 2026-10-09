import { z } from 'zod';
import type { SheetMetadataSource, SheetsMetadata } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { googleSources } from '../../config/google.js';
import { createGoogleAuth, hasGoogleCredentials } from './auth.js';
import type { ReadSheets } from './health.js';
import { safeFailure } from './errors.js';

const metadataSchema = z.object({
  sheets: z.array(
    z.object({
      properties: z.object({ sheetId: z.number(), title: z.string() }),
    }),
  ),
});
const headersSchema = z.object({
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .optional(),
});
export function createMetadataCheck(env: Env, reader?: ReadSheets) {
  const auth = createGoogleAuth(env);
  const read: ReadSheets =
    reader ??
    (async (url) =>
      (
        await auth.request({
          url,
          method: 'GET',
          timeout: env.GOOGLE_TIMEOUT_MS,
          retry: false,
        })
      ).data);
  const sources = [
    ...googleSources(env),
    ...(['O2D_FBD', 'O2D_MUM'] as const).map((type) => ({
      type,
      spreadsheetId: env[`${type}_SPREADSHEET_ID`],
      sheetName: env[`${type}_SHEET_NAME`],
      headerRow: env[`${type}_HEADER_ROW`],
    })),
  ];
  let cached: SheetsMetadata | undefined;
  let expires = 0;
  let pending: Promise<SheetsMetadata> | undefined;
  async function collect(): Promise<SheetsMetadata> {
    const results = await Promise.all(
      sources.map(async (source): Promise<SheetMetadataSource> => {
        const base = {
          type: source.type,
          configuredTab: source.sheetName || null,
          headerRow: source.headerRow ?? null,
          tabs: [],
          headers: null,
        };
        if (!hasGoogleCredentials(env))
          return {
            ...base,
            status: 'error',
            code: 'GOOGLE_NOT_CONFIGURED',
            message:
              'Configure a service-account JSON file or backend Google credentials.',
          };
        let tabs: SheetMetadataSource['tabs'] = [];
        try {
          const root = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(source.spreadsheetId)}`;
          const data = metadataSchema.parse(
            await read(`${root}?fields=sheets(properties(sheetId,title))`),
          );
          tabs = data.sheets.map((sheet) => ({
            id: sheet.properties.sheetId,
            name: sheet.properties.title,
          }));
          if (!source.sheetName || !source.headerRow)
            return {
              ...base,
              tabs,
              status: 'connected',
              message:
                'Spreadsheet accessible. Select the actual tab and configure its header row to verify headers.',
            };
          if (!tabs.some((tab) => tab.name === source.sheetName))
            return {
              ...base,
              tabs,
              status: 'error',
              code: 'GOOGLE_TAB_NOT_FOUND',
              message:
                'Configured tab was not found. Choose an actual tab from metadata.',
            };
          const range = `'${source.sheetName.replace(/'/g, "''")}'!${source.headerRow}:${source.headerRow}`;
          const values = headersSchema.parse(
            await read(
              `${root}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
            ),
          );
          const headers = (values.values?.[0] ?? []).map(String);
          if (!headers.some((h) => h.trim()))
            return {
              ...base,
              tabs,
              headers,
              status: 'error',
              code: 'GOOGLE_HEADERS_EMPTY',
              message: 'The configured header row is empty.',
            };
          return {
            ...base,
            tabs,
            headers,
            status: 'connected',
            message: 'Tab and headers verified.',
          };
        } catch (error) {
          return { ...base, tabs, status: 'error', ...safeFailure(error) };
        }
      }),
    );
    return {
      readOnly: true,
      checkedAt: new Date().toISOString(),
      sources: results,
    };
  }
  return async () => {
    if (cached && Date.now() < expires) return cached;
    pending ??= collect();
    try {
      cached = await pending;
      expires = Date.now() + 15000;
      return cached;
    } finally {
      pending = undefined;
    }
  };
}
