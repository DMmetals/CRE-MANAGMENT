import { fetchApi } from '../../api/response';
import type {
  EnquiryRegister,
  EnquiryType,
  CreateEnquiryInput,
} from '@cre/shared';
export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const body = await fetchApi<T>(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(90000),
  });
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}
export const loadRegister = (type: EnquiryType) =>
  request<EnquiryRegister>(`/api/enquiries/${type}?refresh=true`);
export const loadConfig = () =>
  request<{ canCreate: boolean; date: string }>('/api/enquiries-config');
export const saveEnquiry = (body: CreateEnquiryInput) =>
  request<{ enquiryNo: string; replayed: boolean }>('/api/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
