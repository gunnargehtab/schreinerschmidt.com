// No content in logs (canary), rate limit, production surface (docs/assistant.md §8, docs/angebot.md §11).
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSdkClient, type ParseCall, type RohAntwort } from '../src/claude/client';
import { FakeClaude } from '../src/claude/fake';
import { BACKOFF_MS } from '../src/jobs';
import { createLogger } from '../src/log';
import { BODEN, REGAL, SONSTIGES, anfrageJson, configuratorForm, contactForm, jpeg, newId } from './fixtures';
import { SITE, cleanupDirs, harness, type Harness } from './helpers';
import { aktion, bewerteterFall, formular, seite } from './review-helpers';

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

describe('the Claude step carries no content into logs, and no contact data to Claude', () => {
  it('canaries in every field, in Claude answers and in API errors never reach a log or an event', async () => {
    const KONTAKT = 'Kontaktkanarie9Q';
    const sent: string[] = [];
    const sdkLogs: string[] = [];
    let n = 0;
    const answer = (parsed: unknown, over: Partial<RohAntwort> = {}): RohAntwort => ({
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [{ type: 'text', parsed_output: parsed }],
      parsed_output: parsed,
      ...over,
    });
    const bew = {
      spam: false,
      machbarkeit: 'machbar',
      gruende: [CANARY],
      risiken: [CANARY],
      fehlende_angaben: [],
      rueckfragen: [`${CANARY} für 1 €?`],
      passt_zum_betrieb: true,
      mengen: {
        werkstatt_h: 3,
        montage_h: 1,
        material: [{ art: 'pauschal', menge: 1, einheit: 'Pausch.', begruendung: CANARY }],
      },
    };
    const text = {
      einleitung: `${CANARY} www.evil.de`,
      leistung: [CANARY],
      nicht_enthalten: [],
      naechster_schritt: CANARY,
    };
    const parse: ParseCall = async (p) => {
      sent.push(JSON.stringify(p.messages));
      n++;
      switch (n) {
        case 1: // bewerten (Sonstiges)
          return answer(bew);
        case 2: // bewerten retry (rueckfragen violation): refusal
          return answer(null, { stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] });
        case 3: // angebotstext: violation
          return answer(text);
        case 4: // angebotstext retry: rate limit with the canary in the message
          throw new Anthropic.RateLimitError(429, { message: CANARY }, CANARY, new Headers());
        default: // the Regal: errors with content until the step gives up
          throw new Anthropic.APIConnectionError({ message: `${CANARY} ${KONTAKT}` });
      }
    };
    const claude = createSdkClient({ apiKey: 'sk-test', log: createLogger((l) => sdkLogs.push(l)), parse });
    h = harness({ claude });
    const contact = {
      name: `Erika ${KONTAKT}`,
      email: `${KONTAKT.toLowerCase()}@example.com`,
      telefon: '0621 9182736',
      ort: `Ort ${KONTAKT}`,
      erreichbarkeit: `Abends ${KONTAKT}`,
    };
    const sonst = {
      ...SONSTIGES,
      ...contact,
      sonstiges_beschreibung: `Eine Sitzbank ${CANARY}`,
      nachricht: `Gruß ${KONTAKT}`,
    };
    const sid = newId();
    await h.post(configuratorForm(sonst, { id: sid }));
    await h.deps.runner.runDue();
    const sonstFall = (await h.deps.store.getByAnfrageId(sid))!;
    expect(sonstFall.angebot).toMatchObject({ pfad: 'vorlage' });
    const regal = { ...REGAL, ...contact, moebel_wuensche: `Wünsche ${CANARY}` };
    const id = newId();
    await h.post(configuratorForm(regal, { id }));
    await h.deps.runner.runDue();
    for (const ms of BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }

    // The free text goes to Claude (needed for the assessment); contact data never does.
    expect(sent.some((m) => m.includes(CANARY))).toBe(true);
    for (const m of sent) {
      expect(m).not.toContain(KONTAKT);
      expect(m.toLowerCase()).not.toContain(KONTAKT.toLowerCase());
      expect(m).not.toContain('9182736');
      expect(m).not.toContain('example.com');
    }
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    expect(fall.status).toBe('bewertung_fehlgeschlagen');
    const events: string[] = [];
    for (const f of [fall.id, sonstFall.id]) {
      for (const e of await h.deps.store.events(f)) events.push(`${e.kind} ${e.code ?? ''}`);
    }
    expect(events.length).toBeGreaterThan(8);
    const all = [...h.logs, ...sdkLogs, ...events].join('\n');
    expect(sdkLogs.some((l) => l.includes('"event":"ki_call"'))).toBe(true);
    expect(sdkLogs.some((l) => l.includes('"event":"ki_refusal"'))).toBe(true);
    expect(all).not.toContain(CANARY);
    expect(all.toLowerCase()).not.toContain(KONTAKT.toLowerCase());
    expect(all).not.toContain('evil');
    for (const line of [...h.logs, ...sdkLogs]) expect(() => JSON.parse(line)).not.toThrow();
  });
});

