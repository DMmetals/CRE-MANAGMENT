import type { ApiResponse } from '@cre/shared';

function invalidResponse(response: Response) {
  return new Error(
    response.status >= 500
      ? 'The application server is unavailable. Start or restart the backend, then retry.'
      : 'The application server returned an incomplete or invalid response. Please retry.',
  );
}

export async function fetchApi<T>(url: string, options: RequestInit = {}) {
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, options);
    text = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new Error(
        'The application server took too long to respond. Please retry.',
      );
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error(
      'Cannot connect to the application server. Check that the backend is running, then retry.',
    );
  }
  return parseApiResponse<T>(response, text);
}

export function parseApiResponse<T>(
  response: Response,
  text: string,
): ApiResponse<T> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw invalidResponse(response);
  }
  if (!body || typeof body !== 'object' || !('success' in body))
    throw invalidResponse(response);
  if (body.success === true) {
    if (!response.ok || !('data' in body)) throw invalidResponse(response);
  } else if (body.success === false) {
    if (
      !('error' in body) ||
      !body.error ||
      typeof body.error !== 'object' ||
      !('message' in body.error) ||
      typeof body.error.message !== 'string' ||
      !body.error.message.trim()
    )
      throw invalidResponse(response);
  } else throw invalidResponse(response);
  return body as ApiResponse<T>;
}
