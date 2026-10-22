// Entry point: config, services, HTTP server, graceful shutdown. Bundled to dist/server.mjs.
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ConfigError, describeConfig, loadConfig, type Config } from './config';
import { createLogger, errorCode } from './log';
import { createServices } from './services';

const log = createLogger();

let config: Config;
try {
  config = loadConfig();
} catch (e) {
  // Variable names only, never values.
  process.stderr.write(`${e instanceof ConfigError ? e.message : 'Invalid configuration'}\n`);
  process.exit(1);
}

const deps = createServices(config, { log, auto: true });
const app = createApp(deps);
await deps.runner.start();

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) =>
  log.info('listening', { port: info.port, config: describeConfig(config) }),
) as Server;

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  log.info('shutdown', { code: signal });
  // Hard stop if something hangs (an SMTP socket, a slow upload).
  setTimeout(() => process.exit(1), 10_000).unref();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  server.closeIdleConnections();
  await closed;
  await deps.runner.stop();
  await deps.mailer.close();
  await deps.store.close();
  process.exit(0);
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => void shutdown(sig));
process.on('unhandledRejection', (e) => log.error('unhandled_rejection', { code: errorCode(e) }));
