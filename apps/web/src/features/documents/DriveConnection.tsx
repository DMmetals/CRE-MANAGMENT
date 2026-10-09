import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { request } from '../enquiries/api';
type Status = {
  state: 'ready' | 'sign-in-required' | 'setup-required' | 'error';
  message: string;
  folderName?: string;
};
export function DriveConnection() {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const status = useQuery({
    queryKey: ['drive-status'],
    queryFn: () => request<Status>('/api/drive/status'),
    retry: false,
    staleTime: 15000,
    refetchOnWindowFocus: true,
    refetchInterval: waiting ? 3000 : false,
  });
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setWaiting(false);
      setError('Sign-in timed out. Please try connecting again.');
    }, 600000);
    return () => clearTimeout(timer);
  }, [waiting]);
  useEffect(() => {
    if (status.data?.state === 'ready') setWaiting(false);
  }, [status.data?.state]);
  async function connect() {
    setError('');
    const popup = window.open(
      'about:blank',
      'cre-drive-signin',
      'popup,width=600,height=760',
    );
    if (!popup) {
      setError(
        'Allow pop-ups for this page, then click Connect Google Drive again.',
      );
      return;
    }
    popup.opener = null;
    setStarting(true);
    try {
      const { url } = await request<{ url: string }>('/api/drive/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const destination = new URL(url);
      if (destination.origin !== 'https://accounts.google.com')
        throw new Error('Google sign-in returned an invalid destination.');
      popup.location.href = url;
      setWaiting(true);
    } catch (e) {
      popup.close();
      setError(
        e instanceof Error ? e.message : 'Could not start Google sign-in.',
      );
    } finally {
      setStarting(false);
    }
  }
  return (
    <div
      className="connection-banner"
      style={{ display: 'block', marginBottom: 20 }}
    >
      <strong>
        {status.data?.state === 'ready'
          ? 'Google Drive connected'
          : 'Quotation PDF storage'}
      </strong>
      <p style={{ margin: '6px 0' }}>
        {waiting
          ? 'Complete Google sign-in in the new window. Your quotation stays open here.'
          : (status.data?.message ??
            (status.isError
              ? 'Unable to check Google Drive. Refresh the connection status.'
              : 'Checking Google Drive...'))}
        {status.data?.state === 'ready' && status.data.folderName
          ? ` Folder: ${status.data.folderName}`
          : ''}
      </p>
      <div className="crm-actions">
        {waiting && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setWaiting(false)}
          >
            Cancel waiting
          </button>
        )}
        {(status.data?.state === 'sign-in-required' ||
          status.data?.state === 'ready' ||
          status.data?.state === 'error') && (
          <button
            type="button"
            className="button secondary"
            disabled={starting || waiting}
            onClick={() => void connect()}
          >
            {status.data?.state === 'ready'
              ? 'Change Google account'
              : 'Connect Google Drive'}
          </button>
        )}
        <button
          type="button"
          className="button secondary"
          disabled={status.isFetching}
          onClick={() => void status.refetch()}
        >
          Refresh connection
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
