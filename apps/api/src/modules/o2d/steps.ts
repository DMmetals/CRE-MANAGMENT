import { dateInputValue } from '@cre/shared';
import type { O2DStepField, O2DStepLayout, O2DWorkflowStep } from '@cre/shared';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { createGoogleAuth } from '../google/auth.js';
import { BusinessError } from '../enquiries/creation.js';
import { isBusinessEditable, normalizeO2DHeader } from './headers.js';
import {
  formulaColumns,
  isCellProtected,
  type O2DSnapshot,
} from './repository.js';
import {
  O2DValidationReader,
  PO_MAX_BYTES,
  workflowDefaults,
} from './workflow.js';
import { purchaseDateHeaders, purchaseDefaults } from './purchase.js';
import {
  materialStatusOptions,
  remarksOptions,
  paymentTermsOptions,
} from './step-dropdowns.js';

const valueSchema = z.object({
  stringValue: z.string().optional(),
  numberValue: z.number().optional(),
  boolValue: z.boolean().optional(),
  formulaValue: z.string().optional(),
  errorValue: z.object({ message: z.string().optional() }).optional(),
});
const cellSchema = z.object({
  userEnteredValue: valueSchema.optional(),
  effectiveValue: valueSchema.optional(),
  formattedValue: z.string().optional(),
});
const mergeSchema = z.object({
  startRowIndex: z.number().default(0),
  endRowIndex: z.number(),
  startColumnIndex: z.number().default(0),
  endColumnIndex: z.number(),
});
export const stepGridSchema = z.object({
  sheets: z.array(
    z.object({
      properties: z.object({ sheetId: z.number() }),
      merges: z.array(mergeSchema).optional(),
      data: z
        .array(
          z.object({
            startRow: z.number().default(0),
            startColumn: z.number().default(0),
            rowData: z
              .array(z.object({ values: z.array(cellSchema).optional() }))
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
});
export type StepGrid = z.infer<typeof stepGridSchema>;
type Cell = z.infer<typeof cellSchema>;
const primitive = (value?: z.infer<typeof valueSchema>) =>
  value?.stringValue ?? value?.numberValue ?? value?.boolValue ?? null;
const display = (cell: Cell) =>
  cell.formattedValue ??
  String(
    primitive(cell.effectiveValue) ?? primitive(cell.userEnteredValue) ?? '',
  );
const fail = (message: string): never => {
  throw new BusinessError(409, 'O2D_STEP_LAYOUT_CHANGED', message);
};

export function sheetStepGroups(snapshot: O2DSnapshot, grid: StepGrid) {
  const sheet = grid.sheets.find(
    (s) => s.properties.sheetId === snapshot.source.sheetId,
  );
  if (!sheet)
    return fail('The O2D workflow tab was not returned by Google Sheets.');
  const cells = new Map<string, Cell>();
  for (const block of sheet.data ?? [])
    (block.rowData ?? []).forEach((row, ri) =>
      (row.values ?? []).forEach((cell, ci) =>
        cells.set(`${block.startRow + ri}:${block.startColumn + ci}`, cell),
      ),
    );
  const cellAt = (r: number, c: number) => cells.get(`${r}:${c}`) ?? {};
  const mergedValue = (r: number, c: number) => {
    const merge = (sheet.merges ?? []).find(
      (m) =>
        r >= m.startRowIndex &&
        r < m.endRowIndex &&
        c >= m.startColumnIndex &&
        c < m.endColumnIndex,
    );
    return display(
      cellAt(merge?.startRowIndex ?? r, merge?.startColumnIndex ?? c),
    ).trim();
  };
  const groups: O2DWorkflowStep[] = [];
  const workflowEnd = snapshot.headerMap.requireColumn('Move status') + 1;
  for (const field of snapshot.headerMap.columns.filter(
    (f) => f.column <= workflowEnd,
  )) {
    if (
      normalizeO2DHeader(
        display(cellAt(snapshot.source.header - 1, field.column - 1)),
      ) !== normalizeO2DHeader(field.header)
    )
      return fail(
        'The Sheet column headers changed while loading. Refresh the register.',
      );
  }
  const numbers = new Set<number>();
  for (let r = 0; r < snapshot.source.header - 1; r++)
    for (let c = 0; c < workflowEnd; c++) {
      const text = display(cellAt(r, c)).trim();
      const match = /^step\s+(\d+)$/i.exec(text);
      const final = normalizeO2DHeader(text) === 'final order status';
      if (!match && !final) continue;
      const merge = (sheet.merges ?? []).find(
        (m) => m.startRowIndex === r && m.startColumnIndex === c,
      );
      if (!merge)
        return fail(`The workflow heading ${text} has no merged column range.`);
      const stepNumber = match ? Number(match[1]) : null;
      if (stepNumber !== null) {
        if (numbers.has(stepNumber))
          return fail(
            `Step ${stepNumber} is duplicated in the workflow headers.`,
          );
        numbers.add(stepNumber);
      }
      if (stepNumber === 1) continue; // Basic order fields remain in Overview.
      if (!final && r + 4 >= snapshot.source.header - 1)
        return fail(`Step ${stepNumber} has incomplete What/Who/How/SLA rows.`);
      const title = final ? text : mergedValue(r + 1, c);
      if (!title)
        return fail(`Step ${stepNumber} has no process title in the Sheet.`);
      const columns = snapshot.headerMap.columns.filter(
        (f) => f.column > c && f.column <= merge.endColumnIndex,
      );
      const dispatch =
        final ||
        stepNumber === 9 ||
        stepNumber === 10 ||
        columns.some((f) => normalizeO2DHeader(f.header) === 'planned sg');
      const tab = dispatch
        ? 'Dispatch'
        : stepNumber !== null && [2, 3, 4, 5].includes(stepNumber)
          ? 'Process Status'
          : 'Purchase';
      groups.push({
        key: final ? 'final-status' : `step-${stepNumber}`,
        stepNumber,
        title,
        who: final ? '' : mergedValue(r + 2, c),
        how: final ? '' : mergedValue(r + 3, c),
        sla: final ? '' : mergedValue(r + 4, c),
        tab,
        headerRange: { startColumn: c + 1, endColumn: merge.endColumnIndex },
        fields: [],
      });
    }
  groups.sort((a, b) => a.headerRange.startColumn - b.headerRange.startColumn);
  for (const n of [2, 3, 4, 5, 7, 8, 9])
    if (!numbers.has(n))
      return fail(`Step ${n} is missing from the Sheet workflow headings.`);
  if (!groups.some((g) => g.key === 'final-status'))
    return fail('The Final Order Status merged heading is missing.');
  for (let i = 1; i < groups.length; i++)
    if (
      groups[i]!.headerRange.startColumn <= groups[i - 1]!.headerRange.endColumn
    )
      return fail('O2D workflow heading ranges overlap.');
  // V belongs to Step 1. W:AA have no named step heading. Keep receipt/PO controls
  // in a separate, unnumbered support card instead of falsely assigning them to Step 2.
  const receipt =
    snapshot.headerMap.requireColumn('Order Receiving Date & Time') + 1;
  const terms = snapshot.headerMap.findColumn('Payment Terms');
  const step2 = groups.find((g) => g.stepNumber === 2)!;
  const support: O2DWorkflowStep = {
    key: 'order-receipt',
    stepNumber: null,
    title: snapshot.headerMap.columns[receipt - 1]!.header.trim(),
    who: '',
    how: '',
    sla: '',
    tab: 'Process Status',
    headerRange: {
      startColumn: terms === undefined ? receipt : terms + 1,
      endColumn: step2.headerRange.startColumn - 1,
    },
    fields: [],
  };
  if (support.headerRange.endColumn >= support.headerRange.startColumn)
    groups.unshift(support);
  return { groups, cellAt };
}
const labels: Record<string, string> = {
  'po photo': 'PO Copy',
  'rev po photo': 'Revised PO Copy',
  'vehicle number': 'Vehicle Number',
  'traspoter name': 'Transporter Name',
  'remarks/ challenges': 'Remarks / Challenges',
  'final status timestam[p': 'Final Status Timestamp',
  'final status timestamp': 'Final Status Timestamp',
  'move status': 'Move Status',
};
export function stepFieldLabel(header: string, final: boolean) {
  const key = normalizeO2DHeader(header);
  if (final && key === 'status') return 'Final Order Status';
  if (/^planned(?:\s|$)/.test(key)) return 'Planned';
  if (/^actual(?:\s|$)/.test(key)) return 'Actual';
  if (/^time delay(?:\s|$)/.test(key)) return 'Time Delay';
  if (key === 'status g') return 'Verification Status';
  if (/^status(?:\s|$)/.test(key)) return 'Status';
  return labels[key] ?? header.trim();
}
// Format only explicit ISO timestamps for display. Sheet values and delays stay intact.
export function workflowDisplayValue(
  header: string,
  value: string,
  timeZone?: string,
) {
  if (
    !/^(planned|actual)(?:\s|$)/i.test(header) ||
    !timeZone ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return value;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(instant);
}
export function buildStepLayout(
  snapshot: O2DSnapshot,
  rowNumber: number,
  grid: StepGrid,
  options: Record<number, string[]>,
  writesEnabled: boolean,
): O2DStepLayout {
  const { groups, cellAt } = sheetStepGroups(snapshot, grid);
  const row = snapshot.rows.find((r) => r.rowNumber === rowNumber);
  const managed = formulaColumns(snapshot);
  const warnings: string[] = [];
  const defaults: Record<string, string[]> = {
    'terms & condition': workflowDefaults.termsCondition,
    'size & rate approval': workflowDefaults.sizeRateApproval,
    'material status': materialStatusOptions,
    'material status sg': materialStatusOptions,
    'payment terms': paymentTermsOptions,
    'remarks/ challenges': remarksOptions,
    'status d': purchaseDefaults.approval,
    'status g': workflowDefaults.orderVerification,
    'po approval status': workflowDefaults.poApprovalStatus,
    'status pr': purchaseDefaults.approval,
  };
  for (const group of groups) {
    if (group.stepNumber === 6)
      warnings.push(
        `The ${snapshot.branch} Sheet labels ${group.title} as Step 6; its Sheet numbering is preserved.`,
      );
    group.fields = snapshot.headerMap.columns
      .filter(
        (f) =>
          f.column >= group.headerRange.startColumn &&
          f.column <= group.headerRange.endColumn &&
          f.header.trim(),
      )
      .map((column): O2DStepField => {
        const header = normalizeO2DHeader(column.header),
          cell = cellAt(rowNumber - 1, column.column - 1);
        const formula = cell.userEnteredValue?.formulaValue ?? null;
        const hasFormula = formula !== null || managed.has(column.column - 1);
        const value = display(cell);
        const existing = row?.fields.find((f) => f.column === column.column);
        if (existing && existing.value !== value)
          throw new BusinessError(
            409,
            'ROW_CHANGED',
            'The material changed while loading workflow values. Refresh the register.',
          );
        const protectedCell =
          hasFormula ||
          isCellProtected(snapshot, rowNumber - 1, column.column - 1, managed);
        const system =
          /^planned(?:\s|$)|^time delay|^final status time/.test(header) ||
          [
            'actual d',
            'actual g',
            'actual pr',
            'actual sg',
            'dispatch order link',
          ].includes(header) ||
          (group.stepNumber === 9 && header === 'actual');
        const editable =
          !system &&
          !protectedCell &&
          (existing?.editable ?? isBusinessEditable(column.header));
        const date = header === 'crdd' || purchaseDateHeaders.includes(header);
        let validationOptions = options[column.column];
        let validationSource: O2DStepField['validationSource'] =
          validationOptions ? 'sheet' : undefined;
        // Only explicitly supplied business defaults; never a React option list.
        const fallback =
          group.key === 'final-status' && header === 'status'
            ? purchaseDefaults.final
            : group.stepNumber === 2 && header === 'status'
              ? workflowDefaults.orderVerification
              : defaults[header];
        if (!validationOptions && fallback) {
          validationOptions = [...fallback];
          validationSource = 'supplied-default';
          warnings.push(
            `${column.letter} ${column.header.trim()}: no Sheet list validation; using previously supplied business options.`,
          );
        }
        if (
          group.stepNumber === 2 &&
          header === 'status' &&
          validationSource === 'sheet' &&
          JSON.stringify(validationOptions) !==
            JSON.stringify(workflowDefaults.orderVerification)
        )
          warnings.push(
            `Order Verification validation differs from Verified/CANCEL. The Sheet's current options are shown; the validation rule has not been changed.`,
          );
        const inputType =
          header === 'po photo'
            ? 'po'
            : header === 'rev po photo'
              ? 'revised-po'
              : header === 'dispatch order link'
                ? 'dispatch-link'
                : date
                  ? 'date'
                  : validationOptions && header !== 'lot no.'
                    ? 'select'
                    : 'text';
        return {
          ...column,
          key: `${group.key}.${column.letter}`,
          label: stepFieldLabel(column.header, group.key === 'final-status'),
          value,
          formattedValue: workflowDisplayValue(
            header,
            value,
            snapshot.timeZone,
          ),
          rawValue:
            cell.userEnteredValue?.formulaValue ??
            primitive(cell.userEnteredValue),
          effectiveValue: primitive(cell.effectiveValue),
          formula,
          hasFormula,
          protected: protectedCell,
          editable,
          inputType,
          ...(date
            ? {
                inputValue: dateInputValue(
                  String(primitive(cell.effectiveValue) ?? value),
                ),
              }
            : {}),
          ...(validationOptions ? { validationOptions, validationSource } : {}),
        };
      });
  }
  return {
    steps: groups,
    warnings,
    writesEnabled,
    uploadMaxBytes: PO_MAX_BYTES,
  };
}
export class O2DStepReader {
  private auth;
  constructor(
    private env: Env,
    private validation = new O2DValidationReader(env),
  ) {
    this.auth = createGoogleAuth(env);
  }
  async read(
    snapshot: O2DSnapshot,
    rowNumber = snapshot.source.header + 1,
  ): Promise<O2DStepLayout> {
    const tab = `'${snapshot.source.tab.replace(/'/g, "''")}'`;
    const last = snapshot.headerMap.columns.at(-1)!.letter;
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${snapshot.source.id}`,
    );
    url.searchParams.append(
      'ranges',
      `${tab}!A1:${last}${snapshot.source.header}`,
    );
    url.searchParams.append(
      'ranges',
      `${tab}!A${rowNumber}:${last}${rowNumber}`,
    );
    url.searchParams.set(
      'fields',
      'sheets(properties(sheetId),merges,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue))))',
    );
    let grid: StepGrid;
    try {
      grid = stepGridSchema.parse(
        (
          await this.auth.request({
            url: url.toString(),
            method: 'GET',
            timeout: this.env.GOOGLE_TIMEOUT_MS,
            retry: false,
          })
        ).data,
      );
    } catch {
      throw new BusinessError(
        503,
        'O2D_STEP_METADATA_UNAVAILABLE',
        'Could not read the Sheet workflow headers and calculated values. Retry.',
      );
    }
    const { groups } = sheetStepGroups(snapshot, grid);
    const columns = snapshot.headerMap.columns
      .filter(
        (f) =>
          groups.some(
            (g) =>
              f.column >= g.headerRange.startColumn &&
              f.column <= g.headerRange.endColumn,
          ) &&
          f.header.trim() &&
          !/^planned|^actual|^time delay|^final status time/i.test(
            f.header.trim(),
          ) &&
          !['CRDD', ...purchaseDateHeaders].some(
            (h) => normalizeO2DHeader(h) === normalizeO2DHeader(f.header),
          ),
      )
      .map((f) => f.column);
    const options = await this.validation.readColumns(
      snapshot,
      rowNumber,
      columns,
      true,
    );
    return buildStepLayout(
      snapshot,
      rowNumber,
      grid,
      options,
      this.env.ENABLE_SHEET_WRITES === 'true',
    );
  }
}
export function stepLayoutSignature(layout: O2DStepLayout) {
  return JSON.stringify(
    layout.steps.map((step) => ({
      ...step,
      fields: step.fields.map((f) => ({
        column: f.column,
        header: f.header,
        hasFormula: f.hasFormula,
        protected: f.protected,
        editable: f.editable,
        inputType: f.inputType,
        validationOptions: f.validationOptions,
      })),
    })),
  );
}
