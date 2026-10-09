import { O2DPOService, poInputSchema, type POFile } from './po-upload.js';
import { normalizeBranch } from '@cre/shared';
import { BusinessError } from '../enquiries/creation.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { O2DService } from './service.js';
import { O2DTransferService } from './transfer.js';
import { O2DUpdateService, o2dUpdateSchema } from './updates.js';

const branchSchema = z
  .string()
  .transform(normalizeBranch)
  .pipe(z.enum(['FBD', 'MUM']));
const transferSchema = z
  .object({
    type: z.enum(['CRR', 'NBD']),
    enquiryNo: z.string().trim().min(1).max(200),
    branch: branchSchema.optional(),
    previewToken: z.string().max(200).optional(),
  })
  .strict();
export class O2DController {
  constructor(
    private env: Env,
    private service = new O2DService(env),
    private transfers = new O2DTransferService(env),
    private updates = new O2DUpdateService(env),
    private po = new O2DPOService(env),
  ) {}
  register(app: FastifyInstance) {
    app.get('/api/o2d/:branch', async (request, reply) => {
      const { branch } = z
        .object({ branch: branchSchema })
        .parse(request.params);
      const query = z
        .object({
          enquiryNo: z.string().optional(),
          category: z.enum(['CRR', 'NBD']).optional(),
        })
        .parse(request.query);
      const data = await this.service.list(branch);
      reply.header('Cache-Control', 'no-store');
      return {
        success: true,
        data: {
          ...data,
          rows: data.rows.filter(
            (r) =>
              (!query.enquiryNo || r.enquiryNo === query.enquiryNo) &&
              (!query.category || r.category === query.category),
          ),
        },
      };
    });
    app.get('/api/o2d/:branch/meta', async (request, reply) => {
      const { branch } = z
        .object({ branch: branchSchema })
        .parse(request.params);
      reply.header('Cache-Control', 'no-store');
      const { rowId } = z
        .object({ rowId: z.string().optional() })
        .parse(request.query);
      return { success: true, data: await this.service.meta(branch, rowId) };
    });
    app.get('/api/o2d/:branch/rows/:rowId/purchase', async (request, reply) => {
      const { branch, rowId } = z
        .object({ branch: branchSchema, rowId: z.string().min(1).max(2000) })
        .parse(request.params);
      reply.header('Cache-Control', 'no-store');
      return {
        success: true,
        data: await this.service.purchase(branch, rowId),
      };
    });
    app.get('/api/o2d/:branch/activity', async (request, reply) => {
      const { branch } = z
        .object({ branch: branchSchema })
        .parse(request.params);
      const { enquiryNo, srNo } = z
        .object({ enquiryNo: z.string().min(1), srNo: z.string().optional() })
        .parse(request.query);
      reply.header('Cache-Control', 'no-store');
      return {
        success: true,
        data: await this.service.activity(branch, enquiryNo, srNo),
      };
    });
    app.get('/api/o2d/:branch/enquiries/:enquiryNo', async (request, reply) => {
      const { branch, enquiryNo } = z
        .object({ branch: branchSchema, enquiryNo: z.string().min(1) })
        .parse(request.params);
      reply.header('Cache-Control', 'no-store');
      return {
        success: true,
        data: await this.service.enquiry(branch, enquiryNo),
      };
    });
    app.post('/api/o2d/transfer/preview', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        return {
          success: true,
          data: await this.transfers.preview(
            transferSchema.parse(request.body),
          ),
        };
      } catch (error) {
        if (!(error instanceof BusinessError)) throw error;
        return reply.code(error.statusCode).send({
          success: false,
          error: { code: error.code, message: error.message },
          data: {
            eligible: false,
            normalizedBranch: null,
            destination: null,
            materials: [],
            duplicates: [],
            blockingReasons: [error.message],
            writesEnabled: this.env.ENABLE_SHEET_WRITES === 'true',
          },
        });
      }
    });
    app.post('/api/o2d/transfer', async (request) => ({
      success: true,
      data: await this.transfers.transfer(transferSchema.parse(request.body)),
    }));
    app.patch('/api/o2d/:branch/rows/:rowId', async (request) => {
      const { branch, rowId } = z
        .object({ branch: branchSchema, rowId: z.string().min(1) })
        .parse(request.params);
      const input = o2dUpdateSchema.omit({ id: true }).parse(request.body);
      return {
        success: true,
        data: await this.updates.update(branch, [{ ...input, id: rowId }]),
      };
    });
    app.post('/api/o2d/:branch/rows/:rowId/po', async (request) => {
      const { branch, rowId } = z
        .object({ branch: branchSchema, rowId: z.string().min(1).max(2000) })
        .parse(request.params);
      if (!request.isMultipart())
        throw new BusinessError(
          400,
          'PO_MULTIPART_REQUIRED',
          'Choose a PO file to upload.',
        );
      const fields: Record<string, string> = {};
      let file: POFile | undefined;
      try {
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'file' || file)
              throw new BusinessError(
                400,
                'PO_FILE_REQUIRED',
                'Upload exactly one file.',
              );
            file = {
              name: part.filename,
              mimeType: part.mimetype,
              content: await part.toBuffer(),
            };
          } else {
            if (
              part.fieldname in fields ||
              !['enquiryNo', 'srNo', 'type', 'version'].includes(part.fieldname)
            )
              throw new BusinessError(
                400,
                'PO_FIELDS_INVALID',
                'Invalid or duplicate upload field.',
              );
            fields[part.fieldname] = z.string().parse(part.value);
          }
        }
      } catch (error) {
        if (error instanceof BusinessError) throw error;
        throw new BusinessError(
          400,
          'PO_UPLOAD_INVALID',
          'Upload one PDF, JPG, JPEG or PNG file up to 10 MB with the material details.',
        );
      }
      if (!file)
        throw new BusinessError(
          400,
          'PO_FILE_REQUIRED',
          'Choose a PO file to upload.',
        );
      return {
        success: true,
        data: await this.po.save(
          branch,
          rowId,
          poInputSchema.parse(fields),
          file,
        ),
      };
    });
    app.post('/api/o2d/:branch/batch-update', async (request) => {
      const { branch } = z
        .object({ branch: branchSchema })
        .parse(request.params);
      const { rows } = z
        .object({ rows: z.array(o2dUpdateSchema).min(1).max(50) })
        .strict()
        .parse(request.body);
      return { success: true, data: await this.updates.update(branch, rows) };
    });
  }
}
