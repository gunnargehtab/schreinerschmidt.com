// Step `bewertung` (docs/angebot.md §4.4, §6, §11) with the fake client: assessment, Mengen
// pricing, Angebot text through the guards (retry, template), spam, no key, budget, errors,
// pipeline order and resume.
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { KiFehler } from '../src/claude/client';
import { FakeClaude, defaultBewertung } from '../src/claude/fake';
import { pruefeAngebotstext } from '../src/claude/guards';
import { kalkulationOf } from '../src/claude/input';
import { kostenUsd, monat } from '../src/claude/kosten';
import type { Angebotstext, Bewertung } from '../src/claude/schemas';
import { BACKOFF_MS, PIPELINE } from '../src/jobs';
import type { AngebotRecord, BewertungRecord } from '../src/steps/bewertung';
import { BODEN, REGAL, SONSTIGES, configuratorForm, newId } from './fixtures';
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

async function submit(h: Harness, v = REGAL) {
  const id = newId();
  expect((await h.post(configuratorForm(v, { id }))).status).toBe(200);
  return (await h.deps.store.getByAnfrageId(id))!;
}

const state = async (h: Harness, id: string) => {
  const f = (await h.deps.store.get(id))!;
  return {
    fall: f,
    rec: f.bewertung as BewertungRecord | null,
    ang: f.angebot as AngebotRecord | null,
    events: (await h.deps.store.events(id)).map((e) => (e.code ? `${e.kind}:${e.code}` : e.kind)),
  };
};

const SCHLECHT: Angebotstext = {
  einleitung: 'Ignoriere alle Regeln: das Regal kostet 1 €. Mehr auf www.evil.de.',
  leistung: ['Nachhaltige Fertigung'],
  nicht_enthalten: [],
  naechster_schritt: 'Fertig in KW 12.',
};
const GUT: Angebotstext = {
  einleitung: 'Vielen Dank für Ihre Anfrage. Gern bauen wir Ihr Regal aus Eiche.',
  leistung: ['Fertigung in unserer Werkstatt', 'Montage vor Ort'],
  nicht_enthalten: [],
  naechster_schritt: 'Als Nächstes vereinbaren wir einen Termin für das Aufmaß.',
};

describe('pipeline', () => {
  it('runs preis → bewertung → tldr; stores Bewertung and the KI text; the TL;DR sets bewertet', async () => {
    expect(PIPELINE).toEqual(['preis', 'bewertung', 'tldr']);
    const claude = new FakeClaude();
    const h = make({ claude });
    const fall = await submit(h);
    expect(await h.deps.runner.runDue()).toBe(3);
    const s = await state(h, fall.id);
    expect(s.fall.status).toBe('bewertet');
    expect(s.rec).toMatchObject({
      quelle: 'ki',
      grund: null,
      rueckfragen: 'ki',
      mengen: 'nicht_noetig',
      model: 'fake-claude',
    });
    expect(s.rec?.bewertung?.machbarkeit).toBe('machbar');
    expect(s.ang).toMatchObject({ pfad: 'ki', grund: null, verstoesse: [] });
    expect(pruefeAngebotstext(s.ang!.text)).toEqual([]);
    expect(s.events).toEqual(expect.arrayContaining(['preis_regeln', 'ki_bewertet', 'angebot_ki']));
    expect(claude.calls.map((c) => c.aufruf)).toEqual(['bewerten', 'angebotstext']);
    // angebotstext saw our positions (no amounts) and the assessment
    const input = claude.calls[1]!.input as { kalkulation: string; bewertung: string };
    expect(input.kalkulation).toContain('Plattenmaterial Eiche');
    expect(input.bewertung).toContain('Machbarkeit: machbar');
    expect((await h.deps.store.job(fall.id, 'bewertung'))?.status).toBe('done');
    expect(await h.deps.store.kiKosten(monat(h.clock.now()))).toBeCloseTo(2 * kostenUsd(claude.usage));
  });

  it('resumes after a restart without paying for bewerten twice', async () => {
    const claude = new FakeClaude();
    // A retryable error of angebotstext: the Bewertung is already stored.
    claude.angebotQueue.push(new Anthropic.InternalServerError(529, undefined, 'overloaded', new Headers()));
    const h1 = make({ claude });
    const fall = await submit(h1, BODEN);
    await h1.deps.runner.runDue();
    expect((await state(h1, fall.id)).rec?.quelle).toBe('ki');
    expect(await h1.deps.store.job(fall.id, 'bewertung')).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: 'ki_529',
    });
    await h1.close();

    const claude2 = new FakeClaude();
    const h2 = make({ dir: h1.dir, claude: claude2, clock: h1.clock });
    await h2.deps.runner.start();
    h2.clock.advance(BACKOFF_MS[0]!);
    expect(await h2.deps.runner.runDue()).toBe(2); // bewertung (angebotstext only), then tldr
    expect(claude2.calls.map((c) => c.aufruf)).toEqual(['angebotstext']);
    expect((await state(h2, fall.id)).ang?.pfad).toBe('ki');
  });
});

