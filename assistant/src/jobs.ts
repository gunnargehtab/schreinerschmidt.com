// In-process job runner (docs/angebot.md §3). Jobs live in the `jobs` table, one row per (case,
// step), so they survive a restart: start() turns rows left `running` by a crash back to `pending`
// and runs whatever is due. A step gets three attempts by default (the first run, then retries
// after 30 s and 2 min); a step may bring its own, longer schedule (the enquiry mail). While it
// runs by itself, the runner never sleeps longer than MAX_SLEEP_MS, so a `pending` row written by
// another code path (a late inline mail) is picked up without an external trigger. A pipeline step that fails for good moves the case to `bewertung_fehlgeschlagen` with
// a content-free event; the steps run in PIPELINE order (`preis` now; 7c adds `bewertung`, 7d
// `tldr`). Side jobs (the enquiry-mail retry) are registered steps outside the pipeline.
import type { Config } from './config';
import type { Logger } from './log';
import { errorCode } from './log';
import type { Mailer } from './mail/index';
import type { Fall, Job, Store } from './store';
import type { Clock } from './types';

/** Default delays before the 2nd and 3rd attempt. */
export const BACKOFF_MS: readonly number[] = [30_000, 120_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
/** Longest sleep of the self-scheduling runner. */
export const MAX_SLEEP_MS = 60_000;

/**
 * Delay before the next attempt after `attempts` failed ones, or null when they are used up
 * (`schedule.length + 1` attempts in all).
 */
export const backoff = (attempts: number, schedule: readonly number[] = BACKOFF_MS): number | null =>
  attempts >= 1 && attempts <= schedule.length ? (schedule[attempts - 1] ?? null) : null;

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
  /** Delays between attempts; default BACKOFF_MS. */
  backoff?: readonly number[];
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

  /** One timer for the earliest pending job, at most MAX_SLEEP_MS away (also when nothing is pending). */
  private async schedule(): Promise<void> {
    if (!this.d.auto || this.stopped) return;
    const next = await this.d.store.nextDue();
    if (this.timer) clearTimeout(this.timer);
    const delay = next === null ? MAX_SLEEP_MS : Math.min(Math.max(0, next - this.d.clock.now()), MAX_SLEEP_MS);
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
    let failure: unknown = null;
    try {
      await step.run(ctx);
    } catch (e) {
      failure = e ?? new Error('step failed');
    }
    if (failure === null) {
      // The work is done: a bookkeeping error here must not make the step run (and send) again.
      try {
        await store.complete(job.fallId, job.step, clock.now());
        log.info('job_done', { fall: fall.id, step: job.step, attempt, ms: clock.now() - t0 });
        const i = this.pipeline.indexOf(job.step);
        const next = i >= 0 ? this.pipeline[i + 1] : undefined;
        if (next) await store.enqueue(fall.id, next, clock.now(), clock.now());
      } catch (e) {
        log.error('bookkeeping_failed', { fall: fall.id, step: job.step, code: errorCode(e) });
      }
    } else {
      const code = errorCode(failure);
      const delay = backoff(attempt, step.backoff);
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
