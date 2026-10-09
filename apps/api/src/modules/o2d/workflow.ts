import type {
  O2DColumn,
  O2DDropdownKey,
  O2DWorkflow,
  O2DWorkflowKey,
} from '@cre/shared';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { createGoogleAuth } from '../google/auth.js';
import { BusinessError } from '../enquiries/creation.js';
import type { O2DSnapshot } from './repository.js';
import { normalizeO2DHeader } from './headers.js';

export const PO_MAX_BYTES = 10 * 1024 * 1024;
// Explicit options supplied by the user, used only when the Sheet has no validation.
export const workflowDefaults = {
  orderVerification: ['Verified', 'CANCEL'],
  termsCondition: ['Approved', 'Hold', 'Rejected'],
  sizeRateApproval: ['Approved', 'Hold', 'Rejected'],
  materialStatus: [
    'Material In Stock (MUM)',
    'To Purchase',
    'Jindal Booking',
    'Job Work',
    'POP',
    'Material in Stock',
    'Material in Stock DLH',
    'Material in Stock FBD',
  ],
  poApprovalStatus: ['Approved', 'Hold', 'Cancelled'],
};
export function resolveWorkflowFields(
  snapshot: O2DSnapshot,
): O2DWorkflow['fields'] {
  const map = snapshot.headerMap;
  // The Step labels above the headers define the repeated Planned/Actual/Status groups.
  function stepStart(step: number) {
    const positions = new Set<number>();
    for (const row of snapshot.values.slice(0, snapshot.source.header - 1)) {
      row.forEach((v, c) => {
        if (normalizeO2DHeader(v) === `step ${step}`) positions.add(c);
      });
    }
    if (positions.size !== 1)
      throw new BusinessError(
        409,
        'O2D_STEP_LAYOUT_CHANGED',
        `Cannot uniquely locate Step ${step} above the O2D headers.`,
      );
    return [...positions][0]!;
  }
  const step2 = stepStart(2),
    step3 = stepStart(3),
    step4 = stepStart(4);
  if (!(step2 < step3 && step3 < step4))
    throw new BusinessError(
      409,
      'O2D_STEP_LAYOUT_CHANGED',
      'O2D workflow sections are out of order.',
    );
  const within = (header: string, start: number, end: number): O2DColumn => {
    const columns = map.columns.filter(
      (c) =>
        c.column - 1 >= start &&
        c.column - 1 < end &&
        normalizeO2DHeader(c.header) === normalizeO2DHeader(header),
    );
    if (columns.length !== 1)
      throw new BusinessError(
        409,
        'O2D_STEP_LAYOUT_CHANGED',
        `Cannot uniquely map ${header} in its O2D workflow section.`,
      );
    return columns[0]!;
  };
  const receipt = map.requireColumn('Order Receiving Date & Time');
  return {
    receivingDate: within('Order Receiving Date & Time', receipt, step2),
    receiptPlanned: within('Planned', receipt, step2),
    receiptActual: within('Actual', receipt, step2),
    receiptDelay: within('Time Delay', receipt, step2),
    poCopy: within('PO PHOTO', receipt, step2),
    revisedPoCopy: within('Rev PO Photo', receipt, step2),
    step2Planned: within('Planned', step2, step3),
    step2Actual: within('Actual', step2, step3),
    orderVerification: within('Status', step2, step3),
    step2Delay: within('Time Delay (Auto) P', step2, step3),
    step3Planned: within('Planned P', step3, step4),
    step3Actual: within('Actual P', step3, step4),
    termsCondition: within('Terms & Condition', step3, step4),
    sizeRateApproval: within('Size & Rate Approval', step3, step4),
    materialStatus: within('Material Status', step3, step4),
    lotNo: within('Lot NO.', step3, step4),
    crdd: within('CRDD', step3, step4),
    poApprovalStatus: within('PO Approval Status', step3, step4),
    step3Delay: within('Time Delay (Auto) P1', step3, step4),
  };
}
const validationSchema = z.object({
  condition: z.object({
    type: z.string(),
    values: z
      .array(z.object({ userEnteredValue: z.string().optional() }))
      .optional(),
  }),
  strict: z.boolean().optional(),
});
const gridSchema = z.object({
  sheets: z
    .array(
      z.object({
        data: z
          .array(
            z.object({
              startRow: z.number().optional(),
              startColumn: z.number().optional(),
              rowData: z
                .array(
                  z.object({
                    values: z
                      .array(
                        z.object({
                          dataValidation: validationSchema.optional(),
                        }),
                      )
                      .optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});
export type ValidationRule = z.infer<typeof validationSchema>;
export class O2DValidationReader {
  private auth;
  constructor(private env: Env) {
    this.auth = createGoogleAuth(env);
  }
  async options(
    spreadsheetId: string,
    rule: ValidationRule,
  ): Promise<string[]> {
    const values =
      rule.condition.values?.map((v) => v.userEnteredValue ?? '') ?? [];
    if (rule.condition.type === 'ONE_OF_LIST') {
      if (values.some((v) => v.startsWith('=')))
        throw new BusinessError(
          409,
          'O2D_VALIDATION_UNSUPPORTED',
          'A dropdown contains formula options that cannot be resolved. Use a list or range validation.',
        );
      return [...new Set(values.filter((v) => v.trim()))];
    }
    if (rule.condition.type === 'ONE_OF_RANGE' && values[0]) {
      const range = values[0].replace(/^=/, '');
      const response = await this.auth.request({
        url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
        method: 'GET',
        timeout: this.env.GOOGLE_TIMEOUT_MS,
        retry: false,
      });
      const data = z
        .object({
          values: z
            .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
            .optional(),
        })
        .parse(response.data);
      return [
        ...new Set(
          (data.values ?? [])
            .flat()
            .map(String)
            .filter((v) => v.trim()),
        ),
      ];
    }
    throw new BusinessError(
      409,
      'O2D_VALIDATION_UNSUPPORTED',
      'The Sheet validation for a workflow dropdown is not a list or range.',
    );
  }
  // Purchase uses the same list/range resolver without changing Step 2/3 rules.
  async readColumns(
    snapshot: O2DSnapshot,
    rowNumber: number,
    columns: number[],
    listsOnly = false,
  ) {
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${snapshot.source.id}`,
    );
    const tab = `'${snapshot.source.tab.replace(/'/g, "''")}'`;
    for (const column of columns) {
      const letter = snapshot.headerMap.columns[column - 1]!.letter;
      url.searchParams.append(
        'ranges',
        `${tab}!${letter}${snapshot.source.header + 1}:${letter}${snapshot.source.rowCount}`,
      );
    }
    url.searchParams.set(
      'fields',
      'sheets(data(startRow,startColumn,rowData(values(dataValidation))))',
    );
    let grid: z.infer<typeof gridSchema>;
    try {
      const response = await this.auth.request({
        url: url.toString(),
        method: 'GET',
        timeout: this.env.GOOGLE_TIMEOUT_MS,
        retry: false,
      });
      grid = gridSchema.parse(response.data);
    } catch {
      throw new BusinessError(
        503,
        'O2D_VALIDATION_UNAVAILABLE',
        'Could not read Purchase dropdown settings. Retry before saving.',
      );
    }
    const rules = new Map<number, { row: number; rule: ValidationRule }[]>();
    for (const sheet of grid.sheets ?? [])
      for (const block of sheet.data ?? []) {
        (block.rowData ?? []).forEach((row, ri) =>
          (row.values ?? []).forEach((cell, ci) => {
            if (!cell.dataValidation) return;
            const column = (block.startColumn ?? 0) + ci + 1;
            const list = rules.get(column) ?? [];
            list.push({
              row: (block.startRow ?? 0) + ri + 1,
              rule: cell.dataValidation,
            });
            rules.set(column, list);
          }),
        );
      }
    const result: Record<number, string[]> = {};
    for (const column of columns) {
      const matches = rules.get(column) ?? [];
      let found = matches.find((r) => r.row === rowNumber);
      if (!found && matches.length) {
        if (new Set(matches.map((r) => JSON.stringify(r.rule))).size > 1)
          throw new BusinessError(
            409,
            'O2D_VALIDATION_AMBIGUOUS',
            `${snapshot.headerMap.columns[column - 1]!.header}: this row has no validation and other rows have different dropdown rules.`,
          );
        found = matches[0];
      }
      if (
        found &&
        (!listsOnly ||
          ['ONE_OF_LIST', 'ONE_OF_RANGE'].includes(found.rule.condition.type))
      )
        result[column] = await this.options(snapshot.source.id, found.rule);
    }
    return result;
  }
  async read(
    snapshot: O2DSnapshot,
    rowNumber = snapshot.source.header + 1,
  ): Promise<O2DWorkflow> {
    const fields = resolveWorkflowFields(snapshot);
    const keys = Object.keys(workflowDefaults) as O2DDropdownKey[];
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${snapshot.source.id}`,
    );
    const tab = `'${snapshot.source.tab.replace(/'/g, "''")}'`;
    for (const key of keys.filter((k) => k !== 'orderVerification')) {
      const letter = fields[key].letter;
      url.searchParams.append(
        'ranges',
        `${tab}!${letter}${snapshot.source.header + 1}:${letter}${snapshot.source.rowCount}`,
      );
    }
    url.searchParams.set(
      'fields',
      'sheets(data(startRow,startColumn,rowData(values(dataValidation))))',
    );
    let grid: z.infer<typeof gridSchema>;
    try {
      const response = await this.auth.request({
        url: url.toString(),
        method: 'GET',
        timeout: this.env.GOOGLE_TIMEOUT_MS,
        retry: false,
      });
      grid = gridSchema.parse(response.data);
    } catch {
      throw new BusinessError(
        503,
        'O2D_VALIDATION_UNAVAILABLE',
        'Could not read Sheet dropdown settings. Retry before editing workflow fields.',
      );
    }
    const rules = new Map<number, { row: number; rule: ValidationRule }[]>();
    for (const sheet of grid.sheets ?? [])
      for (const block of sheet.data ?? []) {
        (block.rowData ?? []).forEach((row, ri) =>
          (row.values ?? []).forEach((cell, ci) => {
            if (!cell.dataValidation) return;
            const col = (block.startColumn ?? 0) + ci + 1;
            const list = rules.get(col) ?? [];
            list.push({
              row: (block.startRow ?? 0) + ri + 1,
              rule: cell.dataValidation,
            });
            rules.set(col, list);
          }),
        );
      }
    const dropdowns = { ...workflowDefaults };
    const dropdownSources = {} as O2DWorkflow['dropdownSources'];
    const warnings: string[] = [];
    for (const key of keys) {
      if (key === 'orderVerification') {
        dropdownSources[key] = 'business-rule';
        continue;
      }
      const matches = rules.get(fields[key].column) ?? [];
      let found = matches.find((r) => r.row === rowNumber);
      if (!found && matches.length) {
        if (new Set(matches.map((r) => JSON.stringify(r.rule))).size > 1)
          throw new BusinessError(
            409,
            'O2D_VALIDATION_AMBIGUOUS',
            `${fields[key].header}: this row has no validation and other rows have different dropdown rules.`,
          );
        found = matches[0];
      }
      if (found) {
        dropdowns[key] = await this.options(snapshot.source.id, found.rule);
        dropdownSources[key] = 'sheet';
      } else {
        dropdownSources[key] = 'supplied-default';
        warnings.push(
          `${fields[key].header}: no Sheet validation; using supplied business options.`,
        );
      }
    }
    return {
      fields,
      dropdowns,
      dropdownSources,
      warnings,
      writesEnabled: this.env.ENABLE_SHEET_WRITES === 'true',
      uploadMaxBytes: PO_MAX_BYTES,
    };
  }
}
export const workflowAuditActions: Partial<Record<O2DWorkflowKey, string>> = {
  orderVerification: 'UPDATE_ORDER_VERIFICATION',
  termsCondition: 'UPDATE_TERMS_CONDITION',
  sizeRateApproval: 'UPDATE_SIZE_RATE_APPROVAL',
  materialStatus: 'UPDATE_MATERIAL_STATUS',
  lotNo: 'UPDATE_LOT_NO',
  crdd: 'UPDATE_CRDD',
  poApprovalStatus: 'UPDATE_PO_APPROVAL_STATUS',
};