describe('the owner side (7d) carries no content into logs', () => {
  it('canaries through TL;DR, review page, PDF, every action, PIN, mail failures and timers', async () => {
    const out: string[] = [];
    const capture = (...a: unknown[]) => void out.push(a.map(String).join(' '));
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'info').mockImplementation(capture);
    vi.spyOn(console, 'warn').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    const stdout = vi.spyOn(process.stdout, 'write');
    const stderr = vi.spyOn(process.stderr, 'write');

    const claude = new FakeClaude({
      bewerten: () => ({
        spam: false,
        machbarkeit: 'unklar',
        gruende: [`Grund ${CANARY}`],
        risiken: [`Risiko ${CANARY}`],
        fehlende_angaben: [`Fehlt ${CANARY}`],
        rueckfragen: [`Frage ${CANARY}?`],
        passt_zum_betrieb: true,
        mengen: null,
      }),
      angebotstext: () => ({
        einleitung: `Einleitung ${CANARY}.`,
        leistung: [`Leistung ${CANARY}`],
        nicht_enthalten: [`Ohne ${CANARY}`],
        naechster_schritt: `Aufmaß ${CANARY}.`,
      }),
    });
    h = harness({ claude, env: { OWNER_PIN: '4711', SESSION_SECRET: 's'.repeat(40) } });
    const c = (x: string) => `${x} ${CANARY}`;
    const values = {
      ...REGAL,
      name: c('Erika'),
      email: `${CANARY.toLowerCase()}@example.com`,
      ort: c('Mannheim'),
      erreichbarkeit: c('Abends'),
      nachricht: c('Nachricht'),
      moebel_wuensche: c('Wünsche'),
    };
    const faelle = [];
    for (let i = 0; i < 5; i++) faelle.push(await bewerteterFall(h, values)); // the fifth stays waiting

    // PIN: wrong, then right.
    const [a, b, d, e] = faelle as [(typeof faelle)[0], (typeof faelle)[0], (typeof faelle)[0], (typeof faelle)[0]];
    await aktion(h, a.fall.id, 'pin', { t: a.token, pin: `0000${CANARY}` });
    const ok = await aktion(h, a.fall.id, 'pin', { t: a.token, pin: '4711' });
    const cookie = (ok.headers.get('set-cookie') ?? '').split(';')[0]!;
    const o = { cookie };
    await seite(h, a.fall.id, a.token);
    const page = await (await seite(h, a.fall.id, a.token, { Cookie: cookie })).text();
    expect(page).toContain(CANARY);
    await h.app.request(`/angebot/${a.fall.id}/vorschau.pdf?t=${a.token}&einleitung=${CANARY}`, {
      headers: { Cookie: cookie },
    });
    await seite(h, a.fall.id, `${CANARY}${'x'.repeat(30)}`);

    // Freigeben with an edit that breaks a guard, then with a failing and a working send.
    const f = formular(page, 'freigeben');
    await aktion(h, a.fall.id, 'freigeben', { ...f, einleitung: `${CANARY} 0171 2345678` }, o);
    const confirm = await (await aktion(h, a.fall.id, 'freigeben', f, o)).text();
    h.ctl.message = `550 ${CANARY}@example.com rejected`;
    h.ctl.fail = 1;
    const retry = await (
      await aktion(h, a.fall.id, 'freigeben', { ...formular(confirm, 'freigeben'), schritt: 'senden' }, o)
    ).text();
    await aktion(h, a.fall.id, 'freigeben', { ...formular(retry, 'freigeben'), schritt: 'senden' }, o);

    // Rückfragen, Absage with a personal line, anruf.
    const v = (x: typeof a) => ({ t: x.token, v: String(x.fall.version) });
    const rf = await (
      await aktion(
        h,
        b.fall.id,
        'ablehnen',
        { ...v(b), folge: 'kontakt', kontakt_art: 'mail', rueckfragen: c('Frage') },
        o,
      )
    ).text();
    await aktion(h, b.fall.id, 'ablehnen', { ...formular(rf, 'ablehnen'), schritt: 'senden' }, o);
    const ab = await (
      await aktion(
        h,
        d.fall.id,
        'ablehnen',
        { ...v(d), folge: 'absage', grund: 'sonstiges', persoenlich: c('Leider') },
        o,
      )
    ).text();
    await aktion(h, d.fall.id, 'ablehnen', { ...formular(ab, 'ablehnen'), schritt: 'senden' }, o);
    await aktion(h, e.fall.id, 'ablehnen', { ...v(e), folge: 'manuell' }, o);
    await aktion(
      h,
      e.fall.id,
      'ablehnen',
      { ...v(e), folge: 'manuell' },
      { ...o, origin: `https://${CANARY.toLowerCase()}.example` },
    );

    // Timers: reminder, expiry, retention.
    for (const step of [4 * 86_400_000 + 3_600_000, 12 * 86_400_000, 400 * 86_400_000]) {
      h.clock.advance(step);
      await h.deps.runner.runDue();
    }
    expect(h.ctl.sent.some((m) => m.subject.startsWith('[Erinnerung]'))).toBe(true);

    const events: string[] = [];
    for (const x of faelle)
      for (const ev of await h.deps.store.events(x.fall.id)) events.push(`${ev.kind} ${ev.code ?? ''}`);
    const all = [
      ...h.logs,
      ...out,
      ...events,
      ...stdout.mock.calls.map((x) => String(x[0])),
      ...stderr.mock.calls.map((x) => String(x[0])),
    ].join('\n');
    expect(h.logs.some((l) => l.includes('"event":"angebot"'))).toBe(true);
    expect(h.logs.some((l) => l.includes('"kind":"customer"'))).toBe(true);
    expect(all.toLowerCase()).not.toContain(CANARY.toLowerCase());
    expect(all).not.toContain('example.com');
    expect(all).not.toContain('0171');
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

  it('keys by the last X-Forwarded-For hop only with TRUST_PROXY (behind a local proxy)', async () => {
    h = harness({ rateLimit: { limit: 1 }, env: { TRUST_PROXY: '1' }, peer: '127.0.0.1' });
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
