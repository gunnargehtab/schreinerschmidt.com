// The Angebot PDF (docs/angebot.md §8.1) with pdf-lib: A4, the site's wordmark as letterhead
// (wordmark.generated.ts, ~45 mm wide), Angebotsnummer, date (Europe/Berlin), the customer's name and
// PLZ/Ort as given, the project summary, Leistungen, nicht enthalten, Annahmen, the Preisrahmen
// „2 450 € bis 3 300 € inkl. 19 % MwSt.“, „vorbehaltlich Aufmaß“, validity 30 days and the
// non-binding clause. No positions or unit prices (§8.1). The preview carries a „Vorschau“
// watermark and no Angebotsnummer yet. The SVG elevation drawing (stretch goal) is not included.
//
// The standard fonts (Helvetica) only encode WinAnsi (CP1252); pdf-lib throws on any other glyph.
// Every string goes through pdfText(), which maps typographic spaces (U+202F, U+2009, …) to a
// no-break space, drops format and control characters, replaces a few symbols („≤“ → „<=“) and
// falls back to the base letter or „?“, so no customer text can make the PDF fail.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { SHOP_KONTAKT } from '../claude/brief.generated';
import type { Angebotstext } from '../claude/schemas';
import type { Config } from '../config';
import { kundeName, plzOrt, projektTitel } from '../fall-daten';
import { projektZusammenfassung } from '../projekt';
import { formatDatum, formatEuroRange } from '../format';
import { absenderAdresse } from '../mail/kunde';
import type { Fall } from '../store';
import { BETRIEB, GUELTIG_TAGE, PDF, UNVERBINDLICH, VORBEHALT, inklMwSt } from '../texte/kunde';
import { WORDMARK_PNG_BASE64 } from './wordmark.generated';

/** CP1252 code points 0x80–0x9F as Unicode (the WinAnsi extras beyond Latin-1). */
const CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** True for a character Helvetica can encode (WinAnsi). */
export function winAnsi(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch);
}

const NBSP = '\u00a0';
/** Typographic spaces → NBSP (keeps „2 450 €“ together), other replacements → ASCII. */
const ERSATZ: Readonly<Record<string, string>> = {
  '\u202f': NBSP,
  '\u2002': NBSP,
  '\u2003': NBSP,
  '\u2004': NBSP,
  '\u2005': NBSP,
  '\u2006': NBSP,
  '\u2007': NBSP,
  '\u2008': NBSP,
  '\u2009': NBSP,
  '\u200a': NBSP,
  '\u205f': NBSP,
  '\u3000': ' ',
  '\t': ' ',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '–',
  '\u2015': '—',
  '\u2212': '-',
  '≤': '<=',
  '≥': '>=',
  '≈': '~',
  '→': '->',
  '←': '<-',
  '′': "'",
  '″': '"',
  '‟': '“',
  '‛': '‘',
  '‧': '·',
  '⁄': '/',
  '\u00ad': '',
  // Letters without a decomposition to a WinAnsi base letter.
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
};

/** Any text → WinAnsi-only text for the standard fonts (one line: line breaks become spaces). */
export function pdfText(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    if (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') {
      out += ' ';
      continue;
    }
    if (Object.hasOwn(ERSATZ, ch)) {
      out += ERSATZ[ch];
      continue;
    }
    if (/[\p{Cc}\p{Cf}]/u.test(ch)) continue;
    if (winAnsi(ch)) {
      out += ch;
      continue;
    }
    // Compatibility forms (full-width digits, ligatures) and accented letters without a WinAnsi glyph.
    const k = ch.normalize('NFKC');
    if (k !== ch && [...k].every(winAnsi)) {
      out += k;
      continue;
    }
    const base = ch.normalize('NFKD').replace(/\p{M}/gu, '');
    out += base && [...base].every(winAnsi) ? base : '?';
  }
  return out;
}

const MM = 72 / 25.4;
const A4: [number, number] = [595.28, 841.89];
const RAND = { links: 25 * MM, rechts: 20 * MM, oben: 18 * MM, unten: 22 * MM };
const BREITE = A4[0] - RAND.links - RAND.rechts;
const TINTE = rgb(0.17, 0.08, 0.01); // #2c1403
const GRAU = rgb(0.39, 0.32, 0.27); // #635146
const SAND = rgb(0.92, 0.9, 0.82); // #ebe5d1
const AKZENT = rgb(0.62, 0.13, 0.14); // #9e2124

