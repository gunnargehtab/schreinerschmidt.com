// Form input of the review page (docs/angebot.md §7.3), parsed and validated on the server (the
// page has no JS). Pure. The range is gross, whole euros, both > 0, min ≤ max. Every customer-facing
// text the owner edits runs through the output guards of claude/guards.ts (pruefeText), with one
// allowance: the shop's own confirmed contact details (phone, e-mail) and the MAIL_FROM address may
// appear, they are masked before the check; any other phone number, address, link, amount, date,
// lead time or green claim is refused with the rule named in the error summary.
import { pruefeText, type Verstoss } from '../claude/guards';
import { LIST_LIMITS, TEXT_LIMITS, type Angebotstext } from '../claude/schemas';
import { SEITE } from '../texte/inhaber';

export type Feld =
  | 'min'
  | 'max'
  | 'einleitung'
  | 'leistung'
  | 'nicht_enthalten'
  | 'naechster_schritt'
  | 'annahmen'
  | 'folge'
  | 'kontakt_art'
  | 'rueckfragen'
  | 'persoenlich'
  | 'grund';

export interface Fehler {
  feld: Feld;
  text: string;
}

export const FELD_LABEL: Readonly<Record<Feld, string>> = {
  min: SEITE.von,
  max: SEITE.bis,
  einleitung: SEITE.einleitung,
  leistung: SEITE.leistung,
  nicht_enthalten: SEITE.nichtEnthalten,
  naechster_schritt: SEITE.naechsterSchritt,
  annahmen: SEITE.annahmenFeld,
  folge: SEITE.folgeLegend,
  kontakt_art: SEITE.kontaktArtLegend,
  rueckfragen: SEITE.rueckfragen,
  persoenlich: SEITE.persoenlich,
  grund: SEITE.grundLegend,
};

export const ABSAGE_GRUENDE = ['nicht_wirtschaftlich', 'nicht_machbar', 'keine_kapazitaet', 'sonstiges'] as const;
export type AbsageGrund = (typeof ABSAGE_GRUENDE)[number];
export type Folge = 'manuell' | 'kontakt' | 'absage';
export type KontaktArt = 'mail' | 'anruf';

/** Upper bound of a range end (gross €); anything above is a typo. */
export const MAX_EURO = 10_000_000;
/** Personal line of an Absage. */
export const PERSOENLICH_MAX = 400;

/** Raw form values as strings (what the page re-renders after an error). */
export type Eingabe = Partial<Record<Feld, string>>;

const FELDER: readonly Feld[] = [
  'min',
  'max',
  'einleitung',
  'leistung',
  'nicht_enthalten',
  'naechster_schritt',
  'annahmen',
  'folge',
  'kontakt_art',
  'rueckfragen',
  'persoenlich',
  'grund',
];

/** The known fields of a urlencoded body (first value; CRLF → LF; capped). */
export function eingabeAus(p: URLSearchParams): Eingabe {
  const out: Eingabe = {};
  for (const f of FELDER) {
    const x = p.get(f);
    if (x !== null) out[f] = x.replace(/\r\n?/g, '\n').slice(0, 8000);
  }
  return out;
}

