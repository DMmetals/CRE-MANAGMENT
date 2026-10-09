import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env.js';
import {
  checkPdfFolder,
  driveFailure,
  uploadPdf,
  uploadFile,
} from './drive.js';

const calls = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  request: vi.fn(),
}));
vi.mock('./drive-auth.js', () => ({
  getDriveAuth: async () => {
    calls.auth();
    return {
      auth: { request: calls.request },
      userAuthenticated: calls.user(),
    };
  },
}));
const env = parseEnv({
  NODE_ENV: 'test',
  ENABLE_SHEET_WRITES: 'true',
  GOOGLE_APPLICATION_CREDENTIALS: 'service-account.json',
});
const folder = {
  name: 'Quotation PDFs',
  driveId: 'shared-drive',
  mimeType: 'application/vnd.google-apps.folder',
  capabilities: { canAddChildren: true },
};

beforeEach(() => {
  vi.resetAllMocks();
  calls.user.mockReturnValue(false);
  calls.request.mockResolvedValue({ data: folder });
});

describe('Drive folder validation', () => {
  it('accepts a folder where Google confirms file creation is allowed', async () => {
    await expect(checkPdfFolder(env, 'folder-id')).resolves.toEqual({
      name: 'Quotation PDFs',
      driveId: 'shared-drive',
    });
    expect(calls.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        retry: false,
        url: expect.stringContaining('supportsAllDrives=true'),
      }),
    );
  });

  it.each([
    { ...folder, capabilities: { canAddChildren: false } },
    { ...folder, capabilities: undefined },
    { ...folder, mimeType: 'application/pdf' },
  ])('rejects a destination that cannot accept PDF files: %j', async (data) => {
    calls.request.mockResolvedValue({ data });
    await expect(checkPdfFolder(env, 'folder-id')).rejects.toMatchObject({
      code: 'DRIVE_FOLDER_NOT_WRITABLE',
    });
  });

  it('reports an inaccessible-folder response separately from storage restrictions', async () => {
    calls.request.mockRejectedValue({ response: { status: 404 } });
    await expect(checkPdfFolder(env, 'folder-id')).rejects.toMatchObject({
      code: 'DRIVE_ACCESS_DENIED',
    });
  });

  it('explains that My Drive needs a Google user even when Editor sharing is correct', async () => {
    calls.request.mockResolvedValue({
      data: { ...folder, driveId: undefined },
    });
    await expect(checkPdfFolder(env, 'folder-id')).rejects.toMatchObject({
      code: 'DRIVE_USER_SIGNIN_REQUIRED',
      message: expect.stringContaining('shared correctly'),
    });
  });
  it('accepts the same My Drive folder when a Google user is connected', async () => {
    calls.user.mockReturnValue(true);
    calls.request.mockResolvedValue({
      data: { ...folder, driveId: undefined },
    });
    await expect(checkPdfFolder(env, 'folder-id')).resolves.toMatchObject({
      name: 'Quotation PDFs',
    });
  });
  it.each([
    { response: { status: 401 } },
    { response: { status: 400, data: { error: 'invalid_grant' } } },
  ])('requests reconnection for expired user authorization', (error) => {
    expect(driveFailure(error)).toMatchObject({ code: 'DRIVE_SIGNIN_EXPIRED' });
  });
  it('does not contact Google for an empty folder setting', async () => {
    await expect(checkPdfFolder(env, '')).rejects.toMatchObject({
      code: 'DRIVE_FOLDER_REQUIRED',
    });
    expect(calls.request).not.toHaveBeenCalled();
  });
});

describe('Drive upload failure handling', () => {
  it('distinguishes quota errors from an Editor permission problem', () => {
    expect(
      driveFailure({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: 'storageQuotaExceeded' }] } },
        },
      }),
    ).toMatchObject({ code: 'DRIVE_STORAGE_REQUIRED' });
  });

  it.each([403, 404])('classifies HTTP %s access rejection', (status) => {
    expect(driveFailure({ response: { status } })).toMatchObject({
      code: 'DRIVE_ACCESS_DENIED',
    });
  });

  it('does not claim success after an unconfirmed network failure', () => {
    expect(driveFailure(new Error('connection reset'))).toMatchObject({
      code: 'DRIVE_UPLOAD_UNCONFIRMED',
    });
  });

  it('does not contact Drive when writes are disabled', async () => {
    await expect(
      uploadPdf(
        { ...env, ENABLE_SHEET_WRITES: 'false' },
        'folder-id',
        'Quotation.pdf',
        Buffer.from('%PDF-test'),
      ),
    ).rejects.toMatchObject({ code: 'SHEET_WRITES_DISABLED' });
    expect(calls.auth).not.toHaveBeenCalled();
    expect(calls.request).not.toHaveBeenCalled();
  });

  it('uploads only into the configured folder and uses the returned PDF link', async () => {
    calls.request
      .mockResolvedValueOnce({ data: folder })
      .mockResolvedValueOnce({
        data: {
          id: 'pdf-id',
          webViewLink: 'https://drive.google.com/file/d/pdf-id/view',
        },
      });
    await expect(
      uploadPdf(env, 'folder-id', 'Quotation.pdf', Buffer.from('%PDF-test')),
    ).resolves.toEqual({
      id: 'pdf-id',
      url: 'https://drive.google.com/file/d/pdf-id/view',
    });
    const request = calls.request.mock.calls[1]![0];
    expect(request.method).toBe('POST');
    expect(request.retry).toBe(false);
    expect(request.url).toContain('supportsAllDrives=true');
    expect(request.data.toString()).toContain('"parents":["folder-id"]');
    expect(request.data.toString()).toContain('%PDF-test');
  });
});

it.each(['image/png', 'image/jpeg'] as const)(
  'reuses Drive authentication and folder for %s uploads',
  async (mime) => {
    calls.request
      .mockResolvedValueOnce({ data: folder })
      .mockResolvedValueOnce({ data: { id: 'image-id' } });
    await uploadFile(
      env,
      'folder-id',
      'PO-image',
      Buffer.from('binary-image-fixture'),
      mime,
    );
    const body = calls.request.mock.calls[1]![0].data.toString();
    expect(body).toContain(`"mimeType":"${mime}"`);
    expect(body).toContain(`Content-Type: ${mime}`);
    expect(body).toContain('"parents":["folder-id"]');
  },
);