export interface PdfInput {
  fall: Fall;
  text: Angebotstext;
  /** The Annahmen for the customer, as the owner edited them (never the raw Kalkulation list). */
  annahmen: readonly string[];
  /** Gross range; null only in a preview without a range yet. */
  min: number | null;
  max: number | null;
  /** Angebotsnummer; null in the preview. */
  nummer: string | null;
  /** Date of the Angebot (epoch ms). */
  datum: number;
  vorschau: boolean;
}

/** Wraps a line to the width (by words; an over-long word is cut by characters). */
export function umbrechen(text: string, font: PDFFont, size: number, breite: number): string[] {
  const words = pdfText(text).split(' ');
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= breite;
  for (const w0 of words) {
    let w = w0;
    while (!fits(w)) {
      let i = w.length - 1;
      while (i > 1 && !fits(w.slice(0, i))) i--;
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(w.slice(0, i));
      w = w.slice(i);
    }
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur || !lines.length) lines.push(cur);
  return lines;
}

class Schreiber {
  page!: PDFPage;
  y = 0;
  readonly pages: PDFPage[] = [];
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.neueSeite();
  }
  neueSeite(): void {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - RAND.oben;
  }
  platz(h: number): void {
    if (this.y - h < RAND.unten) this.neueSeite();
  }
  abstand(h: number): void {
    this.y -= h;
  }
  zeile(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}): void {
    const size = o.size ?? 10;
    const lh = size * 1.35;
    this.platz(lh);
    this.y -= lh;
    this.page.drawText(pdfText(text), {
      x: RAND.links + (o.x ?? 0),
      y: this.y + size * 0.25,
      size,
      font: o.bold ? this.bold : this.font,
      color: o.color ?? TINTE,
    });
  }
  absatz(
    text: string,
    o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; einzug?: number } = {},
  ): void {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.font;
    for (const para of text.split(/\n+/)) {
      for (const l of umbrechen(para, font, size, BREITE - (o.einzug ?? 0))) {
        this.zeile(l, {
          size,
          ...(o.bold ? { bold: true } : {}),
          ...(o.color ? { color: o.color } : {}),
          x: o.einzug ?? 0,
        });
      }
    }
  }
  ueberschrift(text: string): void {
    this.platz(40);
    this.abstand(8);
    this.zeile(text, { size: 11.5, bold: true, color: AKZENT });
    this.abstand(2);
  }
  liste(items: readonly string[], size = 10): void {
    for (const item of items) {
      const lines = umbrechen(item, this.font, size, BREITE - 12);
      lines.forEach((l, i) => {
        this.zeile(l, { size, x: 12 });
        if (i === 0) {
          this.page.drawText('•', { x: RAND.links + 2, y: this.y + size * 0.25, size, font: this.font, color: TINTE });
        }
      });
    }
  }
}

/** Left edge of the meta block (Angebotsnummer, Datum, Vorgang) on the first page. */
export const META_X = RAND.links + BREITE - 62 * MM;
/** The address column ends 6 mm before the meta block, so long names and places never overlap it. */
export const ADRESS_BREITE = BREITE - 62 * MM - 6 * MM;
export const ADRESS_LINKS = RAND.links;
export const ADRESS_SIZE = 10.5;

/** The customer's name and PLZ/Ort as given, wrapped to the address column. */
export function adressZeilen(font: PDFFont, name: string | null, plzOrt: string): string[] {
  return [name, plzOrt].filter((x): x is string => !!x).flatMap((x) => umbrechen(x, font, ADRESS_SIZE, ADRESS_BREITE));
}

const wordmarkBytes = (): Uint8Array => Buffer.from(WORDMARK_PNG_BASE64, 'base64');

/** The sender line under the letterhead: confirmed details only. */
function absenderZeile(config: Config): string {
  const k = SHOP_KONTAKT;
  const ort = [k.plz, k.ort].filter(Boolean).join(' ');
  return [k.name ?? BETRIEB, k.strasse, ort, k.telefon, k.email ?? absenderAdresse(config.mailFrom)]
    .filter(Boolean)
    .join(' · ');
}

