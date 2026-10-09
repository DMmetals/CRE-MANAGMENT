import type { O2DBranch, O2DRow } from '@cre/shared';
import { extname } from 'node:path';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
import { withCreationLock } from '../enquiries/lock.js';
import { uploadFile, trashUploadedFile } from '../documents/drive.js';
import { cellWrite } from '../google/sheets.js';
import {
  GoogleSheetsO2DRepository,
  type O2DRepository,
  type O2DSnapshot,
} from './repository.js';
import { PO_MAX_BYTES, resolveWorkflowFields } from './workflow.js';
import { o2dAuditRequests } from './audit.js';
export const poInputSchema = z
  .object({
    enquiryNo: z.string().trim().min(1).max(200),
    srNo: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(100),
    type: z.enum(['PO', 'REVISED_PO']),
    version: z.string().min(1).max(200).optional(),
  })
  .strict();
export type POInput = z.infer<typeof poInputSchema>;
export interface POFile {
  name: string;
  mimeType: string;
  content: Buffer;
}
export function validatePOFile(
  file: POFile,
): 'application/pdf' | 'image/jpeg' | 'image/png' {
  if (!file.content.length || file.content.length > PO_MAX_BYTES)
    throw new BusinessError(
      400,
      'PO_FILE_SIZE',
      'Choose a non-empty PO file no larger than 10 MB.',
    );
  const ext = extname(file.name).toLowerCase();
  const type = file.mimeType.toLowerCase();
  const pdf =
    ext === '.pdf' &&
    type === 'application/pdf' &&
    file.content.subarray(0, 5).toString() === '%PDF-';
  const jpeg =
    ['.jpg', '.jpeg'].includes(ext) &&
    type === 'image/jpeg' &&
    file.content.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const png =
    ext === '.png' &&
    type === 'image/png' &&
    file.content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!(pdf || jpeg || png))
    throw new BusinessError(
      400,
      'PO_FILE_TYPE',
      'Choose a valid PDF, JPG, JPEG or PNG file. Its contents must match its file type.',
    );
  return pdf ? 'application/pdf' : jpeg ? 'image/jpeg' : 'image/png';
}
export function poFilename(
  input: POInput,
  extension: string,
  time = new Date(),
) {
  const enquiry = Array.from(input.enquiryNo, (char) =>
    char.charCodeAt(0) < 32 ? '_' : char,
  )
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 150);
  return `${enquiry}_SR-${input.srNo}_${input.type}_${time.toISOString().replace(/[:.]/g, '-')}${extension.toLowerCase()}`;
}
export class O2DPOService {
  constructor(
    private env: Env,
    private repository: O2DRepository = new GoogleSheetsO2DRepository(env),
    private upload = uploadFile,
    private trash = trashUploadedFile,
  ) {}
  private target(snapshot: O2DSnapshot, rowId: string, input: POInput) {
    const rows = snapshot.rows.filter(
      (r) => r.enquiryNo === input.enquiryNo && r.srNo === input.srNo,
    );
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row ||
      row.id !== rowId ||
      (input.version && row.version !== input.version)
    )
      throw new BusinessError(
        409,
        'ROW_CHANGED',
        'The material moved or changed. Refresh before uploading the PO.',
      );
    const mapping = resolveWorkflowFields(snapshot);
    const column = mapping[input.type === 'PO' ? 'poCopy' : 'revisedPoCopy'];
    const field = row.fields.find((f) => f.column === column.column);
    if (!field || field.protected)
      throw new BusinessError(
        409,
        'O2D_FORMULA_PROTECTED',
        'The PO cell is Sheet formula / protected. No file was attached.',
      );
    return { row, field };
  }
  async save(
    branch: O2DBranch,
    rowId: string,
    inputValue: POInput,
    file: POFile,
  ) {
    if (this.env.ENABLE_SHEET_WRITES !== 'true')
      throw new BusinessError(
        403,
        'SHEET_WRITES_DISABLED',
        'Sheet writes are disabled. PO uploads are unavailable.',
      );
    const input = poInputSchema.parse(inputValue);
    const mime = validatePOFile(file);
    return withCreationLock(async () => {
      const snapshot = await this.repository.load(branch);
      const original = this.target(snapshot, rowId, input);
      const folder =
        this.env.O2D_PO_FOLDER_ID || this.env.QUOTATION_PDF_FOLDER_ID;
      const uploaded = await this.upload(
        this.env,
        folder,
        poFilename(input, extname(file.name)),
        file.content,
        mime,
      );
      let committing = false;
      try {
        const latest = await this.repository.load(branch);
        const current = this.target(latest, rowId, {
          ...input,
          version: original.row.version,
        });
        if (current.field.column !== original.field.column)
          throw new BusinessError(
            409,
            'ROW_CHANGED',
            'The PO column moved while uploading. Refresh before retrying.',
          );
        const action = `${current.field.value ? 'REPLACE' : 'UPLOAD'}_${input.type}`;
        committing = true;
        await this.repository.commit(latest, [
          cellWrite(
            latest.source.sheetId,
            current.row.rowNumber - 1,
            current.field.column - 1,
            uploaded.url,
          ),
          ...o2dAuditRequests(latest, [
            {
              action,
              enquiryNo: input.enquiryNo,
              srNo: input.srNo,
              field: current.field.header,
              oldValue: current.field.value,
              newValue: uploaded.url,
            },
          ]),
        ]);
      } catch (error) {
        if (!committing) {
          try {
            await this.trash(this.env, uploaded.id);
          } catch {
            throw new BusinessError(
              409,
              'PO_UPLOAD_UNLINKED',
              'The PO file uploaded but the material changed before its link could be saved. The unlinked file remains in the configured Drive folder. Refresh before retrying.',
            );
          }
          throw error;
        }
        throw new BusinessError(
          503,
          'PO_SAVE_UNCONFIRMED',
          'The PO upload succeeded, but its Sheet link could not be confirmed. Refresh this material before retrying; the uploaded file is retained.',
        );
      }
      let row: O2DRow | undefined;
      try {
        row = (await this.repository.load(branch)).rows.find(
          (r) => r.id === rowId,
        );
      } catch {
        /* Save completed; the UI must refresh before another edit. */
      }
      return {
        url: uploaded.url,
        column: original.field.column,
        row,
        refreshRequired: !row,
        type: input.type,
      };
    });
  }
}
