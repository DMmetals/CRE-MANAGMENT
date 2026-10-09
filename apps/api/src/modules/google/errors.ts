import { z } from 'zod';
import type { SourceHealth } from '@cre/shared';
export function safeFailure(
  error: unknown,
): Pick<SourceHealth, 'code' | 'message'> {
  const parsed = z
    .object({ response: z.object({ status: z.number() }) })
    .safeParse(error);
  const status = parsed.success ? parsed.data.response.status : undefined;
  if (status === 401)
    return {
      code: 'GOOGLE_AUTH_FAILED',
      message: 'Google rejected the service-account credentials.',
    };
  if (status === 403)
    return {
      code: 'GOOGLE_ACCESS_DENIED',
      message:
        'Enable the Sheets API and share the spreadsheet with the service account.',
    };
  if (status === 404)
    return {
      code: 'GOOGLE_SHEET_NOT_FOUND',
      message: 'Check the spreadsheet ID and service-account access.',
    };
  if (status === 400)
    return {
      code: 'GOOGLE_RANGE_INVALID',
      message: 'Check the configured FMS tab and header row.',
    };
  if (status === 429)
    return {
      code: 'GOOGLE_RATE_LIMITED',
      message: 'Google quota exceeded. Retry later.',
    };
  return {
    code: 'GOOGLE_CONNECTION_FAILED',
    message:
      'Google connectivity failed. Check credentials, network access and configuration.',
  };
}
