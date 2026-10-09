// Soft hyphens for long German compounds in headings (docs/design-system.md §2).
// Headings use `hyphens: manual`, so they break only where this helper inserts U+00AD.
// Build-time only: call it on heading text, never on <title> or meta content.

/** U+00AD SOFT HYPHEN. */
export const SHY = '­';

/**
 * Compound words with `|` at the allowed break points. Matching is case-insensitive and allows
 * inflection suffixes (Holzhandwerks, Schreinermeisterin, umweltbewusste), so list the stem.
 */
export const DICTIONARY: readonly string[] = [
  'Hoch|kant|lamellen|parkett',
  'Altbau|sanierung',
  'Landhaus|dielen',
  'Massiv|dielen',
  'Massiv|holz|dielen',
  'Massiv|holz|möbel',
  'Datenschutz|erklärung',
  'umwelt|bewusst',
  'Holz|handwerk',
  'Schreiner|meister',
  'Schreiner|handwerk',
  'Fisch|grät|parkett',
  'Stab|parkett',
  'Einbau|schrank',
  'Einbau|schränke',
  'Einbau|möbel',
  'Terrassen|dielen',
  'Garten|möbel',
  'Haus|türen',
  'Innen|türen',
  'Holz|fenster',
  'Fenster|sanierung',
  'Treppen|sanierung',
  'Treppen|renovierung',
  'Denkmal|schutz',
  'Meister|betrieb',
  'Wunsch|möbel',
  'Konfigura|tor',
];

interface Entry {
  pattern: RegExp;
  /** Cumulative character offsets of the break points inside the stem. */
  breaks: number[];
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(word: string): Entry {
  const parts = word.normalize('NFC').split('|');
  const breaks: number[] = [];
  let offset = 0;
  for (const part of parts.slice(0, -1)) {
    offset += part.length;
    breaks.push(offset);
  }
  const stem = escape(parts.join(''));
  // Word start (no letter or soft hyphen before), the stem, then any inflection letters.
  const pattern = new RegExp(`(?<![\\p{L}\\u00AD])${stem}(?=[\\p{L}]*)`, 'giu');
  return { pattern, breaks };
}

const ENTRIES: readonly Entry[] = DICTIONARY.map(compile);

function insert(stem: string, breaks: number[]): string {
  let out = '';
  let last = 0;
  for (const at of breaks) {
    out += stem.slice(last, at) + SHY;
    last = at;
  }
  return out + stem.slice(last);
}

/**
 * Insert soft hyphens into every dictionary compound in `text`. Case and inflection are preserved,
 * the result is NFC, and the function is idempotent.
 */
export function shy(text: string): string {
  let out = text.normalize('NFC');
  for (const { pattern, breaks } of ENTRIES) {
    out = out.replace(pattern, (match) => insert(match, breaks));
  }
  return out;
}

/** Remove every soft hyphen, e.g. for <title>, meta tags or JSON-LD. */
export function stripShy(text: string): string {
  return text.replaceAll(SHY, '');
}
