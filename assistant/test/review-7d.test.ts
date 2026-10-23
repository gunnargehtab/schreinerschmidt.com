// Regression tests for the phase 7d review findings: customer Annahmen as an edited field, expiry
// vs. an action in flight, the PDF address column, the reminder on Berlin wall-clock time and a
// TL;DR that cannot be sent for a long time.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nachArbeitstagen } from '../src/arbeitstage';
import { FakeClaude } from '../src/claude/fake';
import { kalkulationOf } from '../src/claude/input';
import { ADRESS_BREITE, ADRESS_LINKS, ADRESS_SIZE, META_X, adressZeilen, angebotPdf } from '../src/pdf/index';
import { kundenAnnahmen } from '../src/projekt';
import { MAIL_BACKOFF_MS } from '../src/steps/anfrage-mail';
import { TLDR_NACHLAEUFE } from '../src/steps/tldr';
import type { Fall } from '../src/store';
import { ablauf } from '../src/timers';
import { REGAL, SONSTIGES, configuratorForm, newId } from './fixtures';
import { cleanupDirs, harness, tempDir, testConfig, type Harness } from './helpers';
import { pdfTexte } from './pdf-helpers';
import { aktion, bewerteterFall, formular, kundenmails, seite, tldrVon } from './review-helpers';

let h: Harness | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await h?.close();
  h = undefined;
  cleanupDirs();
});

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Fenster without a count: the rule price assumes 1 window (a customer-relevant assumption). */
const FENSTER = {
  typ: 'fenster',
  fenster_leistung: ['neu'],
  fenster_breite: '120',
  fenster_hoehe: '140',
  fenster_verglasung: '2fach',
  plz: '10115',
  ort: 'Berlin',
  name: 'Kim Beispiel',
  email: 'kim@example.com',
};

/** Two-step Freigeben (or own range) with the page's values plus overrides; returns the sent mail. */
async function senden(
  hh: Harness,
  fall: Fall,
  token: string,
  form: 'freigeben' | 'manuell',
  extra: Record<string, string> = {},
) {
  const page = await (await seite(hh, fall.id, token)).text();
  const confirm = await aktion(hh, fall.id, form, { ...formular(page, form), min: '2000', max: '2600', ...extra });
  expect(confirm.status).toBe(200);
  const res = await aktion(hh, fall.id, form, { ...formular(await confirm.text(), form), schritt: 'senden' });
  expect(res.status).toBe(200);
  const mail = kundenmails(hh).at(-1)!;
  // Lines may wrap: compare with single spaces.
  return { mail, pdf: pdfTexte(mail.attachments![0]!.content).join('\n').replace(/\s+/g, ' ') };
}

