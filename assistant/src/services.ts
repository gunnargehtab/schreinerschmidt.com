// Wires the backend from a Config: store, mailer, job runner and rate limiter. server.ts and the
// tests use the same wiring; tests override single parts (clock, transports, steps, logger).
import type { AppDeps } from './app';
import { createSdkClient, type ClaudeClient } from './claude/client';
import type { Config } from './config';
import { JobRunner, TLDR_STEP, type StepRegistry } from './jobs';
import { createLogger, type Logger } from './log';
import { createMailer, type Mailer, type TransportFactory } from './mail/index';
import { RateLimiter, type RateLimitOptions } from './ratelimit';
import { ANFRAGE_MAIL, anfrageMail } from './steps/anfrage-mail';
import { BEWERTUNG, bewertung } from './steps/bewertung';
import { preis } from './steps/preis';
import { tldr } from './steps/tldr';
import { openSqliteStore, type Store } from './store';
import { zeitgeber } from './timers';
import { systemClock, type Clock } from './types';

/** Every step the runner knows; the pipeline order lives in jobs.ts (PIPELINE). */
export const STEPS: StepRegistry = { [ANFRAGE_MAIL]: anfrageMail, preis, [BEWERTUNG]: bewertung, [TLDR_STEP]: tldr };

export interface ServiceOverrides {
  store?: Store;
  mailer?: Mailer;
  clock?: Clock;
  log?: Logger;
  transports?: TransportFactory;
  steps?: StepRegistry;
  /** Claude client; `null` forces the no-AI path. Default: the SDK client when a key is set. */
  claude?: ClaudeClient | null;
  pipeline?: readonly string[];
  /** Let the runner schedule itself (server: true; tests: false and runDue()). */
  auto?: boolean;
  rateLimit?: RateLimitOptions;
  /** Timers (reminder, expiry, retention) on the runner's tick; default on, `false` turns them off. */
  timers?: boolean;
}

export function createServices(config: Config, o: ServiceOverrides = {}): AppDeps {
  const clock = o.clock ?? systemClock;
  const log = o.log ?? createLogger(undefined, () => clock.now());
  const store = o.store ?? openSqliteStore(config.dataDir);
  const mailer =
    o.mailer ?? createMailer(config, { ...(o.transports ? { transports: o.transports } : {}), now: () => clock.now() });
  const claude =
    o.claude !== undefined
      ? o.claude
      : config.anthropicApiKey
        ? createSdkClient({ apiKey: config.anthropicApiKey, log, now: () => clock.now() })
        : null;
  const runner = new JobRunner({
    store,
    clock,
    log,
    mailer,
    config,
    steps: o.steps ?? STEPS,
    claude,
    ...(o.pipeline ? { pipeline: o.pipeline } : {}),
    auto: o.auto ?? true,
    ...(o.timers === false ? {} : { periodic: zeitgeber({ store, clock, log, mailer, config }) }),
  });
  return { config, store, mailer, clock, log, runner, limiter: new RateLimiter(clock, o.rateLimit) };
}
