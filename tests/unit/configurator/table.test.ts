// Table generator properties (docs/configurator.md §4.2 "Table", §7).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { KNEE_ROOM } from '../../../src/lib/configurator/furniture/table-rules';
import { generate } from '../../../src/lib/configurator/furniture';
import type { Part, TableParams } from '../../../src/lib/configurator/furniture/types';

const tableArb: fc.Arbitrary<TableParams> = fc.record({
  kind: fc.constant('esstisch' as const),
  length: fc.integer({ min: 120, max: 320 }).map((v) => v * 10),
  width: fc.integer({ min: 70, max: 110 }).map((v) => v * 10),
  height: fc.integer({ min: 72, max: 78 }).map((v) => v * 10),
  top: fc.constantFrom(25, 40, 60 as const),
  edge: fc.constantFrom('gerade', 'baumkante' as const),
  seed: fc.integer({ min: 0, max: 2 ** 31 }),
  base: fc.constantFrom('vierfuss', 'kufen-holz', 'kufen-stahl' as const),
  species: fc.constantFrom('eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche' as const),
  finish: fc.constantFrom('natur-geoelt', 'weiss-geoelt', 'lack-matt' as const),
});

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

const EPS = 1e-6;
const overlap = (a: Part, b: Part) =>
  [0, 1, 2].every((i) => a.min[i]! + EPS < b.min[i]! + b.size[i]! && b.min[i]! + EPS < a.min[i]! + a.size[i]!);

describe('generateTable', () => {
  it('bounds equal length × height × width and nothing overlaps', () => {
    fc.assert(
      fc.property(tableArb, (p) => {
        const b = generate(p);
        expect(b.bounds.min).toEqual([0, 0, 0]);
        expect(b.bounds.max).toEqual([p.length, p.height, p.width]);
        expect(b.derived.outer).toEqual([p.length, p.height, p.width]);
        const parts = b.parts;
        for (let i = 0; i < parts.length; i++)
          for (let j = i + 1; j < parts.length; j++) {
            if (overlap(parts[i]!, parts[j]!)) throw new Error(`${parts[i]!.id} overlaps ${parts[j]!.id}`);
          }
        expect(new Set(parts.map((x) => x.id)).size).toBe(parts.length);
      }),
    );
  });

  it('keeps the Zarge/Traverse underside ≥ 620 mm above the floor', () => {
    fc.assert(
      fc.property(tableArb, (p) => {
        const b = generate(p);
        for (const z of b.parts.filter((x) => x.role === 'zarge' || x.role === 'traverse')) {
          expect(z.min[1]).toBeGreaterThanOrEqual(KNEE_ROOM);
          expect(z.min[1] + z.size[1]).toBeCloseTo(p.height - p.top, 6);
          expect(z.size[1]).toBeLessThanOrEqual(100);
        }
      }),
    );
  });

  it('Vierfuß: four legs 70–90 mm thick, inset 60–150 mm, grain vertical', () => {
    fc.assert(
      fc.property(tableArb, (p) => {
        const b = generate({ ...p, base: 'vierfuss' });
        const legs = b.parts.filter((x) => x.role === 'bein');
        expect(legs).toHaveLength(4);
        for (const l of legs) {
          expect(l.size[0]).toBeGreaterThanOrEqual(70);
          expect(l.size[0]).toBeLessThanOrEqual(90);
          expect(l.grain).toBe(1);
          const inset = Math.min(l.min[0], p.length - l.min[0] - l.size[0]);
          expect(inset).toBeGreaterThanOrEqual(60);
          expect(inset).toBeLessThanOrEqual(150);
        }
        expect(b.parts.filter((x) => x.role === 'zarge')).toHaveLength(4);
        expect(b.derived.seats).toBeDefined();
      }),
    );
  });

  it('Kufen sit at ±(L/2 − max(300, 0.18 L)) and are joined by a Traverse', () => {
    fc.assert(
      fc.property(tableArb, fc.constantFrom('kufen-holz', 'kufen-stahl' as const), (p, base) => {
        const b = generate({ ...p, base });
        const kufen = b.parts.filter((x) => x.role === 'kufe');
        expect(kufen).toHaveLength(2);
        const off = p.length / 2 - Math.max(300, 0.18 * p.length);
        const centres = kufen.map((k) => k.min[0] + k.size[0] / 2).sort((a, b) => a - b);
        expect(centres[0]).toBeCloseTo(p.length / 2 - off, 6);
        expect(centres[1]).toBeCloseTo(p.length / 2 + off, 6);
        const tr = b.parts.find((x) => x.role === 'traverse')!;
        expect(tr.min[0]).toBeCloseTo(kufen[0]!.min[0] + kufen[0]!.size[0], 6);
        expect(tr.min[0] + tr.size[0]).toBeCloseTo(kufen[1]!.min[0], 6);
        const metal = base === 'kufen-stahl';
        expect(kufen.every((k) => k.surface === (metal ? 'metall' : 'holz'))).toBe(true);
        expect(tr.grain).toBe(0);
      }),
    );
  });

  it('Baumkante needs a 40 mm top: 25 mm falls back to a straight edge with a warning', () => {
    const b = generate({ ...TISCH, top: 25 });
    expect(b.parts.find((x) => x.role === 'platte')!.outline).toBeUndefined();
    expect(b.hints).toEqual([expect.objectContaining({ code: 'baumkante', level: 'warn', field: 'tisch_platte' })]);
    const ok = generate(TISCH);
    expect(ok.parts.find((x) => x.role === 'platte')!.outline!.length).toBeGreaterThan(20);
    expect(ok.hints).toEqual([]);
    expect(generate({ ...TISCH, edge: 'gerade' }).parts[0]!.outline).toBeUndefined();
  });

  it('seats and the Zarge hint', () => {
    expect(generate(TISCH).derived.seats).toEqual([6, 8]);
    const low = generate({ ...TISCH, height: 720, top: 60 });
    expect(low.hints.find((h) => h.code === 'zarge')?.level).toBe('warn');
    expect(low.parts.find((x) => x.role === 'zarge')!.size[1]).toBe(40);
  });

  it('dimension specs: length, width, height, top thickness', () => {
    const ids = generate(TISCH).dims.map((d) => d.id);
    expect(ids).toEqual(['laenge', 'hoehe', 'breite', 'platte']);
  });
});
