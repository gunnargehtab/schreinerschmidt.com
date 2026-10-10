// The field registry and its labels (docs/configurator.md §1, §4.2, §7 "Markup").
import { describe, expect, it } from 'vitest';
import {
  ART_OPTIONS,
  ART_RANGES,
  DECIMAL_PATTERN,
  FIELDS,
  FIELD_NAMES,
  PLZ_PATTERN,
  STEPS,
  TEL_PATTERN,
  fieldDefault,
  fieldRange,
  fieldValues,
} from '../../../src/lib/configurator/fields';
import { PROJECT_TYPES } from '../../../src/lib/configurator/conditions';
import { INTRO, LABELS, PROJECT_TYPE_LABELS, STEP_TITLES } from '../../../src/lib/configurator/labels';

const entries = Object.entries(FIELDS);
const KINDS = ['enum', 'int', 'dec', 'text', 'bool', 'date', 'file'];
const NNBSP = ' ';

describe('FIELDS', () => {
  it('has the six steps in order', () => {
    expect(STEPS).toEqual(['projekt', 'details', 'ausfuehrung', 'rahmen', 'kontakt', 'pruefen']);
  });

  it.each(entries)('%s is well-formed', (name, f) => {
    expect(KINDS).toContain(f.kind);
    expect(STEPS).toContain(f.step);
    if (f.branch) expect(PROJECT_TYPES).toContain(f.branch);
    if (f.share) {
      expect(['enum', 'int', 'dec', 'bool']).toContain(f.kind);
      expect(['projekt', 'details', 'ausfuehrung']).toContain(f.step);
      expect(f.pii).toBe(false);
    }
    if (f.kind === 'enum') {
      expect(f.values!.length).toBeGreaterThanOrEqual(2);
      expect(new Set(f.values).size).toBe(f.values!.length);
      for (const v of f.values!) expect(v).toMatch(/^[a-z0-9][a-z0-9x-]*$/);
      if (f.def !== undefined) expect(f.values).toContain(f.def);
    } else {
      expect(f.multi).toBeUndefined();
    }
    if (f.kind === 'int' || f.kind === 'dec') expect(f.min!).toBeLessThan(f.max!);
    if (f.kind === 'dec') expect(f.pattern).toBe(DECIMAL_PATTERN);
    if (f.kind === 'text') expect(f.maxLength).toBeGreaterThan(0);
    if (f.minLength) expect(f.minLength).toBeLessThan(f.maxLength!);
    if (f.unit) expect(['cm', 'mm', 'm²', 'lfm']).toContain(f.unit);
    if (f.branch) expect(['details', 'ausfuehrung']).toContain(f.step);
    else expect(name === 'fotos[]' ? 'ausfuehrung' : f.step).not.toBe('details');
  });

  it('puts HTML `required` only on the always-visible fields', () => {
    const html = entries.filter(([, f]) => f.required === 'html').map(([n]) => n);
    expect(html).toEqual(['typ', 'plz', 'name', 'email']);
    for (const [, f] of entries.filter(([, f]) => f.required === 'js')) expect(f.branch).toBeDefined();
  });

  it('names branch fields with the branch prefix (or a documented sub-prefix)', () => {
    const prefixes: Record<string, string[]> = {
      moebel: ['moebel_', 'tisch_', 'bett_'],
      fenster: ['fenster_', 'rolllaeden_', 'fensterbaenke_'],
      terrasse: ['terrasse_', 'zaun_'],
    };
    for (const [name, f] of entries) {
      if (!f.branch) continue;
      const ok = (prefixes[f.branch] ?? [`${f.branch}_`]).some((p) => name.startsWith(p));
      expect(ok, name).toBe(true);
    }
  });

  it('covers every branch with a JS-required first question and a photo input', () => {
    for (const t of PROJECT_TYPES) {
      const first = entries.find(([, f]) => f.branch === t && f.step === 'details' && f.required === 'js');
      expect(first, t).toBeDefined();
    }
    expect(FIELDS['fotos[]']).toMatchObject({ kind: 'file', share: false, step: 'ausfuehrung' });
  });

  it('matches the spec values', () => {
    expect(FIELDS['plz']).toMatchObject({ pattern: PLZ_PATTERN, maxLength: 5, pii: true });
    expect(PLZ_PATTERN).toBe('[0-9]{5}');
    expect(TEL_PATTERN).toBe('[0-9 +()/-]{6,30}');
    expect(FIELDS['moebel_breite']).toMatchObject({ min: 40, max: 400, unit: 'cm' });
    expect(FIELDS['moebel_hoehe']).toMatchObject({ min: 40, max: 320 });
    expect(FIELDS['moebel_tiefe']).toMatchObject({ min: 20, max: 65 });
    expect(FIELDS['moebel_staerke']).toMatchObject({ values: ['19', '25', '40'], def: '19', unit: 'mm' });
    expect(FIELDS['moebel_holz']).toMatchObject({ def: 'eiche', share: true });
    expect(FIELDS['moebel_oberflaeche']).toMatchObject({ def: 'natur-geoelt' });
    expect(FIELDS['moebel_beschreibung']).toMatchObject({
      required: 'js',
      minLength: 10,
      maxLength: 2000,
      share: false,
    });
    expect(FIELDS['boden_flaeche']).toMatchObject({ kind: 'dec', min: 1, max: 2000, required: 'js', unit: 'm²' });
    expect(FIELDS['treppe_geschosshoehe']).toMatchObject({ min: 200, max: 450 });
    expect(FIELDS['fenster_leistung']).toMatchObject({ multi: true, required: 'js' });
    expect(FIELDS['altbau_bereiche']).toMatchObject({ multi: true, required: 'js' });
    expect(FIELDS['altbau_baujahr']).toMatchObject({ min: 1500, max: 2026 });
    expect(FIELDS['tuer_hoehe']).toMatchObject({ min: 180, max: 300 });
    expect(FIELDS['zaun_hoehe']).toMatchObject({ min: 60, max: 220 });
    expect(FIELDS['email']).toMatchObject({ maxLength: 254, pii: true, share: false });
    expect(FIELDS['telefon']).toMatchObject({ pattern: TEL_PATTERN });
    expect(FIELDS['nachricht']).toMatchObject({ maxLength: 2000 });
  });

  it('keeps Rahmen and Kontakt out of the URL', () => {
    for (const [, f] of entries) if (f.step === 'rahmen' || f.step === 'kontakt') expect(f.share).toBe(false);
  });

  it('FIELD_NAMES is the unique key list', () => {
    expect(FIELD_NAMES).toEqual(Object.keys(FIELDS));
    expect(new Set(FIELD_NAMES).size).toBe(FIELD_NAMES.length);
  });
});

