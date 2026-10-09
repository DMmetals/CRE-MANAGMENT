import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../features/enquiries/api';
import { getGoogleHealth } from './health';
afterEach(() => vi.unstubAllGlobals());
const reply = (body: string, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(body, { status })),
  );
describe('API response handling', () => {
  it('explains an empty proxy failure', async () => {
    reply('', 500);
    await expect(request('/api/enquiries/CRR')).rejects.toThrow(
      'application server is unavailable',
    );
  });
  it('handles non-JSON gateway failures without exposing response HTML', async () => {
    reply('<html>gateway error</html>', 502);
    await expect(request('/api/enquiries/CRR')).rejects.toThrow(
      'application server is unavailable',
    );
  });
  it.each([
    '',
    'null',
    '{}',
    '{"success":false}',
    '{"success":true}',
    '{"success":true,',
  ])('rejects incomplete success responses: %s', async (body) => {
    reply(body);
    await expect(request('/api/enquiries/CRR')).rejects.toThrow(
      'incomplete or invalid response',
    );
  });
  it('preserves actionable API errors', async () => {
    reply(
      JSON.stringify({
        success: false,
        error: {
          code: 'SPREADSHEET_ACCESS_DENIED',
          message: 'Share the CRR spreadsheet.',
        },
      }),
      403,
    );
    await expect(request('/api/enquiries/CRR')).rejects.toThrow(
      'Share the CRR spreadsheet.',
    );
  });
  it('returns register data', async () => {
    reply(JSON.stringify({ success: true, data: { rows: [] } }));
    await expect(request('/api/enquiries/CRR')).resolves.toEqual({ rows: [] });
  });
  it('retains Google connection details on a structured error response', async () => {
    reply(
      JSON.stringify({
        success: false,
        error: { code: 'GOOGLE_UNAVAILABLE', message: 'Connection failed' },
        data: { sources: [{ type: 'CRR', status: 'error' }] },
      }),
      503,
    );
    await expect(getGoogleHealth()).resolves.toEqual({
      sources: [{ type: 'CRR', status: 'error' }],
    });
  });
  it('explains a disconnected backend and does not automatically retry a save', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    await expect(request('/api/enquiries', { method: 'POST' })).rejects.toThrow(
      'Cannot connect',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('explains timeouts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')),
    );
    await expect(request('/api/enquiries/CRR')).rejects.toThrow(
      'took too long',
    );
  });
});
