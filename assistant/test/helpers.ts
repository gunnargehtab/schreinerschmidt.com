// Test harness: the real app, store (temp DATA_DIR), mailer (dry-run unless a test says otherwise)
// and job runner, wired in-process with a fake clock and a captured log.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { vi } from 'vitest';
import { createApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import type { StepRegistry } from '../src/jobs';
import { createLogger } from '../src/log';
import {
  OUTBOX,
  createMailer,
  defaultTransports,
  type Mailer,
  type OutgoingMail,
  type TransportFactory,
} from '../src/mail/index';
import { STEPS, createServices } from '../src/services';
import { DB_FILE } from '../src/store';
import type { Clock } from '../src/types';

export const SITE = 'https://www.schreinerei.test';
export const OWNER = 'inhaber@schreinerei.test';
export const FROM = 'Schreinerei Schmidt <anfrage@schreinerei.test>';
export const NEXT = `${SITE}/konfigurator/danke/`;

export class FakeClock implements Clock {
  constructor(public t = Date.UTC(2026, 9, 22, 9, 0, 0)) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/** Follows Date.now(), for tests with vi.useFakeTimers() (advance the timers, not the clock). */
export class TimerClock extends FakeClock {
  override now(): number {
    return Date.now();
  }
}

const dirs: string[] = [];
export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'assistant-test-'));
  dirs.push(d);
  return d;
}
export function cleanupDirs(): void {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
}

export function testConfig(dir: string, env: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    SITE_ORIGIN: SITE,
    PUBLIC_BASE_URL: 'https://anfrage.schreinerei.test',
    DATA_DIR: dir,
    OWNER_EMAIL: OWNER,
    MAIL_FROM: FROM,
    ...env,
  });
}

/** Controls a wrapped mailer: fail the next n sends, hang forever, record what was sent. */
export interface MailControl {
  fail: number;
  hang: boolean;
  /** Wait this long (setTimeout) before succeeding or failing. */
  delayMs: number;
  /** Error message for failures (the canary test puts content into it). */
  message: string;
  sent: OutgoingMail[];
}

export function controlled(inner: Mailer): { mailer: Mailer; ctl: MailControl } {
  const ctl: MailControl = { fail: 0, hang: false, delayMs: 0, message: 'SMTP down', sent: [] };
  const mailer: Mailer = {
    mode: inner.mode,
    async send(m) {
      if (ctl.hang) return new Promise(() => {});
      if (ctl.delayMs) await new Promise((r) => setTimeout(r, ctl.delayMs));
      if (ctl.fail > 0) {
        ctl.fail--;
        throw Object.assign(new Error(ctl.message), { code: 'ECONNECTION' });
      }
      ctl.sent.push(m);
      return inner.send(m);
    },
    close: () => inner.close(),
  };
  return { mailer, ctl };
}

export interface HarnessOptions {
  dir?: string;
  env?: Record<string, string>;
  clock?: FakeClock;
  steps?: StepRegistry;
  smtp?: TransportFactory['smtp'];
  rateLimit?: { limit?: number; windowMs?: number };
  inlineMailMs?: number;
  bodyLimit?: number;
  /** Let the runner schedule itself (default false: tests call runDue()). */
  auto?: boolean;
  /** Socket peer address for the rate limit (app.request() has no socket). */
  peer?: string;
}

export type Harness = ReturnType<typeof harness>;

export function harness(o: HarnessOptions = {}) {
  const dir = o.dir ?? tempDir();
  const config = testConfig(dir, o.env);
  const clock = o.clock ?? new FakeClock();
  const logs: string[] = [];
  const log = createLogger(
    (l) => logs.push(l),
    () => clock.now(),
  );
  const smtp = vi.fn(
    o.smtp ??
      (() => {
        throw new Error('SMTP transport constructed');
      }),
  );
  const stream = vi.fn(defaultTransports.stream);
  const inner = createMailer(config, { transports: { stream, smtp }, now: () => clock.now() });
  const { mailer, ctl } = controlled(inner);
  const deps = createServices(config, {
    clock,
    log,
    mailer,
    steps: { ...STEPS, ...o.steps },
    auto: o.auto ?? false,
    rateLimit: o.rateLimit ?? { limit: 1000 },
  });
  const app = createApp({
    ...deps,
    ...(o.inlineMailMs !== undefined ? { inlineMailMs: o.inlineMailMs } : {}),
    ...(o.bodyLimit !== undefined ? { bodyLimit: o.bodyLimit } : {}),
    ...(o.peer !== undefined ? { peerAddress: () => o.peer } : {}),
  });

  const post = (
    body: FormData | string,
    opts: { origin?: string | null; json?: boolean; headers?: Record<string, string> } = {},
  ) => {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.origin !== null) headers['Origin'] = opts.origin ?? SITE;
    if (opts.json !== false) headers['Accept'] = 'application/json';
    return app.request('/anfrage', { method: 'POST', body, headers });
  };

  const outbox = (): string[] => {
    try {
      const d = join(dir, OUTBOX);
      return readdirSync(d)
        .filter((f) => f.endsWith('.eml'))
        .sort()
        .map((f) => readFileSync(join(d, f), 'utf8'));
    } catch {
      return [];
    }
  };

  /** Row count of a table, read straight from the SQLite file. */
  const count = (table: 'faelle' | 'jobs' | 'ereignisse'): number => {
    const db = new DatabaseSync(join(dir, DB_FILE), { readOnly: true });
    try {
      return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
    } finally {
      db.close();
    }
  };

  const close = async () => {
    await deps.runner.stop();
    await deps.store.close();
  };

  return { app, deps, config, dir, clock, logs, ctl, smtp, stream, post, outbox, count, close };
}

/** Header block of an .eml (unfolded). */
export function headers(eml: string): string[] {
  const head = eml.split(/\r?\n\r?\n/)[0] ?? '';
  return head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
}

export const header = (eml: string, name: string): string | undefined =>
  headers(eml)
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    ?.slice(name.length + 1)
    .trim();