describe('per-type ranges and options (§4.2)', () => {
  it('lie inside the HTML union ranges', () => {
    for (const ranges of Object.values(ART_RANGES)) {
      for (const [name, [min, max, def]] of Object.entries(ranges)) {
        const f = FIELDS[name]!;
        expect(min).toBeGreaterThanOrEqual(f.min!);
        expect(max).toBeLessThanOrEqual(f.max!);
        expect(def).toBeGreaterThanOrEqual(min);
        expect(def).toBeLessThanOrEqual(max);
      }
    }
    for (const opts of Object.values(ART_OPTIONS))
      for (const [name, values] of Object.entries(opts))
        for (const v of values) expect(FIELDS[name]!.values).toContain(v);
  });

  it('matches the spec table', () => {
    expect(ART_RANGES['regal']).toEqual({
      moebel_breite: [40, 300, 120],
      moebel_hoehe: [40, 260, 200],
      moebel_tiefe: [20, 45, 35],
    });
    expect(ART_RANGES['sideboard']).toEqual({
      moebel_breite: [80, 280, 180],
      moebel_hoehe: [50, 100, 80],
      moebel_tiefe: [35, 55, 45],
    });
    expect(ART_RANGES['einbauschrank']).toEqual({
      moebel_breite: [60, 400, 240],
      moebel_hoehe: [180, 320, 250],
      moebel_tiefe: [35, 65, 60],
    });
    expect(ART_RANGES['esstisch']).toEqual({
      tisch_laenge: [120, 320, 200],
      tisch_breite: [70, 110, 90],
      tisch_hoehe: [72, 78, 75],
    });
    expect(ART_OPTIONS['regal']!['moebel_staerke']).toEqual(['19', '25', '40']);
    expect(ART_OPTIONS['sideboard']!['moebel_staerke']).toEqual(['19', '25']);
    expect(ART_OPTIONS['sideboard']!['moebel_front']).toEqual(['tueren', 'schubkaesten', 'gemischt']);
    expect(ART_OPTIONS['einbauschrank']!['moebel_unterbau']).toEqual(['sockel']);
  });

  it('fieldRange narrows per moebel_art and falls back to the HTML range', () => {
    expect(fieldRange('moebel_breite', { moebel_art: 'sideboard' })).toEqual([80, 280]);
    expect(fieldRange('moebel_breite', {})).toEqual([40, 400]);
    expect(fieldRange('moebel_breite', { moebel_art: 'bett' })).toEqual([40, 400]);
    expect(fieldRange('tuer_anzahl', {})).toEqual([1, 50]);
    expect(fieldRange('name', {})).toBeNull();
    expect(fieldRange('nope', {})).toBeNull();
  });

  it('fieldDefault: per-type dimension, first per-type option, registry default, or empty', () => {
    expect(fieldDefault('moebel_breite', { moebel_art: 'einbauschrank' })).toBe('240');
    expect(fieldDefault('moebel_breite', {})).toBe('');
    expect(fieldDefault('moebel_front', { moebel_art: 'sideboard' })).toBe('tueren');
    expect(fieldDefault('moebel_front', { moebel_art: 'regal' })).toBe('offen');
    expect(fieldDefault('moebel_staerke', { moebel_art: 'sideboard' })).toBe('19');
    expect(fieldDefault('moebel_holz', {})).toBe('eiche');
    expect(fieldDefault('tisch_platte', { moebel_art: 'esstisch' })).toBe('40');
    expect(fieldDefault('name', {})).toBe('');
    expect(fieldDefault('nope', {})).toBe('');
  });

  it('fieldValues filters options per moebel_art', () => {
    expect(fieldValues('moebel_staerke', { moebel_art: 'sideboard' })).toEqual(['19', '25']);
    expect(fieldValues('moebel_staerke', {})).toEqual(['19', '25', '40']);
    expect(fieldValues('nope', {})).toEqual([]);
  });
});

