import multipart from '@fastify/multipart';
import { driveOAuthRoutes } from './modules/documents/drive-oauth.js';
import { documentRoutes } from './modules/documents/routes.js';
import { O2DController } from './modules/o2d/controller.js';
import { BusinessError } from './modules/enquiries/creation.js';
import { ZodError } from 'zod';
import { GoogleSheetsEnquiryRepository } from './modules/enquiries/repository.js';
import { enquiryRoutes } from './modules/enquiries/routes.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { ApiResponse, GoogleHealth, Health } from '@cre/shared';
import type { Env } from './config/env.js';
import { createGoogleHealthCheck } from './modules/google/health.js';
import { createMetadataCheck } from './modules/google/metadata.js';

export function buildApp(
  env: Env,
  checkGoogle = createGoogleHealthCheck(env),
  checkMetadata = createMetadataCheck(env),
) {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              req: (req: { method?: string; url?: string }) => ({
                method: req.method,
                url: req.url?.split('?')[0],
              }),
            },
          },
    bodyLimit: 65536,
  });
  app.register(cors, {
    origin: env.FRONTEND_URL,
    methods: ['GET', 'POST', 'PATCH'],
  });
  app.register(helmet);
  app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 4,
      parts: 5,
      fieldSize: 2048,
    },
  });
  app.addHook('preHandler', async (request, reply) => {
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) &&
      ![
        '/api/drive/connect',
        '/api/o2d/transfer/preview',
        '/api/quotations/preview',
        '/api/quotations/pdf',
        '/api/dispatch/preview',
        '/api/dispatch/pdf',
      ].includes(request.url.split('?')[0]!)
    ) {
      if (env.ENABLE_SHEET_WRITES !== 'true')
        return reply.code(403).send({
          success: false,
          error: {
            code: 'SHEET_WRITES_DISABLED',
            message:
              'Write functionality is ready. Set ENABLE_SHEET_WRITES=true to enable real Google Sheet writes.',
          },
        });
      if (
        env.NODE_ENV !== 'development' ||
        env.DEV_AUTH_BYPASS !== 'true' ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.ip)
      )
        return reply.code(403).send({
          success: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Business writes require authorized local access.',
          },
        });
      if (
        request.headers.origin &&
        !['http://127.0.0.1:5173', env.FRONTEND_URL].includes(
          request.headers.origin,
        )
      )
        return reply.code(403).send({
          success: false,
          error: {
            code: 'ORIGIN_DENIED',
            message: 'Request origin is not allowed.',
          },
        });
    }
  });
  driveOAuthRoutes(app, env);
  app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
  app.get('/api/health', async (): Promise<ApiResponse<Health>> => ({
    success: true,
    data: {
      status: 'ok',
      service: 'cre-erp-api',
      timestamp: new Date().toISOString(),
      phase: 1,
    },
  }));
  app.get(
    '/api/health/google',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_request, reply): Promise<ApiResponse<GoogleHealth>> => {
      reply.header('Cache-Control', 'no-store');
      const data = await checkGoogle();
      if (data.sources.every((source) => source.status === 'connected'))
        return { success: true, data };
      reply.code(503);
      return {
        success: false,
        error: {
          code: 'GOOGLE_UNAVAILABLE',
          message: 'One or more spreadsheet connectivity checks failed.',
        },
        data,
      };
    },
  );
  app.get(
    '/api/meta/sheets',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const data = await checkMetadata();
      if (data.sources.every((source) => source.status === 'connected'))
        return { success: true, data };
      reply.code(503);
      return {
        success: false,
        error: {
          code: 'GOOGLE_METADATA_UNAVAILABLE',
          message: 'One or more metadata checks failed.',
        },
        data,
      };
    },
  );
  enquiryRoutes(app, new GoogleSheetsEnquiryRepository(env), env);
  documentRoutes(app, env);
  new O2DController(env).register(app);
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Endpoint not found.' },
    }),
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof BusinessError)
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...('protectedFields' in error
            ? { protectedFields: error.protectedFields }
            : {}),
        },
      });
    if (error instanceof ZodError)
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.issues.map((i) => i.message).join('; '),
        },
      });
    const candidate =
      error instanceof Error && 'statusCode' in error
        ? error.statusCode
        : undefined;
    const status =
      typeof candidate === 'number' && candidate >= 400 && candidate < 500
        ? candidate
        : 500;
    request.log.error({ requestId: request.id, status }, 'Request failed');
    reply.code(status).send({
      success: false,
      error: {
        code:
          status === 429
            ? 'RATE_LIMITED'
            : status === 500
              ? 'INTERNAL_ERROR'
              : 'REQUEST_ERROR',
        message:
          status === 429
            ? 'Too many requests. Retry later.'
            : status === 500
              ? 'An unexpected server error occurred.'
              : 'The request could not be processed.',
      },
    });
  });
  return app;
}
