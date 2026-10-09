import nodemailer from 'nodemailer';
import type { Env } from '../../config/env.js';
import type { DispatchEmail } from './schema.js';
import { BusinessError } from '../enquiries/creation.js';
export function dispatchEmailReady(env: Env) {
  return Boolean(
    env.DISPATCH_EMAIL_FROM &&
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASSWORD,
  );
}
export async function sendDispatchEmail(
  env: Env,
  email: DispatchEmail,
  pdf: Buffer,
  filename: string,
) {
  if (!dispatchEmailReady(env))
    throw new BusinessError(
      409,
      'EMAIL_CONFIGURATION_REQUIRED',
      'Configure the authorized dispatch sender and SMTP settings before sending email.',
    );
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: env.DISPATCH_EMAIL_FROM,
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      text: email.message,
      attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
    });
    if (result.rejected.length)
      throw new BusinessError(
        503,
        'EMAIL_PARTIAL',
        'Some recipients were rejected. Check sent mail before retrying to avoid duplicate delivery.',
      );
    return { messageId: String(result.messageId) };
  } catch (e) {
    if (e instanceof BusinessError) throw e;
    throw new BusinessError(
      503,
      'EMAIL_UNCONFIRMED',
      'The mail server did not confirm delivery. Check sent mail and SMTP configuration before retrying.',
    );
  } finally {
    transport.close();
  }
}
