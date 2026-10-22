// Output guards (docs/angebot.md §6.4): code checks on every customer-facing text before it is
// stored. Customer-facing are all Angebotstext fields and Bewertung.rueckfragen (7d may mail them).
// A violation is a code, never the text: the caller logs codes and retries once with a corrective
// note, then falls back to the neutral template (templates.ts).
//
// The text is normalised before matching, so Unicode tricks do not slip through: NFKC (full-width
// „１０００ €“ and superscript digits become ASCII), format characters removed (zero-width spaces,
// joiners, soft hyphens, BOM), every space-like character (NBSP, U+202F, …) a plain space, and the
// odd full stops (。｡．) a dot. Digits are matched as \p{Nd}, so digits of other scripts count too.
import { LIST_LIMITS, TEXT_LIMITS, type Angebotstext } from './schemas';

export type Verstoss =
  /** A number next to €, EUR or Euro (also a number word: „tausend Euro“). */
  | 'betrag'
  /** A percentage („10 % Rabatt“). */
  | 'prozent'
  | 'url'
  | 'email'
  | 'telefon'
  /** dd.mm.(yy)yy, ISO, a day with a month name, „KW 12“, weekday + date, month + year. */
  | 'datum'
  /** A lead time („in 3 Wochen“, „2 Werktage“). */
  | 'frist'
  /** umweltfreundlich, nachhaltig, ökologisch, natürlich and inflections (CLAUDE.md hard rule). */
  | 'gruen'
  | 'laenge'
  | 'leer';

export const VERSTOESSE: readonly Verstoss[] = [
  'betrag',
  'prozent',
  'url',
  'email',
  'telefon',
  'datum',
  'frist',
  'gruen',
  'laenge',
  'leer',
];

/** Normalises a text for matching (never for output). */
export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\p{Zs}\t]/gu, ' ')
    .replace(/[。｡．]/g, '.');
}

const D = '\\p{Nd}';
/** Not preceded by a letter or digit (JS \b only knows ASCII letters, so „ökologisch“ needs this). */
const START = '(?<![\\p{L}\\p{Nd}])';
const END = '(?![\\p{L}\\p{Nd}])';
const re = (src: string): RegExp => new RegExp(src, 'iu');

const NUMBER_WORDS =
  'ein|eine|einen|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf|zwanzig|dreißig|dreissig|vierzig|fünfzig|fuenfzig|hundert|tausend|million|millionen';
const CURRENCY = `(?:€|${START}eur${END}|${START}euros?${END})`;
const MONTHS =
  'januar|jan|jänner|februar|feb|märz|maerz|mär|mrz|april|apr|mai|juni|jun|juli|jul|august|aug|september|sept|sep|oktober|okt|november|nov|dezember|dez';
const WEEKDAYS = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag';
/** Two-letter weekdays only with their dot („So., 12.“): „so 2 Fachböden“ is no date. */
const WEEKDAY_ABBR = 'mo|di|mi|do|fr|sa|so';
const TLDS =
  'de|com|net|org|eu|info|biz|io|co|at|ch|nl|fr|it|es|pl|uk|us|ru|cn|shop|online|site|store|app|xyz|me|tv|cc|ly|gl|to|link|club|top';

