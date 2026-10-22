// No content in logs (canary), rate limit, production surface (docs/assistant.md §8, docs/angebot.md §11).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKOFF_MS } from '../src/jobs';
import { BODEN, REGAL, SONSTIGES, anfrageJson, configuratorForm, contactForm, jpeg, newId } from './fixtures';
import { SITE, cleanupDirs, harness, type Harness } from './helpers';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.restoreAllMocks();
  cleanupDirs();
});

const CANARY = 'Kanarienvogel7F3K';

describe('logs carry no content', () => {
  it('a canary in every free-text field never reaches the log output', async () => {
    const out: string[] = [];
    const capture = (...a: unknown[]) => void out.push(a.map(String).join(' '));
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'info').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');

    h = harness();
    const c = (s: string) => `${s} ${CANARY}`;
    const regal = {
      ...REGAL,
      name: c('Erika'),
      email: `${CANARY.toLowerCase()}@example.com`,
      ort: c('Mannheim'),
      erreichbarkeit: c('Abends'),
      nachricht: c('Nachricht'),
      moebel_wuensche: c('Wünsche'),
    };
    const id = newId();
    const json = { ...anfrageJson(id, regal), moebel: { derived: { doors: 9 }, beschreibung: c('Regal') } };
    const files = [{ name: 'fotos[]', file: jpeg(`${CANARY}.jpg`) }];
    const extra = { zusammenfassung: c('Zusammenfassung'), _replyto: `${CANARY}@example.com` };
    await h.post(configuratorForm(regal, { id, json, subject: c('Betreff'), extra, files }));
    // Duplicate, a failing mail, the job retries and their exhaustion.
    await h.post(configuratorForm(regal, { id, json, subject: c('Betreff'), extra, files }));
    h.ctl.message = `550 mailbox ${CANARY}@example.com unavailable`;
    h.ctl.fail = 10;
    await h.post(configuratorForm({ ...SONSTIGES, sonstiges_beschreibung: c('Eine Sitzbank') }, { subject: c('S') }));
    await h.post(contactForm({ name: c('Kontakt'), nachricht: c('Hallo'), _subject: c('Kontakt') }));
    h.ctl.fail = 0;
    await h.deps.runner.runDue();
    for (const ms of BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    // Rejections: unknown field name and value, bad values, honeypot.
    await h.post(configuratorForm(REGAL, { extra: { [`x_${CANARY}`]: CANARY } }));
    await h.post(configuratorForm({ ...BODEN, boden_art: CANARY }));
    await h.post(configuratorForm({ ...BODEN, plz: CANARY.slice(0, 5) }));
    await h.post(configuratorForm(BODEN, { extra: { homepage: CANARY } }));
    await h.post(configuratorForm(BODEN), { origin: `https://${CANARY.toLowerCase()}.example` });

    const all = [
      ...h.logs,
      ...out,
      ...stdout.mock.calls.map((x) => String(x[0])),
      ...stderr.mock.calls.map((x) => String(x[0])),
    ].join('\n');
    expect(h.logs.length).toBeGreaterThan(10);
    expect(all.toLowerCase()).not.toContain(CANARY.toLowerCase());
    expect(all).not.toContain('example.com');
    for (const line of h.logs) expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('rate limit', () => {
  it('answers the 11th request within an hour with 429, and frees up after the window', async () => {
    h = harness({ rateLimit: {} });
    const send = () => h!.post(configuratorForm(BODEN, { extra: { homepage: 'bot' } }));
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ success: false, error: 'rejected' });
    h.clock.advance(3_600_001);
    expect((await send()).status).toBe(200);
  });

  it('keys by the last X-Forwarded-For hop only with TRUST_PROXY', async () => {
    h = harness({ rateLimit: { limit: 1 }, env: { TRUST_PROXY: '1' } });
    const send = (ip: string) =>
      h!.post(configuratorForm(BODEN, { extra: { homepage: 'bot' } }), {
        headers: { 'X-Forwarded-For': `1.1.1.1, ${ip}` },
      });
    expect((await send('10.0.0.1')).status).toBe(200);
    expect((await send('10.0.0.2')).status).toBe(200);
    expect((await send('10.0.0.1')).status).toBe(429);
  });
});

describe('production surface', () => {
  it('has no /dev/outbox in production', async () => {
    h = harness({
      env: { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://anfrage.schreinerei.test', SEND_MODE: 'dry-run' },
    });
    expect(h.config.nodeEnv).toBe('production');
    await h.post(configuratorForm(REGAL));
    expect((await h.app.request('/dev/outbox')).status).toBe(404);
    expect((await h.app.request('/health')).status).toBe(204);
    expect(SITE).toBe(h.config.siteOrigin);
  });
});
