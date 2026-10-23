// Customer mails and the Angebot PDF (docs/angebot.md §8): SEND_MODE (dry-run .eml, allowlist
// redirect), the signature from confirmed details only, the PDF (parses, range, Angebotsnummer,
// WinAnsi mapping), the per-year Angebotsnummer sequence and the wordmark embedding.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORDMARK_OUT, shopKontakt, wordmarkModule } from '../scripts/build-brief.mjs';
import type { ShopKontakt } from '../src/claude/brief.generated';
import { FakeClaude } from '../src/claude/fake';
import { erlaubteKontaktangaben, nachAnrede, signatur } from '../src/mail/kunde';
import { PILOT_PREFIX } from '../src/mail/index';
import { angebotPdf, pdfText, winAnsi } from '../src/pdf/index';
import { pruefeInhaberText } from '../src/review/formular';
import { REGAL } from './fixtures';
import { OWNER, cleanupDirs, harness, header, tempDir, testConfig, type Harness } from './helpers';
import { pdfTexte } from './pdf-helpers';
import { aktion, bewerteterFall, formular, kundenmails, seite } from './review-helpers';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.restoreAllMocks();
  cleanupDirs();
});

const NB = '\u00a0';

/** Sends a Freigeben for a fresh case; returns the customer mail. */
async function freigabe(hh: Harness, extra: Record<string, string> = {}) {
  const { fall, token } = await bewerteterFall(hh, REGAL);
  const page = await (await seite(hh, fall.id, token)).text();
  const confirm = await aktion(hh, fall.id, 'freigeben', {
    ...formular(page, 'freigeben'),
    min: '2450',
    max: '3300',
    ...extra,
  });
  const res = await aktion(hh, fall.id, 'freigeben', {
    ...formular(await confirm.text(), 'freigeben'),
    schritt: 'senden',
  });
  expect(res.status).toBe(200);
  return { fall, token, mail: kundenmails(hh).at(-1)! };
}