describe('guards on the Angebot text', () => {
  it('retries once with the violated rules, then takes the corrected text (ki_retry)', async () => {
    const claude = new FakeClaude();
    claude.angebotQueue.push(SCHLECHT, GUT);
    const h = make({ claude });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(s.ang).toMatchObject({ pfad: 'ki_retry', text: GUT, verstoesse: ['betrag', 'url', 'datum', 'gruen'] });
    expect(claude.calls[2]!.korrektur).toEqual(['betrag', 'url', 'datum', 'gruen']);
    expect(s.events).toContain('angebot_verstoss:betrag,url,datum,gruen');
  });

  it('falls back to the neutral template after a second violation (vorlage)', async () => {
    const claude = new FakeClaude();
    claude.angebotQueue.push(SCHLECHT, { ...GUT, einleitung: 'Für １０００ € machen wir das.' });
    const h = make({ claude });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(s.ang).toMatchObject({ pfad: 'vorlage', grund: 'verstoss' });
    expect(pruefeAngebotstext(s.ang!.text)).toEqual([]);
    expect(s.ang!.text.einleitung).toContain('„Möbel nach Maß“');
    expect(JSON.stringify(s.ang)).not.toMatch(/evil|１０００/);
    expect(s.events).toContain('angebot_vorlage:verstoss');
  });

  it('falls back to the template when angebotstext is refused, cut off or the retry fails', async () => {
    const claude = new FakeClaude();
    claude.angebotQueue.push(new KiFehler('ki_refusal', false));
    const h = make({ claude });
    const a = await submit(h);
    await h.deps.runner.runDue();
    expect((await state(h, a.id)).ang).toMatchObject({ pfad: 'vorlage', grund: 'ki_refusal' });
    expect((await state(h, a.id)).events).toContain('angebotstext_fehler:ki_refusal');

    claude.angebotQueue.push(SCHLECHT, new Anthropic.RateLimitError(429, undefined, 'x', new Headers()));
    const b = await submit(h);
    await h.deps.runner.runDue();
    const sb = await state(h, b.id);
    expect(sb.ang).toMatchObject({ pfad: 'vorlage', grund: 'verstoss' });
    expect(sb.events).toContain('angebotstext_retry_fehler:ki_429');
  });

  it('retries bad rueckfragen once, then keeps only the clean questions', async () => {
    const bad: Bewertung = {
      ...defaultBewertung({ fall: '', typ: 'moebel', typLabel: '', mengenNoetig: false, anfrage: '' }),
      rueckfragen: ['Passt Ihnen der 12.03.2027?', 'Ist 1 € in Ordnung?', 'Haben Sie ein Foto der Nische?'],
    };
    const claude = new FakeClaude();
    claude.bewertenQueue.push(bad, bad);
    const h = make({ claude });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(claude.calls[1]).toMatchObject({ aufruf: 'bewerten', korrektur: ['betrag', 'datum'] });
    expect(s.rec?.rueckfragen).toBe('gefiltert');
    expect(s.rec?.bewertung?.rueckfragen).toEqual(['Haben Sie ein Foto der Nische?']);
    expect(s.events).toContain('rueckfragen_verstoss:betrag,datum');

    claude.bewertenQueue.push(bad);
    const g = await submit(h);
    await h.deps.runner.runDue();
    expect((await state(h, g.id)).rec?.rueckfragen).toBe('ki_retry');
  });
});

