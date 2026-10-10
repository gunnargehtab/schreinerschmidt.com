// German messages and cross-field rules (docs/configurator.md §3 "Validation", §7 "Validate").
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ART_RANGES, FIELDS, type Values } from '../../../src/lib/configurator/fields';
import { MAIL, MSG, num } from '../../../src/scripts/configurator/messages.de';
import {
  controlMessage,
  crossErrors,
  parseDecimal,
  type ControlLike,
} from '../../../src/scripts/configurator/validate';

const NNBSP = ' ';
const label = (name: string) => `Label ${name}`;
const ctx = { today: '2026-10-10', label };

const control = (patch: Partial<ControlLike>): ControlLike => ({
  name: 'x',
  type: 'text',
  label: 'Feld',
  validity: {},
  ...patch,
});

describe('messages.de', () => {
  const samples = [
    MSG.missing('Postleitzahl des Objekts'),
    MSG.choose('Welches Möbel?'),
    MSG.confirm('Nische hat eine Dachschräge'),
    MSG.atLeastOne('Was ist geplant?'),
    MSG.min('Breite', 40, 'cm'),
    MSG.max('Breite', 400, 'cm'),
    MSG.min('Anzahl', 1),
    MSG.between('Breite', 80, 280, 'cm'),
    MSG.tooShort('Was dürfen wir bauen?', 10),
    MSG.tooLong('Nachricht', 2000),
    ...Object.values(MSG).filter((m) => typeof m === 'string'),
  ];

  it.each(samples)('"%s" is a German sentence', (text) => {
    expect(text).toMatch(/^[A-ZÄÖÜ„]/);
    expect(text).toMatch(/\.$/);
    expect(text).not.toMatch(/["']/);
    expect(text).not.toMatch(/\s{2,}/);
    expect(text).not.toMatch(/\d (cm|mm|m²|lfm)\b/);
  });

  it('drops a trailing question mark from the label and quotes it', () => {
    expect(MSG.choose('Welches Möbel?')).toBe('Bitte wählen Sie eine Option bei „Welches Möbel“.');
    expect(MSG.missing('Postleitzahl des Objekts')).toBe('Bitte geben Sie „Postleitzahl des Objekts“ an.');
  });

  it('uses U+202F before the unit and a decimal comma', () => {
    expect(MSG.min('Breite', 40, 'cm')).toBe(`Breite muss mindestens 40${NNBSP}cm betragen.`);
    expect(MSG.between('Fläche', 1, 2000, 'm²')).toBe(`Fläche muss zwischen 1 und 2000${NNBSP}m² liegen.`);
    expect(MSG.min('Anzahl', 1)).toBe('Anzahl muss mindestens 1 betragen.');
    expect(num(12.5)).toBe('12,5');
    expect(MSG.baumkante).toBe(`Eine Baumkante braucht eine Plattenstärke von mindestens 40${NNBSP}mm.`);
    expect(MSG.plz).toBe('Die Postleitzahl hat 5 Ziffern.');
    expect(MSG.email).toContain('z. B. name@beispiel.de');
    expect(MAIL.truncated).toBe('[gekürzt – vollständige Angaben über den Konfigurationslink]');
  });
});

describe('parseDecimal', () => {
  it('reads German and English decimals', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal(' 1 234,50 ')).toBe(1234.5);
    expect(parseDecimal('7')).toBe(7);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('12,5,1')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1e3')).toBeNaN();
  });

  it('round-trips any finite number with up to two decimals', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999999 }), fc.integer({ min: 0, max: 99 }), (i, d) => {
        const s = `${i},${String(d).padStart(2, '0')}`;
        expect(parseDecimal(s)).toBeCloseTo(i + d / 100, 10);
      }),
    );
  });
});

