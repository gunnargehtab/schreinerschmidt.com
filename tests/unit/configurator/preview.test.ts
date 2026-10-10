// Möbel preview: form values → generator params (src/scripts/configurator/preview/params.ts).
// Defaults, cm → mm, every moebel_art, clamping to ART_RANGES, stale values from another type,
// and the derived moebel_faecher range.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ART_OPTIONS, ART_RANGES, type Values } from '../../../src/lib/configurator/fields';
import { generate } from '../../../src/lib/configurator/furniture';
import { deriveShelves } from '../../../src/lib/configurator/furniture/constraints';
import type { CarcassParams, TableParams } from '../../../src/lib/configurator/furniture/types';
import { BASE_HEIGHT, faecherRange, paramsFromValues } from '../../../src/scripts/configurator/preview/params';

const carcass = (v: Values) => paramsFromValues(v) as CarcassParams;
const table = (v: Values) => paramsFromValues(v) as TableParams;

describe('paramsFromValues', () => {
  it('returns null without a furniture type, for bett/andere and for other project types', () => {
    expect(paramsFromValues({})).toBeNull();
    expect(paramsFromValues({ moebel_art: 'bett' })).toBeNull();
    expect(paramsFromValues({ moebel_art: 'andere' })).toBeNull();
    expect(paramsFromValues({ moebel_art: 'xyz' })).toBeNull();
    expect(paramsFromValues({ typ: 'boden', moebel_art: 'regal' })).toBeNull();
    expect(paramsFromValues({ typ: 'moebel', moebel_art: 'regal' })).not.toBeNull();
  });

  it('fills the §4.2 defaults for an empty Regal (cm → mm)', () => {
    const p = carcass({ moebel_art: 'regal' });
    expect(p).toEqual({
      kind: 'regal',
      width: 1200,
      height: 2000,
      depth: 350,
      board: 19,
      front: 'offen',
      base: { type: 'sockel', height: BASE_HEIGHT.sockel },
      back: 'eingenutet',
      shelvesPerBay: 'auto',
      handle: 'grifflos',
      species: 'eiche',
      finish: 'natur-geoelt',
    });
    expect(generate(p).derived.outer).toEqual([1200, 2000, 350]);
  });

  it('fills the defaults for Sideboard, Einbauschrank and Esstisch', () => {
    const s = carcass({ moebel_art: 'sideboard' });
    expect([s.kind, s.width, s.height, s.depth, s.board, s.front, s.base]).toEqual([
      'sideboard',
      1800,
      800,
      450,
      19,
      'tueren',
      { type: 'sockel', height: 80 },
    ]);
    expect(s.back).toBe('eingenutet');
    const e = carcass({ moebel_art: 'einbauschrank' });
    expect([e.kind, e.width, e.height, e.depth, e.front, e.base]).toEqual([
      'einbauschrank',
      2400,
      2500,
      600,
      'tueren',
      { type: 'sockel', height: 100 },
    ]);
    expect(e.niche).toEqual({ fillerSide: 30, fillerTop: 40, dachschraege: false });
    const t = table({ moebel_art: 'esstisch' });
    expect(t).toEqual({
      kind: 'esstisch',
      length: 2000,
      width: 900,
      height: 750,
      top: 40,
      edge: 'gerade',
      seed: 0,
      base: 'vierfuss',
      species: 'eiche',
      finish: 'natur-geoelt',
    });
  });

  it('maps every field of a full Regal and a full Esstisch', () => {
    const p = carcass({
      moebel_art: 'regal',
      moebel_breite: '90',
      moebel_hoehe: '180',
      moebel_tiefe: '30',
      moebel_staerke: '25',
      moebel_unterbau: 'fuesse',
      moebel_rueckwand: 'ohne',
      moebel_faecher: '4',
      moebel_holz: 'nussbaum',
      moebel_oberflaeche: 'lack-matt',
    });
    expect(p).toMatchObject({
      width: 900,
      height: 1800,
      depth: 300,
      board: 25,
      base: { type: 'fuesse', height: BASE_HEIGHT.fuesse },
      back: 'ohne',
      shelvesPerBay: 4,
      species: 'nussbaum',
      finish: 'lack-matt',
    });
    const t = table({
      moebel_art: 'esstisch',
      tisch_laenge: '240',
      tisch_breite: '100',
      tisch_hoehe: '76',
      tisch_platte: '60',
      tisch_kante: 'baumkante',
      tisch_gestell: 'kufen-stahl',
      tisch_brett: '42',
      moebel_holz: 'esche',
    });
    expect(t).toMatchObject({
      length: 2400,
      width: 1000,
      height: 760,
      top: 60,
      edge: 'baumkante',
      base: 'kufen-stahl',
      seed: 42,
      species: 'esche',
    });
  });

  it('draws oak for „Beratung“ and marks the Dachschräge only for the Einbauschrank', () => {
    expect(carcass({ moebel_art: 'regal', moebel_holz: 'beratung' }).species).toBe('eiche');
    expect(carcass({ moebel_art: 'einbauschrank', moebel_dachschraege: '1' }).niche?.dachschraege).toBe(true);
    expect(carcass({ moebel_art: 'regal', moebel_dachschraege: '1' }).niche).toBeUndefined();
  });

  it('rejects values that do not exist for the type: stale fronts, boards, bases and the Regal Rückwand', () => {
    // A Sideboard's drawers stay behind when the user switches to a Regal or Einbauschrank.
    expect(carcass({ moebel_art: 'regal', moebel_front: 'schubkaesten' }).front).toBe('offen');
    expect(carcass({ moebel_art: 'einbauschrank', moebel_front: 'schubkaesten' }).front).toBe('tueren');
    expect(carcass({ moebel_art: 'sideboard', moebel_front: 'schubkaesten' }).front).toBe('schubkaesten');
    expect(carcass({ moebel_art: 'sideboard', moebel_staerke: '40' }).board).toBe(19);
    expect(carcass({ moebel_art: 'regal', moebel_staerke: '40' }).board).toBe(40);
    expect(carcass({ moebel_art: 'einbauschrank', moebel_unterbau: 'haengend' }).base.type).toBe('sockel');
    expect(carcass({ moebel_art: 'sideboard', moebel_unterbau: 'haengend' }).base).toEqual({
      type: 'haengend',
      height: BASE_HEIGHT.haengend,
    });
    expect(carcass({ moebel_art: 'sideboard', moebel_rueckwand: 'ohne' }).back).toBe('eingenutet');
    expect(carcass({ moebel_art: 'regal', moebel_rueckwand: 'ohne' }).back).toBe('ohne');
    expect(carcass({ moebel_art: 'regal', moebel_holz: 'teak' }).species).toBe('eiche');
    expect(carcass({ moebel_art: 'regal', moebel_oberflaeche: 'glanz' }).finish).toBe('natur-geoelt');
  });

  it('clamps dimensions to the per-type ranges and rounds to whole cm', () => {
    expect(
      carcass({ moebel_art: 'regal', moebel_breite: '10', moebel_hoehe: '999', moebel_tiefe: '35.4' }),
    ).toMatchObject({ width: 400, height: 2600, depth: 350 });
    expect(carcass({ moebel_art: 'sideboard', moebel_breite: '400' }).width).toBe(2800);
    expect(table({ moebel_art: 'esstisch', tisch_hoehe: '90', tisch_laenge: '-5' })).toMatchObject({
      height: 780,
      length: 1200,
    });
    expect(carcass({ moebel_art: 'regal', moebel_faecher: '99' }).shelvesPerBay).toBe(12);
    expect(carcass({ moebel_art: 'regal', moebel_faecher: 'abc' }).shelvesPerBay).toBe('auto');
  });

  it('property: any input yields params inside ART_RANGES/ART_OPTIONS, and the generator accepts them', () => {
    const junk = fc.oneof(
      fc.constant(''),
      fc.integer({ min: -1000, max: 1000 }).map(String),
      fc.string({ maxLength: 6 }),
      fc.constantFrom('abc', '1e3', ' 12 ', '12,5'),
    );
    const enumJunk = fc.oneof(
      fc.constant(''),
      fc.constantFrom('offen', 'tueren', 'schubkaesten', 'gemischt', 'sockel', 'fuesse', 'haengend', 'ohne', '40'),
      fc.string({ maxLength: 8 }),
    );
    const valuesArb = fc.record({
      moebel_art: fc.constantFrom('regal', 'sideboard', 'einbauschrank', 'esstisch'),
      moebel_breite: junk,
      moebel_hoehe: junk,
      moebel_tiefe: junk,
      moebel_staerke: enumJunk,
      moebel_front: enumJunk,
      moebel_unterbau: enumJunk,
      moebel_faecher: junk,
      tisch_laenge: junk,
      tisch_breite: junk,
      tisch_hoehe: junk,
      tisch_platte: fc.constantFrom('', '25', '40', '60', '99'),
      moebel_holz: fc.constantFrom('', 'eiche', 'kirsche', 'beratung', 'x'),
    });
    fc.assert(
      fc.property(valuesArb, (v) => {
        const p = paramsFromValues(v)!;
        const art = v.moebel_art;
        const r = ART_RANGES[art]!;
        const within = (key: string, mm: number) => mm >= r[key]![0] * 10 && mm <= r[key]![1] * 10;
        if (p.kind === 'esstisch') {
          expect(within('tisch_laenge', p.length)).toBe(true);
          expect(within('tisch_breite', p.width)).toBe(true);
          expect(within('tisch_hoehe', p.height)).toBe(true);
          expect([25, 40, 60]).toContain(p.top);
        } else {
          expect(within('moebel_breite', p.width)).toBe(true);
          expect(within('moebel_hoehe', p.height)).toBe(true);
          expect(within('moebel_tiefe', p.depth)).toBe(true);
          const o = ART_OPTIONS[art]!;
          expect(o['moebel_staerke']).toContain(String(p.board));
          expect(o['moebel_front']).toContain(p.front);
          expect(o['moebel_unterbau']).toContain(p.base.type);
          expect(p.shelvesPerBay === 'auto' || (p.shelvesPerBay >= 0 && p.shelvesPerBay <= 12)).toBe(true);
        }
        const b = generate(p);
        expect(b.parts.length).toBeGreaterThan(0);
        expect(b.derived.outer.every(Number.isFinite)).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});

describe('faecherRange', () => {
  it('is null for tables and inactive types', () => {
    expect(faecherRange({ moebel_art: 'esstisch' })).toBeNull();
    expect(faecherRange({ moebel_art: 'bett' })).toBeNull();
    expect(faecherRange({})).toBeNull();
  });

  it('matches deriveShelves of the inner height: Regal 200 cm with Sockel 8 cm, 19 mm board', () => {
    const inner = 2000 - 80 - 2 * 19;
    const k = deriveShelves(inner);
    expect(faecherRange({ moebel_art: 'regal' })).toEqual([k.min - 1, k.max - 1]);
    expect(faecherRange({ moebel_art: 'regal' })).toEqual([4, 8]);
  });

  it('uses the main cabinet of a tall Einbauschrank and [0, 0] for a tiny opening', () => {
    // 320 cm niche − 4 cm Blende − 10 cm Sockel = 306 cm carcass → main cabinet 225 cm (§4.2).
    const k = deriveShelves(2250 - 2 * 19);
    expect(faecherRange({ moebel_art: 'einbauschrank', moebel_hoehe: '320' })).toEqual([k.min - 1, k.max - 1]);
    expect(faecherRange({ moebel_art: 'regal', moebel_hoehe: '40', moebel_staerke: '40' })).toEqual([0, 0]);
  });

  it('agrees with the generator: a value inside the range is never adjusted', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('regal', 'sideboard', 'einbauschrank'),
        fc.integer({ min: 40, max: 320 }),
        fc.constantFrom('19', '25'),
        fc.constantFrom('sockel', 'fuesse', 'ohne'),
        (art, h, t, base) => {
          const v: Values = { moebel_art: art, moebel_hoehe: String(h), moebel_staerke: t, moebel_unterbau: base };
          const [min, max] = faecherRange(v)!;
          const want = Math.min(12, max);
          const b = generate(paramsFromValues({ ...v, moebel_faecher: String(want) })!);
          const front = (b.params as CarcassParams).front;
          // 'gemischt' loses a drawer's height before the shelves are counted; the hint then explains.
          if (front !== 'gemischt') expect(b.hints.some((x) => x.code === 'faecher')).toBe(false);
          expect(min).toBeLessThanOrEqual(max);
          expect(min).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
