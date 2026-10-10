// Summary text, sections, subject line and short id (docs/configurator.md §3 "Summary sidebar",
// §5 "Payload"): the pure parts of summary.ts and submit.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { STEPS, type StepId } from '../../../src/lib/configurator/fields';
import { shortId, subjectLine } from '../../../src/scripts/configurator/submit';
import { toSections, toText, type Item } from '../../../src/scripts/configurator/summary';

const NNBSP = ' ';
const TITLES: Record<StepId, string> = {
  projekt: 'Projekt',
  details: 'Möbel & Maße',
  ausfuehrung: 'Holz & Oberfläche',
  rahmen: 'Zeitraum, Budget & Ort',
  kontakt: 'Kontakt',
  pruefen: 'Prüfen & senden',
};
const title = (s: StepId) => TITLES[s];

const regal: Item[] = [
  { name: 'typ', label: 'Projektart', value: 'Möbel nach Maß', step: 'projekt' },
  { name: 'moebel_art', label: 'Welches Möbel', value: 'Regal', step: 'details' },
  { name: 'moebel_breite', label: 'Breite in cm', value: `120${NNBSP}cm`, step: 'details' },
  { name: 'moebel_hoehe', label: 'Höhe in cm', value: `200${NNBSP}cm`, step: 'details' },
  { name: 'moebel_tiefe', label: 'Tiefe in cm', value: `35${NNBSP}cm`, step: 'details' },
  { name: 'moebel_staerke', label: 'Materialstärke', value: `19${NNBSP}mm`, step: 'details' },
  { name: 'moebel_holz', label: 'Holzart', value: 'Eiche', step: 'ausfuehrung' },
  { name: 'plz', label: 'Postleitzahl des Objekts', value: '68161', step: 'rahmen' },
  { name: 'ort', label: 'Ort', value: 'Mannheim', step: 'rahmen' },
  { name: 'name', label: 'Name', value: 'Erika Mustermann', step: 'kontakt' },
  { name: 'email', label: 'E-Mail', value: 'erika@example.com', step: 'kontakt' },
];

describe('toSections / toText', () => {
  it('groups the items by step in step order and drops empty steps', () => {
    const sections = toSections(regal, title);
    expect(sections.map((s) => s.step)).toEqual(['projekt', 'details', 'ausfuehrung', 'rahmen', 'kontakt']);
    expect(sections[1]).toEqual({
      step: 'details',
      title: 'Möbel & Maße',
      lines: [
        'Welches Möbel: Regal',
        `Breite in cm: 120${NNBSP}cm`,
        `Höhe in cm: 200${NNBSP}cm`,
        `Tiefe in cm: 35${NNBSP}cm`,
        `Materialstärke: 19${NNBSP}mm`,
      ],
    });
    expect(toSections([], title)).toEqual([]);
  });

  it('renders one block per step with a blank line between them', () => {
    const text = toText(toSections(regal.slice(0, 2), title));
    expect(text).toBe('Projekt\nProjektart: Möbel nach Maß\n\nMöbel & Maße\nWelches Möbel: Regal');
    expect(toText([])).toBe('');
  });

  it('keeps every item exactly once, in the order given, for any item list', () => {
    const item = fc.record({
      name: fc.stringMatching(/^[a-z_]{1,12}$/),
      label: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\n')),
      value: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\n')),
      step: fc.constantFrom(...STEPS),
    });
    fc.assert(
      fc.property(fc.array(item, { maxLength: 30 }), (items) => {
        const lines = toSections(items, title).flatMap((s) => s.lines);
        expect(lines).toEqual(
          STEPS.flatMap((step) => items.filter((i) => i.step === step).map((i) => `${i.label}: ${i.value}`)),
        );
        expect(
          toText(toSections(items, title))
            .split('\n')
            .filter((l) => l !== ''),
        ).toHaveLength(lines.length + new Set(items.map((i) => i.step)).size);
      }),
    );
  });
});

describe('subjectLine', () => {
  it('reads "Anfrage <short type>: <art> <b×h×t> – <plz> <ort> – #<id>" (spec §5)', () => {
    expect(subjectLine(regal, '7F3K', 'moebel')).toBe('Anfrage Möbel: Regal 120×200×35 – 68161 Mannheim – #7F3K');
  });

  it('falls back to the card label without a known type', () => {
    expect(subjectLine(regal, '7F3K')).toBe('Anfrage Möbel nach Maß: Regal 120×200×35 – 68161 Mannheim – #7F3K');
    expect(subjectLine(regal, '7F3K', 'nope')).toContain('Anfrage Möbel nach Maß:');
  });

  it('leaves out what is missing', () => {
    expect(subjectLine([regal[0]!], 'A1B2', 'moebel')).toBe('Anfrage Möbel – #A1B2');
    expect(subjectLine([regal[0]!, regal[7]!], 'A1B2', 'moebel')).toBe('Anfrage Möbel – 68161 – #A1B2');
    const boden: Item[] = [
      { name: 'typ', label: 'Projektart', value: 'Boden', step: 'projekt' },
      { name: 'boden_leistung', label: 'Was ist geplant', value: 'Neuer Boden', step: 'details' },
      { name: 'boden_flaeche', label: 'Fläche ca. in m²', value: `42,5${NNBSP}m²`, step: 'details' },
    ];
    expect(subjectLine(boden, 'ZZ99', 'boden')).toBe('Anfrage Boden: Neuer Boden – #ZZ99');
    const tuer: Item[] = [{ name: 'typ', label: 'Projektart', value: 'Türen', step: 'projekt' }];
    expect(subjectLine(tuer, 'ZZ99', 'tuer')).toBe('Anfrage Tür – #ZZ99');
  });

  it('never contains a line break and uses at most three dimensions', () => {
    const item = fc.record({
      name: fc.constantFrom(
        'typ',
        'moebel_art',
        'moebel_breite',
        'moebel_hoehe',
        'moebel_tiefe',
        'tisch_laenge',
        'plz',
        'ort',
      ),
      label: fc.constant('L'),
      value: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/[\n×–]/.test(s)),
      step: fc.constantFrom(...STEPS),
    });
    fc.assert(
      fc.property(fc.array(item, { maxLength: 12 }), fc.stringMatching(/^[A-Z0-9]{4}$/), (items, id) => {
        const s = subjectLine(items, id);
        expect(s).not.toMatch(/\n/);
        expect(s.startsWith('Anfrage ')).toBe(true);
        expect(s.endsWith(`#${id}`)).toBe(true);
        expect((s.split(' – ')[0]!.match(/×/g) ?? []).length).toBeLessThanOrEqual(2);
      }),
    );
  });
});

describe('shortId', () => {
  it('turns a UUID into four A–Z/0–9 characters, deterministically', () => {
    const id = shortId('3b241101-e2bb-4255-8caf-4136c566a962');
    expect(id).toMatch(/^[A-Z0-9]{4}$/);
    expect(shortId('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(id);
    expect(shortId('nope')).toBe('');
  });

  it('is four characters for every UUID', () => {
    fc.assert(
      fc.property(fc.uuid(), (u) => {
        expect(shortId(u)).toMatch(/^[A-Z0-9]{4}$/);
      }),
    );
  });
});