/** Builds the Angebot PDF (or its preview). Deterministic for the same input and date. */
export async function angebotPdf(config: Config, i: PdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const datum = new Date(i.datum);
  doc.setTitle(pdfText(`${PDF.titel} ${i.nummer ?? ''}`.trim()));
  doc.setAuthor(pdfText(SHOP_KONTAKT.name ?? BETRIEB));
  doc.setCreator(pdfText(SHOP_KONTAKT.name ?? BETRIEB));
  doc.setProducer('pdf-lib');
  doc.setLanguage('de-DE');
  doc.setCreationDate(datum);
  doc.setModificationDate(datum);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(wordmarkBytes());
  const w = new Schreiber(doc, font, bold);
  const v = i.fall.payload.values;

  // Letterhead: wordmark (~45 mm), sender line.
  const logoW = 45 * MM;
  const logoH = (logoW * logo.height) / logo.width;
  w.page.drawImage(logo, { x: RAND.links, y: w.y - logoH, width: logoW, height: logoH });
  w.abstand(logoH + 8);
  w.zeile(absenderZeile(config), { size: 8, color: GRAU });
  w.abstand(18);

  // Customer (as given) left, meta right.
  const metaTop = w.y;
  w.zeile(PDF.fuer, { size: 8, color: GRAU });
  for (const l of adressZeilen(font, kundeName(v), plzOrt(v))) w.zeile(l, { size: ADRESS_SIZE });
  const kundeY = w.y;
  const meta: [string, string][] = [
    [PDF.angebotsnummer, i.nummer ?? PDF.nummerVorschau],
    [PDF.datum, formatDatum(i.datum)],
    [PDF.vorgang, `#${i.fall.kurz}`],
  ];
  let my = metaTop;
  const mx = META_X;
  for (const [label, wert] of meta) {
    my -= 13;
    w.page.drawText(pdfText(label), { x: mx, y: my, size: 8.5, font, color: GRAU });
    w.page.drawText(pdfText(wert), { x: mx + 28 * MM, y: my, size: 8.5, font: bold, color: TINTE });
  }
  w.y = Math.min(kundeY, my) - 22;

  // Title and introduction.
  w.absatz(`${PDF.titel}: ${projektTitel(v)}`, { size: 15, bold: true });
  w.abstand(6);
  w.absatz(i.text.einleitung, { size: 10.5 });

  const projekt = projektZusammenfassung(v);
  if (projekt.length) {
    w.ueberschrift(PDF.projekt);
    w.liste(projekt, 10);
  }
  if (i.text.leistung.length) {
    w.ueberschrift(PDF.leistungen);
    w.liste(i.text.leistung);
  }
  if (i.text.nicht_enthalten.length) {
    w.ueberschrift(PDF.nichtEnthalten);
    w.liste(i.text.nicht_enthalten);
  }
  if (i.annahmen.length) {
    w.ueberschrift(PDF.annahmen);
    w.liste(i.annahmen, 9.5);
  }

  // Preisrahmen box.
  w.ueberschrift(PDF.preisrahmen);
  const preis = i.min !== null && i.max !== null ? inklMwSt(formatEuroRange(i.min, i.max)) : PDF.preisOffen;
  const preisZeilen = umbrechen(preis, bold, 13, BREITE - 20);
  const boxH = preisZeilen.length * 13 * 1.35 + 10.5 * 1.35 + 16;
  w.platz(boxH);
  w.page.drawRectangle({ x: RAND.links, y: w.y - boxH, width: BREITE, height: boxH, color: SAND });
  w.abstand(8);
  for (const l of preisZeilen) w.zeile(l, { size: 13, bold: true, x: 10 });
  w.zeile(VORBEHALT, { size: 10.5, x: 10 });
  w.abstand(8);

  w.abstand(6);
  w.absatz(i.text.naechster_schritt, { size: 10.5 });
  w.abstand(6);
  w.absatz(PDF.gueltig(formatDatum(i.datum + GUELTIG_TAGE * 86_400_000)), { size: 10 });
  w.abstand(8);
  w.absatz(UNVERBINDLICH, { size: 8.5, color: GRAU });

  // Footer and watermark on every page.
  const n = w.pages.length;
  w.pages.forEach((p, idx) => {
    p.drawText(pdfText(absenderZeile(config)), { x: RAND.links, y: RAND.unten - 30, size: 7.5, font, color: GRAU });
    const seite = pdfText(PDF.seite(idx + 1, n));
    p.drawText(seite, {
      x: RAND.links + BREITE - font.widthOfTextAtSize(seite, 7.5),
      y: RAND.unten - 30,
      size: 7.5,
      font,
      color: GRAU,
    });
    if (i.vorschau) {
      const t = pdfText(PDF.vorschau);
      const size = 96;
      const tw = bold.widthOfTextAtSize(t, size);
      const r = Math.PI / 4;
      p.drawText(t, {
        x: A4[0] / 2 - (Math.cos(r) * tw) / 2 + (Math.sin(r) * size) / 3,
        y: A4[1] / 2 - (Math.sin(r) * tw) / 2 - (Math.cos(r) * size) / 3,
        size,
        font: bold,
        color: AKZENT,
        opacity: 0.12,
        rotate: degrees(45),
      });
    }
  });

  return doc.save({ useObjectStreams: false });
}
