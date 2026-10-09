import { z } from 'zod';
import type { CreateEnquiryInput } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { googleSources } from '../../config/google.js';
import { GoogleAuth } from 'google-auth-library';
import { planCreation, BusinessError } from './creation.js';
import { withCreationLock } from './lock.js';

export type SheetsTransport = (options: {
  url: string;
  method: 'GET' | 'POST';
  timeout: number;
  retry: boolean;
  data?: { requests: Record<string, unknown>[] };
}) => Promise<{ data: unknown }>;
export function createEnquiryService(env: Env, transport?: SheetsTransport) {
  // Writes are available only for explicitly configured local development.
  const auth = new GoogleAuth({
    ...(env.GOOGLE_APPLICATION_CREDENTIALS
      ? { keyFile: env.GOOGLE_APPLICATION_CREDENTIALS }
      : {
          credentials: {
            client_email: env.GOOGLE_CLIENT_EMAIL,
            private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
        }),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const request: SheetsTransport =
    transport ?? (async (options) => auth.request(options));
  return async (input: CreateEnquiryInput) =>
    withCreationLock(async () => {
      if (env.ENABLE_SHEET_WRITES !== 'true')
        throw new BusinessError(
          403,
          'SHEET_WRITES_DISABLED',
          'Set ENABLE_SHEET_WRITES=true to enable real Google Sheet writes.',
        );
      const source = googleSources(env).find((s) => s.type === input.type)!;
      const root = `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}`;
      const tab = `'${source.sheetName.replace(/'/g, "''")}'`;
      const options = { timeout: env.GOOGLE_TIMEOUT_MS, retry: false };
      const [metadata, values] = await Promise.all([
        request({
          url:
            root +
            '?fields=sheets(properties(sheetId,title,gridProperties(rowCount)),protectedRanges(warningOnly,requestingUserCanEdit,range))',
          method: 'GET',
          ...options,
        }),
        request({
          url:
            root +
            '/values/' +
            encodeURIComponent(tab) +
            '?valueRenderOption=FORMULA',
          method: 'GET',
          ...options,
        }),
      ]);
      const sheets = z
        .object({
          sheets: z.array(
            z.object({
              protectedRanges: z
                .array(
                  z.object({
                    warningOnly: z.boolean().optional(),
                    requestingUserCanEdit: z.boolean().optional(),
                    range: z.object({
                      startRowIndex: z.number().optional(),
                      endRowIndex: z.number().optional(),
                      startColumnIndex: z.number().optional(),
                      endColumnIndex: z.number().optional(),
                    }),
                  }),
                )
                .optional(),
              properties: z.object({
                sheetId: z.number(),
                title: z.string(),
                gridProperties: z.object({ rowCount: z.number() }),
              }),
            }),
          ),
        })
        .parse(metadata.data).sheets;
      const sheet = sheets.find(
        (s) => s.properties.title === source.sheetName,
      )?.properties;
      if (!sheet)
        throw new BusinessError(
          503,
          'SHEET_MISSING',
          'The configured enquiry tab is unavailable.',
        );
      const rows =
        z
          .object({
            values: z
              .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
              .optional(),
          })
          .parse(values.data)
          .values?.map((row) => row.map(String)) ?? [];
      const plan = planCreation(
        input,
        rows,
        source.headerRow,
        source.dataStartRow,
      );
      if (plan.replayed) return { enquiryNo: plan.enquiryNo, replayed: true };
      const protections =
        sheets.find((s) => s.properties.sheetId === sheet.sheetId)
          ?.protectedRanges ?? [];
      const blocked = new Set<string>();
      for (const protection of protections) {
        if (protection.warningOnly || protection.requestingUserCanEdit)
          continue;
        const range = protection.range;
        // Insertion can shift protected rows. Conservatively require permission
        // when the target rows or their written columns intersect protection.
        if (
          (range.endRowIndex ?? Infinity) <= plan.insertionIndex ||
          (range.startRowIndex ?? 0) >=
            plan.insertionIndex + plan.materials.length
        )
          continue;
        for (const fields of plan.materials)
          for (const field of fields)
            if (
              field.column >= (range.startColumnIndex ?? 0) &&
              field.column < (range.endColumnIndex ?? Infinity)
            )
              blocked.add(field.name);
      }
      if (blocked.size)
        throw new BusinessError(
          403,
          'SHEET_RANGE_PROTECTED',
          `Cannot save: the service account lacks permission for protected FMS fields: ${[...blocked].join(', ')}. Ask the Sheet owner to add the service-account email under Data > Protect sheets and ranges > Set permissions. Spreadsheet Editor access alone is not enough. No rows were written by this attempt.`,
        );
      const audit = sheets.find((s) => s.properties.title === 'CRE Audit Log');
      const auditId =
        audit?.properties.sheetId ??
        Math.max(...sheets.map((s) => s.properties.sheetId)) + 1;
      const requests: Record<string, unknown>[] = [];
      if (!audit)
        requests.push({
          addSheet: {
            properties: { sheetId: auditId, title: 'CRE Audit Log' },
          },
        });
      if (plan.insertionIndex < sheet.gridProperties.rowCount)
        requests.push({
          insertDimension: {
            range: {
              sheetId: sheet.sheetId,
              dimension: 'ROWS',
              startIndex: plan.insertionIndex,
              endIndex: plan.insertionIndex + plan.materials.length,
            },
            inheritFromBefore: true,
          },
        });
      else
        requests.push({
          appendDimension: {
            sheetId: sheet.sheetId,
            dimension: 'ROWS',
            length: plan.materials.length,
          },
        });
      if (plan.insertionIndex > source.dataStartRow - 1)
        for (const pasteType of ['PASTE_FORMAT', 'PASTE_DATA_VALIDATION'])
          requests.push({
            copyPaste: {
              source: {
                sheetId: sheet.sheetId,
                startRowIndex: plan.insertionIndex - 1,
                endRowIndex: plan.insertionIndex,
              },
              destination: {
                sheetId: sheet.sheetId,
                startRowIndex: plan.insertionIndex,
                endRowIndex: plan.insertionIndex + plan.materials.length,
              },
              pasteType,
            },
          });
      const auditRows: {
        values: { userEnteredValue: { stringValue: string } }[];
      }[] = [];
      if (!audit)
        auditRows.push({
          values: [
            'timestamp',
            'user',
            'module',
            'spreadsheet',
            'sheet',
            'row',
            'field',
            'oldValue',
            'newValue',
            'action',
          ].map((stringValue) => ({ userEnteredValue: { stringValue } })),
        });
      plan.materials.forEach((fields, index) =>
        fields.forEach((field) => {
          requests.push({
            updateCells: {
              start: {
                sheetId: sheet.sheetId,
                rowIndex: plan.insertionIndex + index,
                columnIndex: field.column,
              },
              rows: [
                {
                  values: [
                    {
                      userEnteredValue:
                        typeof field.value === 'number'
                          ? { numberValue: field.value }
                          : { stringValue: field.value },
                    },
                  ],
                },
              ],
              fields: 'userEnteredValue',
            },
          });
          auditRows.push({
            values: [
              new Date().toISOString(),
              'local-development-user',
              input.type,
              source.spreadsheetId,
              source.sheetName,
              String(plan.insertionIndex + index + 1),
              field.name,
              '',
              String(field.value),
              'CREATE_ENQUIRY',
            ].map((stringValue) => ({ userEnteredValue: { stringValue } })),
          });
        }),
      );
      requests.push({
        appendCells: {
          sheetId: auditId,
          rows: auditRows,
          fields: 'userEnteredValue',
        },
      });
      await request({
        url: root + ':batchUpdate',
        method: 'POST',
        data: { requests },
        ...options,
      });
      return { enquiryNo: plan.enquiryNo, replayed: false };
    });
}