describe('customer mails and SEND_MODE', () => {
  it('dry-run: the Angebot is an .eml in the outbox with the PDF attached, BCC to the owner', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall } = await freigabe(h);
    const eml = h.outbox().find((e) => e.includes(`filename=Angebot-${fall.kurz}.pdf`))!;
    expect(eml).toBeDefined();
    expect(header(eml, 'To')).toBe('erika@example.com');
    expect(header(eml, 'Bcc')).toBe(OWNER);
    expect(header(eml, 'Reply-To')).toBe('Schreinerei Schmidt <anfrage@schreinerei.test>');
    expect(header(eml, 'From')).toBe('Schreinerei Schmidt <anfrage@schreinerei.test>');
    expect(eml).toContain(`filename=Angebot-${fall.kurz}.pdf`);
    expect(eml).toMatch(/Content-Type: text\/html/);
    expect(h.smtp).not.toHaveBeenCalled();
  });

  it('allowlist: a customer outside SEND_ALLOWLIST is redirected to the owner with the pilot prefix', async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(t, 'sendMail');
    h = harness({
      claude: new FakeClaude(),
      env: {
        SEND_MODE: 'allowlist',
        SEND_ALLOWLIST: 'jemand@example.com',
        SMTP_HOST: 'smtp.example.test',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        ANTHROPIC_API_KEY: 'k',
      },
      smtp: () => t,
    });
    const { fall, token } = await bewerteterFall(h, REGAL);
    const page = await (await seite(h, fall.id, token)).text();
    const confirm = await aktion(h, fall.id, 'freigeben', formular(page, 'freigeben'));
    const confirmHtml = await confirm.text();
    expect(confirmHtml).toContain('Pilotbetrieb: Die Mail geht nicht an den Kunden, sondern an Ihre Adresse.');
    const res = await aktion(h, fall.id, 'freigeben', { ...formular(confirmHtml, 'freigeben'), schritt: 'senden' });
    expect(res.status).toBe(200);
    const last = spy.mock.calls.at(-1)![0] as { to: string; subject: string; bcc?: string };
    expect(last.to).toBe(OWNER);
    expect(last.subject.startsWith(`${PILOT_PREFIX} Ihr unverbindliches Angebot`)).toBe(true);
    expect(last.bcc).toBeUndefined();
    expect((await h.deps.store.get(fall.id))?.entscheidung).toMatchObject({ mail: { umgeleitet: true } });
    expect(await res.text()).toContain('Im Pilotbetrieb am');
  });

  it('allowlist: an allowlisted customer gets the mail', async () => {
    const t = nodemailer.createTransport({ jsonTransport: true });
    const spy = vi.spyOn(t, 'sendMail');
    h = harness({
      claude: new FakeClaude(),
      env: {
        SEND_MODE: 'allowlist',
        SEND_ALLOWLIST: 'Erika@Example.com',
        SMTP_HOST: 'smtp.example.test',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        ANTHROPIC_API_KEY: 'k',
      },
      smtp: () => t,
    });
    await freigabe(h);
    const last = spy.mock.calls.at(-1)![0] as { to: string; bcc?: string };
    expect(last.to).toBe('erika@example.com');
    expect(last.bcc).toBe(OWNER);
  });

  it('after the greeting a non-noun opener continues in lowercase; nouns and „Ihr“ keep their capital', () => {
    for (const [ein, aus] of [
      ['Vielen Dank für Ihre Anfrage.', 'vielen Dank für Ihre Anfrage.'],
      ['Wir freuen uns.', 'wir freuen uns.'],
      ['Gerne fertigen wir', 'gerne fertigen wir'],
      ['Für Ihr Regal', 'für Ihr Regal'],
      ['Über Ihre Anfrage', 'über Ihre Anfrage'],
      ['Das Regal', 'das Regal'],
      ['Schön, dass', 'schön, dass'],
    ] as const) {
      expect(nachAnrede(ein)).toBe(aus);
    }
    for (const t of [
      'Ihr Regal aus Eiche …',
      'Ihre Anfrage …',
      'Ihrem Wunsch …',
      'Regal aus Eiche …',
      'Danksagung …',
      'Wirklich …',
      'Die-Hard …',
      'vielen Dank (schon klein)',
      '„Vielen Dank“',
      '',
    ]) {
      expect(nachAnrede(t)).toBe(t);
    }
  });

  it('signature: confirmed shop details only, else the name and the MAIL_FROM address', () => {
    const config = testConfig(tempDir());
    const leer: ShopKontakt = {
      name: null,
      inhaber: null,
      titel: null,
      strasse: null,
      plz: null,
      ort: null,
      telefon: null,
      email: null,
    };
    expect(signatur(config, leer)).toEqual([
      'Mit freundlichen Grüßen',
      'Schreinerei Schmidt',
      'anfrage@schreinerei.test',
    ]);
    expect(erlaubteKontaktangaben(config, leer)).toEqual(['anfrage@schreinerei.test']);
    const voll: ShopKontakt = {
      name: 'Schreinerei Schmidt',
      inhaber: 'Ulf Schmidt',
      titel: 'Schreinermeister',
      strasse: 'Musterweg 1',
      plz: '68159',
      ort: 'Mannheim',
      telefon: '+49 621 000000',
      email: 'info@schreinerei.test',
    };
    expect(signatur(config, voll)).toEqual([
      'Mit freundlichen Grüßen',
      'Schreinerei Schmidt',
      'Ulf Schmidt, Schreinermeister',
      'Musterweg 1, 68159 Mannheim',
      'Telefon +49 621 000000',
      'info@schreinerei.test',
    ]);
    // The owner may write the confirmed phone (any spacing) and e-mail; anything else stays blocked.
    const erlaubt = erlaubteKontaktangaben(config, voll);
    expect(pruefeInhaberText('Rufen Sie uns an: 0621 000000 oder info@schreinerei.test.', erlaubt)).toEqual([]);
    expect(pruefeInhaberText('Rufen Sie uns an: +49 (621) 000-000.', erlaubt)).toEqual([]);
    expect(pruefeInhaberText('Rufen Sie an: 0621 123456.', erlaubt)).toEqual(['telefon']);
    expect(pruefeInhaberText('Schreiben Sie an chef@andere.test.', erlaubt)).toEqual(['email']);
  });

  it('the brief script reads the shop details only from a confirmed settings entry', () => {
    const root = tempDir();
    mkdirSync(join(root, 'src/content'), { recursive: true });
    const yaml = (status: string) => `site:
  name: Schreinerei Schmidt
  owner: { name: Ulf Schmidt, title: Schreinermeister }
  address: { street: Musterweg 1, postalCode: '68159', city: Mannheim }
  phone: { display: +49 621 000000 }
  email: info@schreinerei.test
  review: { status: ${status} }
`;
    writeFileSync(join(root, 'src/content/settings.yaml'), yaml('needs-review'));
    expect(Object.values(shopKontakt(root)).every((v) => v === null)).toBe(true);
    writeFileSync(join(root, 'src/content/settings.yaml'), yaml('confirmed'));
    expect(shopKontakt(root)).toEqual({
      name: 'Schreinerei Schmidt',
      inhaber: 'Ulf Schmidt',
      titel: 'Schreinermeister',
      strasse: 'Musterweg 1',
      plz: '68159',
      ort: 'Mannheim',
      telefon: '+49 621 000000',
      email: 'info@schreinerei.test',
    });
  });
});

