import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { parseEnv } from './config/env.js';
import { buildApp } from './app.js';

config({
  path: fileURLToPath(new URL('../../../.env', import.meta.url)),
  quiet: true,
});
try {
  const env = parseEnv(process.env);
  const app = buildApp(env);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
  await app.listen({ host: env.HOST, port: env.PORT });
} catch {
  console.error(
    'API startup failed. Check environment configuration and port availability.',
  );
  process.exitCode = 1;
}