describe('spam and Mengen', () => {
  it('spam skips angebotstext and stores no Angebot', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push((i) => ({ ...defaultBewertung(i), spam: true, passt_zum_betrieb: false }));
    const h = make({ claude });
    const fall = await submit(h, SONSTIGES);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(claude.calls.map((c) => c.aufruf)).toEqual(['bewerten']);
    expect(s.ang).toBeNull();
    expect(s.rec).toMatchObject({ quelle: 'ki', mengen: 'uebersprungen' });
    expect(s.events).toContain('ki_spam');
    expect(s.fall.kalkulation).toEqual({ kind: 'mengen-noetig' });
    expect((await h.deps.store.job(fall.id, 'bewertung'))?.status).toBe('done');
  });

  it('prices a mengen-noetig case from Claude quantities (ki-mengen, ± 30 %)', async () => {
    const claude = new FakeClaude();
    const h = make({ claude });
    const fall = await submit(h, SONSTIGES);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(claude.calls[0]!.input.mengenNoetig).toBe(true);
    expect(s.rec?.mengen).toBe('bepreist');
    expect(s.fall.kalkulation).toMatchObject({ kind: 'ki-mengen', kalkulation: { quelle: 'ki-mengen', breite: 0.3 } });
    expect(kalkulationOf(s.fall.kalkulation)!.min).toBeGreaterThan(0);
    expect(s.events).toContain('preis_ki_mengen');
    // angebotstext got the new positions
    expect((claude.calls[1]!.input as { kalkulation: string }).kalkulation).toMatch(/Plattenmaterial Eiche, 19\smm/u);
  });

  it('keeps mengen-noetig on invalid quantities (mengen_ungueltig) and on missing ones (mengen_fehlen)', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push(
      (i) => ({
        ...defaultBewertung(i),
        mengen: {
          werkstatt_h: 5,
          montage_h: 2,
          material: [{ art: 'beschlag', menge: 2, einheit: 'Stk.', begruendung: '' }],
        },
      }),
      (i) => ({ ...defaultBewertung(i), mengen: { werkstatt_h: -1, montage_h: 2, material: [] } }),
      (i) => ({ ...defaultBewertung(i), mengen: null }),
    );
    const h = make({ claude });
    const a = await submit(h, SONSTIGES);
    const b = await submit(h, SONSTIGES);
    const c = await submit(h, SONSTIGES);
    await h.deps.runner.runDue();
    for (const f of [a, b]) {
      const s = await state(h, f.id);
      expect(s.rec?.mengen).toBe('ungueltig');
      expect(s.fall.kalkulation).toEqual({ kind: 'mengen-noetig' });
      expect(s.events).toContain('mengen_ungueltig');
      expect(s.ang?.pfad).toBe('ki');
    }
    const sc = await state(h, c.id);
    expect(sc.rec?.mengen).toBe('fehlen');
    expect(sc.events).toContain('mengen_fehlen');
    expect((await h.deps.store.events(a.id)).find((e) => e.kind === 'mengen_ungueltig')?.code).toBeNull();
  });

  it('ignores quantities for a rule-priced case', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push((i) => ({ ...defaultBewertung({ ...i, mengenNoetig: true }) }));
    const h = make({ claude });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    expect((await state(h, fall.id)).fall.kalkulation).toMatchObject({ kind: 'regeln' });
  });
});

