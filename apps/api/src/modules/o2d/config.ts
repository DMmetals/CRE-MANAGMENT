import type { Env } from '../../config/env.js';
import type { O2DBranch } from '@cre/shared';
// Verified through spreadsheets.get: gid=0, header row 6 (2026-10-07).
export const O2D_SOURCES = {
  FBD: {
    id: '1f0nOcCu4AaFl0DDzODv_mM8i4YYBaCD9lyixfd-DLyo',
    tab: 'FBD',
    sheetId: 0,
    header: 6,
  },
  MUM: {
    id: '1f9_splrR2pFkvtnLbKY2glGnidYMXxiSriNOJO6cH6A',
    tab: 'MUM',
    sheetId: 0,
    header: 6,
  },
} as const;
export function orderSource(env: Env, branch: O2DBranch) {
  return {
    id: env[`O2D_${branch}_SPREADSHEET_ID`],
    tab: env[`O2D_${branch}_SHEET_NAME`] || O2D_SOURCES[branch].tab,
    header: env[`O2D_${branch}_HEADER_ROW`] ?? O2D_SOURCES[branch].header,
    sheetId: 0,
  };
}
