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
  /**
   * A number next to €, EUR or Euro, glued or spaced („1200EUR“, „EUR1200“), a number word
   * („zwölfhundert Euro“, „2 Tsd. Euro“), „1.200,-“/„1.200.-“, or a number after a price word
   * („Preis: 1.200“, „kostet 1200“).
   */
  | 'betrag'
  /** A percentage („10 % Rabatt“, „zehn Prozent“). */
  | 'prozent'
  | 'url'
  | 'email'
  | 'telefon'
  /**
   * dd.mm.(yy)yy, ISO, a day with a month name, „KW 12“, weekday + date, month + year; without
   * digits „im Mai“, „am Montag“; a season or part of a year with a year („Ende 2026“, „Q3 2027“).
   */
  | 'datum'
  /** A lead time („in 3 Wochen“, „2 Werktage“, „nächste Woche“, „in wenigen Tagen“, „zeitnah“). */
  | 'frist'
  /**
   * umweltfreundlich, nachhaltig, ökologisch, natürlich and inflections (CLAUDE.md hard rule), and
   * their synonyms (klimafreundlich, schadstofffrei, naturbelassen, Öko-/Bio-, FSC/PEFC …).
   */
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
  'ein|eine|einen|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf|zwanzig|dreißig|dreissig|vierzig|fünfzig|fuenfzig|sechzig|siebzig|achtzig|neunzig|hundert|tausend|million|millionen';
/** Any number word: the list above, or a compound with hundert/tausend/million („zwölfhundert“). */
const NUMBER_WORD = `(?:${NUMBER_WORDS}|\\p{L}*(?:hundert|tausend|million)\\p{L}*|\\p{L}+(?:zig|ßig|ssig|zehn))`;
/** Currency after a number: also glued to it („1200EUR“, „1200Euro“). */
const CUR_AFTER = `(?:€|eur(?:os?)?${END})`;
/** Currency before a number: also glued to it („EUR1200“). */
const CUR_BEFORE = `(?:€|${START}eur(?:os?)?)`;
/** Words that introduce a price; a number after them is an amount even without a currency. */
const PRICE_WORDS =
  'preis|preise|gesamtpreis|endpreis|festpreis|pauschalpreis|aufpreis|kostet|kosten|betrag|gesamtbetrag|beträgt|betragen|summe|gesamtsumme|pauschal';
const PRICE_BRIDGE =
  '(?:\\s*[:=]?\\s*(?:von|ca\\.?|circa|zirka|rund|etwa|nur|ab|bei|liegt|liegen|insgesamt|lediglich)?)*';

const MONTHS_FULL = 'januar|jänner|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember';
const MONTHS = `${MONTHS_FULL}|jan|feb|mär|mrz|apr|jun|jul|aug|sept|sep|okt|nov|dez`;
const WEEKDAYS = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag';
/** Two-letter weekdays only with their dot („So., 12.“): „so 2 Fachböden“ is no date. */
const WEEKDAY_ABBR = 'mo|di|mi|do|fr|sa|so';
const SEASONS = 'anfang|mitte|ende|frühjahr|fruehjahr|frühling|sommer|herbst|winter|quartal|q[1-4]';
/** Units of a lead time; years are left out („30 Jahre alt“ describes the object, not a deadline). */
const TIME_UNITS = '(?:(?:arbeits|werk|kalender)?tag(?:en?)?|wochen?|monat(?:en?)?)';

/** TLDs safe to match in spaced or bracketed forms; German words like „es“ are left out. */
const TLDS_SPACED =
  'de|com|net|org|eu|info|biz|io|at|ch|nl|fr|pl|uk|us|ru|cn|xyz|berlin|hamburg|koeln|bayern|nrw|gmbh|immo|dev|ai|lu|be|dk|se|no|fi|cz|pt';
