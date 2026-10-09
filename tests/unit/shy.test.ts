import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DICTIONARY, SHY, shy, stripShy } from '~/lib/shy';

const required = [
  'Hoch|kant|lamellen|parkett',
  'Altbau|sanierung',
  'Landhaus|dielen',
  'Massiv|dielen',
  'Datenschutz|erklärung',
  'umwelt|bewusst',
  'Holz|handwerk',
  'Schreiner|meister',
];

describe('shy dictionary', () => {
  it('contains the compounds the design system names', () => {
    for (const word of required) expect(DICTIONARY).toContain(word);
  });

  it('has no duplicate stems and only letters and separators', () => {
    const stems = DICTIONARY.map((w) => w.replaceAll('|', '').toLowerCase());
    expect(new Set(stems).size).toBe(stems.length);
    for (const word of DICTIONARY) expect(word).toMatch(/^\p{L}+(\|\p{L}+)+$/u);
  });
});

describe('shy()', () => {
  it('inserts soft hyphens at the dictionary break points', () => {
    expect(shy('Hochkantlamellenparkett')).toBe(`Hoch${SHY}kant${SHY}lamellen${SHY}parkett`);
    expect(shy('Datenschutzerklärung')).toBe(`Datenschutz${SHY}erklärung`);
  });

  it('keeps case and inflection suffixes', () => {
    expect(shy('Ihr Experte für umweltbewusstes Holzhandwerk')).toBe(
      `Ihr Experte für umwelt${SHY}bewusstes Holz${SHY}handwerk`,
    );
    expect(shy('Schreinermeisterin')).toBe(`Schreiner${SHY}meisterin`);
    expect(shy('HOLZHANDWERK')).toBe(`HOLZ${SHY}HANDWERK`);
  });

  it('matches whole words only, not inside other words', () => {
    expect(shy('Rohholzhandwerk')).toBe('Rohholzhandwerk');
    expect(shy('Altbau')).toBe('Altbau');
  });

  it('handles punctuation, quotes and line breaks around words', () => {
    expect(shy('„Landhausdielen“, Massivdielen.\nAltbausanierung')).toBe(
      `„Landhaus${SHY}dielen“, Massiv${SHY}dielen.\nAltbau${SHY}sanierung`,
    );
  });

  it('normalises to NFC before matching', () => {
    const nfd = 'Datenschutzerklärung';
    expect(shy(nfd)).toBe(`Datenschutz${SHY}erklärung`);
  });

  it('leaves text without dictionary words unchanged', () => {
    expect(shy('Böden')).toBe('Böden');
    expect(shy('')).toBe('');
  });

  it('is idempotent', () => {
    for (const word of DICTIONARY) {
      const once = shy(word.replaceAll('|', ''));
      expect(shy(once)).toBe(once);
    }
  });
});

describe('stripShy()', () => {
  it('removes every soft hyphen', () => {
    expect(stripShy(`Holz${SHY}hand${SHY}werk`)).toBe('Holzhandwerk');
  });

  it('inverts shy() for arbitrary NFC text (property)', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme' }), (s) => {
        const nfc = s.normalize('NFC');
        fc.pre(!nfc.includes(SHY));
        expect(stripShy(shy(nfc))).toBe(nfc);
      }),
    );
  });

  it('shy() only ever adds soft hyphens (property)', () => {
    const words = DICTIONARY.map((w) => w.replaceAll('|', ''));
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constantFrom(...words), fc.string({ unit: 'grapheme' })), { maxLength: 6 }),
        (parts) => {
          const text = parts.join(' ').normalize('NFC');
          fc.pre(!text.includes(SHY));
          const out = shy(text);
          expect(out.replaceAll(SHY, '')).toBe(text);
          expect(out.length).toBeGreaterThanOrEqual(text.length);
        },
      ),
    );
  });
});
