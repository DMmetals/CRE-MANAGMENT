import {
  customers,
  salesPersons,
  validateSelections,
} from '../customers/service.js';
import { nextEnquiryNumber } from './creation.js';
import { updateSchema, updateEnquiries } from './update-service.js';
import { createEnquirySchema } from '@cre/shared';
import type { Env } from '../../config/env.js';
import { createEnquiryService } from './create-service.js';
import { BusinessError, businessDate } from './creation.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EnquiryRepository } from './repository.js';
export function enquiryRoutes(
  app: FastifyInstance,
  repository: EnquiryRepository,
  env: Env,
) {
  app.get('/api/enquiries/:type', async (request, reply) => {
    const params = z
      .object({ type: z.enum(['CRR', 'NBD']) })
      .safeParse(request.params);
    if (!params.success)
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Choose CRR or NBD.' },
      });
    const query = z
      .object({ refresh: z.enum(['true', 'false']).optional() })
      .safeParse(request.query);
    if (!query.success)
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid refresh parameter.',
        },
      });
    reply.header('Cache-Control', 'no-store');
    return {
      success: true,
      data: await repository.findAll(
        params.data.type,
        query.data.refresh === 'true',
      ),
    };
  });

  app.get('/api/enquiries/:type/next-number', async (request, reply) => {
    const { type } = z
      .object({ type: z.enum(['CRR', 'NBD']) })
      .parse(request.params);
    const data = await repository.findAll(type, true);
    reply.header('Cache-Control', 'no-store');
    return {
      success: true,
      data: {
        enquiryNo: nextEnquiryNumber(
          type,
          data.rows.map((r) => r.enquiryNo),
          businessDate(),
        ),
        date: businessDate(),
        preview: true,
      },
    };
  });
  app.get('/api/enquiries/:type/:enquiryNo', async (request, reply) => {
    const { type, enquiryNo } = z
      .object({ type: z.enum(['CRR', 'NBD']), enquiryNo: z.string() })
      .parse(request.params);
    const data = await repository.findAll(type);
    const rows = data.rows.filter((r) => r.enquiryNo === enquiryNo);
    if (!rows.length)
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Enquiry not found.' },
      });
    return { success: true, data: { ...data, rows } };
  });
  app.get('/api/customers/:type', async (request) => {
    const { type } = z
      .object({ type: z.enum(['CRR', 'NBD']) })
      .parse(request.params);
    return {
      success: true,
      data: (await customers(env, type)).map((c) => c.customer),
    };
  });
  app.get('/api/customers/:type/:customerName', async (request, reply) => {
    const { type, customerName } = z
      .object({ type: z.enum(['CRR', 'NBD']), customerName: z.string() })
      .parse(request.params);
    const item = (await customers(env, type)).find(
      (c) => c.customer === customerName,
    );
    if (!item)
      return reply
        .code(404)
        .send({
          success: false,
          error: {
            code: 'CUSTOMER_NOT_FOUND',
            message: 'Customer is not in New Party addition.',
          },
        });
    return { success: true, data: item };
  });
  app.get('/api/meta/sales-persons/:type', async (request) => {
    const { type } = z
      .object({ type: z.enum(['CRR', 'NBD']) })
      .parse(request.params);
    return { success: true, data: await salesPersons(env, type) };
  });
  app.patch('/api/enquiries/:type/rows/:dbId', async (request) => {
    const { type, dbId } = z
      .object({ type: z.enum(['CRR', 'NBD']), dbId: z.string().min(1) })
      .parse(request.params);
    const payload = updateSchema.parse(request.body);
    return {
      success: true,
      data: await updateEnquiries(env, type, [{ id: dbId, ...payload }]),
    };
  });
  app.post('/api/enquiries/:type/batch-update', async (request) => {
    const { type } = z
      .object({ type: z.enum(['CRR', 'NBD']) })
      .parse(request.params);
    const updates = z
      .array(updateSchema.extend({ id: z.string().min(1) }))
      .min(1)
      .max(100)
      .parse(request.body);
    if (new Set(updates.map((u) => u.id)).size !== updates.length)
      throw new BusinessError(
        400,
        'DUPLICATE_ID',
        'Save each material only once per batch.',
      );
    return { success: true, data: await updateEnquiries(env, type, updates) };
  });
  const create = createEnquiryService(env);
  app.get('/api/enquiries-config', async () => ({
    success: true,
    data: {
      canCreate:
        env.NODE_ENV === 'development' && env.DEV_AUTH_BYPASS === 'true',
      writesEnabled: env.ENABLE_SHEET_WRITES === 'true',
      date: businessDate(),
    },
  }));
  app.post('/api/enquiries', async (request, reply) => {
    if (
      env.NODE_ENV !== 'development' ||
      env.DEV_AUTH_BYPASS !== 'true' ||
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)
    )
      return reply.code(403).send({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message:
            'Enquiry creation requires an authenticated deployment. Local development access is disabled.',
        },
      });
    const origin = request.headers.origin;
    if (
      origin &&
      origin !== env.FRONTEND_URL &&
      origin !== 'http://127.0.0.1:5173'
    )
      return reply.code(403).send({
        success: false,
        error: {
          code: 'ORIGIN_DENIED',
          message: 'Request origin is not allowed.',
        },
      });
    if (!request.headers['content-type']?.startsWith('application/json'))
      return reply.code(415).send({
        success: false,
        error: { code: 'JSON_REQUIRED', message: 'Use JSON requests.' },
      });
    const parsed = createEnquirySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
    try {
      await validateSelections(
        env,
        parsed.data.type,
        parsed.data.customerName,
        parsed.data.salesPerson,
      );
      const result = await create(parsed.data);
      return reply
        .code(result.replayed ? 200 : 201)
        .send({ success: true, data: result });
    } catch (error) {
      if (error instanceof BusinessError)
        return reply.code(error.statusCode).send({
          success: false,
          error: { code: error.code, message: error.message },
        });
      return reply.code(503).send({
        success: false,
        error: {
          code: 'SAVE_UNCONFIRMED',
          message:
            'Save could not be confirmed. Retry this same submission to avoid duplicates.',
        },
      });
    }
  });
}