/** TLDs of the glued form „name.tld“ (no space, so German words cannot collide). */
const TLDS = `${TLDS_SPACED}|co|it|es|shop|online|site|store|app|me|tv|cc|ly|gl|to|link|club|top|haus`;
/** An obfuscated dot: „[.]“, „(.)“, „(punkt)“, „[dot]“, or „ punkt “ / „ dot “ between spaces. */
const OBFUSCATED_DOT = '(?:\\s*[([]\\s*(?:\\.|punkt|dot)\\s*[)\\]]\\s*|\\s+(?:punkt|dot)\\s+)';

const RULES: readonly (readonly [Verstoss, RegExp])[] = [
  ['betrag', re(`${D}[${D}.,' ]*\\s*(?:-\\s*)?${CUR_AFTER}`)],
  ['betrag', re(`${CUR_BEFORE}\\s*${D}`)],
  ['betrag', re(`${START}${NUMBER_WORD}\\s*${CUR_AFTER}`)],
  ['betrag', re(`${D}\\s*(?:tsd|tausend|mio|mill?)\\.?\\s*${CUR_AFTER}`)],
  ['betrag', re(`${D}\\s*,-`)],
  ['betrag', re(`${D}[.,]\\s*[-–](?!\\s*${D})`)],
  ['betrag', re(`${START}(?:${PRICE_WORDS})${END}${PRICE_BRIDGE}\\s*${D}`)],
  ['prozent', re(`${D}\\s*(?:%|prozent${END})`)],
  ['prozent', re(`${START}${NUMBER_WORD}\\s*(?:%|prozent${END})`)],
  ['url', re(`${START}(?:https?|ftp)\\s*:\\s*\\/\\/`)],
  ['url', re(`${START}www\\s*\\.`)],
  ['url', re(`${START}www\\s+[\\p{L}${D}-]+\\s+(?:${TLDS_SPACED})${END}`)],
  ['url', re(`${START}[\\p{L}${D}-]+(?:\\.[\\p{L}${D}-]+)*\\.(?:${TLDS})${END}`)],
  ['url', re(`${START}[\\p{L}${D}-]+${OBFUSCATED_DOT}(?:${TLDS_SPACED})${END}`)],
  ['email', re(`[\\p{L}${D}._%+-]\\s*@\\s*[\\p{L}${D}]`)],
  ['email', re(`[\\p{L}${D}]\\s*[([{]\\s*at\\s*[)\\]}]\\s*[\\p{L}${D}]`)],
  // dd.mm. with an optional year; ISO; a day with a month name; month name + year
  ['datum', re(`${START}${D}{1,2}\\s*\\.\\s*${D}{1,2}\\s*\\.(?:\\s*${D}{2,4})?`)],
  ['datum', re(`${START}${D}{1,2}\\/${D}{1,2}\\/${D}{2,4}${END}`)],
  ['datum', re(`${START}${D}{4}-${D}{1,2}-${D}{1,2}${END}`)],
  ['datum', re(`${START}${D}{1,2}\\s*\\.?\\s*(?:${MONTHS})${END}`)],
  ['datum', re(`${START}(?:${MONTHS})\\.?\\s*${D}{2,4}${END}`)],
  ['datum', re(`${START}(?:kw|kalenderwoche)\\s*\\.?\\s*${D}{1,2}${END}`)],
  ['datum', re(`${START}(?:${WEEKDAYS})${END}\\.?\\s*,?\\s*(?:den\\s+)?${D}{1,2}${END}`)],
  ['datum', re(`${START}(?:${WEEKDAY_ABBR})\\.\\s*,?\\s*(?:den\\s+)?${D}{1,2}${END}`)],
  // without digits: „im Mai“, „ab Freitag“; with a year: „Ende 2026“, „Q3 2027“, „noch 2026“
  ['datum', re(`${START}(?:im|ab|bis|anfang|mitte|ende|vor|nach|seit)\\s+(?:${MONTHS_FULL})${END}`)],
  ['datum', re(`${START}(?:am|ab|bis|vor|nach|nächsten|naechsten|kommenden)\\s+(?:${WEEKDAYS})${END}`)],
  ['datum', re(`${START}(?:${SEASONS})\\s*[/.]?\\s*${D}{4}${END}`)],
  ['datum', re(`${START}(?:bis|noch|ab|im\\s+jahr|zum\\s+jahr)\\s+${D}{4}${END}`)],
  ['frist', re(`${START}${D}+(?:\\s*(?:[-–—]|bis)\\s*${D}+)?\\s*(?:${TIME_UNITS}|stunden?)${END}`)],
  [
    'frist',
    re(
      `${START}(?:ein|eine|einer|einem|zwei|drei|vier|fünf|sechs|acht|zehn|zwölf)\\s+(?:(?:arbeits|werk|kalender)?tag(?:en?)?|wochen?|monat(?:en?)?)${END}`,
    ),
  ],
  // without digits: „morgen“, „nächste Woche“, „in wenigen Tagen“, „zeitnah“, „sofort lieferbar“
  ['frist', re(`${START}(?<!guten\\s)(?:übermorgen|uebermorgen|morgen)${END}`)],
  [
    'frist',
    re(
      `${START}(?:nächst|naechst|kommend|folgend)(?:e|en|er|es|em)?\\s+(?:woche|wochen|monat|monaten?|jahr|jahren?|jahres)${END}`,
    ),
  ],
  ['frist', re(`${START}(?:einige|einigen|wenige|wenigen|mehrere|mehreren|ein\\s+paar|paar)\\s+${TIME_UNITS}${END}`)],
  ['frist', re(`${START}(?:zeitnah|kurzfristig|umgehend)\\p{L}*`)],
  ['frist', re(`${START}sofort\\s+(?:lieferbar|verfügbar|verfuegbar|möglich|moeglich|einsatzbereit)`)],
  ['gruen', re(`${START}(?:umweltfreundlich|nachhaltig|ökologisch|oekologisch|natürlich|natuerlich)`)],
  [
    'gruen',
    re(
      `${START}(?:umweltschonend|umweltverträglich|umweltvertraeglich|umweltbewusst|umweltgerecht|klimaneutral|klimafreundlich|klimaschonend|klimapositiv|co2-neutral|ressourcenschonend|biologisch|schadstofffrei|schadstoffarm|emissionsarm|lösemittelfrei|loesemittelfrei|naturbelassen|nachwachsend)`,
    ),
  ],
  // „öko“ and „bio“ only as a word or a hyphenated prefix („Öko-Lack“), not „Ökonomie“, „Biografie“
  ['gruen', re(`${START}(?:öko|oeko|bio)(?:-|${END})`)],
  ['gruen', re(`${START}(?:fsc|pefc)${END}`)],
];

