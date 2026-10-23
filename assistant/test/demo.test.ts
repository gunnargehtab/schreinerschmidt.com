// The owner demo (phase 7f) as a regression test: the 24 fixtures through the real backend in
// dry-run with the recorded answers (POST /anfrage → preis → bewertung → tldr → review routes),
// the §11 bar, the owner actions, the saved files, and what the customer would read: no amount
// outside the price slot, no link, no internal position, no hours and no recommendation flag in
// any customer mail or PDF (the sent ones and the preview of every case).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatEuroRange } from '../src/format';
import { absenderAdresse } from '../src/mail/kunde';
import { inklMwSt } from '../src/texte/kunde';
import {
  AKTIONEN,
  ABSAGE_PERSOENLICH,
  demoLauf,
  eigenerRahmen,
  START,
  type DemoErgebnis,
  type DemoFall,
} from '../eval/demo/lauf';
import { uebersicht } from '../eval/demo/uebersicht';
import { FAELLE } from '../eval/fixtures/faelle';
import { BAR_TREFFER } from '../eval/lauf';
import { cleanupDirs, tempDir } from './helpers';
import { pdfTexte } from './pdf-helpers';

let r: DemoErgebnis;
let ausgabe: string;

beforeAll(async () => {
  ausgabe = join(tempDir(), 'demo');
  r = await demoLauf({ ausgabe });
}, 60_000);
afterAll(() => cleanupDirs());

/** Spaces of any kind (NBSP, U+202F from the PDF and the formatter) as one plain space. */
const norm = (s: string): string => s.replace(/[\s  ]+/g, ' ');

/**
 * Problems of a customer-facing text: amounts outside the price slot, links, internal positions,
 * hours, recommendation flags. `preis` is the range in the slot (null: none).
 */
function probleme(text: string, e: DemoFall, preis: { min: number; max: number } | null): string[] {
  let t = norm(text)
    .split(norm(absenderAdresse(r.config.mailFrom)))
    .join(' ');
  if (preis) t = t.split(norm(inklMwSt(formatEuroRange(preis.min, preis.max)))).join(' [PREIS] ');
  const out: string[] = [];
  if (/€|\bEUR\b|\bEuro\b|%|Prozent/i.test(t)) out.push('betrag');
  if (/https?:|www\.|[a-z0-9-]+\.(?:de|com|net|org|eu|invalid|example)\b/i.test(t)) out.push('url');
  if (/\d\s*h\b|Stunde/i.test(t)) out.push('stunden');
  if (/Plattenmaterial|Anfahrt|Einzugsgebiet|Zuschlag|Werkstatt, \d|Mengen geschätzt/.test(t)) out.push('intern');
  // Position texts with their quantities („Werkstatt, 19 Teile“); a bare „Montage“ is customer-level
  // wording too („Lieferung und Montage vor Ort“), the internal labels are matched above.
  for (const p of e.kalkulation?.positionen ?? []) {
    if (/\d/.test(p.text) && t.includes(norm(p.text))) out.push(`position:${p.text}`);
  }
  for (const f of e.empfehlung?.flags ?? []) if (t.includes(norm(f.text))) out.push(`flag:${f.code}`);
  if (/Empfehlung|\bKI\b|Claude|Spam/.test(t)) out.push('intern');
  for (const n of ALLE_NUTZLASTEN) if (n.test(t)) out.push(`nutzlast:${n.source}`);
  return out;
}

/**
 * The payloads of the prompt-injection and spam fixtures (eval/fixtures/faelle.ts), as patterns
 * over normalised text. None may ever reach a customer mail or PDF.
 */
const NUTZLAST: Readonly<Record<string, readonly RegExp[]>> = {
  'moebel-injection': [/evil/i, /(?<![\d.,])1 ?€/, /bis morgen/i, /Ignoriere/i],
  'treppe-injection': [/99 ?Euro/i, /0621 ?999/, /Admin-Modus/i, /SYSTEM:/],
  'tuer-spam': [/crypto|krypto/i, /5000 ?€/, /Bonus/i, /registrieren/i],
  'altbau-injection': [/evil/i, /(?<![\d.,])10 ?€/, /KW ?12/, /Ignoriere/i, /info@/],
};
const ALLE_NUTZLASTEN = Object.values(NUTZLAST).flat();

const pdfText = (bytes: Uint8Array): string => pdfTexte(bytes).join(' ');
const ohneHtml = (s: string): string =>
  s.replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));

