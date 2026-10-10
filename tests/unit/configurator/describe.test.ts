// describe(): the German sentence from docs/configurator.md §4.11.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { describe as describeBuild, generate } from '../../../src/lib/configurator/furniture';
import type { CarcassParams, FurnitureParams, TableParams } from '../../../src/lib/configurator/furniture/types';

const REGAL: CarcassParams = {
  kind: 'regal',
  width: 1200,
  height: 2000,
  depth: 350,
  board: 19,
  front: 'offen',
  base: { type: 'sockel', height: 80 },
  back: 'eingenutet',
  shelvesPerBay: 'auto',
  handle: 'grifflos',
  species: 'eiche',
  finish: 'natur-geoelt',
};
const TISCH: TableParams = {
  kind: 'esstisch',
  length: 2000,
  width: 900,
  height: 750,
  top: 40,
  edge: 'baumkante',
  seed: 7,
  base: 'vierfuss',
  species: 'nussbaum',
  finish: 'natur-geoelt',
};

const species = fc.constantFrom('eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche' as const);
const finish = fc.constantFrom('natur-geoelt', 'weiss-geoelt', 'lack-matt' as const);
const carcassArb: fc.Arbitrary<FurnitureParams> = fc.record({
  kind: fc.constantFrom('regal', 'sideboard', 'einbauschrank' as const),
  width: fc.integer({ min: 60, max: 300 }).map((v) => v * 10),
  height: fc.integer({ min: 50, max: 320 }).map((v) => v * 10),
  depth: fc.integer({ min: 20, max: 65 }).map((v) => v * 10),
  board: fc.constantFrom(19, 25, 40 as const),
  front: fc.constantFrom('offen', 'tueren', 'schubkaesten', 'gemischt' as const),
  base: fc.record({
    type: fc.constantFrom('sockel', 'fuesse', 'haengend', 'ohne' as const),
    height: fc.integer({ min: 60, max: 250 }),
  }),
  back: fc.constantFrom('ohne', 'eingenutet' as const),
  shelvesPerBay: fc.oneof(fc.constant('auto' as const), fc.integer({ min: 0, max: 12 })),
  handle: fc.constantFrom('grifflos', 'holz', 'metall' as const),
  species,
  finish,
});
const tableArb: fc.Arbitrary<FurnitureParams> = fc.record({
  kind: fc.constant('esstisch' as const),
  length: fc.integer({ min: 120, max: 320 }).map((v) => v * 10),
  width: fc.integer({ min: 70, max: 110 }).map((v) => v * 10),
  height: fc.integer({ min: 72, max: 78 }).map((v) => v * 10),
  top: fc.constantFrom(25, 40, 60 as const),
  edge: fc.constantFrom('gerade', 'baumkante' as const),
  seed: fc.nat(),
  base: fc.constantFrom('vierfuss', 'kufen-holz', 'kufen-stahl' as const),
  species,
  finish,
});

const NNBSP = ' ';

describe('describe', () => {
  it('matches the §4.11 example (the viewer adds the „3D-Vorschau: “ prefix)', () => {
    expect(describeBuild(generate({ ...REGAL, back: 'ohne' }))).toBe(
      `Regal aus Eiche, natur geölt, 120${NNBSP}cm breit, 200${NNBSP}cm hoch, 35${NNBSP}cm tief; 2 Felder mit je 5 Fachböden; Sockel 8${NNBSP}cm.`,
    );
  });

  it('mentions Rückwand, fronts, feet, hanging and single bays', () => {
    expect(describeBuild(generate(REGAL))).toContain('; mit Rückwand; Sockel 8 cm.');
    const sb = describeBuild(
      generate({
        ...REGAL,
        kind: 'sideboard',
        width: 1800,
        height: 800,
        depth: 450,
        front: 'gemischt',
        base: { type: 'fuesse', height: 150 },
        handle: 'metall',
        species: 'nussbaum',
        finish: 'weiss-geoelt',
      }),
    );
    expect(sb).toBe(
      `Sideboard aus Nussbaum, weiß geölt, 180${NNBSP}cm breit, 80${NNBSP}cm hoch, 45${NNBSP}cm tief; 3 Felder mit je 1 Fachboden; 3 Schubkästen und 3 Türen; mit Rückwand; auf Füßen (15${NNBSP}cm).`,
    );
    expect(
      describeBuild(generate({ ...REGAL, width: 600, base: { type: 'haengend', height: 300 }, back: 'ohne' })),
    ).toBe(
      `Regal aus Eiche, natur geölt, 60${NNBSP}cm breit, 200${NNBSP}cm hoch, 35${NNBSP}cm tief; 1 Feld mit 5 Fachböden; hängend.`,
    );
    expect(
      describeBuild(generate({ ...REGAL, base: { type: 'ohne', height: 0 }, front: 'tueren', back: 'ohne' })),
    ).toBe(
      `Regal aus Eiche, natur geölt, 120${NNBSP}cm breit, 200${NNBSP}cm hoch, 35${NNBSP}cm tief; 2 Felder mit je 5 Fachböden; 2 Türen.`,
    );
  });

  it('Einbauschrank: Nischenmaß, modules in the dative, Drehtüren, Aufsatz and Dachschräge', () => {
    const s = describeBuild(
      generate({
        ...REGAL,
        kind: 'einbauschrank',
        width: 2400,
        height: 2800,
        depth: 600,
        front: 'tueren',
        base: { type: 'sockel', height: 100 },
        finish: 'lack-matt',
        niche: { fillerSide: 30, fillerTop: 40, dachschraege: true },
      }),
    );
    expect(s).toBe(
      `Einbauschrank aus Eiche, matt lackiert, 240${NNBSP}cm breit, 280${NNBSP}cm hoch, 60${NNBSP}cm tief (Nischenmaß); 2 Module mit 4 Feldern und je 6 Fachböden; 8 Drehtüren; Sockel 10${NNBSP}cm; mit Aufsatz; Dachschräge laut Angabe.`,
    );
  });

  it('Esstisch: Platte, Baumkante, Gestell and seats as a range', () => {
    expect(describeBuild(generate(TISCH))).toBe(
      `Esstisch aus Nussbaum, natur geölt, 200${NNBSP}cm lang, 90${NNBSP}cm breit, 75${NNBSP}cm hoch; Platte 40${NNBSP}mm mit Baumkante; Vierfußgestell; Platz für 6 bis 8 Personen.`,
    );
    expect(describeBuild(generate({ ...TISCH, width: 800, base: 'kufen-stahl', edge: 'gerade' }))).toBe(
      `Esstisch aus Nussbaum, natur geölt, 200${NNBSP}cm lang, 80${NNBSP}cm breit, 75${NNBSP}cm hoch; Platte 40${NNBSP}mm; Kufengestell aus Stahl; Platz für 6 Personen.`,
    );
    expect(describeBuild(generate({ ...TISCH, base: 'kufen-holz' }))).toContain('Kufengestell aus Holz');
  });

  it('always ends with a full stop, uses German decimals and no bare ASCII spaces before units', () => {
    fc.assert(
      fc.property(fc.oneof(carcassArb, tableArb), (p) => {
        const s = describeBuild(generate(p));
        expect(s.endsWith('.')).toBe(true);
        expect(s).not.toMatch(/\d\.\d/);
        expect(s).not.toMatch(/\d cm/);
        expect(s).toContain(`${NNBSP}cm`);
      }),
    );
  });
});
