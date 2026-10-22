// In-process job runner (docs/angebot.md §3). Jobs live in the `jobs` table, one row per (case,
// step), so they survive a restart: start() turns rows left `running` by a crash back to `pending`
// and runs whatever is due. Each step gets three attempts: the first run, then retries after 30 s
// and 2 min. A pipeline step that fails for good moves the case to `bewertung_fehlgeschlagen` with
// a content-free event; the steps run in PIPELINE order (`preis` now; 7c adds `bewertung`, 7d
// `tldr`). Side jobs (the enquiry-mail retry) are registered steps outside the pipeline.
import type { Config } from './config';
import type { Logger } from './log';
import { errorCode } from './log';
import type { Mailer } from './mail/index';
import type { Fall, Job, Store } from './store';
import type { Clock } from './types';

/** Delays before the 2nd and 3rd attempt. */
export const BACKOFF_MS: readonly number[] = [30_000, 120_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** Delay before the next attempt after `attempts` failed ones, or null when they are used up. */
export const backoff = (attempts: number): number | null =>
  attempts < MAX_ATTEMPTS ? (BACKOFF_MS[attempts - 1] ?? null) : null;

export interface StepContext {
  fall: Fall;
  store: Store;
  clock: Clock;
  log: Logger;
  mailer: Mailer;
  config: Config;
}

export interface StepDef {
  run(ctx: StepContext): Promise<void>;
  /** Called once when the last attempt failed. */
  exhausted?(ctx: StepContext, code: string): Promise<void>;
}

export type StepRegistry = Readonly<Record<string, StepDef>>;

/** Pipeline steps in order; each one is enqueued when the previous one is done. */
export const PIPELINE: readonly string[] = ['preis'];

export interface RunnerDeps {
  store: Store;
  clock: Clock;
  log: Logger;
  mailer: Mailer;
  config: Config;
  steps: StepRegistry;
  pipeline?: readonly string[];
  /** Schedule runs by itself (server). Tests turn it off and call runDue(). */
  auto?: boolean;
}

export class JobRunner {
  private chain: Promise<number> = Promise.resolve(0);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  readonly pipeline: readonly string[];

  constructor(private readonly d: RunnerDeps) {
    this.pipeline = d.pipeline ?? PIPELINE;
  }

  /** The jobs a new case starts with: the first pipeline step, due now. */
  firstJobs(now: number): { step: string; status: 'pending'; nextAt: number }[] {
    const first = this.pipeline[0];
    return first ? [{ step: first, status: 'pending', nextAt: now }] : [];
  }

  /** Resumes after a restart: `running` rows go back to `pending`, then everything due runs. */
  async start(): Promise<void> {
    this.stopped = false;
    const n = await this.d.store.resetRunning(this.d.clock.now());
    if (n) this.d.log.warn('jobs_resumed', { count: n });
    this.kick();
  }

  /** Asks for a run soon (after the current response); no-op unless `auto`. */
  kick(): void {
    if (!this.d.auto || this.stopped) return;
    setImmediate(() => void this.runDue());
  }

  /** Runs every due job (serialised: concurrent calls queue up). Resolves with the number run. */
  runDue(): Promise<number> {
    this.chain = this.chain.then(
      () => this.drain(),
      () => this.drain(),
    );
    return this.chain;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.chain.catch(() => 0);
  }

  private async drain(): Promise<number> {
    let n = 0;
    // Bounded: a job that is due again at once (clock not moving) cannot spin forever.
    for (let round = 0; round < 100 && !this.stopped; round++) {
      const jobs = await this.d.store.due(this.d.clock.now());
      if (!jobs.length) break;
      for (const j of jobs) {
        if (this.stopped) break;
        if (await this.runOne(j)) n++;
      }
    }
    await this.schedule();
    return n;
  }

  /** One timer for the earliest pending job (retries after 30 s / 2 min). */
  private async schedule(): Promise<void> {
    if (!this.d.auto || this.stopped) return;
    const next = await this.d.store.nextDue();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (next === null) return;
    const delay = Math.min(Math.max(0, next - this.d.clock.now()), 2_147_000_000);
    this.timer = setTimeout(() => void this.runDue(), delay);
    this.timer.unref();
  }

  private async runOne(job: Job): Promise<boolean> {
    const { store, clock, log } = this.d;
    if (!(await store.claim(job.fallId, job.step, clock.now()))) return false;
    const fall = await store.get(job.fallId);
    const step = this.d.steps[job.step];
    const attempt = job.attempts + 1;
    if (!fall || !step) {
      await store.fail(job.fallId, job.step, fall ? 'unknown_step' : 'no_case', clock.now());
      log.error('job_failed', { fall: job.fallId, step: job.step, code: fall ? 'unknown_step' : 'no_case' });
      return true;
    }
    const ctx: StepContext = { ...this.d, fall };
    const t0 = clock.now();
    try {
      await step.run(ctx);
      await store.complete(job.fallId, job.step, clock.now());
      log.info('job_done', { fall: fall.id, step: job.step, attempt, ms: clock.now() - t0 });
      const i = this.pipeline.indexOf(job.step);
      const next = i >= 0 ? this.pipeline[i + 1] : undefined;
      if (next) await store.enqueue(fall.id, next, clock.now(), clock.now());
    } catch (e) {
      const code = errorCode(e);
      const delay = backoff(attempt);
      if (delay !== null) {
        await store.retry(job.fallId, job.step, clock.now() + delay, code, clock.now());
        log.warn('job_retry', { fall: fall.id, step: job.step, attempt, code, ms: clock.now() - t0 });
      } else {
        await store.fail(job.fallId, job.step, code, clock.now());
        log.error('job_failed', { fall: fall.id, step: job.step, attempt, code });
        await store.event(fall.id, `${job.step}_failed`, code, clock.now());
        try {
          if (step.exhausted) await step.exhausted({ ...ctx, fall: (await store.get(fall.id)) ?? fall }, code);
          if (this.pipeline.includes(job.step)) await markFailed(ctx, code);
        } catch (e2) {
          log.error('job_exhausted_handler', { fall: fall.id, step: job.step, code: errorCode(e2) });
        }
      }
    }
    return true;
  }
}

/** A pipeline step failed for good: `eingegangen` → `bewertung_fehlgeschlagen` (owner prices manually). */
export async function markFailed(ctx: StepContext, code: string): Promise<void> {
  const { store, clock, log } = ctx;
  for (let i = 0; i < 3; i++) {
    const cur = await store.get(ctx.fall.id);
    if (!cur || cur.status !== 'eingegangen') return;
    const r = await store.transition(cur.id, 'eingegangen', 'bewertung_fehlgeschlagen', cur.version, clock.now());
    if (r.ok) {
      log.warn('bewertung_fehlgeschlagen', { fall: cur.id, code });
      return;
    }
  }
}
