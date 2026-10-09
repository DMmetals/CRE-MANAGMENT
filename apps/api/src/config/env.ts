import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    FRONTEND_URL: z.url().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DM_COMPANY_NAME: z.string().default(''),
    MM_COMPANY_NAME: z.string().default(''),
    DM_COMPANY_ADDRESS: z.string().default(''),
    MM_COMPANY_ADDRESS: z.string().default(''),
    DM_COMPANY_GSTIN: z.string().default(''),
    MM_COMPANY_GSTIN: z.string().default(''),
    ENABLE_SHEET_WRITES: z.enum(['true', 'false']).default('false'),
    O2D_PO_FOLDER_ID: z.string().default(''),
    QUOTATION_PDF_FOLDER_ID: z.string().default(''),
    DISPATCH_PDF_FOLDER_ID: z.string().default(''),
    DISPATCH_GST_RATE: z.coerce.number().min(0).max(100).default(18),
    DISPATCH_EMAIL_FROM: z.union([z.email(), z.literal('')]).default(''),
    SMTP_HOST: z.string().default(''),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASSWORD: z.string().default(''),
    DISPATCH_FBD_GSTIN: z.string().default(''),
    DISPATCH_FBD_ADDRESS: z.string().default(''),
    DISPATCH_FBD_TRANSPORTER_SPREADSHEET_ID: z.string().default(''),
    DISPATCH_FBD_TRANSPORTER_SHEET: z.string().default(''),
    DISPATCH_MUM_GSTIN: z.string().default(''),
    DISPATCH_MUM_ADDRESS: z.string().default(''),
    DISPATCH_MUM_TRANSPORTER_SPREADSHEET_ID: z.string().default(''),
    DISPATCH_MUM_TRANSPORTER_SHEET: z.string().default(''),
    PDF_BROWSER_PATH: z
      .string()
      .default('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
    GOOGLE_PROJECT_ID: z.string().default(''),
    GOOGLE_CLIENT_EMAIL: z.union([z.email(), z.literal('')]).default(''),
    GOOGLE_PRIVATE_KEY: z.string().default(''),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().default(''),
    GOOGLE_DRIVE_OAUTH_CLIENT_FILE: z.string().default(''),
    GOOGLE_DRIVE_USER_CREDENTIALS: z.string().default(''),
    CRR_SHEET_NAME: z.string().default('FMS'),
    NBD_SHEET_NAME: z.string().default('FMS'),
    O2D_FBD_SPREADSHEET_ID: z
      .string()
      .min(1)
      .default('1f0nOcCu4AaFl0DDzODv_mM8i4YYBaCD9lyixfd-DLyo'),
    O2D_MUM_SPREADSHEET_ID: z
      .string()
      .min(1)
      .default('1f9_splrR2pFkvtnLbKY2glGnidYMXxiSriNOJO6cH6A'),
    O2D_FBD_SHEET_NAME: z.string().default(''),
    O2D_MUM_SHEET_NAME: z.string().default(''),
    O2D_FBD_HEADER_ROW: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.coerce.number().int().positive().optional(),
    ),
    O2D_MUM_HEADER_ROW: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.coerce.number().int().positive().optional(),
    ),
    GOOGLE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(30000)
      .default(10000),
    CRR_SPREADSHEET_ID: z
      .string()
      .min(1)
      .default('1Z0dvhNndytFhj122O-QUJjfJQ6y01uNXtnZqQXEQQRA'),
    NBD_SPREADSHEET_ID: z
      .string()
      .min(1)
      .default('1ovxLDAoPuxktNkSTKUBOM9mDzxGbU-x1wOEkTLJmupc'),
    FMS_SHEET_NAME: z.string().min(1).default('FMS'),
    FMS_HEADER_ROW: z.coerce.number().int().positive().default(7),
    FMS_DATA_START_ROW: z.coerce.number().int().positive().default(8),
    DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((env, ctx) => {
    if (env.FMS_DATA_START_ROW <= env.FMS_HEADER_ROW)
      ctx.addIssue({
        code: 'custom',
        path: ['FMS_DATA_START_ROW'],
        message: 'Must be after header row',
      });
    if (env.NODE_ENV === 'production' && env.DEV_AUTH_BYPASS === 'true')
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_BYPASS'],
        message: 'Forbidden in production',
      });
  });

export type Env = z.infer<typeof schema>;
export function parseEnv(input: NodeJS.ProcessEnv): Env {
  const result = schema.safeParse({
    ...input,
    PORT: input.CRE_API_PORT ?? input.PORT,
  });
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  return result.data;
}
