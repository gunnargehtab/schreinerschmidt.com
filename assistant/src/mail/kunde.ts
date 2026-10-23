// Customer mails (docs/angebot.md §8): the Angebot with its PDF, the Rückfragen and the Absage.
// Kind `customer`, so the SEND_MODE allowlist and dry-run apply in the Mailer; From and Reply-To are
// MAIL_FROM, a BCC goes to OWNER_EMAIL for the record. Plain text + simple HTML (escaped). The
// signature uses confirmed shop details only (SHOP_KONTAKT from the brief script); while nothing is
// confirmed it is „Schreinerei Schmidt“ and the MAIL_FROM address. Copy in texte/kunde.ts
// (needs-review). The internal reason of an Absage is never part of a mail.
import type { Attachment } from '../attachments';
import { SHOP_KONTAKT, type ShopKontakt } from '../claude/brief.generated';
import type { Angebotstext } from '../claude/schemas';
import type { Config } from '../config';
import { kundeName, projektTitel } from '../fall-daten';
import { projektZusammenfassung } from '../projekt';
import { formatEuroRange } from '../format';
import { esc } from '../html';
import { bodyText, headerText } from '../sanitize';
import type { Fall } from '../store';
import {
  ABSAGE_MAIL,
  ANGEBOT_MAIL,
  BETRIEB,
  GRUSS,
  PDF,
  RUECKFRAGEN_MAIL,
  SIGNATUR,
  UNVERBINDLICH,
  anrede,
} from '../texte/kunde';
import type { OutgoingMail } from './index';

export type KundenmailArt = 'angebot' | 'rueckfragen' | 'absage';

/** The bare address of MAIL_FROM („Name <a@b.de>“ → „a@b.de“). */
export const absenderAdresse = (mailFrom: string): string => /<([^<>]+)>/.exec(mailFrom)?.[1] ?? mailFrom.trim();

/** Signature lines: confirmed shop details, else the shop name and the MAIL_FROM address. */
export function signatur(config: Config, k: ShopKontakt = SHOP_KONTAKT): string[] {
  const lines = [GRUSS, k.name ?? BETRIEB];
  if (k.inhaber) lines.push(SIGNATUR.inhaber(k.inhaber, k.titel));
  const ort = [k.plz, k.ort].filter(Boolean).join(' ');
  const adresse = [k.strasse, ort].filter(Boolean).join(', ');
  if (adresse) lines.push(adresse);
  if (k.telefon) lines.push(SIGNATUR.telefon(k.telefon));
  lines.push(k.email ?? absenderAdresse(config.mailFrom));
  return lines;
}

/** Strings the owner may use in his own edits (§7.3): confirmed contact details and MAIL_FROM. */
export function erlaubteKontaktangaben(config: Config, k: ShopKontakt = SHOP_KONTAKT): string[] {
  return [k.telefon, k.email, absenderAdresse(config.mailFrom)].filter((x): x is string => !!x && x.length >= 5);
}

/** Paragraphs → plain text and simple HTML. A paragraph that is a list renders as <ul>. */
type Absatz = string | { titel?: string; liste: readonly string[] };

