// Job runner and the `preis` step (docs/angebot.md §3, §4, §11).
import { afterEach, describe, expect, it } from 'vitest';
import type { KalkulierenResult } from '../../src/lib/configurator/pricing/kalkulieren';
import { BACKOFF_MS } from '../src/jobs';
import { MAIL_BACKOFF_MS } from '../src/steps/anfrage-mail';
import { BODEN, REGAL, SONSTIGES, anfrageJson, configuratorForm, jpeg, newId } from './fixtures';
import { cleanupDirs, harness, type Harness } from './helpers';

const open: Harness[] = [];
const make = (...a: Parameters<typeof harness>) => {
  const x = harness(...a);
  open.push(x);
  return x;
};
afterEach(async () => {
  for (const x of open.splice(0)) await x.close();
  cleanupDirs();
});

async function submit(h: Harness, v = REGAL, opts: Parameters<typeof configuratorForm>[1] = {}) {
  const id = opts.id ?? newId();
  const res = await h.post(configuratorForm(v, { ...opts, id }));
  expect(res.status).toBe(200);
  return (await h.deps.store.getByAnfrageId(id!))!;
}

const kinds = async (h: Harness, id: string) => (await h.deps.store.events(id)).map((e) => e.kind);

describe('preis step', () => {
  it('stores a rule-based Kalkulation for a Möbel Regal; the status stays eingegangen', async () => {
    const h = make();
    const fall = await submit(h, REGAL);
    expect(await h.deps.runner.runDue()).toBe(2); // preis, then bewertung (no key: without AI)
    const after = await h.deps.store.get(fall.id);
    const k = after?.kalkulation as KalkulierenResult;
    expect(k.kind).toBe('regeln');
    if (k.kind !== 'regeln') return;
    expect(k.kalkulation.quelle).toBe('regeln');
    expect(k.kalkulation.min).toBeGreaterThan(0);
    expect(k.kalkulation.min).toBeLessThanOrEqual(k.kalkulation.max);
    expect(k.kalkulation.positionen.some((p) => p.text.startsWith('Anfahrt'))).toBe(true);
    expect(after?.status).toBe('eingegangen');
    expect(await kinds(h, fall.id)).toContain('preis_regeln');
    expect(await kinds(h, fall.id)).not.toContain('build_mismatch');
    expect((await h.deps.store.job(fall.id, 'preis'))?.status).toBe('done');
  });

  it('prices a Boden by rules and marks a Sonstiges as mengen-noetig', async () => {
    const h = make();
    const boden = await submit(h, BODEN);
    const sonst = await submit(h, SONSTIGES);
    await h.deps.runner.runDue();
    expect(((await h.deps.store.get(boden.id))?.kalkulation as KalkulierenResult).kind).toBe('regeln');
    expect((await h.deps.store.get(sonst.id))?.kalkulation).toEqual({ kind: 'mengen-noetig' });
    expect(await kinds(h, sonst.id)).toContain('preis_mengen_noetig');
  });

  it('flags a Build mismatch when the client counts differ (content-free event, not an error)', async () => {
    const h = make();
    const id = newId();
    const fall = await submit(h, REGAL, { id, json: anfrageJson(id, REGAL, { doors: 4, drawers: 2, hinges: 8 }) });
    await h.deps.runner.runDue();
    const events = await h.deps.store.events(fall.id);
    const mismatch = events.find((e) => e.kind === 'build_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch?.code).toBeNull();
    expect((await h.deps.store.get(fall.id))?.status).toBe('eingegangen');
    expect((await h.deps.store.job(fall.id, 'preis'))?.status).toBe('done');
  });
});

describe('failures and retries', () => {
  const boom = {
    async run() {
      throw Object.assign(new Error('Kalkulation kaputt'), { code: 'KAPUTT' });
    },
  };

  it('sends the enquiry mail even when preis throws', async () => {
    const h = make({ steps: { preis: boom } });
    const fall = await submit(h, REGAL);
    expect(h.outbox()).toHaveLength(1);
    await h.deps.runner.runDue();
    expect(h.outbox()).toHaveLength(1);
    expect((await h.deps.store.get(fall.id))?.messageId).toBeTruthy();
  });

  it('retries after 30 s and 2 min, then moves the case to bewertung_fehlgeschlagen', async () => {
    const h = make({ steps: { preis: boom } });
    const fall = await submit(h, REGAL);
    const job = () => h.deps.store.job(fall.id, 'preis');

    expect(await h.deps.runner.runDue()).toBe(1);
    expect(await job()).toMatchObject({ status: 'pending', attempts: 1, lastErrorCode: 'KAPUTT' });
    h.clock.advance(BACKOFF_MS[0]! - 1);
    expect(await h.deps.runner.runDue()).toBe(0);
    h.clock.advance(1);
    expect(await h.deps.runner.runDue()).toBe(1);
    expect(await job()).toMatchObject({ status: 'pending', attempts: 2 });
    h.clock.advance(BACKOFF_MS[1]! - 1);
    expect(await h.deps.runner.runDue()).toBe(0);
    h.clock.advance(1);
    expect(await h.deps.runner.runDue()).toBe(1);
    expect(await job()).toMatchObject({ status: 'failed', attempts: 3, lastErrorCode: 'KAPUTT' });

    const after = await h.deps.store.get(fall.id);
    expect(after?.status).toBe('bewertung_fehlgeschlagen');
    const failed = (await h.deps.store.events(fall.id)).find((e) => e.kind === 'preis_failed');
    expect(failed?.code).toBe('KAPUTT');
    expect(h.logs.some((l) => l.includes('Kalkulation kaputt'))).toBe(false);
    h.clock.advance(3_600_000);
    expect(await h.deps.runner.runDue()).toBe(0);
  });

  it('retries a failed enquiry mail from the stored payload, naming the missing attachments', async () => {
    const h = make();
    h.ctl.fail = 1;
    const fall = await submit(h, REGAL, { files: [{ name: 'fotos[]', file: jpeg('Wand.jpg') }] });
    expect(h.outbox()).toHaveLength(0);
    expect(await h.deps.store.job(fall.id, 'anfrage_mail')).toMatchObject({ status: 'pending', attempts: 1 });
    await h.deps.runner.runDue(); // preis only: the mail retry waits 30 s
    expect(h.outbox()).toHaveLength(0);
    h.clock.advance(BACKOFF_MS[0]!);
    await h.deps.runner.runDue();
    expect(h.outbox()).toHaveLength(1);
    const mail = h.ctl.sent[0]!;
    expect(mail.attachments).toEqual([]);
    expect(mail.text).toContain('Die Anhänge (Wand.jpg) konnten nicht mit zugestellt werden.');
    expect((await h.deps.store.get(fall.id))?.messageId).toBeTruthy();
  });

  it('gives up on the enquiry mail after six attempts without touching the case status', async () => {
    const h = make();
    h.ctl.fail = 6;
    const fall = await submit(h, REGAL);
    await h.deps.runner.runDue();
    for (const ms of MAIL_BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    expect(await h.deps.store.job(fall.id, 'anfrage_mail')).toMatchObject({ status: 'failed', attempts: 6 });
    expect(await kinds(h, fall.id)).toContain('anfrage_mail_failed');
    expect((await h.deps.store.get(fall.id))?.status).toBe('eingegangen');
    expect(h.logs.some((l) => l.includes('"event":"anfrage_mail_failed"'))).toBe(true);
  });
});

describe('resume after restart', () => {
  it('re-created app on the same DATA_DIR resumes pending and interrupted jobs', async () => {
    const h1 = make({ inlineMailMs: 5 });
    h1.ctl.hang = true; // the inline mail never returns: the process "dies" mid-send
    const fall = await submit(h1, BODEN);
    expect(await h1.deps.store.job(fall.id, 'anfrage_mail')).toMatchObject({ status: 'running' });
    expect(await h1.deps.store.job(fall.id, 'preis')).toMatchObject({ status: 'pending' });
    await h1.close();

    const h2 = make({ dir: h1.dir });
    await h2.deps.runner.start();
    expect(await h2.deps.store.job(fall.id, 'anfrage_mail')).toMatchObject({ status: 'pending' });
    expect(await h2.deps.runner.runDue()).toBe(3); // anfrage_mail, preis, bewertung
    const after = await h2.deps.store.get(fall.id);
    expect((after?.kalkulation as KalkulierenResult).kind).toBe('regeln');
    expect(after?.messageId).toBeTruthy();
    expect(h2.outbox()).toHaveLength(1);
    expect(h2.logs.some((l) => l.includes('"event":"jobs_resumed"'))).toBe(true);
  });
});
