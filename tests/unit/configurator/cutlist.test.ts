// cutList(): grouped parts with the length along the grain.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cutList, generate } from '../../../src/lib/configurator/furniture';
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

describe('cutList', () => {
  it('groups identical parts and sums to the part count (walls excluded)', () => {
    fc.assert(
      fc.property(fc.oneof(carcassArb, tableArb), (p) => {
        const b = generate(p);
        const list = cutList(b);
        const parts = b.parts.filter((x) => x.role !== 'wand');
        expect(list.reduce((s, i) => s + i.count, 0)).toBe(parts.length);
        expect(list.every((i) => i.role !== 'wand')).toBe(true);
        for (const i of list) {
          expect(i.count).toBeGreaterThanOrEqual(1);
          expect(i.thickness).toBeLessThanOrEqual(i.width);
          expect(Number.isInteger(i.length) && Number.isInteger(i.width) && Number.isInteger(i.thickness)).toBe(true);
          expect(parts.some((x) => x.id === i.id)).toBe(true);
        }
      }),
    );
  });

  it('Regal 120 × 200 × 35: two sides of 1920 along the grain, shelves grouped by 10', () => {
    const list = cutList(generate(REGAL));
    const sides = list.find((i) => i.role === 'seite')!;
    expect(sides).toMatchObject({ id: 'seiteL', count: 2, length: 1920, width: 350, thickness: 19, material: 'holz' });
    expect(list.find((i) => i.role === 'fachboden')).toMatchObject({
      count: 10,
      length: 572,
      width: 332,
      thickness: 19,
    });
    expect(list[0]!.role).toBe('seite');
    expect(list.map((i) => i.role).indexOf('fachboden')).toBeGreaterThan(list.map((i) => i.role).indexOf('mittelwand'));
  });

  it('marks steel Kufen as metal', () => {
    const list = cutList(generate({ ...TISCH, base: 'kufen-stahl' }));
    expect(list.find((i) => i.role === 'kufe')).toMatchObject({ count: 2, material: 'metall', thickness: 12 });
    expect(list.find((i) => i.role === 'platte')).toMatchObject({ length: 2000, width: 900, thickness: 40 });
  });
});
