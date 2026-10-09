// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DriveConnection } from './DriveConnection';
const request = vi.hoisted(() => vi.fn());
vi.mock('../enquiries/api', () => ({ request }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  request.mockReset();
});
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DriveConnection />
    </QueryClientProvider>,
  );
  return client;
}
describe('Drive connection UI', () => {
  it('shows the admin setup requirement without starting Google auth', async () => {
    request.mockResolvedValue({
      state: 'setup-required',
      message: 'Add the OAuth client file.',
    });
    const client = show();
    expect(await screen.findByText('Add the OAuth client file.')).toBeTruthy();
    expect(screen.queryByText('Connect Google Drive')).toBeNull();
    client.clear();
  });
  it('preserves the quotation when the browser blocks the popup', async () => {
    request.mockResolvedValue({
      state: 'sign-in-required',
      message: 'Connect your Google account',
    });
    const popup = vi.spyOn(window, 'open').mockReturnValue(null);
    const client = show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Connect Google Drive' }),
    );
    expect(popup).toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Allow pop-ups',
    );
    expect(request.mock.calls.some((c) => c[0] === '/api/drive/connect')).toBe(
      false,
    );
    client.clear();
  });
  it('opens Google sign-in from the user click with no opener access', async () => {
    request.mockImplementation(async (path: string) =>
      path === '/api/drive/connect'
        ? { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' }
        : { state: 'sign-in-required', message: 'Connect your Google account' },
    );
    const popup = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const client = show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Connect Google Drive' }),
    );
    await waitFor(() =>
      expect(popup.location.href).toContain('https://accounts.google.com/'),
    );
    expect(popup.opener).toBeNull();
    expect(request).toHaveBeenCalledWith(
      '/api/drive/connect',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText(/Complete Google sign-in/)).toBeTruthy();
    client.clear();
  });
});