describe('PDF', () => {
  it('pdfText maps everything Helvetica cannot encode', async () => {
    expect(pdfText('2\u202f450\u202f€')).toBe(`2${NB}450${NB}€`);
    expect(pdfText('„Regal“ 120×200 … – ½ ² ±')).toBe('„Regal“ 120×200 … – ½ ² ±');
    expect(pdfText('a\u2009b\u2007c\u00a0d')).toBe(`a${NB}b${NB}c${NB}d`);
    expect(pdfText('≤ 5 ≥ 3 ≈ 1 → x \u2212 y')).toBe('<= 5 >= 3 ~ 1 -> x - y');
    expect(pdfText('Zeile1\nZeile2\r\nZeile3')).toBe('Zeile1 Zeile2  Zeile3');
    expect(pdfText('ab\u200bc\u00add\u0007e\ufeff')).toBe('abcde');
    expect(pdfText('１２３ ﬁ')).toBe('123 fi');
    expect(pdfText('Łódź Ő ă')).toBe('Lódz O a');
    expect(pdfText('🪵 木')).toBe('? ?');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    // winAnsi() agrees with the font's own character set (printable range).
    const set = new Set(font.getCharacterSet());
    for (let cp = 0x20; cp < 0x3000; cp++) {
      const ch = String.fromCodePoint(cp);
      if (/\p{Cc}|\p{Cf}/u.test(ch)) continue;
      expect(winAnsi(ch), `U+${cp.toString(16)}`).toBe(set.has(cp));
    }
    // Every result of pdfText encodes.
    let all = '';
    for (let cp = 0; cp < 0x3100; cp++) all += String.fromCodePoint(cp);
    all += '🪵\u{1F600}\u{10FFFF}';
    expect(() => font.encodeText(pdfText(all))).not.toThrow();
  });

  it('the sent PDF parses and contains the range, Angebotsnummer, texts and the clause', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, mail } = await freigabe(h, {
      einleitung: 'Vielen Dank – „Ihr Regal“ 120×200 cm mit 19\u202fmm Böden.',
    });
    const pdf = mail.attachments![0]!.content;
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const [w, hgt] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect([Math.round(w), Math.round(hgt)]).toEqual([595, 842]);
    expect(doc.getTitle()).toBe('Unverbindliches Angebot A-2026-0001');
    const text = pdfTexte(pdf).join('\n');
    expect(text).toContain(`2${NB}450${NB}€ bis 3${NB}300${NB}€ inkl. 19${NB}% MwSt.`);
    expect(text).toContain('A-2026-0001');
    expect(text).toContain(`#${fall.kurz}`);
    expect(text).toContain('vorbehaltlich Aufmaß');
    expect(text).toContain('Erika Mustermann');
    expect(text).toContain('68161 Mannheim');
    expect(text).toContain('„Ihr Regal“ 120×200 cm mit 19');
    expect(text).toMatch(/Gültig 30.Tage, bis \d\d\.\d\d\.2026\./);
    expect(text).toContain('Dieses Angebot ist freibleibend und unverbindlich.');
    expect(text).not.toContain('Vorschau');
    expect(text).not.toContain('Plattenmaterial'); // no positions
    // „Ihr Projekt“ is the compact summary, not a field dump; Leistungen are customer-level.
    expect(text).toContain('Ihr Projekt');
    expect(text).toContain(
      `Regal, 120 × 200 × 35${NB}cm (B × H × T), Eiche, natur geölt, 19${NB}mm, auf Sockel, mit Rückwand`,
    );
    expect(text).not.toMatch(/Breite in cm|Welches Möbel|Werkstatt, \d|Anfahrt|\d Teile/);
    expect(mail.text).toContain('Ihr Projekt:\n- Regal, 120 × 200 × 35');
    // Mail: lowercase after the greeting; PDF: as written (it follows a heading).
    expect(mail.text.startsWith('Guten Tag Erika Mustermann,\n\nvielen Dank – „Ihr Regal“')).toBe(true);
    expect(text).toContain('Vielen Dank – „Ihr Regal“');
    expect(mail.text).not.toMatch(/Breite in cm|Werkstatt, \d|Plattenmaterial/);
    // The wordmark is embedded as an image.
    expect(Buffer.from(pdf).toString('latin1')).toMatch(/\/Subtype \/Image/);
  });

  it('the preview has the watermark and no number yet, and takes edited values', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h, REGAL);
    const res = await h.app.request(
      `/angebot/${fall.id}/vorschau.pdf?t=${token}&min=1000&max=1500&einleitung=Neu&leistung=A&naechster_schritt=B`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(`inline; filename="Vorschau-Angebot-${fall.kurz}.pdf"`);
    const pdf = new Uint8Array(await res.arrayBuffer());
    await PDFDocument.load(pdf);
    const text = pdfTexte(pdf).join('\n');
    expect(text).toContain('Vorschau');
    expect(text).toContain('wird beim Senden vergeben');
    expect(text).toContain(`1${NB}000${NB}€ bis 1${NB}500${NB}€`);
    // Invalid edits fall back to the stored values.
    const res2 = await h.app.request(`/angebot/${fall.id}/vorschau.pdf?t=${token}&min=abc&max=1`);
    const text2 = pdfTexte(new Uint8Array(await res2.arrayBuffer())).join('\n');
    expect(text2).not.toContain(`1${NB}000${NB}€`);
  });

  it('renders long and hostile text without failing (wrapping, page breaks)', async () => {
    const config = testConfig(tempDir());
    h = harness({ claude: new FakeClaude() });
    const { fall } = await bewerteterFall(h, REGAL);
    const lang = 'Sehr lange Leistungsbeschreibung mit vielen Wörtern '.repeat(8);
    const pdf = await angebotPdf(config, {
      fall: (await h.deps.store.get(fall.id))!,
      text: {
        einleitung: `${'Wort '.repeat(120)}\u{1F600} Überlänge${'x'.repeat(300)}`,
        leistung: Array.from({ length: 10 }, () => lang.slice(0, 200)),
        nicht_enthalten: Array.from({ length: 6 }, () => lang.slice(0, 200)),
        naechster_schritt: 'Aufmaß',
      },
      annahmen: [],
      min: 1,
      max: 9_999_999,
      nummer: 'A-2026-0042',
      datum: Date.UTC(2026, 11, 31, 23, 30),
      vorschau: false,
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    const text = pdfTexte(pdf).join('\n');
    expect(text).toContain('Seite 1 von');
    expect(text).toContain('01.01.2027'); // the date is Europe/Berlin
  });

  it('the wordmark module is in sync with the site asset', () => {
    expect(readFileSync(WORDMARK_OUT, 'utf8')).toBe(wordmarkModule());
  });
});

describe('Angebotsnummer', () => {
  it('is a per-year sequence, assigned once per case and never reused', async () => {
    h = harness();
    const s = h.deps.store;
    const a = await bewerteterFall(h, REGAL);
    const b = await bewerteterFall(h, REGAL);
    const c = await bewerteterFall(h, REGAL);
    expect(await s.angebotsnummer(a.fall.id, 2026)).toBe('A-2026-0001');
    expect(await s.angebotsnummer(b.fall.id, 2026)).toBe('A-2026-0002');
    expect(await s.angebotsnummer(a.fall.id, 2026)).toBe('A-2026-0001');
    expect(await s.angebotsnummer(a.fall.id, 2027)).toBe('A-2026-0001');
    expect(await s.angebotsnummer(c.fall.id, 2027)).toBe('A-2027-0001');
    await expect(s.angebotsnummer('3b241101-e2bb-4255-8caf-ffffffffffff', 2026)).rejects.toThrow();
    const d = await bewerteterFall(h, REGAL);
    expect(await s.angebotsnummer(d.fall.id, 2026)).toBe('A-2026-0003');
  });
});