function rendern(absaetze: readonly Absatz[]): { text: string; html: string } {
  const text = absaetze
    .map((a) =>
      typeof a === 'string' ? a : [...(a.titel ? [a.titel] : []), ...a.liste.map((x) => `- ${x}`)].join('\n'),
    )
    .join('\n\n');
  const body = absaetze
    .map((a) =>
      typeof a === 'string'
        ? `<p>${esc(a).replace(/\n/g, '<br>')}</p>`
        : `${a.titel ? `<p>${esc(a.titel)}</p>\n` : ''}<ul>${a.liste.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`,
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(BETRIEB)}</title></head>
<body style="font-family: system-ui, sans-serif; color: #2c1403; line-height: 1.5; max-width: 40rem;">
${body}
</body>
</html>
`;
  return { text: bodyText(text), html };
}

function kundenmail(
  config: Config,
  fall: Fall,
  subject: string,
  absaetze: readonly Absatz[],
  attachments: readonly Attachment[] = [],
): OutgoingMail {
  const to = fall.payload.values['email'];
  if (typeof to !== 'string' || !to.trim()) throw Object.assign(new Error('no customer address'), { code: 'no_email' });
  const r = rendern([...absaetze, signatur(config).join('\n')]);
  return {
    kind: 'customer',
    to: to.trim(),
    subject: headerText(subject, 200),
    text: r.text,
    html: r.html,
    replyTo: config.mailFrom,
    bcc: config.ownerEmail,
    attachments,
  };
}

export interface AngebotDaten {
  min: number;
  max: number;
  text: Angebotstext;
}

/**
 * Sentence openers that are not nouns: after „Guten Tag {Name},“ the letter continues in lowercase
 * (German letter convention), so these lose their capital in the mail. „Ihr/Ihre …“ (polite form)
 * and every noun keep theirs. The PDF keeps the text as written (it follows a heading there).
 */
const ANSCHLUSS_KLEIN = new Set([
  'vielen',
  'herzlichen',
  'danke',
  'wir',
  'gern',
  'gerne',
  'schön',
  'besten',
  'haben',
  'nach',
  'mit',
  'für',
  'zu',
  'bei',
  'auf',
  'über',
  'es',
  'das',
  'die',
  'der',
]);

/** The first paragraph after the greeting: a non-noun opener in lowercase, anything else unchanged. */
export function nachAnrede(text: string): string {
  const m = /^(\p{Lu})(\p{L}*)(?![\p{L}\p{N}-])/u.exec(text);
  if (!m || !ANSCHLUSS_KLEIN.has(`${m[1]}${m[2]}`.toLowerCase())) return text;
  return `${m[1]!.toLowerCase()}${text.slice(1)}`;
}

/** §8.1: greeting, einleitung, range „vorbehaltlich Aufmaß“, next step, PDF note, clause. */
export function angebotMail(config: Config, fall: Fall, a: AngebotDaten, pdf: Uint8Array | null): OutgoingMail {
  const v = fall.payload.values;
  const attachments: Attachment[] = pdf
    ? [
        {
          field: 'angebot',
          filename: PDF.dateiname(fall.kurz),
          content: Buffer.from(pdf),
          contentType: 'application/pdf',
        },
      ]
    : [];
  return kundenmail(
    config,
    fall,
    ANGEBOT_MAIL.betreff(projektTitel(v), fall.kurz),
    [
      anrede(kundeName(v)),
      nachAnrede(a.text.einleitung),
      { titel: `${PDF.projekt}:`, liste: projektZusammenfassung(v) },
      ANGEBOT_MAIL.preis(formatEuroRange(a.min, a.max)),
      a.text.naechster_schritt,
      ANGEBOT_MAIL.pdf,
      UNVERBINDLICH,
      ANGEBOT_MAIL.antwort,
    ],
    attachments,
  );
}

/** §8.2 Rückfragen with the (edited) questions. */
export function rueckfragenMail(config: Config, fall: Fall, fragen: readonly string[]): OutgoingMail {
  return kundenmail(config, fall, RUECKFRAGEN_MAIL.betreff(fall.kurz), [
    anrede(kundeName(fall.payload.values)),
    RUECKFRAGEN_MAIL.einleitung,
    { liste: fragen },
    RUECKFRAGEN_MAIL.schluss(SHOP_KONTAKT.telefon),
  ]);
}

/** §8.2 Absage: the template, an optional personal line, optionally the Innung pointer. */
export function absageMail(config: Config, fall: Fall, persoenlich: string | null): OutgoingMail {
  const absaetze: Absatz[] = [anrede(kundeName(fall.payload.values)), ABSAGE_MAIL.text];
  if (persoenlich) absaetze.push(persoenlich);
  if (config.innungHinweis) absaetze.push(ABSAGE_MAIL.innung);
  absaetze.push(ABSAGE_MAIL.schluss);
  return kundenmail(config, fall, ABSAGE_MAIL.betreff(fall.kurz), absaetze);
}
