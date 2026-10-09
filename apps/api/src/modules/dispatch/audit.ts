import {
  mkdir,
  appendFile,
  readFile,
  writeFile,
  rename,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { DispatchSaved } from '@cre/shared';
const directory = process.env.VITEST
  ? join(tmpdir(), `cre-dispatch-${process.pid}-${randomUUID()}`)
  : fileURLToPath(new URL('../../../../../runtime/dispatch/', import.meta.url));
export interface DispatchOperation {
  hash: string;
  phase: string;
  result?: DispatchSaved;
  error?: string;
}
export class DispatchAudit {
  async event(action: string, details: Record<string, unknown>) {
    await mkdir(directory, { recursive: true });
    await appendFile(
      join(directory, 'audit.jsonl'),
      JSON.stringify({
        action,
        ...details,
        user: 'local-development-user',
        timestamp: new Date().toISOString(),
      }) + '\n',
    );
  }
  async read(id: string): Promise<DispatchOperation | null> {
    try {
      return JSON.parse(
        await readFile(join(directory, id + '.json'), 'utf8'),
      ) as DispatchOperation;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }
  async write(id: string, data: DispatchOperation) {
    await mkdir(directory, { recursive: true });
    const target = join(directory, id + '.json');
    const temp = target + '.' + randomUUID() + '.tmp';
    await writeFile(temp, JSON.stringify(data), { mode: 0o600 });
    await rename(temp, target);
  }
}
