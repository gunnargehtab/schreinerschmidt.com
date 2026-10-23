// German copy for the customer (docs/angebot.md §8): the Angebot, Rückfragen and Absage mails, the
// signature and the PDF labels. All customer-facing wording lives here, so the copywriter can
// polish it without touching logic.
//
// needs-review (docs/owner-checklist.md "Angebot pilot"): every text below is a pilot draft. The
// owner must approve it, and the non-binding clause (UNVERBINDLICH) and the Absage need the legal
// review, before SEND_MODE=live. The Innung pointer is a placeholder behind INNUNG_HINWEIS (off).
// Rules: sentence case, „…“ quotes, formal „Sie“, U+202F between number and unit, no green claims.
// Every fixed sentence here stays free of amounts, dates, lead times, links and contact data, so it
// can never trip the output guards (claude/guards.ts); the only exceptions are the slots for the
// range, the dates and the confirmed phone.
import { NNBSP } from '../format';

/** needs-review (legal): the non-binding clause of mail and PDF (§8.1). */
export const UNVERBINDLICH =
  'Dieses Angebot ist freibleibend und unverbindlich. Der Preisrahmen beruht allein auf Ihren Angaben im Konfigurator; nach dem Aufmaß vor Ort kann er abweichen. Ein verbindliches Angebot erhalten Sie nach dem Aufmaß.';

/** The range sentence part: „2 450 € bis 3 300 € inkl. 19 % MwSt.“ */
export const inklMwSt = (range: string): string => `${range} inkl. 19${NNBSP}% MwSt.`;

export const VORBEHALT = 'vorbehaltlich Aufmaß';

/** Greeting: the customer's name only as given, else a neutral one. */
export const anrede = (name: string | null): string => (name ? `Guten Tag ${name},` : 'Guten Tag,');

export const GRUSS = 'Mit freundlichen Grüßen';
/** Signature name when the shop's details are not confirmed yet. */
export const BETRIEB = 'Schreinerei Schmidt';

/** Project titles for subjects and the PDF. */
export const TITEL = {
  moebel: (art: string, holz: string | null) => (holz ? `${art} aus ${holz}` : art),
  /** `sonstiges` („Etwas anderes“ reads oddly in a subject). */
  sonstiges: 'Ihr Vorhaben',
} as const;

/** Angebot mail (§8.1). */
export const ANGEBOT_MAIL = {
  betreff: (titel: string, kurz: string) => `Ihr unverbindliches Angebot: ${titel} – ${BETRIEB} (#${kurz})`,
  preis: (range: string) => `Ihr Preisrahmen: ${inklMwSt(range)}, ${VORBEHALT}.`,
  pdf: 'Welche Leistungen enthalten sind, was nicht dazugehört und von welchen Annahmen wir ausgehen, lesen Sie im angehängten Angebot (PDF).',
  antwort: 'Haben Sie Fragen oder Änderungswünsche? Antworten Sie einfach auf diese E-Mail.',
} as const;

/** Rückfragen mail (§8.2). */
export const RUECKFRAGEN_MAIL = {
  betreff: (kurz: string) => `Rückfragen zu Ihrer Anfrage (#${kurz})`,
  einleitung:
    'vielen Dank für Ihre Anfrage über unseren Konfigurator. Wir haben Ihre Angaben durchgesehen. Damit wir Ihnen einen Preisrahmen nennen können, der zu Ihrem Vorhaben passt, haben wir noch ein paar Fragen:',
  schluss: (telefon: string | null) =>
    telefon
      ? `Antworten Sie einfach auf diese E-Mail oder rufen Sie uns an: ${telefon}. Sobald wir Ihre Antworten haben, melden wir uns mit dem Preisrahmen.`
      : 'Antworten Sie einfach auf diese E-Mail. Wenn Sie lieber telefonieren, nennen Sie uns eine Nummer und eine Zeit, die Ihnen passt, dann rufen wir Sie an.',
} as const;

/** Absage mail (§8.2): polite, never the internal reason. needs-review (owner, legal). */
export const ABSAGE_MAIL = {
  betreff: (kurz: string) => `Ihre Anfrage bei der ${BETRIEB} (#${kurz})`,
  text: 'vielen Dank für Ihre Anfrage und Ihr Interesse an unserer Arbeit. Wir haben uns Ihre Angaben angesehen. Leider können wir Ihr Vorhaben nicht übernehmen.',
  /** placeholder (owner to confirm the Innung and its Betriebssuche); only with INNUNG_HINWEIS. */
  innung: 'Einen passenden Fachbetrieb in Ihrer Nähe finden Sie über die Betriebssuche der Schreiner-Innung.',
  schluss:
    'Wir wünschen Ihnen für Ihr Vorhaben alles Gute. Und wenn Sie einmal ein anderes Projekt planen, freuen wir uns, wieder von Ihnen zu hören.',
} as const;

/** Signature lines from confirmed shop details (brief.generated.ts SHOP_KONTAKT). */
export const SIGNATUR = {
  inhaber: (name: string, titel: string | null) => (titel ? `${name}, ${titel}` : name),
  telefon: (nr: string) => `Telefon ${nr}`,
} as const;

/** PDF labels (§8.1). */
export const PDF = {
  titel: 'Unverbindliches Angebot',
  angebotsnummer: 'Angebotsnummer',
  nummerVorschau: 'wird beim Senden vergeben',
  datum: 'Datum',
  vorgang: 'Vorgang',
  fuer: 'Für',
  projekt: 'Ihr Projekt',
  leistungen: 'Leistungen',
  nichtEnthalten: 'Nicht enthalten',
  annahmen: 'Unsere Annahmen',
  preisrahmen: 'Preisrahmen',
  /** Preview only, before the owner entered a range. */
  preisOffen: 'Preisrahmen noch offen',
  gueltig: (bis: string) => `Gültig 30${NNBSP}Tage, bis ${bis}.`,
  vorschau: 'Vorschau',
  seite: (n: number, von: number) => `Seite ${n} von ${von}`,
  dateiname: (kurz: string) => `Angebot-${kurz}.pdf`,
} as const;

/** Days an Angebot is valid (§8.1). */
export const GUELTIG_TAGE = 30;
