import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { DispatchOrderService } from './service.js';
import { dispatchInputSchema, dispatchEmailSchema } from './schema.js';
export function dispatchRoutes(
  app: FastifyInstance,
  env: Env,
  service = new DispatchOrderService(env),
) {
  const branchSchema = z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(z.enum(['FBD', 'MUM']));
  const params = z.object({
    branch: branchSchema,
    enquiryNo: z.string().optional(),
  });
  app.get('/api/dispatch/:branch/enquiries', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return {
      success: true,
      data: await service.enquiries(params.parse(req.params).branch),
    };
  });
  app.get(
    '/api/dispatch/:branch/enquiries/:enquiryNo/materials',
    async (req, reply) => {
      const p = params.parse(req.params);
      reply.header('Cache-Control', 'no-store');
      return {
        success: true,
        data: await service.materials(p.branch, p.enquiryNo!),
      };
    },
  );
  for (const kind of ['preview', 'pdf', 'save', 'email'] as const) {
    app.post(`/api/dispatch/:branch/${kind}`, async (req, reply) => {
      const branch = params.parse(req.params).branch;
      const body = z.record(z.string(), z.unknown()).parse(req.body);
      const { email, ...raw } = body;
      const input = dispatchInputSchema.parse(raw);
      reply.header('Cache-Control', 'no-store');
      if (kind === 'preview')
        return { success: true, data: await service.preview(branch, input) };
      if (kind === 'pdf') {
        const result = await service.download(branch, input);
        return reply
          .type('application/pdf')
          .header(
            'Content-Disposition',
            `attachment; filename="${result.filename}"`,
          )
          .send(result.pdf);
      }
      return {
        success: true,
        data: await service.save(
          branch,
          input,
          kind === 'email' ? dispatchEmailSchema.parse(email) : undefined,
        ),
      };
    });
  }
  // Compatibility endpoints delegate to the same selection, approval and document pipeline.
  for (const kind of ['preview', 'pdf', 'save'] as const)
    app.post(`/api/dispatch/${kind}`, async (req, reply) => {
      const old = z
        .object({
          branch: branchSchema,
          enquiryNo: z.string(),
          srNos: z.array(z.string()),
          transporter: z.string().optional(),
          vehicle: z.string().optional(),
          billTo: z.string().optional(),
          shipTo: z.string().optional(),
          notes: z.string().optional(),
          overrides: z.record(z.string(), z.unknown()).optional(),
          versions: z.record(z.string(), z.string()).optional(),
          requestId: z.string().optional(),
        })
        .parse(req.body);
      const input = dispatchInputSchema.parse({
        enquiryNo: old.enquiryNo,
        srNos: old.srNos,
        versions: old.versions,
        requestId: old.requestId,
        overrides: {
          ...(old.transporter ? { transporterName: old.transporter } : {}),
          ...(old.vehicle ? { vehicleNumber: old.vehicle } : {}),
          ...(old.billTo ? { billToAddress: old.billTo } : {}),
          ...(old.shipTo ? { shipToAddress: old.shipTo } : {}),
          ...(old.notes ? { termsText: old.notes } : {}),
          ...old.overrides,
        },
      });
      if (kind === 'preview')
        return {
          success: true,
          data: await service.preview(old.branch, input),
        };
      if (kind === 'save')
        return { success: true, data: await service.save(old.branch, input) };
      const result = await service.download(old.branch, input);
      return reply
        .type('application/pdf')
        .header(
          'Content-Disposition',
          `attachment; filename="${result.filename}"`,
        )
        .send(result.pdf);
    });
}
