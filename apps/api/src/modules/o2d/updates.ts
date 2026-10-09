import { dateSerial } from '@cre/shared';
import type {
  O2DBranch,
  O2DDropdownKey,
  O2DWorkflow,
  O2DWorkflowKey,
  O2DPurchase,
  O2DStepLayout,
} from '@cre/shared';
import { stepLayoutSignature } from './steps.js';
import { purchaseActualWrite } from './purchase.js';
import { resolveWorkflowFields, workflowAuditActions } from './workflow.js';
import { o2dAuditRequests, type O2DAuditEntry } from './audit.js';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
import { withCreationLock } from '../enquiries/lock.js';
import { cellWrite } from '../google/sheets.js';
import { GoogleSheetsO2DRepository, type O2DRepository } from './repository.js';

export const o2dUpdateSchema = z
  .object({
    id: z.string().min(1).max(2000),
    version: z.string().min(1).max(200),
    enquiryNo: z.string().trim().min(1).max(200),
    srNo: z.string().trim().min(1).max(100),
    sku: z.string().trim().min(1).max(500).optional(),
    context: z.enum(['purchase', 'workflow']).optional(),
    changes: z
      .array(
        z
          .object({
            column: z.number().int().positive(),
            value: z.union([z.string().max(5000), z.number().finite()]),
          })
          .strict(),
      )
      .min(1)
      .max(140),
  })
  .strict();
export type O2DUpdate = z.infer<typeof o2dUpdateSchema>;