describe('1: Annahmen are an edited field; internal lines never reach the customer', () => {
  it('filters internal lines from the pre-fill', () => {
    expect(
      kundenAnnahmen([
        'Anfahrt wie außerhalb des Einzugsgebiets berechnet (PLZ unbekannt).',
        'Mengen geschätzt, vor dem Aufmaß zu prüfen.',
        'Werkstattstunden auf das Maximum von 400 begrenzt.',
        'Plattenfläche insgesamt auf das Maximum von 200 begrenzt.',
        'Fläche nicht angegeben, wir rechnen mit 1 m².',
        'Pauschales Material ist im Preis nicht enthalten und wird nach dem Aufmaß ergänzt.',
      ]),
    ).toEqual([
      'Fläche nicht angegeben, wir rechnen mit 1 m².',
      'Pauschales Material ist im Preis nicht enthalten und wird nach dem Aufmaß ergänzt.',
    ]);
  });

  it('PLZ 10115: no Anfahrt/PLZ line in form, PDF or mail; the customer-relevant line stays', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h, FENSTER);
    // Make sure the Kalkulation carries an internal travel line, as for an unknown PLZ.
    const cur = (await h.deps.store.get(fall.id))!;
    const k = kalkulationOf(cur.kalkulation)!;
    k.annahmen.push('Anfahrt wie außerhalb des Einzugsgebiets berechnet (PLZ unbekannt).');
    await h.deps.store.update(fall.id, { kalkulation: { kind: 'regeln', kalkulation: k } });
    const page = await (await seite(h, fall.id, token)).text();
    const vorbelegt = formular(page, 'freigeben')['annahmen']!;
    expect(vorbelegt).toMatch(/Zahl der Fenster nicht angegeben, wir rechnen mit 1\sFenster\./u);
    expect(vorbelegt).not.toMatch(/Anfahrt|PLZ|Einzugsgebiet/);
    const { mail, pdf } = await senden(h, (await h.deps.store.get(fall.id))!, token, 'freigeben');
    expect(pdf).toMatch(/Zahl der Fenster nicht angegeben, wir rechnen mit 1\sFenster\./u);
    expect(pdf).not.toMatch(/Anfahrt|PLZ unbekannt|Einzugsgebiet/);
    expect(mail.text).not.toMatch(/Anfahrt|PLZ unbekannt|Einzugsgebiet/);
  });

  it('KI-Mengen: no estimate note and no hours reach the customer', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h, SONSTIGES);
    const k = kalkulationOf((await h.deps.store.get(fall.id))!.kalkulation)!;
    expect(k.quelle).toBe('ki-mengen');
    expect(k.annahmen.join(' ')).toContain('Mengen geschätzt');
    const { pdf, mail } = await senden(h, fall, token, 'freigeben');
    expect(pdf).not.toMatch(/Mengen geschätzt|stunden|\d\s?h\b|Werkstatt, \d/);
    expect(mail.text).not.toMatch(/Mengen geschätzt|stunden/);
  });

  it('own range (manuell): the Annahmen start empty, the old calculation’s lines are not sent', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, FENSTER);
    await aktion(h, fall.id, 'ablehnen', { t: token, v: String(fall.version), folge: 'manuell' });
    const page = await (await seite(h, fall.id, token)).text();
    expect(formular(page, 'manuell')['annahmen']).toBe('');
    const { pdf } = await senden(h, (await h.deps.store.get(fall.id))!, token, 'manuell');
    expect(pdf).not.toContain('Zahl der Fenster');
    expect(pdf).not.toMatch(/ Annahmen /);
  });

  it('the owner edits and removes lines; the sent list is stored and is all the PDF has', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, FENSTER);
    const neu = 'Die alten Fenster bleiben bis zum Einbau eingesetzt.\n- Fensterbänke werden übernommen.';
    const { pdf } = await senden(h, fall, token, 'freigeben', { annahmen: neu });
    expect(pdf).toContain('Die alten Fenster bleiben bis zum Einbau eingesetzt.');
    expect(pdf).toContain('Fensterbänke werden übernommen.');
    expect(pdf).not.toContain('Zahl der Fenster');
    expect((await h.deps.store.get(fall.id))?.entscheidung).toMatchObject({
      annahmen: ['Die alten Fenster bleiben bis zum Einbau eingesetzt.', 'Fensterbänke werden übernommen.'],
    });
    await h.close();

    h = harness();
    const b = await bewerteterFall(h, FENSTER);
    const leer = await senden(h, b.fall, b.token, 'freigeben', { annahmen: '' });
    expect(leer.pdf).not.toContain('Zahl der Fenster');
    expect((await h.deps.store.get(b.fall.id))?.entscheidung).toMatchObject({ annahmen: [] });
  });

  it('guard violations and too many lines in the Annahmen are refused with the error summary', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, FENSTER);
    const page = await (await seite(h, fall.id, token)).text();
    for (const [wert, msg] of [
      ['Einbau bis 12.11.2026', 'ein Datum oder einen Termin'],
      ['Aufpreis 300 € für Sprossen', 'einen Betrag'],
      ['Infos auf www.example.de', 'einen Link oder eine Webadresse'],
      [Array.from({ length: 11 }, (_, i) => `Annahme ${i}`).join('\n'), 'zu lang oder hat zu viele Zeilen'],
    ] as const) {
      const res = await aktion(h, fall.id, 'freigeben', { ...formular(page, 'freigeben'), annahmen: wert });
      expect(res.status, wert).toBe(422);
      const html = await res.text();
      expect(html).toContain(msg);
      expect(html).toContain('href="#f-annahmen"');
    }
    expect(kundenmails(h)).toHaveLength(0);
  });

  it('the confirm page carries the Annahmen to the send and to the preview', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, FENSTER);
    const page = await (await seite(h, fall.id, token)).text();
    const confirm = await aktion(h, fall.id, 'freigeben', {
      ...formular(page, 'freigeben'),
      annahmen: 'Nur Erdgeschoss.',
    });
    const html = await confirm.text();
    expect(formular(html, 'freigeben')['annahmen']).toBe('Nur Erdgeschoss.');
    const vorschau = /<form method="get" action="([^"]+)">([\s\S]*?)<\/form>/.exec(html)!;
    const q = new URLSearchParams(
      [...vorschau[2]!.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((m) => [
        m[1]!,
        m[2]!.replace(/&#(\d+);/g, (_x, n: string) => String.fromCharCode(Number(n))),
      ]),
    );
    const pdf = await h.app.request(`${vorschau[1]}?${q.toString()}`);
    expect(pdfTexte(new Uint8Array(await pdf.arrayBuffer())).join('\n')).toContain('Nur Erdgeschoss.');
  });
});