describe('npm run demo (recorded answers, dry-run)', () => {
  it('runs all 24 cases to a TL;DR and meets the §11 bar', () => {
    expect(r.faelle).toHaveLength(24);
    expect(r.config.sendMode).toBe('dry-run');
    expect(r.config.smtp).toBeNull();
    expect(r.treffer).toBeGreaterThanOrEqual(BAR_TREFFER);
    expect(r.treffer).toBe(24);
    expect(r.unpassendFreigegeben).toBe(0);
    expect(r.bar).toBe(true);
    for (const e of r.faelle) {
      expect(e.empfehlung, e.fixture.id).not.toBeNull();
      if (e.fixture.art === 'unpassend') expect(e.empfehlung!.empfehlung).not.toBe('freigeben');
    }
    // 24 enquiries + 24 TL;DRs to the owner, one customer mail per action that sends.
    const owner = r.mails.filter((m) => m.kind === 'owner');
    expect(owner).toHaveLength(48);
    expect(owner.every((m) => m.to === r.config.ownerEmail)).toBe(true);
    expect(r.mails.filter((m) => m.kind === 'customer')).toHaveLength(Object.keys(AKTIONEN).length);
  });

  it('the owner actions went through the review routes', () => {
    const by = new Map(r.faelle.map((e) => [e.fixture.id, e]));
    for (const e of r.faelle) {
      const art = AKTIONEN[e.fixture.id] ?? 'tldr';
      expect(e.aktion).toBe(art);
      const status = {
        freigeben: 'gesendet',
        selbst: 'gesendet',
        rueckfragen: 'kontakt',
        absage: 'abgesagt',
        tldr: 'bewertet',
      }[art];
      expect(e.status, e.fixture.id).toBe(status);
      expect(e.kundenmails).toHaveLength(art === 'tldr' ? 0 : 1);
    }
    const regal = by.get('moebel-klar')!;
    expect(regal.entscheidung).toMatchObject({
      aktion: 'freigeben',
      preis: { min: regal.kalkulation!.min, max: regal.kalkulation!.max },
    });
    expect(regal.entscheidung?.angebotsnummer).toMatch(/^A-2026-\d{4}$/);
    const altbau = by.get('altbau-klar')!;
    expect(altbau.kalkulation?.quelle).toBe('ki-mengen');
    expect(altbau.entscheidung).toMatchObject({
      aktion: 'eigener_preis',
      preis: eigenerRahmen(altbau.kalkulation!.min, altbau.kalkulation!.max),
    });
    const tuer = by.get('tuer-grenzfall')!;
    expect(tuer.rueckfragenPfad).toBe('ki_retry');
    expect(tuer.kundenmails[0]!.text).toContain('Ist die gesprungene Scheibe aus klarem oder aus verziertem Glas?');
    expect(tuer.kundenmails[0]!.text).not.toContain('zeitnah');
    const absage = by.get('sonstiges-unpassend')!;
    expect(absage.entscheidung).toMatchObject({ aktion: 'absage', grund: 'sonstiges' });
    expect(absage.kundenmails[0]!.text).toContain(ABSAGE_PERSOENLICH);
    expect(absage.kundenmails[0]!.text).not.toContain('sonstiges');
    expect(by.get('terrasse-grenzfall')!.angebot?.pfad).toBe('ki_retry');
    expect(by.get('fenster-grenzfall')!.angebot).toMatchObject({ pfad: 'vorlage', grund: 'verstoss' });
  });

  it('no customer mail or PDF has an amount outside the price slot, a link, positions, hours or flags', () => {
    let geprueft = 0;
    for (const e of r.faelle) {
      for (const m of e.kundenmails) {
        const preis = e.entscheidung?.preis ?? null;
        expect(probleme(m.subject, e, null), `${e.fixture.id} subject`).toEqual([]);
        expect(probleme(m.text, e, preis), `${e.fixture.id} text`).toEqual([]);
        expect(m.html, `${e.fixture.id} html`).toBeDefined();
        expect(probleme(ohneHtml(m.html!), e, preis), `${e.fixture.id} html`).toEqual([]);
        for (const a of m.attachments ?? []) {
          // Not vacuous: the PDF has text, and the range is in its slot.
          expect(pdfTexte(a.content).length, `${e.fixture.id} pdf text`).toBeGreaterThan(0);
          expect(preis, `${e.fixture.id} pdf price`).not.toBeNull();
          expect(norm(pdfText(a.content))).toContain(norm(formatEuroRange(preis!.min, preis!.max)));
          expect(probleme(pdfText(a.content), e, preis), `${e.fixture.id} pdf`).toEqual([]);
          geprueft++;
        }
        if (preis) expect(norm(m.text)).toContain(norm(inklMwSt(formatEuroRange(preis.min, preis.max))));
      }
      // The preview of every case: the text and the range the owner would send by Freigeben.
      expect(e.vorschau, e.fixture.id).not.toBeNull();
      const k = e.kalkulation;
      const vorschau = pdfText(e.vorschau!);
      expect(vorschau).toContain('Preisrahmen');
      expect(norm(vorschau)).toContain(norm(e.angebot?.text.einleitung ?? 'Vielen Dank').slice(0, 30));
      expect(probleme(vorschau, e, k ? { min: k.min, max: k.max } : null), `${e.fixture.id} vorschau`).toEqual([]);
      geprueft++;
    }
    expect(geprueft).toBe(24 + 8);
  });

  it('no injected or spam payload reaches a customer text (explicit negatives per fixture)', () => {
    for (const [id, muster] of Object.entries(NUTZLAST)) {
      const f = FAELLE.find((x) => x.id === id)!;
      const quelle = norm(Object.values(f.values).flat().join(' '));
      // The patterns match the fixture's own text, so their absence below means something.
      for (const n of muster) expect(n.test(quelle), `${id}: ${n.source} in the fixture`).toBe(true);
      const e = r.faelle.find((x) => x.fixture.id === id)!;
      const texte = [
        pdfText(e.vorschau!),
        ...e.kundenmails.flatMap((m) => [
          m.subject,
          m.text,
          ohneHtml(m.html ?? ''),
          ...(m.attachments ?? []).map((a) => pdfText(a.content)),
        ]),
      ].map(norm);
      expect(texte[0]!.length).toBeGreaterThan(100);
      for (const t of texte) for (const n of muster) expect(n.test(t), `${id}: ${n.source}`).toBe(false);
    }
  });

  it('writes the artifacts of every case for offline reading', () => {
    for (const e of r.faelle) {
      const dir = join(ausgabe, e.ordner);
      for (const f of ['anfrage.eml', 'tldr.eml', 'tldr.html', 'pruefseite.html', 'vorschau.pdf']) {
        expect(existsSync(join(dir, f)), `${e.ordner}/${f}`).toBe(true);
      }
      const tldr = readFileSync(join(dir, 'tldr.html'), 'utf8');
      expect(tldr).toContain('href="pruefseite.html"');
      expect(tldr).not.toContain(r.config.publicBaseUrl);
      const seite = readFileSync(join(dir, 'pruefseite.html'), 'utf8');
      expect(seite).toContain('href="../review.css"');
      expect(seite).not.toMatch(/action="\/angebot|href="\/angebot/);
      expect(seite).toContain('id="demo-hinweis"');
      if (e.aktion !== 'tldr') {
        for (const f of [
          'bestaetigen.html',
          'ergebnis.html',
          `kunde-${e.aktion === 'freigeben' || e.aktion === 'selbst' ? 'angebot' : e.aktion}.eml`,
        ]) {
          expect(existsSync(join(dir, f)), `${e.ordner}/${f}`).toBe(true);
        }
      }
      if (e.aktion === 'freigeben' || e.aktion === 'selbst') {
        expect(existsSync(join(dir, `Angebot-${e.kurz}.pdf`))).toBe(true);
      }
    }
    expect(existsSync(join(ausgabe, 'review.css'))).toBe(true);
    // Enquiry .eml: the real dry-run file, addressed to the owner.
    const eml = readFileSync(join(ausgabe, r.faelle[0]!.ordner, 'anfrage.eml'), 'utf8');
    expect(eml).toMatch(/^To: inhaber@schreinerei-schmidt\.invalid$/m);
    // The .eml carries the fake clock: the first enquiry arrives at START.
    const date = /^Date: (.+)$/m.exec(eml)?.[1];
    expect(date).toBeDefined();
    expect(Date.parse(date!)).toBe(START);
  });

  it('the overview is self-contained German HTML with one h1 and all 24 cases', () => {
    const page = uebersicht(r, { hinweis: null });
    expect(page).toContain('<html lang="de">');
    expect(page.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(page).toContain('Trockenlauf: keine Mail hat das Haus verlassen.');
    expect(page).toContain('Aufnahmen');
    for (const t of ['Preise bestätigen', 'Absage und Klausel rechtlich prüfen', 'Postfach', 'Hosting', 'KI-Zugang']) {
      expect(page).toContain(t);
    }
    expect(page.match(/<tr>/g)?.length).toBe(25);
    // No external resource: no src attribute, no stylesheet link, no script, links only relative.
    expect(page).not.toMatch(/<script|<link|\ssrc=|@import|url\(/);
    for (const m of page.matchAll(/href="([^"]+)"/g)) expect(m[1]).not.toMatch(/^[a-z]+:|^\/\//i);
    expect(page).toContain('kein Preis');
  });
});
