// Internal link check: serve dist/ the way GitHub Pages does, crawl from the base URL, stop the server.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { check } from 'linkinator';

if (!process.env.BASE_PATH && existsSync('env/pages.env')) process.loadEnvFile('env/pages.env');

const port = Number(process.env.PORT ?? 4173);
const base = `/${(process.env.BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
const origin = `http://localhost:${port}`;
const startUrl = `${origin}${base}`;

async function isUp() {
  try {
    await fetch(startUrl, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/** @param {import('node:child_process').ChildProcess} server */
async function waitForServer(server, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`serve-dist exited early with code ${server.exitCode}`);
    if (await isUp()) return;
    await sleep(200);
  }
  throw new Error(`serve-dist did not answer on ${startUrl} within ${timeoutMs} ms`);
}

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;
let exitCode = 0;
try {
  if (await isUp()) {
    console.log(`Using the server that already runs on ${startUrl}`);
  } else {
    server = spawn(process.execPath, ['scripts/serve-dist.mjs'], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitForServer(server);
  }

  const result = await check({
    path: startUrl,
    recurse: true,
    // Internal links only: anything outside our own origin is skipped.
    linksToSkip: async (link) => !link.startsWith(`${origin}/`),
  });

  const broken = result.links.filter((link) => link.state === 'BROKEN');
  const checked = result.links.filter((link) => link.state === 'OK').length;
  console.log(`Checked ${checked} internal links, ${broken.length} broken.`);
  for (const link of broken) {
    console.error(`  [${link.status ?? 'ERR'}] ${link.url}\n      found on ${link.parent ?? '(start page)'}`);
  }
  if (broken.length > 0 || !result.passed) exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  // Wait for the child to exit; calling process.exit() while it is still
  // closing trips a libuv assertion on Windows.
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server?.once('exit', resolve));
    server.kill();
    await exited;
  }
}
// Let pending handles (keep-alive sockets) close instead of forcing exit.
process.exitCode = exitCode;
