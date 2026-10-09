import { getDriveAuth } from './drive-auth.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Env } from '../../config/env.js';
import { BusinessError } from '../enquiries/creation.js';
export function driveFailure(error: unknown): BusinessError {
  const authentication = z
    .object({
      response: z
        .object({
          status: z.number(),
          data: z.object({ error: z.string() }).optional(),
        })
        .optional(),
    })
    .safeParse(error);
  if (
    authentication.success &&
    (authentication.data.response?.status === 401 ||
      authentication.data.response?.data?.error === 'invalid_grant')
  )
    return new BusinessError(
      401,
      'DRIVE_SIGNIN_EXPIRED',
      'Google Drive sign-in expired or was revoked. Reconnect Google Drive from the quotation page.',
    );
  const parsed = z
    .object({
      response: z
        .object({
          status: z.number(),
          data: z
            .object({
              error: z
                .object({
                  errors: z.array(z.object({ reason: z.string() })).optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .safeParse(error);
  const response = parsed.success ? parsed.data.response : undefined;
  if (response?.status === 401)
    return new BusinessError(
      401,
      'DRIVE_SIGNIN_EXPIRED',
      'Google Drive sign-in expired or was revoked. Reconnect Google Drive from the quotation page.',
    );
  if (
    response?.data?.error?.errors?.some(
      (e) => e.reason === 'storageQuotaExceeded',
    )
  )
    return new BusinessError(
      409,
      'DRIVE_STORAGE_REQUIRED',
      'Google rejected the upload because this account has no Drive storage available. Use a Shared Drive folder with upload access or configure an authorized Google user. Rates and links were not changed.',
    );
  if (response?.status === 403 || response?.status === 404)
    return new BusinessError(
      403,
      'DRIVE_ACCESS_DENIED',
      'Google did not authorize this app to access the PDF folder. Check the configured Drive authorization and folder ID. Editor sharing alone may not authorize the app. Rates and links were not changed.',
    );
  return new BusinessError(
    503,
    'DRIVE_UPLOAD_UNCONFIRMED',
    'Google Drive did not confirm the PDF upload. Check the folder before retrying. Rates and links were not changed.',
  );
}
export async function checkPdfFolder(env: Env, folder: string) {
  if (!folder)
    throw new BusinessError(
      409,
      'DRIVE_FOLDER_REQUIRED',
      'Configure the quotation PDF folder.',
    );
  const { auth, userAuthenticated } = await getDriveAuth(env);
  let response;
  try {
    response = await auth.request({
      url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folder)}?supportsAllDrives=true&fields=name,driveId,mimeType,capabilities(canAddChildren)`,
      method: 'GET',
      timeout: env.GOOGLE_TIMEOUT_MS,
      retry: false,
    });
  } catch (error) {
    throw driveFailure(error);
  }
  const data = z
    .object({
      name: z.string().optional(),
      driveId: z.string().optional(),
      mimeType: z.string(),
      capabilities: z
        .object({ canAddChildren: z.boolean().optional() })
        .optional(),
    })
    .parse(response.data);
  if (
    data.mimeType !== 'application/vnd.google-apps.folder' ||
    !data.capabilities?.canAddChildren
  )
    throw new BusinessError(
      403,
      'DRIVE_FOLDER_NOT_WRITABLE',
      'The configured PDF destination must be a Drive folder where the connected Google account can add files.',
    );
  if (!data.driveId && !userAuthenticated)
    throw new BusinessError(
      409,
      'DRIVE_USER_SIGNIN_REQUIRED',
      'This folder is shared correctly, but it is in My Drive. Connect a Google user to upload PDFs here. A service account can only create files in a Google Workspace Shared Drive. Rates and links were not changed.',
    );
  return { name: data.name ?? 'PDF folder', driveId: data.driveId };
}
export async function uploadPdf(
  env: Env,
  folder: string,
  name: string,
  pdf: Buffer,
) {
  return uploadFile(env, folder, name, pdf, 'application/pdf');
}
export async function uploadFile(
  env: Env,
  folder: string,
  name: string,
  content: Buffer,
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png',
) {
  if (env.ENABLE_SHEET_WRITES !== 'true')
    throw new BusinessError(
      403,
      'SHEET_WRITES_DISABLED',
      'Real writes are disabled.',
    );
  if (!folder)
    throw new BusinessError(
      409,
      'DRIVE_FOLDER_REQUIRED',
      'Configure the document Drive folder.',
    );
  await checkPdfFolder(env, folder);
  const { auth } = await getDriveAuth(env);
  const boundary = 'cre-' + randomUUID();
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType, parents: [folder] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await auth
    .request({
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      data: body,
      timeout: env.GOOGLE_TIMEOUT_MS,
      retry: false,
    })
    .catch((error: unknown) => {
      throw driveFailure(error);
    });
  const result = z
    .object({ id: z.string(), webViewLink: z.string().optional() })
    .parse(response.data);
  return {
    id: result.id,
    url:
      result.webViewLink ?? `https://drive.google.com/file/d/${result.id}/view`,
  };
}

/** Only used to clean up a newly uploaded, unlinked PO after a confirmed pre-write failure. */
export async function trashUploadedFile(env: Env, id: string) {
  const { auth } = await getDriveAuth(env);
  await auth.request({
    url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,
    method: 'PATCH',
    data: { trashed: true },
    timeout: env.GOOGLE_TIMEOUT_MS,
    retry: false,
  });
}