describe('controlMessage', () => {
  it('returns nothing for valid controls', () => {
    expect(controlMessage(control({ validity: { valid: true } }))).toBe('');
    expect(controlMessage(control({ validity: {} }))).toBe('');
    expect(controlMessage(control({ validity: { valid: false } }))).toBe('');
  });

  it.each<[Partial<ControlLike>, string]>([
    [{ validity: { valueMissing: true }, label: 'Name' }, MSG.missing('Name')],
    [{ validity: { valueMissing: true }, type: 'radio', label: 'Welches Möbel?' }, MSG.choose('Welches Möbel?')],
    [{ validity: { valueMissing: true }, type: 'select-one', label: 'Budget' }, MSG.choose('Budget')],
    [{ validity: { valueMissing: true }, type: 'checkbox', label: 'RC2' }, MSG.confirm('RC2')],
    [{ validity: { typeMismatch: true }, type: 'email' }, MSG.email],
    [{ validity: { typeMismatch: true }, type: 'url' }, MSG.pattern],
    [{ validity: { patternMismatch: true }, name: 'plz' }, MSG.plz],
    [{ validity: { patternMismatch: true }, autocomplete: 'postal-code' }, MSG.plz],
    [{ validity: { patternMismatch: true }, type: 'tel' }, MSG.tel],
    [{ validity: { patternMismatch: true }, inputMode: 'decimal' }, MSG.decimal],
    [{ validity: { patternMismatch: true } }, MSG.pattern],
    [{ validity: { badInput: true }, type: 'number' }, MSG.integer],
    [{ validity: { badInput: true }, type: 'date' }, MSG.date],
    [{ validity: { badInput: true }, type: 'text' }, MSG.pattern],
    [
      { validity: { rangeUnderflow: true }, type: 'number', label: 'Breite in cm', min: '40', unit: 'cm' },
      MSG.min('Breite in cm', 40, 'cm'),
    ],
    [{ validity: { rangeUnderflow: true }, type: 'number', label: 'Stufen', min: 2 }, MSG.min('Stufen', 2)],
    [{ validity: { rangeUnderflow: true }, type: 'date', label: 'Termin', min: '2026-10-10' }, MSG.datePast],
    [
      { validity: { rangeOverflow: true }, type: 'number', label: 'Höhe', max: '320', unit: 'cm' },
      MSG.max('Höhe', 320, 'cm'),
    ],
    [{ validity: { stepMismatch: true }, type: 'number' }, MSG.integer],
    [{ validity: { tooShort: true }, label: 'Text', minLength: 10 }, MSG.tooShort('Text', 10)],
    [{ validity: { tooShort: true }, label: 'Text' }, MSG.tooShort('Text', 0)],
    [{ validity: { tooLong: true }, label: 'Text', maxLength: 2000 }, MSG.tooLong('Text', 2000)],
    [{ validity: { customError: true }, validationMessage: 'Eigene Meldung.' }, 'Eigene Meldung.'],
    [{ validity: { customError: true } }, MSG.pattern],
  ])('%j → %s', (patch, expected) => {
    expect(controlMessage(control(patch))).toBe(expected);
  });

  it('prefers valueMissing over format flags', () => {
    expect(controlMessage(control({ validity: { valueMissing: true, patternMismatch: true }, name: 'plz' }))).toBe(
      MSG.missing('Feld'),
    );
  });
});