const PHONE_RUN = /\+?\(?\p{Nd}[\p{Nd} ()/.-]{4,}\p{Nd}/gu;
const digits = (s: string): string => {
  let d = s.replace(/\D/g, '');
  if (/^\s*(?:\+|00)49/.test(s)) d = `0${d.replace(/^(?:00)?49/, '')}`;
  return d;
};
const escapeRx = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The guard violations of an owner's text, with the allowed contact strings masked first: an
 * e-mail address exactly, a phone number by its digits (so „0179 9467822“ matches „+49 179 9467822“).
 */
export function pruefeInhaberText(text: string, erlaubt: readonly string[]): Verstoss[] {
  let t = text.normalize('NFKC');
  const telefone = new Set<string>();
  for (const a of erlaubt) {
    if (a.includes('@')) t = t.replace(new RegExp(escapeRx(a), 'giu'), 'Kontakt');
    else if (/\d/.test(a)) telefone.add(digits(a));
  }
  if (telefone.size) t = t.replace(PHONE_RUN, (m) => (telefone.has(digits(m)) ? 'Kontakt' : m));
  return pruefeText(t);
}

const regelText = (codes: readonly Verstoss[]): string => {
  const words = codes.map((c) => SEITE.regel[c]);
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} und ${words.at(-1)}` : (words[0] ?? '');
};

/** Lines of a list textarea: trimmed, empty lines dropped, list markers („- “, „• “) removed. */
export const zeilen = (s: string | undefined): string[] =>
  (s ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s+/, '').trim())
    .filter(Boolean);

function betrag(s: string | undefined): number | null {
  const t = (s ?? '').replace(/[\s.\u00a0\u202f€]/g, '').replace(/,-?$/, '');
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export type Ergebnis<T> = { ok: true; wert: T } | { ok: false; fehler: Fehler[] };

export interface AngebotEingabe {
  min: number;
  max: number;
  text: Angebotstext;
  /** The Annahmen the customer gets (PDF), as edited by the owner; may be empty. */
  annahmen: string[];
}

/** At most this many Annahmen lines. */
export const ANNAHMEN_MAX = 10;

function textFeld(
  feld: Feld,
  wert: string,
  max: number,
  pflicht: boolean,
  erlaubt: readonly string[],
  fehler: Fehler[],
): void {
  const label = FELD_LABEL[feld];
  if (pflicht && !wert.trim()) {
    fehler.push({ feld, text: SEITE.fehler.leer(label) });
    return;
  }
  if (wert.length > max) fehler.push({ feld, text: SEITE.fehler.laenge(label) });
  const v = pruefeInhaberText(wert, erlaubt);
  if (v.length) fehler.push({ feld, text: SEITE.fehler.regel(label, regelText(v)) });
}

function listenFeld(
  feld: Feld,
  items: readonly string[],
  maxItems: number,
  pflicht: boolean,
  erlaubt: readonly string[],
  fehler: Fehler[],
): void {
  const label = FELD_LABEL[feld];
  if (pflicht && !items.length) {
    fehler.push({ feld, text: feld === 'rueckfragen' ? SEITE.fehler.rueckfragenLeer : SEITE.fehler.leer(label) });
    return;
  }
  if (items.length > maxItems || items.some((x) => x.length > TEXT_LIMITS.item)) {
    fehler.push({ feld, text: SEITE.fehler.laenge(label) });
  }
  const v = new Set<Verstoss>();
  for (const x of items) for (const c of pruefeInhaberText(x, erlaubt)) v.add(c);
  if (v.size) fehler.push({ feld, text: SEITE.fehler.regel(label, regelText([...v])) });
}

/** Freigeben / eigener Preisrahmen: range + the four Angebot text fields. */
export function pruefeAngebot(e: Eingabe, erlaubt: readonly string[]): Ergebnis<AngebotEingabe> {
  const fehler: Fehler[] = [];
  const min = betrag(e.min);
  const max = betrag(e.max);
  if (min === null) fehler.push({ feld: 'min', text: SEITE.fehler.min });
  else if (min > MAX_EURO) fehler.push({ feld: 'min', text: SEITE.fehler.zuGross });
  if (max === null) fehler.push({ feld: 'max', text: SEITE.fehler.max });
  else if (max > MAX_EURO) fehler.push({ feld: 'max', text: SEITE.fehler.zuGross });
  if (min !== null && max !== null && min > max) fehler.push({ feld: 'min', text: SEITE.fehler.reihenfolge });
  const text: Angebotstext = {
    einleitung: (e.einleitung ?? '').trim(),
    leistung: zeilen(e.leistung),
    nicht_enthalten: zeilen(e.nicht_enthalten),
    naechster_schritt: (e.naechster_schritt ?? '').trim(),
  };
  textFeld('einleitung', text.einleitung, TEXT_LIMITS.einleitung, true, erlaubt, fehler);
  listenFeld('leistung', text.leistung, LIST_LIMITS.leistung, true, erlaubt, fehler);
  listenFeld('nicht_enthalten', text.nicht_enthalten, LIST_LIMITS.nicht_enthalten, false, erlaubt, fehler);
  textFeld('naechster_schritt', text.naechster_schritt, TEXT_LIMITS.naechster_schritt, true, erlaubt, fehler);
  const annahmen = zeilen(e.annahmen);
  listenFeld('annahmen', annahmen, ANNAHMEN_MAX, false, erlaubt, fehler);
  if (fehler.length || min === null || max === null) return { ok: false, fehler };
  return { ok: true, wert: { min, max, text, annahmen } };
}

export type Ablehnung =
  | { folge: 'manuell' }
  | { folge: 'kontakt'; art: 'anruf' }
  | { folge: 'kontakt'; art: 'mail'; fragen: string[] }
  | { folge: 'absage'; grund: AbsageGrund; persoenlich: string | null };

/** Ablehnen with its follow-up (§7.3). */
export function pruefeAblehnung(e: Eingabe, erlaubt: readonly string[]): Ergebnis<Ablehnung> {
  const fehler: Fehler[] = [];
  const folge = e.folge;
  if (folge === 'manuell') return { ok: true, wert: { folge } };
  if (folge === 'kontakt') {
    if (e.kontakt_art === 'anruf') return { ok: true, wert: { folge, art: 'anruf' } };
    if (e.kontakt_art !== 'mail')
      return { ok: false, fehler: [{ feld: 'kontakt_art', text: SEITE.fehler.kontaktArt }] };
    const fragen = zeilen(e.rueckfragen);
    listenFeld('rueckfragen', fragen, LIST_LIMITS.rueckfragen, true, erlaubt, fehler);
    return fehler.length ? { ok: false, fehler } : { ok: true, wert: { folge, art: 'mail', fragen } };
  }
  if (folge === 'absage') {
    const grund = ABSAGE_GRUENDE.find((g) => g === e.grund);
    if (!grund) fehler.push({ feld: 'grund', text: SEITE.fehler.grund });
    const persoenlich = (e.persoenlich ?? '').trim();
    if (persoenlich) textFeld('persoenlich', persoenlich, PERSOENLICH_MAX, false, erlaubt, fehler);
    if (fehler.length || !grund) return { ok: false, fehler };
    return { ok: true, wert: { folge, grund, persoenlich: persoenlich || null } };
  }
  return { ok: false, fehler: [{ feld: 'folge', text: SEITE.fehler.folge }] };
}

/** The Eingabe that pre-fills the Angebot form from a stored text and range. */
export function eingabeVon(
  text: Angebotstext,
  min: number | null,
  max: number | null,
  annahmen: readonly string[],
): Eingabe {
  return {
    min: min === null ? '' : String(min),
    max: max === null ? '' : String(max),
    einleitung: text.einleitung,
    leistung: text.leistung.join('\n'),
    nicht_enthalten: text.nicht_enthalten.join('\n'),
    naechster_schritt: text.naechster_schritt,
    annahmen: annahmen.join('\n'),
  };
}