const RULES: readonly (readonly [Verstoss, RegExp])[] = [
  ['betrag', re(`${D}[${D}.,' ]*\\s*(?:-\\s*)?${CURRENCY}`)],
  ['betrag', re(`${CURRENCY}\\s*${D}`)],
  ['betrag', re(`${START}(?:${NUMBER_WORDS})\\s*${CURRENCY}`)],
  ['betrag', re(`${D}\\s*,-`)],
  ['prozent', re(`${D}\\s*(?:%|prozent${END})`)],
  ['url', re(`${START}(?:https?|ftp)\\s*:\\s*\\/\\/`)],
  ['url', re(`${START}www\\s*\\.`)],
  ['url', re(`${START}[\\p{L}${D}-]+(?:\\.[\\p{L}${D}-]+)*\\.(?:${TLDS})${END}`)],
  ['url', re(`${START}[\\p{L}${D}-]+\\s*[([]?\\s*(?:punkt|dot)\\s*[)\\]]?\\s*(?:${TLDS})${END}`)],
  ['email', re(`[\\p{L}${D}._%+-]\\s*@\\s*[\\p{L}${D}]`)],
  ['email', re(`[\\p{L}${D}]\\s*[([]\\s*at\\s*[)\\]]\\s*[\\p{L}${D}]`)],
  // dd.mm. with an optional year; ISO; a day with a month name; month name + year
  ['datum', re(`${START}${D}{1,2}\\s*\\.\\s*${D}{1,2}\\s*\\.(?:\\s*${D}{2,4})?`)],
  ['datum', re(`${START}${D}{1,2}\\/${D}{1,2}\\/${D}{2,4}${END}`)],
  ['datum', re(`${START}${D}{4}-${D}{1,2}-${D}{1,2}${END}`)],
  ['datum', re(`${START}${D}{1,2}\\s*\\.?\\s*(?:${MONTHS})${END}`)],
  ['datum', re(`${START}(?:${MONTHS})\\.?\\s*${D}{2,4}${END}`)],
  ['datum', re(`${START}(?:kw|kalenderwoche)\\s*\\.?\\s*${D}{1,2}${END}`)],
  ['datum', re(`${START}(?:${WEEKDAYS})${END}\\.?\\s*,?\\s*(?:den\\s+)?${D}{1,2}${END}`)],
  ['datum', re(`${START}(?:${WEEKDAY_ABBR})\\.\\s*,?\\s*(?:den\\s+)?${D}{1,2}${END}`)],
  [
    'frist',
    re(
      `${START}${D}+(?:\\s*(?:[-–—]|bis)\\s*${D}+)?\\s*(?:(?:arbeits|werk|kalender)?tag(?:en?)?|wochen?|monat(?:en?)?|stunden?)${END}`,
    ),
  ],
  [
    'frist',
    re(
      `${START}(?:ein|eine|einer|einem|zwei|drei|vier|fünf|sechs|acht|zehn|zwölf)\\s+(?:(?:arbeits|werk|kalender)?tag(?:en?)?|wochen?|monat(?:en?)?)${END}`,
    ),
  ],
  ['gruen', re(`${START}(?:umweltfreundlich|nachhaltig|ökologisch|oekologisch|natürlich|natuerlich)`)],
  ['gruen', re(`${START}(?:umweltschonend|klimaneutral|co2-neutral|ressourcenschonend)`)],
];

/** Phone-like runs: digits with spaces, +, /, (, ), . or -; six or more digits make a phone number. */
const PHONE_RUN = new RegExp(`\\+?[${D}][${D} ()/.\\-]{4,}[${D}]`, 'gu');
const DIGIT = new RegExp(D, 'gu');

/** A run that is a numeric date (dd.mm.yyyy, ISO) counts as `datum` only. */
const DATE_RUN = new RegExp(`^(?:${D}{1,2}\\.${D}{1,2}\\.${D}{2,4}|${D}{4}-${D}{1,2}-${D}{1,2})$`, 'u');

function hasPhone(t: string): boolean {
  for (const m of t.matchAll(PHONE_RUN)) {
    if (DATE_RUN.test(m[0].trim())) continue;
    if ((m[0].match(DIGIT)?.length ?? 0) >= 6) return true;
  }
  return false;
}

/** The violations of one text (empty: clean). Length is checked by the record checks below. */
export function pruefeText(text: string): Verstoss[] {
  const t = normalise(text);
  const out = new Set<Verstoss>();
  for (const [code, rx] of RULES) if (!out.has(code) && rx.test(t)) out.add(code);
  if (hasPhone(t)) out.add('telefon');
  return VERSTOESSE.filter((v) => out.has(v));
}

const sortiert = (s: Set<Verstoss>): Verstoss[] => VERSTOESSE.filter((v) => s.has(v));

function pruefeListe(list: readonly string[], max: number, out: Set<Verstoss>): void {
  if (list.length > max) out.add('laenge');
  for (const x of list) {
    if (x.length > TEXT_LIMITS.item) out.add('laenge');
    if (!x.trim()) out.add('leer');
    for (const v of pruefeText(x)) out.add(v);
  }
}

/** All violations of an Angebotstext (all four fields are customer-facing). */
export function pruefeAngebotstext(a: Angebotstext): Verstoss[] {
  const out = new Set<Verstoss>();
  for (const [field, max] of [
    [a.einleitung, TEXT_LIMITS.einleitung],
    [a.naechster_schritt, TEXT_LIMITS.naechster_schritt],
  ] as const) {
    if (!field.trim()) out.add('leer');
    if (field.length > max) out.add('laenge');
    for (const v of pruefeText(field)) out.add(v);
  }
  pruefeListe(a.leistung, LIST_LIMITS.leistung, out);
  pruefeListe(a.nicht_enthalten, LIST_LIMITS.nicht_enthalten, out);
  return sortiert(out);
}

/** Violations of Bewertung.rueckfragen (questions that may be mailed to the customer in 7d). */
export function pruefeRueckfragen(rueckfragen: readonly string[]): Verstoss[] {
  const out = new Set<Verstoss>();
  pruefeListe(rueckfragen, LIST_LIMITS.rueckfragen, out);
  return sortiert(out);
}

/** Only the clean questions (the fallback when the retry still has violations). */
export const saubereRueckfragen = (rueckfragen: readonly string[]): string[] =>
  rueckfragen
    .filter((q) => q.trim() && q.length <= TEXT_LIMITS.item && pruefeText(q).length === 0)
    .slice(0, LIST_LIMITS.rueckfragen);