describe('crossErrors', () => {
  it('requires at least one checkbox in a required group', () => {
    expect(crossErrors({ typ: 'fenster' }, 'details', ctx)).toEqual([
      { name: 'fenster_leistung', message: MSG.atLeastOne(label('fenster_leistung')) },
    ]);
    expect(crossErrors({ typ: 'fenster', fenster_leistung: [] }, 'details', ctx)).toHaveLength(1);
    expect(crossErrors({ typ: 'fenster', fenster_leistung: ['neu'] }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ typ: 'fenster', fenster_leistung: 'neu' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ typ: 'altbau' }, 'details', ctx)[0]?.name).toBe('altbau_bereiche');
    // Groups of other branches and other steps do not count.
    expect(crossErrors({ typ: 'boden' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ typ: 'fenster' }, 'ausfuehrung', ctx)).toEqual([]);
  });

  it('Baumkante needs a top of at least 40 mm', () => {
    const base: Values = { typ: 'moebel', moebel_art: 'esstisch', tisch_kante: 'baumkante' };
    expect(crossErrors({ ...base, tisch_platte: '25' }, 'details', ctx)).toEqual([
      { name: 'tisch_platte', message: MSG.baumkante },
    ]);
    expect(crossErrors(base, 'details', ctx)).toEqual([{ name: 'tisch_platte', message: MSG.baumkante }]);
    expect(crossErrors({ ...base, tisch_platte: '40' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ ...base, tisch_platte: '60' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ ...base, tisch_kante: 'gerade', tisch_platte: '25' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ ...base, moebel_art: 'regal', tisch_platte: '25' }, 'details', ctx)).toEqual([]);
  });

  it('termin must not be before today', () => {
    expect(crossErrors({ termin: '2026-10-09' }, 'rahmen', ctx)).toEqual([{ name: 'termin', message: MSG.datePast }]);
    expect(crossErrors({ termin: '2026-10-10' }, 'rahmen', ctx)).toEqual([]);
    expect(crossErrors({ termin: '2027-01-01' }, 'rahmen', ctx)).toEqual([]);
    expect(crossErrors({ termin: '' }, 'rahmen', ctx)).toEqual([]);
    expect(crossErrors({ termin: '2020-01-01' }, 'kontakt', ctx)).toEqual([]);
  });

  it('applies the per-type dimension limits', () => {
    const sb: Values = { typ: 'moebel', moebel_art: 'sideboard', moebel_breite: '300' };
    expect(crossErrors(sb, 'details', ctx)).toEqual([
      { name: 'moebel_breite', message: MSG.between(label('moebel_breite'), 80, 280, 'cm') },
    ]);
    expect(crossErrors({ ...sb, moebel_art: 'regal' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ ...sb, moebel_breite: '' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ ...sb, moebel_breite: 'abc' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ typ: 'moebel', moebel_art: 'esstisch', tisch_hoehe: '80' }, 'details', ctx)[0]?.name).toBe(
      'tisch_hoehe',
    );
  });

  it('checks decimal ranges with a comma', () => {
    expect(crossErrors({ typ: 'boden', boden_leistung: 'neu', boden_flaeche: '12,5' }, 'details', ctx)).toEqual([]);
    expect(crossErrors({ typ: 'boden', boden_leistung: 'neu', boden_flaeche: '2500' }, 'details', ctx)).toEqual([
      { name: 'boden_flaeche', message: MSG.between(label('boden_flaeche'), 1, 2000, 'm²') },
    ]);
    expect(crossErrors({ typ: 'boden', boden_leistung: 'neu', boden_flaeche: '0,5' }, 'details', ctx)).toHaveLength(1);
  });

  it('never flags a dimension inside its per-type range', () => {
    const arts = Object.keys(ART_RANGES);
    fc.assert(
      fc.property(
        fc.constantFrom(...arts).chain((art) =>
          fc.record({
            art: fc.constant(art),
            dims: fc.record(
              Object.fromEntries(
                Object.entries(ART_RANGES[art]!).map(([name, [min, max]]) => [
                  name,
                  fc.integer({ min, max }).map(String),
                ]),
              ),
            ),
          }),
        ),
        ({ art, dims }) => {
          const values: Values = { typ: 'moebel', moebel_art: art, ...dims };
          if (art === 'esstisch') values['tisch_platte'] = '40';
          expect(crossErrors(values, 'details', ctx)).toEqual([]);
        },
      ),
    );
  });

  it('flags every dimension outside its per-type range', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(ART_RANGES)), fc.integer({ min: -5, max: 1000 }), (art, x) => {
        const [name, [min, max]] = Object.entries(ART_RANGES[art]!)[0]!;
        const errors = crossErrors({ typ: 'moebel', moebel_art: art, [name]: String(x) }, 'details', ctx);
        const expected = x < min || x > max ? 1 : 0;
        expect(errors.filter((e) => e.name === name)).toHaveLength(expected);
        expect(FIELDS[name]!.unit).toBe('cm');
      }),
    );
  });
});
