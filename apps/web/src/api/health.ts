import { fetchApi } from './response';
import type { ApiResponse, GoogleHealth, Health } from '@cre/shared';

async function get<T>(path: string): Promise<ApiResponse<T>> {
  return fetchApi<T>(path, { signal: AbortSignal.timeout(35000) });
}
export async function getHealth() {
  const body = await get<Health>('/api/health');
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}
export async function getGoogleHealth() {
  const body = await get<GoogleHealth>('/api/health/google');
  if (!body.data)
    throw new Error(
      body.success ? 'No connectivity details returned.' : body.error.message,
    );
  return body.data;
}