describe('2: expiry never races an action in flight', () => {
  it('ablauf skips a case with a sperre and leaves the sperre', async () => {
    h = harness({ timers: false });
    const { fall } = await bewerteterFall(h, REGAL);
    const sperre = { art: 'freigeben', at: h.clock.now() };
    await h.deps.store.update(fall.id, { sperre });
    h.clock.advance(15 * DAY);
    expect(await ablauf(h.deps)).toBe(0);
    const after = (await h.deps.store.get(fall.id))!;
    expect(after.status).toBe('bewertet');
    expect(after.sperre).toEqual(sperre);
    expect(h.logs.some((l) => l.includes('"event":"ablauf_uebersprungen"') && l.includes('"code":"sperre"'))).toBe(
      true,
    );
  });

  it('claim just before expiry with a slow transport: sent and gesendet, never abgelaufen', async () => {
    h = harness({ claude: new FakeClaude(), timers: false });
    const { fall, token } = await bewerteterFall(h, REGAL);
    const exp = (await h.deps.store.get(fall.id))!.tokenExpiresAt!;
    h.clock.t = exp - 1;
    const page = await (await seite(h, fall.id, token)).text();
    const confirm = await (await aktion(h, fall.id, 'freigeben', formular(page, 'freigeben'))).text();
    h.ctl.delayMs = 150;
    const post = aktion(h, fall.id, 'freigeben', { ...formular(confirm, 'freigeben'), schritt: 'senden' });
    await vi.waitUntil(async () => (await h!.deps.store.get(fall.id))?.sperre, { timeout: 2000, interval: 5 });
    h.clock.t = exp + 1;
    expect(await ablauf(h.deps)).toBe(0); // the mail is on its way
    expect((await post).status).toBe(200);
    const after = (await h.deps.store.get(fall.id))!;
    expect(after.status).toBe('gesendet');
    expect(kundenmails(h)).toHaveLength(1);
  });

  it('expiry between the access check and the claim: released, nothing sent, then abgelaufen', async () => {
    h = harness({ claude: new FakeClaude(), timers: false });
    const { fall, token } = await bewerteterFall(h, REGAL);
    const exp = (await h.deps.store.get(fall.id))!.tokenExpiresAt!;
    h.clock.t = exp - 1;
    const page = await (await seite(h, fall.id, token)).text();
    const confirm = await (await aktion(h, fall.id, 'freigeben', formular(page, 'freigeben'))).text();
    const store = h.deps.store;
    const update = store.update.bind(store);
    vi.spyOn(store, 'update').mockImplementation(async (id, patch, v) => {
      if ((patch.sperre as { art?: string } | null | undefined)?.art) h!.clock.t = exp + 1; // time passes
      return update(id, patch, v);
    });
    const res = await aktion(h, fall.id, 'freigeben', { ...formular(confirm, 'freigeben'), schritt: 'senden' });
    expect(res.status).toBe(410);
    expect(kundenmails(h)).toHaveLength(0);
    expect((await store.get(fall.id))?.sperre).toBeNull();
    expect(await ablauf(h.deps)).toBe(1);
    expect((await store.get(fall.id))?.status).toBe('abgelaufen');
  });
});

describe('3: the PDF address column never runs into the meta block', () => {
  it('wraps a 97-character name and a 200-character Ort inside the column', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const name = `${'Maximiliane-Friederike '.repeat(4)}von und zu Oberhausen-Sterkrade`.slice(0, 97);
    const ort = `68161 ${'Mannheim-Neckarstadt-West Langerötterstraße Hinterhaus '.repeat(4)}`.slice(0, 200);
    expect(name).toHaveLength(97);
    expect(ort).toHaveLength(200);
    const zeilen = adressZeilen(font, name, ort);
    expect(zeilen.length).toBeGreaterThan(3);
    expect(ADRESS_LINKS + ADRESS_BREITE).toBeLessThan(META_X);
    for (const z of zeilen) expect(ADRESS_LINKS + font.widthOfTextAtSize(z, ADRESS_SIZE)).toBeLessThan(META_X);
    expect(zeilen.join(' ').replace(/\s+/g, ' ')).toBe(`${name} ${ort}`.replace(/\s+/g, ' ').trim());
    // And the PDF renders them.
    h = harness();
    const { fall } = await bewerteterFall(h, { ...REGAL, name, ort: ort.slice(6, 106) });
    const pdf = await angebotPdf(testConfig(tempDir()), {
      fall: (await h.deps.store.get(fall.id))!,
      text: { einleitung: 'Danke.', leistung: ['Regal'], nicht_enthalten: [], naechster_schritt: 'Aufmaß.' },
      annahmen: [],
      min: 1000,
      max: 1200,
      nummer: 'A-2026-0001',
      datum: h.clock.now(),
      vorschau: false,
    });
    const text = pdfTexte(pdf);
    expect(text).toContain(zeilen[0]);
  });
});