describe('labels', () => {
  it('has a label for every field and a field for every label', () => {
    expect(Object.keys(LABELS).sort()).toEqual(FIELD_NAMES.slice().sort());
  });

  it('has an option label for every enum value, and no stray option labels', () => {
    for (const [name, f] of entries) {
      if (f.kind !== 'enum' || name === 'typ') continue;
      const options = LABELS[name]!.options!;
      expect(Object.keys(options).sort(), name).toEqual(f.values!.slice().sort());
    }
    expect(Object.keys(PROJECT_TYPE_LABELS)).toEqual(PROJECT_TYPES);
    expect(Object.keys(STEP_TITLES)).toEqual(STEPS);
  });

  it('uses spec wording', () => {
    expect(PROJECT_TYPE_LABELS.moebel).toEqual({
      label: 'Möbel nach Maß',
      hint: 'Schrank, Regal, Sideboard, Tisch, Bett',
    });
    expect(STEP_TITLES.details).toEqual({ moebel: 'Möbel & Maße', other: 'Ihr Vorhaben' });
    expect(STEP_TITLES.pruefen.other).toBe('Prüfen & senden');
    expect(LABELS['boden_leistung']!.options!['aufarbeiten']).toBe('Abschleifen & Aufarbeiten');
    expect(LABELS['treppe_leistung']!.options!['belegen']).toBe('Bestandstreppe mit Holz belegen');
    expect(LABELS['treppe_geschosshoehe']!.hint).toBe('Oberkante Fertigfußboden bis Oberkante Fertigfußboden');
    expect(LABELS['moebel_dachschraege']!.hint).toBe('Bitte Foto/Skizze beifügen');
    expect(LABELS['zeitraum']!.options!['asap']).toBe('So bald wie möglich');
    expect(LABELS['plz']!.label).toBe('Postleitzahl des Objekts');
    expect(INTRO).toContain('Schreinermeister Ulf Schmidt');
  });

  it('follows the German typography rules (no straight quotes, U+202F before units)', () => {
    const texts: string[] = [INTRO];
    for (const l of Object.values(LABELS)) texts.push(l.label, l.hint ?? '', ...Object.values(l.options ?? {}));
    for (const p of Object.values(PROJECT_TYPE_LABELS)) texts.push(p.label, p.hint);
    for (const t of texts) {
      expect(t).not.toMatch(/["']/);
      expect(t).not.toMatch(/\d (cm|mm|m|€|Minuten)\b/);
      expect(t).not.toMatch(/\s{2,}/);
    }
    expect(LABELS['moebel_staerke']!.options!['19']).toBe(`19${NNBSP}mm`);
  });
});