/** Phone-like runs: digits with spaces, +, /, (, ), . or -. */
const PHONE_RUN = new RegExp(`\\+?\\(?[${D}][${D} ()/.\\-]{4,}[${D}]`, 'gu');
const DIGIT = new RegExp(D, 'gu');

/** A run that is a numeric date (dd.mm.yyyy, ISO) counts as `datum` only. */
const DATE_RUN = new RegExp(`^(?:${D}{1,2}\\.${D}{1,2}\\.${D}{2,4}|${D}{4}-${D}{1,2}-${D}{1,2})$`, 'u');

/**
 * Six or more digits make a phone number when the run starts like one (0, + or „(0“), or when it is
 * at least seven digits in three or more groups split only by spaces or hyphens („621 123 4567“).
 * Measurements and years („120 / 200 / 35“, „1960-1970“, „2026/2027“) are not phone numbers.
 */
function hasPhone(t: string): boolean {
  for (const m of t.matchAll(PHONE_RUN)) {
    const run = m[0].trim();
    if (DATE_RUN.test(run)) continue;
    const digits = run.match(DIGIT)?.length ?? 0;
    if (digits < 6) continue;
    if (/^(?:\+|\(?0)/u.test(run)) return true;
    const groups = run.split(/[ -]+/u);
    if (digits >= 7 && !/[/().]/u.test(run) && groups.length >= 3) return true;
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
