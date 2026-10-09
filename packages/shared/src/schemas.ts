import { z } from 'zod';
export const createEnquirySchema = z
  .object({
    requestId: z.uuid(),
    type: z.enum(['CRR', 'NBD']),
    customerName: z.string().trim().min(1, 'Customer is required').max(200),
    salesPerson: z.string().trim().min(1, 'Sales person is required').max(100),
    branch: z.enum(['FBD', 'MUM']),
    materials: z
      .array(
        z.object({
          materialType: z.string().trim().max(100),
          sku: z
            .string()
            .trim()
            .min(1, 'SKU is required')
            .max(200)
            .refine(
              (v) => v.split('-').length >= 5 && v.split('-').every(Boolean),
              'Use THK-WIDTH-LENGTH-FINISH-GRADE',
            ),
          edge: z.enum(['ME', 'TE']),
          qty: z.number().positive('Quantity must be positive').max(1000000000),
          limit: z.string().trim().max(100),
          mode: z.enum(['Whatsapp', 'Mail']),
        }),
      )
      .min(1)
      .max(50),
  })
  .strict();
export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;
