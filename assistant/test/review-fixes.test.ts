// Regression tests for the phase 7b review findings (PR #9): orphaned mail retry, contact-form
// leniency, the longer enquiry-mail backoff, no re-send after a delivered mail, the dry-run and
// production guards, and X-Forwarded-For from untrusted peers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPrivateAddress } from '../src/app';
import { ConfigError, loadConfig } from '../src/config';
import { MAIL_BACKOFF_MS } from '../src/steps/anfrage-mail';
import { REGAL, configuratorForm, contactForm, newId } from './fixtures';
import { PIPELINE_7C, TimerClock, cleanupDirs, harness, type Harness } from './helpers';

let h: Harness | undefined;
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await h?.close();
  h = undefined;
  cleanupDirs();
});

const body = async (res: Response) => (await res.json()) as { success: boolean; error?: string };

/** Advances fake timers in small steps until the promise settles. */
async function drive<T>(value: T | Promise<T>, stepMs = 10, max = 2000): Promise<T> {
  const p = Promise.resolve(value);
  let done = false;
  void p.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < max && !done; i++) await vi.advanceTimersByTimeAsync(stepMs);
  return p;
}

describe('1: an inline mail that fails after the deadline is retried without an external trigger', () => {
  it('re-arms the runner when the late send fails', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 22, 9), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = harness({ auto: true, inlineMailMs: 50, clock: new TimerClock(), pipeline: PIPELINE_7C });
    h.ctl.delayMs = 500; // the send outlives the 50 ms deadline …
    h.ctl.fail = 1; // … and then fails
    const id = newId();
    const res = await drive(h.post(configuratorForm(REGAL, { id })));
    expect(await body(res)).toEqual({ success: true });
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    await drive(
      vi.waitUntil(async () => (await h!.deps.store.job(fall.id, 'anfrage_mail'))?.status === 'pending', {
        timeout: 5000,
      }),
    );
    h.ctl.delayMs = 0;
    // No further request arrives: the runner must wake up by itself after the 30 s backoff.
    await vi.advanceTimersByTimeAsync(MAIL_BACKOFF_MS[0]! + 1000);
    await drive(
      vi.waitUntil(async () => (await h!.deps.store.job(fall.id, 'anfrage_mail'))?.status === 'done', {
        timeout: 5000,
      }),
    );
    expect(h.ctl.sent).toHaveLength(1);
  });

  it('never sleeps longer than 60 s while a pending row exists', async () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 22, 9), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h = harness({ auto: true, clock: new TimerClock() });
    await h.deps.runner.start();
    await vi.advanceTimersByTimeAsync(10);
    // A row written behind the runner's back (no kick, no schedule).
    const id = newId();
    const created = await h.deps.store.create(
      {
        anfrageId: id,
        kurz: 'TEST',
        payload: {
          values: { typ: 'sonstiges' },
          anfrage: null,
          zusammenfassung: 'x',
          subject: 's',
          replyTo: null,
          configUrl: null,
          anhaenge: [],
        },
      },
      [{ step: 'preis', status: 'pending', nextAt: Date.now() }],
      Date.now(),
    );
    await vi.advanceTimersByTimeAsync(61_000);
    await drive(
      vi.waitUntil(async () => (await h!.deps.store.job(created.fall.id, 'preis'))?.status === 'done', {
        timeout: 5000,
      }),
    );
  });
});

describe('2: contact and application posts accept what the site form accepts', () => {
  it('takes a phone number with words and a long name', async () => {
    h = harness();
    const name = 'N'.repeat(150);
    const res = await h.post(contactForm({ telefon: '0621 123456 (Büro)', name }));
    expect(res.status).toBe(200);
    expect(h.ctl.sent[0]?.text).toContain('Telefon: 0621 123456 (Büro)');
    expect(h.ctl.sent[0]?.text).toContain(`Name: ${name}`);
  });

  it('truncates instead of rejecting, strips controls, and accepts a@b like type=email', async () => {
    h = harness();
    const res = await h.post(
      contactForm({
        name: `A\r\nB${'x'.repeat(400)}`,
        email: ' a@b ',
        plz: 'D-68161',
        ort: 'Mann\u0000heim',
        nachricht: `Zeile 1\nZeile 2\u0007${'y'.repeat(12000)}`,
      }),
    );
    expect(res.status).toBe(200);
    const text = h.ctl.sent[0]!.text;
    const nameLine = text.split('\n').find((l) => l.startsWith('Name: '))!;
    expect(nameLine.startsWith('Name: A B')).toBe(true);
    expect(nameLine.length).toBeLessThanOrEqual('Name: '.length + 200);
    expect(text).toContain('PLZ: D-68161');
    expect(text).toContain('Ort: Mannheim');
    expect(text).toContain('Zeile 1\nZeile 2');
    expect(text).not.toContain('\u0007');
    expect(h.ctl.sent[0]?.replyTo).toBe('a@b');
  });

  it('still rejects what the browser rejects: a missing required field and an invalid e-mail', async () => {
    h = harness();
    expect((await h.post(contactForm({ name: '' }))).status).toBe(422);
    expect((await h.post(contactForm({ email: 'nope' }))).status).toBe(422);
    expect((await h.post(contactForm({ email: 'a@b c' }))).status).toBe(422);
  });

  it('keeps the registry patterns for configurator fields', async () => {
    h = harness();
    expect((await h.post(configuratorForm({ ...REGAL, telefon: '0621 123456 (Büro)' }))).status).toBe(422);
  });
});