describe('4: reminder on the Berlin wall clock', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  it('keeps the local time across DST changes and skips weekends and holidays', () => {
    // Fri 23.10.2026 10:00 CEST → Tue 27.10. 10:00 CET
    expect(iso(nachArbeitstagen(Date.UTC(2026, 9, 23, 8, 0), 2))).toBe('2026-10-27T09:00:00.000Z');
    // Fri 23.10.2026 00:30 CEST (Thu 22:30 UTC) → Tue 27.10. 00:30 CET
    expect(iso(nachArbeitstagen(Date.UTC(2026, 9, 22, 22, 30), 2))).toBe('2026-10-26T23:30:00.000Z');
    // Thu 25.03.2027 10:00 CET → Karfreitag, weekend, Ostermontag → Wed 31.03. 10:00 CEST
    expect(iso(nachArbeitstagen(Date.UTC(2027, 2, 25, 9, 0), 2))).toBe('2027-03-31T08:00:00.000Z');
    // Without a DST change it is unchanged: Thu 24.12.2026 10:00 → Tue 29.12. 10:00
    expect(iso(nachArbeitstagen(Date.UTC(2026, 11, 24, 9, 0), 2))).toBe('2026-12-29T09:00:00.000Z');
  });
});

describe('5: a TL;DR that cannot be sent never lets the case expire silently', () => {
  it('fails through the mail schedule, keeps retrying every 6 h, sends once SMTP recovers', async () => {
    h = harness();
    const id = newId();
    await h.post(configuratorForm(REGAL, { id }));
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    expect(fall.messageId).toBeTruthy(); // the enquiry mail went out
    h.ctl.fail = 1000; // from now on SMTP is down
    await h.deps.runner.runDue();
    for (const ms of MAIL_BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    let cur = (await h.deps.store.get(fall.id))!;
    expect(cur.status).toBe('eingegangen'); // not marked as a failed assessment
    expect(cur.tokenExpiresAt).toBeNull(); // the link never started counting
    expect(h.logs.some((l) => l.includes('"level":"error"') && l.includes('"event":"tldr_failed"'))).toBe(true);
    expect(await h.deps.store.job(fall.id, 'tldr')).toMatchObject({ status: 'pending' });

    // Two more days down: the timers run, nothing expires.
    for (let i = 0; i < 8; i++) {
      h.clock.advance(6 * HOUR);
      await h.deps.runner.runDue();
    }
    expect((await h.deps.store.get(fall.id))?.status).toBe('eingegangen');
    expect(await ablauf(h.deps)).toBe(0);

    h.ctl.fail = 0;
    h.clock.advance(6 * HOUR);
    await h.deps.runner.runDue();
    cur = (await h.deps.store.get(fall.id))!;
    expect(cur.status).toBe('bewertet');
    expect(cur.tokenExpiresAt).toBe(cur.tldrAt! + 14 * DAY);
    expect(tldrVon(h, cur)).toBeDefined();
    expect(h.ctl.sent.filter((m) => m.text.includes('/angebot/'))).toHaveLength(1);
    h.clock.advance(13 * DAY);
    await h.deps.runner.runDue();
    expect((await h.deps.store.get(fall.id))?.status).toBe('bewertet');
  });

  it('stops re-queueing after the cap', async () => {
    h = harness();
    const id = newId();
    await h.post(configuratorForm(REGAL, { id }));
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    h.ctl.fail = 10_000;
    await h.deps.runner.runDue();
    for (const ms of MAIL_BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    for (let i = 0; i < TLDR_NACHLAEUFE + 2; i++) {
      h.clock.advance(6 * HOUR);
      await h.deps.runner.runDue();
    }
    expect(await h.deps.store.job(fall.id, 'tldr')).toMatchObject({ status: 'failed' });
    expect(h.logs.filter((l) => l.includes('"event":"tldr_failed"')).length).toBe(TLDR_NACHLAEUFE + 1);
  });
});
