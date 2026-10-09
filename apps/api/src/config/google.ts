import { enquiryTypes } from '@cre/shared';
import type { Env } from './env.js';

export const SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly';
export function googleSources(env: Env) {
  return enquiryTypes.map((type) => ({
    type,
    spreadsheetId: env[`${type}_SPREADSHEET_ID`],
    sheetName: env[`${type}_SHEET_NAME`] || env.FMS_SHEET_NAME,
    headerRow: env.FMS_HEADER_ROW,
    dataStartRow: env.FMS_DATA_START_ROW,
  }));
}