describe('3: the enquiry mail has its own, longer backoff', () => {
  it('keeps retrying for hours (+30 s, +2 min, +15 min, +1 h, +6 h), then records anfrage_mail_failed', async () => {
    expect(MAIL_BACKOFF_MS).toEqual([30_000, 120_000, 900_000, 3_600_000, 21_600_000]);
    h = harness({ pipeline: PIPELINE_7C });
    h.ctl.fail = 5;
    const id = newId();
    await h.post(configuratorForm(REGAL, { id }));
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    await h.deps.runner.runDue(); // preis
    for (const ms of MAIL_BACKOFF_MS.slice(0, 4)) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    expect(await h.deps.store.job(fall.id, 'anfrage_mail')).toMatchObject({ status: 'pending', attempts: 5 });
    expect(h.outbox()).toHaveLength(0);
    h.clock.advance(MAIL_BACKOFF_MS[4]!);
    await h.deps.runner.runDue();
    expect(h.outbox()).toHaveLength(1);
    expect((await h.deps.store.job(fall.id, 'preis'))?.attempts).toBe(0);
  });
});

describe('4: a delivered mail is never sent again', () => {
  it('completes the job when only the bookkeeping after the send fails', async () => {
    h = harness({ pipeline: PIPELINE_7C });
    const update = vi.spyOn(h.deps.store, 'update').mockRejectedValueOnce(new Error('database is locked'));
    const id = newId();
    const res = await h.post(configuratorForm(REGAL, { id }));
    expect(await body(res)).toEqual({ success: true });
    expect(update).toHaveBeenCalled();
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    expect((await h.deps.store.job(fall.id, 'anfrage_mail'))?.status).toBe('done');
    expect(h.logs.some((l) => l.includes('"event":"bookkeeping_failed"'))).toBe(true);
    for (const ms of MAIL_BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    expect(h.outbox()).toHaveLength(1);
  });

  it('does not re-run a step whose completion bookkeeping fails', async () => {
    h = harness({ pipeline: PIPELINE_7C });
    h.ctl.fail = 1;
    const id = newId();
    await h.post(configuratorForm(REGAL, { id }));
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    await h.deps.runner.runDue(); // preis
    vi.spyOn(h.deps.store, 'update').mockRejectedValueOnce(new Error('database is locked'));
    vi.spyOn(h.deps.store, 'complete').mockRejectedValueOnce(new Error('database is locked'));
    h.clock.advance(MAIL_BACKOFF_MS[0]!);
    await h.deps.runner.runDue();
    for (const ms of MAIL_BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    expect(h.outbox()).toHaveLength(1);
    expect((await h.deps.store.job(fall.id, 'anfrage_mail'))?.status).not.toBe('pending');
  });
});

describe('5: guards follow SEND_MODE, not only NODE_ENV', () => {
  it('requires the production values for allowlist and live even without NODE_ENV=production', () => {
    const smtp = { SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', ANTHROPIC_API_KEY: 'k' };
    for (const mode of ['allowlist', 'live']) {
      try {
        loadConfig({ SEND_MODE: mode, ...smtp }, '/srv');
        throw new Error('expected a ConfigError');
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        expect((e as ConfigError).variables).toEqual([
          'PUBLIC_BASE_URL',
          'SITE_ORIGIN',
          'OWNER_EMAIL',
          'MAIL_FROM',
          'DATA_DIR',
        ]);
      }
    }
  });

  it('serves /dev/outbox only in dry-run', async () => {
    h = harness({
      env: { SEND_MODE: 'allowlist', SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', ANTHROPIC_API_KEY: 'k' },
    });
    expect(h.config.nodeEnv).toBe('test');
    expect((await h.app.request('/dev/outbox')).status).toBe(404);
  });
});

describe('6: X-Forwarded-For counts only from a private or loopback peer', () => {
  const send = (x: Harness, ip: string) =>
    x.post(configuratorForm(REGAL, { extra: { homepage: 'bot' } }), {
      headers: { 'X-Forwarded-For': `198.51.100.1, ${ip}` },
    });

  it('ignores X-Forwarded-For from a public peer', async () => {
    h = harness({ rateLimit: { limit: 1 }, env: { TRUST_PROXY: '1' }, peer: '203.0.113.9' });
    expect((await send(h, '10.0.0.1')).status).toBe(200);
    expect((await send(h, '10.0.0.2')).status).toBe(429);
  });

  it.each(['127.0.0.1', '::1', '10.1.2.3', '172.20.0.1', '192.168.0.10', '::ffff:10.0.0.7', 'fd12::1'])(
    'honours it from %s',
    async (peer) => {
      h = harness({ rateLimit: { limit: 1 }, env: { TRUST_PROXY: '1' }, peer });
      expect((await send(h, '10.0.0.1')).status).toBe(200);
      expect((await send(h, '10.0.0.2')).status).toBe(200);
      expect((await send(h, '10.0.0.1')).status).toBe(429);
    },
  );

  it('classifies addresses', () => {
    for (const a of [
      '127.0.0.1',
      '127.255.0.1',
      '::1',
      '10.0.0.0',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      'fc00::1',
      'fdff::1',
      '::ffff:192.168.1.1',
    ])
      expect(isPrivateAddress(a)).toBe(true);
    for (const a of [
      '8.8.8.8',
      '172.32.0.1',
      '172.15.0.1',
      '192.169.0.1',
      '11.0.0.1',
      '2001:db8::1',
      'fe80::1',
      'unknown',
      '',
    ])
      expect(isPrivateAddress(a)).toBe(false);
  });
});