export class O2DUpdateService {
  constructor(
    private env: Env,
    private repository: O2DRepository = new GoogleSheetsO2DRepository(env),
    private now: () => Date = () => new Date(),
  ) {}
  async update(branch: O2DBranch, input: O2DUpdate[]) {
    if (this.env.ENABLE_SHEET_WRITES !== 'true')
      throw new BusinessError(
        403,
        'SHEET_WRITES_DISABLED',
        'Real Sheet writes are disabled.',
      );
    const updates = z.array(o2dUpdateSchema).min(1).max(50).parse(input);
    if (new Set(updates.map((r) => r.id)).size !== updates.length)
      throw new BusinessError(
        400,
        'DUPLICATE_ROW',
        'Each material may be updated only once per batch.',
      );
    return withCreationLock(async () => {
      const snapshot = await this.repository.load(branch);
      const requests: Record<string, unknown>[] = [];
      const audit: O2DAuditEntry[] = [];
      const workflows = new Map<string, O2DWorkflow>();
      const purchases = new Map<string, O2DPurchase>();
      const layouts = new Map<string, O2DStepLayout>();
      const timestamp = this.now();
      const protectedFields: string[] = [];
      const changedIds = new Set<string>();
      for (const update of updates) {
        if (update.context && !update.sku)
          throw new BusinessError(
            400,
            'SKU_REQUIRED',
            'Workflow saves require Enquiry No., Sr no and SKU.',
          );
        const matches = snapshot.rows.filter(
          (r) =>
            r.enquiryNo === update.enquiryNo &&
            r.srNo === update.srNo &&
            (update.sku === undefined || r.sku === update.sku),
        );
        const row = matches[0];
        if (
          matches.length !== 1 ||
          !row ||
          row.id !== update.id ||
          row.version !== update.version
        )
          throw new BusinessError(
            409,
            'ROW_CHANGED',
            'The material moved or changed. Refresh the O2D register before saving.',
          );
        if (
          new Set(update.changes.map((c) => c.column)).size !==
          update.changes.length
        )
          throw new BusinessError(
            400,
            'DUPLICATE_COLUMN',
            'Each column may be updated only once.',
          );
        const workflow =
          update.context === 'workflow'
            ? undefined
            : await this.repository.workflow?.(snapshot, row.rowNumber);
        const layout =
          update.context === 'workflow'
            ? await this.repository.steps?.(snapshot, row.rowNumber)
            : undefined;
        if (update.context === 'workflow' && !layout)
          throw new BusinessError(
            503,
            'O2D_STEP_METADATA_UNAVAILABLE',
            'Could not verify the Sheet workflow configuration. Retry before saving.',
          );
        if (layout) layouts.set(row.id, layout);
        if (workflow) workflows.set(row.id, workflow);
        const workflowFields =
          workflow?.fields ??
          (layout ? resolveWorkflowFields(snapshot) : undefined);
        const purchase =
          update.context === 'purchase'
            ? await this.repository.purchase?.(snapshot, row.rowNumber)
            : undefined;
        if (update.context === 'purchase' && !purchase)
          throw new BusinessError(
            503,
            'PURCHASE_SETTINGS_UNAVAILABLE',
            'Could not read Purchase settings. Retry before saving.',
          );
        if (purchase) purchases.set(row.id, purchase);
        for (const change of update.changes) {
          const field = row.fields.find((f) => f.column === change.column);
          if (!field)
            throw new BusinessError(
              400,
              'COLUMN_INVALID',
              'This column does not exist in O2D.',
            );
          if (field.protected) {
            protectedFields.push(
              `${row.enquiryNo} / Sr ${row.srNo}: ${field.header} (${field.column})`,
            );
            continue;
          }
          const stepField = layout?.steps
            .flatMap((step) => step.fields)
            .find((f) => f.column === field.column);
          if (stepField && !stepField.editable)
            throw new BusinessError(
              400,
              'FIELD_READ_ONLY',
              `${stepField.label} is controlled by the Sheet or workflow and cannot be edited.`,
            );
          if (purchase?.readOnlyColumns.includes(field.column))
            throw new BusinessError(
              400,
              'FIELD_READ_ONLY',
              `${field.header} is generated automatically and cannot be entered manually.`,
            );
          if (
            !field.editable &&
            !(purchase?.finalStatusColumn === field.column) &&
            !(
              purchase?.columns.includes(field.column) &&
              field.header.trim().toLowerCase() === 'material status sg'
            )
          )
            throw new BusinessError(
              400,
              'FIELD_READ_ONLY',
              `${field.header || 'Unnamed column'} cannot be changed by this action.`,
            );
          const header = field.header.trim().toLowerCase();
          let value = change.value;
          const workflowKey =
            workflowFields &&
            (Object.keys(workflowFields) as O2DWorkflowKey[]).find(
              (key) => workflowFields[key].column === change.column,
            );
          const dropdownKey =
            workflow && workflowKey && workflowKey in workflow.dropdowns
              ? (workflowKey as O2DDropdownKey)
              : undefined;
          if (
            dropdownKey &&
            String(value) !== '' &&
            !workflow!.dropdowns[dropdownKey].includes(String(value))
          )
            throw new BusinessError(
              400,
              'OPTION_INVALID',
              `Choose a configured option for ${workflowKey === 'orderVerification' ? 'Order Verification' : field.header}.`,
            );
          const purchaseOptions =
            stepField?.validationOptions ?? purchase?.dropdowns[field.column];
          if (
            purchaseOptions &&
            String(value) !== '' &&
            String(value) !== field.value &&
            !purchaseOptions.includes(String(value))
          )
            throw new BusinessError(
              400,
              'OPTION_INVALID',
              `Choose a configured option for ${field.column === purchase?.finalStatusColumn ? 'Final Order Status' : field.header}.`,
            );
          const dateField =
            header === 'crdd' ||
            stepField?.inputType === 'date' ||
            purchase?.dateColumns.includes(field.column);
          if (dateField && String(value) !== '') {
            const serial = dateSerial(String(value));
            if (serial === null)
              throw new BusinessError(
                400,
                'DATE_INVALID',
                header === 'crdd'
                  ? 'Choose a valid CRDD date in YYYY-MM-DD format.'
                  : `Choose a valid ${field.header} date in YYYY-MM-DD format.`,
              );
            value = serial;
          }
          if (
            [
              'nos',
              'order qty',
              'order rate',
              'qty dispatched',
              'invoice value',
            ].includes(header) &&
            String(value).trim() !== ''
          ) {
            const numeric = Number(value);
            if (
              !Number.isFinite(numeric) ||
              numeric < 0 ||
              (header === 'order qty' && numeric === 0)
            )
              throw new BusinessError(
                400,
                'NUMBER_INVALID',
                `Enter a valid ${field.header}.`,
              );
            value = numeric;
          }
          if (
            ['dispatch order link', 'po photo', 'rev po photo'].includes(
              header,
            ) &&
            String(value).trim()
          ) {
            try {
              const url = new URL(String(value));
              if (!['https:', 'http:'].includes(url.protocol))
                throw new Error('protocol');
            } catch {
              throw new BusinessError(
                400,
                'LINK_INVALID',
                `Enter a valid web link for ${field.header}.`,
              );
            }
          }
          if (String(change.value) === (field.inputValue ?? field.value))
            continue;
          const write = cellWrite(
            snapshot.source.sheetId,
            row.rowNumber - 1,
            change.column - 1,
            value,
          );
          if (dateField) {
            Object.assign(write.updateCells.rows[0]!.values[0]!, {
              userEnteredFormat: {
                numberFormat: { type: 'DATE', pattern: 'dd/MM/yyyy' },
              },
            });
            write.updateCells.fields =
              'userEnteredValue,userEnteredFormat.numberFormat';
          }
          requests.push(write);
          audit.push({
            action:
              (workflowKey && workflowAuditActions[workflowKey]) ||
              'UPDATE_O2D',
            enquiryNo: row.enquiryNo,
            srNo: row.srNo,
            field: `${field.header} [${change.column}]`,
            oldValue: field.value,
            newValue: String(change.value),
          });
          if (purchase || layout) {
            const actual = purchaseActualWrite(
              snapshot,
              row,
              field.column,
              value,
              timestamp,
            );
            if (actual) {
              requests.push(actual.write);
              audit.push({
                action: 'UPDATE_PURCHASE_ACTUAL',
                enquiryNo: row.enquiryNo,
                srNo: row.srNo,
                field: `${actual.field.header} [${actual.field.column}]`,
                oldValue: actual.field.value,
                newValue: String(actual.value),
              });
            }
          }
          changedIds.add(row.id);
        }
      }
      if (requests.length) {
        const latest = await this.repository.load(branch);
        if (
          JSON.stringify(snapshot.values[snapshot.source.header - 1]) !==
            JSON.stringify(latest.values[latest.source.header - 1]) ||
          JSON.stringify(snapshot.formulas) !==
            JSON.stringify(latest.formulas) ||
          JSON.stringify(snapshot.protectedRanges) !==
            JSON.stringify(latest.protectedRanges) ||
          updates.some(
            (u) =>
              !latest.rows.some(
                (r) =>
                  r.id === u.id &&
                  r.enquiryNo === u.enquiryNo &&
                  r.srNo === u.srNo &&
                  (u.sku === undefined || r.sku === u.sku) &&
                  r.version === u.version,
              ),
          )
        )
          throw new BusinessError(
            409,
            'ROW_CHANGED',
            'O2D changed while saving. Refresh before retrying.',
          );
        for (const [id, previous] of workflows) {
          const current = latest.rows.find((r) => r.id === id)!;
          const latestWorkflow = await this.repository.workflow?.(
            latest,
            current.rowNumber,
          );
          if (JSON.stringify(previous) !== JSON.stringify(latestWorkflow))
            throw new BusinessError(
              409,
              'ROW_CHANGED',
              'Workflow settings changed while saving. Refresh before retrying.',
            );
        }
        for (const [id, previous] of purchases) {
          const current = latest.rows.find((r) => r.id === id)!;
          const next = await this.repository.purchase?.(
            latest,
            current.rowNumber,
          );
          if (
            snapshot.timeZone !== latest.timeZone ||
            JSON.stringify(previous) !== JSON.stringify(next)
          )
            throw new BusinessError(
              409,
              'ROW_CHANGED',
              'Purchase settings changed while saving. Refresh before retrying.',
            );
        }
        for (const [id, previous] of layouts) {
          const current = latest.rows.find((r) => r.id === id)!;
          const next = await this.repository.steps?.(latest, current.rowNumber);
          if (
            !next ||
            snapshot.timeZone !== latest.timeZone ||
            stepLayoutSignature(previous) !== stepLayoutSignature(next)
          )
            throw new BusinessError(
              409,
              'ROW_CHANGED',
              'Sheet workflow configuration changed while saving. Refresh before retrying.',
            );
        }
        await this.repository.commit(latest, [
          ...requests,
          ...o2dAuditRequests(latest, audit),
        ]);
      }
      return { updatedRows: changedIds.size, protectedFields };
    });
  }
}
