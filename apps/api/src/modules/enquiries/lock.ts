import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, open, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BusinessError } from './creation.js';
// Each isolated Vitest module gets its own lock; tests never contend with live saves.
const directory = process.env.VITEST
  ? join(tmpdir(), `cre-enquiry-lock-${process.pid}-${randomUUID()}`)
  : fileURLToPath(new URL('../../../../../runtime/locks/', import.meta.url));
export async function withCreationLock<T>(
  action: () => Promise<T>,
): Promise<T> {
  await mkdir(directory, { recursive: true });
  const path = `${directory}/enquiry-create.lock`;
  const handle = await open(path, 'wx').catch(() => {
    throw new BusinessError(
      409,
      'CREATE_BUSY',
      'Another enquiry is being saved. Retry in a moment.',
    );
  });
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    return await action();
  } finally {
    await handle.close();
    await unlink(path);
  }
}
