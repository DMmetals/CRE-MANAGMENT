import { z } from 'zod';
import { dateSerial } from '@cre/shared';
const text = z.string().max(4000);
const amount = z.union([
  z.number().finite(),
  z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,6})?$/, 'Enter a non-negative decimal amount.'),
]);
export const dispatchInputSchema = z
  .object({
    enquiryNo: z.string().trim().min(1).max(200),
    srNos: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    versions: z.record(z.string(), z.string()).optional(),
    fingerprint: z.string().optional(),
    overrides: z
      .object({
        date: z
          .string()
          .refine((v) => dateSerial(v) !== null, 'Choose a valid date.'),
        termsOfPayment: text,
        poRefNo: text,
        termsOfDelivery: text,
        deliveryLocation: text,
        shipToName: text,
        shipToAddress: text,
        shipGSTIN: text,
        billToName: text,
        billToAddress: text,
        billGSTIN: text,
        vehicleNumber: z.string().max(100),
        transporterName: z.string().max(250),
        otherCharges: amount,
        pkgLoading: amount,
        gstRate: amount,
        termsText: text,
        footerText: text,
      })
      .partial()
      .strict()
      .default({}),
    requestId: z.uuid().optional(),
  })
  .strict();
export type DispatchInput = z.infer<typeof dispatchInputSchema>;
const recipients = z
  .string()
  .max(3000)
  .transform((v) =>
    v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.email()).max(30));
export const dispatchEmailSchema = z
  .object({
    to: recipients.refine((v) => v.length > 0, 'Enter a recipient.'),
    cc: recipients.default([]),
    subject: z
      .string()
      .max(300)
      .refine((v) => !/[\r\n]/.test(v), 'Invalid subject.')
      .default(''),
    message: z
      .string()
      .max(10000)
      .default('Please find attached Dispatch Order PDF.'),
  })
  .strict();
export type DispatchEmail = z.infer<typeof dispatchEmailSchema>;