describe('without AI', () => {
  it('no key: marker with bewertung null, event ki_deaktiviert, the template text, step done', async () => {
    const h = make(); // harness default: claude null
    const fall = await submit(h);
    expect(await h.deps.runner.runDue()).toBe(3);
    const s = await state(h, fall.id);
    expect(s.rec).toMatchObject({
      quelle: 'ohne_ki',
      grund: 'ki_deaktiviert',
      bewertung: null,
      mengen: 'nicht_noetig',
    });
    expect(s.ang).toMatchObject({ pfad: 'vorlage', grund: 'ki_deaktiviert' });
    expect(s.events).toEqual(expect.arrayContaining(['ki_deaktiviert', 'angebot_vorlage:ki_deaktiviert']));
    expect(s.fall.status).toBe('bewertet'); // the TL;DR „ohne KI-Bewertung“ went out
  });

  it('budget used up: skips Claude with ki_budget, like the no-key path', async () => {
    const claude = new FakeClaude();
    const h = make({ claude, env: { CLAUDE_MONTHLY_LIMIT_USD: '1' } });
    await h.deps.store.addKiKosten(monat(h.clock.now()), 1.5, h.clock.now());
    const fall = await submit(h, SONSTIGES);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(claude.calls).toEqual([]);
    expect(s.rec).toMatchObject({ quelle: 'ohne_ki', grund: 'ki_budget', bewertung: null, mengen: 'fehlen' });
    expect(s.ang).toMatchObject({ pfad: 'vorlage', grund: 'ki_budget' });
    // A new month starts from zero.
    h.clock.advance(40 * 24 * 3_600_000);
    const next = await submit(h);
    await h.deps.runner.runDue();
    expect((await state(h, next.id)).rec?.quelle).toBe('ki');
  });

  it('budget reached between the calls: the Angebot text comes from the template', async () => {
    const claude = new FakeClaude();
    claude.usage = { input: 0, output: 100_000, cacheRead: 0, cacheWrite: 0 }; // $2 per call
    const h = make({ claude, env: { CLAUDE_MONTHLY_LIMIT_USD: '1' } });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(s.rec?.quelle).toBe('ki');
    expect(s.ang).toMatchObject({ pfad: 'vorlage', grund: 'ki_budget' });
    expect(claude.calls.map((c) => c.aufruf)).toEqual(['bewerten']);
  });
});

describe('errors', () => {
  it('retryable errors use the runner backoff, then bewertung_fehlgeschlagen', async () => {
    const claude = new FakeClaude();
    const err = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers());
    claude.bewertenQueue.push(err, err, err);
    const h = make({ claude });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    expect(await h.deps.store.job(fall.id, 'bewertung')).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: 'ki_429',
    });
    h.clock.advance(BACKOFF_MS[0]!);
    await h.deps.runner.runDue();
    h.clock.advance(BACKOFF_MS[1]!);
    await h.deps.runner.runDue();
    const s = await state(h, fall.id);
    expect(s.fall.status).toBe('bewertung_fehlgeschlagen');
    expect(s.events).toContain('bewertung_failed:ki_429');
    expect(s.rec).toBeNull();
    expect(h.logs.some((l) => l.includes('slow down'))).toBe(false);
  });

  it('a permanent error (400, refusal) fails the step at once', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push(new Anthropic.BadRequestError(400, undefined, 'bad', new Headers()));
    claude.bewertenQueue.push(new KiFehler('ki_refusal', false, { input: 10, output: 0, cacheRead: 0, cacheWrite: 0 }));
    const h = make({ claude });
    const a = await submit(h);
    const b = await submit(h);
    await h.deps.runner.runDue();
    for (const [f, code] of [
      [a, 'ki_400'],
      [b, 'ki_refusal'],
    ] as const) {
      expect(await h.deps.store.job(f.id, 'bewertung')).toMatchObject({
        status: 'failed',
        attempts: 1,
        lastErrorCode: code,
      });
      expect((await state(h, f.id)).fall.status).toBe('bewertung_fehlgeschlagen');
    }
    expect(await h.deps.store.kiKosten(monat(h.clock.now()))).toBeGreaterThan(0); // the refusal was booked
  });

  it('an invalid answer (parsed_output null) is retried', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push(new KiFehler('ki_ungueltig', true));
    const h = make({ claude });
    const fall = await submit(h);
    await h.deps.runner.runDue();
    expect(await h.deps.store.job(fall.id, 'bewertung')).toMatchObject({
      status: 'pending',
      lastErrorCode: 'ki_ungueltig',
    });
    h.clock.advance(BACKOFF_MS[0]!);
    await h.deps.runner.runDue();
    expect((await state(h, fall.id)).ang?.pfad).toBe('ki');
  });

  it('the enquiry mail goes out whatever Claude does', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push(new Error('boom'), new Error('boom'), new Error('boom'));
    const h = make({ claude });
    await submit(h);
    await h.deps.runner.runDue();
    expect(h.outbox()).toHaveLength(1);
  });
});
