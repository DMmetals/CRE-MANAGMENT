import { quotationCompany } from './profile.js';
import { quotationHtml } from './quotation.js';
import { customers } from '../customers/service.js';
import { businessDate } from '../enquiries/creation.js';
import { saveQuotation } from './save-quotation.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { GoogleSheetsEnquiryRepository } from '../enquiries/repository.js';
import { BusinessError } from '../enquiries/creation.js';
import { renderPdf } from './pdf.js';
import { dispatchRoutes } from '../dispatch/routes.js';
export function documentRoutes(app: FastifyInstance, env: Env) {
  const quote = z.object({
    type: z.enum(['CRR', 'NBD']),
    enquiryNo: z.string().min(1),
    company: z.enum(['DM', 'MM']),
    materials: z
      .array(
        z.object({
          id: z.string(),
          sku: z.string().min(1),
          updatedAt: z.string(),
          version: z.string().min(1),
          rate: z.number().nonnegative(),
        }),
      )
      .min(1)
      .max(50),
    notes: z.string().max(5000).default(''),
    terms: z.record(z.string().max(50), z.string().max(500)).default({}),
  });
  async function quoteHtml(body: unknown) {
    const input = quote.parse(body);
    const data = await new GoogleSheetsEnquiryRepository(env).findAll(
      input.type,
      true,
    );
    const rows = input.materials.map((m) => {
      const r = data.rows.find(
        (r) =>
          r.id === m.id &&
          r.enquiryNo === input.enquiryNo &&
          r.sku === m.sku &&
          r.updatedAt === m.updatedAt &&
          r.version === m.version,
      );
      if (!r)
        throw new BusinessError(
          409,
          'ROW_CHANGED',
          'Quotation material no longer matches the enquiry.',
        );
      return { ...r, rate: m.rate };
    });
    if (new Set(rows.map((r) => r.customer)).size !== 1)
      throw new BusinessError(
        400,
        'CUSTOMER_MISMATCH',
        'Quotation materials must share one customer.',
      );
    const first = rows[0]!;
    const party = (await customers(env, input.type)).find(
      (p) => p.customer === first.customer,
    );
    const company = quotationCompany(env, input.company);
    return quotationHtml({
      company: company.name,
      companyAddress: company.address,
      companyGstin: company.gstin,
      enquiry: input.enquiryNo,
      date: businessDate(),
      customer: first.customer,
      address: party?.address ?? '',
      gstin: party?.gstin ?? '',
      purchaser: party?.purchaser || first.purchaser,
      branch: first.branch,
      terms: input.terms,
      notes: input.notes,
      rows: rows.map((r, index) => [
        index + 1,
        r.thickness ?? '',
        r.width ?? '',
        r.length ?? '',
        r.finish ?? '',
        r.grade ?? '',
        r.edge,
        r.qty ?? '',
        r.rate,
        'KG',
      ]),
    });
  }
  app.post('/api/quotations/preview', async (request) => ({
    success: true,
    data: { html: await quoteHtml(request.body) },
  }));
  app.post('/api/quotations/pdf', async (request, reply) =>
    reply
      .type('application/pdf')
      .header('Content-Disposition', 'attachment; filename="quotation.pdf"')
      .send(await renderPdf(env, await quoteHtml(request.body))),
  );
  app.post('/api/quotations/save', async (request) => {
    const result = await saveQuotation(
      env,
      quote.parse(request.body),
      await quoteHtml(request.body),
    );
    return {
      success: true,
      data: { id: result.id, url: result.url, updatedRows: result.updatedRows },
    };
  });
  app.post('/api/quotations/save-and-download', async (request, reply) => {
    const input = quote.parse(request.body);
    const result = await saveQuotation(env, input, await quoteHtml(input));
    const filename = `Quotation_${input.enquiryNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    return reply
      .type('application/pdf')
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('X-Quotation-Url', result.url)
      .header('X-Updated-Rows', String(result.updatedRows))
      .send(result.pdf);
  });
  app.post('/api/quotations/email', async () => {
    throw new BusinessError(
      409,
      'EMAIL_CONFIGURATION_REQUIRED',
      'Configure an authorized sender mailbox before sending quotation email.',
    );
  });
  dispatchRoutes(app, env);
}
