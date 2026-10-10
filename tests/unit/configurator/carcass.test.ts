// Carcass generator properties (docs/configurator.md §7 "Generators").
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GAP, GRID, MAX_BAY } from '../../../src/lib/configurator/furniture/constraints';
import { generate } from '../../../src/lib/configurator/furniture';
import type { Board, CarcassParams, Part } from '../../../src/lib/configurator/furniture/types';

const board = fc.constantFrom<Board>(19, 25, 40);
const species = fc.constantFrom('eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche' as const);
const finish = fc.constantFrom('natur-geoelt', 'weiss-geoelt', 'lack-matt' as const);
const front = fc.constantFrom('offen', 'tueren', 'schubkaesten', 'gemischt' as const);
const handle = fc.constantFrom('grifflos', 'holz', 'metall' as const);
const back = fc.constantFrom('ohne', 'eingenutet' as const);
const shelvesPerBay = fc.oneof(fc.constant('auto' as const), fc.integer({ min: 0, max: 12 }));

/** UI ranges per type (§4.2), in mm. */
const carcassArb: fc.Arbitrary<CarcassParams> = fc.oneof(
  fc.record({
    kind: fc.constant('regal' as const),
    width: fc.integer({ min: 40, max: 300 }).map((v) => v * 10),
    height: fc.integer({ min: 40, max: 260 }).map((v) => v * 10),
    depth: fc.integer({ min: 20, max: 45 }).map((v) => v * 10),
    board,
    front,
    base: fc.oneof(
      fc.record({ type: fc.constant('sockel' as const), height: fc.integer({ min: 60, max: 120 }) }),
      fc.record({ type: fc.constant('fuesse' as const), height: fc.integer({ min: 100, max: 250 }) }),
      fc.record({ type: fc.constant('ohne' as const), height: fc.constant(0) }),
    ),
    back,
    shelvesPerBay,
    handle,
    species,
    finish,
  }),
  fc.record({
    kind: fc.constant('sideboard' as const),
    width: fc.integer({ min: 80, max: 280 }).map((v) => v * 10),
    height: fc.integer({ min: 50, max: 100 }).map((v) => v * 10),
    depth: fc.integer({ min: 35, max: 55 }).map((v) => v * 10),
    board: fc.constantFrom<Board>(19, 25),
    front,
    base: fc.oneof(
      fc.record({ type: fc.constant('sockel' as const), height: fc.integer({ min: 60, max: 120 }) }),
      fc.record({ type: fc.constant('fuesse' as const), height: fc.integer({ min: 100, max: 250 }) }),
      fc.record({ type: fc.constant('haengend' as const), height: fc.integer({ min: 200, max: 600 }) }),
    ),
    back,
    shelvesPerBay,
    handle,
    species,
    finish,
  }),
  fc.record({
    kind: fc.constant('einbauschrank' as const),
    width: fc.integer({ min: 60, max: 400 }).map((v) => v * 10),
    height: fc.integer({ min: 180, max: 320 }).map((v) => v * 10),
    depth: fc.integer({ min: 35, max: 65 }).map((v) => v * 10),
    board: fc.constantFrom<Board>(19, 25),
    front: fc.constantFrom('offen', 'tueren' as const),
    base: fc.record({ type: fc.constant('sockel' as const), height: fc.integer({ min: 80, max: 120 }) }),
    back: fc.constant('eingenutet' as const),
    shelvesPerBay,
    handle,
    niche: fc.record({
      fillerSide: fc.integer({ min: 20, max: 50 }),
      fillerTop: fc.integer({ min: 30, max: 80 }),
      dachschraege: fc.boolean(),
    }),
    species,
    finish,
  }),
);

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

const EPS = 1e-6;
const overlap = (a: Part, b: Part) =>
  [0, 1, 2].every((i) => a.min[i]! + EPS < b.min[i]! + b.size[i]! && b.min[i]! + EPS < a.min[i]! + a.size[i]!);

describe('generateCarcass', () => {
  it('W = 1200 oak 19 → 2 bays, 5 shelves each, Mittelwand hint with the thicker board', () => {
    const b = generate(REGAL);
    expect(b.derived.bays).toBe(2);
    expect(b.derived.bayWidths).toEqual([572, 572]);
    expect(b.derived.shelves).toEqual([5, 5]);
    expect(b.derived.maxSpan).toBe(741);
    expect(b.hints[0]).toMatchObject({ code: 'mittelwand', level: 'info', field: 'moebel_staerke' });
    expect(b.hints[0]!.text).toBe('Mittelwand ergänzt: 19 mm Eiche spannt maximal 74,1 cm.');
    // At 90 cm the 25 mm board would span the whole width, so the hint suggests it.
    expect(generate({ ...REGAL, width: 900 }).hints[0]!.text).toBe(
      'Mittelwand ergänzt: 19 mm Eiche spannt maximal 74,1 cm. Mit 25 mm wären es 97,5 cm.',
    );
    expect(generate({ ...REGAL, width: 3000, board: 40 }).hints[0]!.text).toBe(
      '2 Mittelwände ergänzt: ein Feld ist höchstens 120 cm breit.',
    );
    expect(generate({ ...REGAL, width: 700 }).hints).toEqual([]);
    expect(b.parts.map((p) => p.id)).toContain('feld2/fach3');
    expect(b.parts.find((p) => p.id === 'mittelwand1')).toBeDefined();
  });

  it('bounds equal the outer dimensions and every part lies inside them', () => {
    fc.assert(
      fc.property(carcassArb, (p) => {
        const b = generate(p);
        const size = b.bounds.max.map((v, i) => v - b.bounds.min[i]!);
        expect(size.map(Math.round)).toEqual([p.width, p.height, p.depth]);
        expect(b.derived.outer).toEqual([p.width, p.height, p.depth]);
        for (const part of b.parts) {
          if (part.role === 'wand' || part.role === 'griff') continue;
          for (let i = 0; i < 3; i++) {
            expect(part.min[i]!).toBeGreaterThanOrEqual(b.bounds.min[i]! - EPS);
            expect(part.min[i]! + part.size[i]!).toBeLessThanOrEqual(b.bounds.max[i]! + EPS);
          }
          expect(part.size.every((s) => s > 0)).toBe(true);
        }
      }),
    );
  });

  it('no two parts overlap in volume', () => {
    fc.assert(
      fc.property(carcassArb, (p) => {
        const parts = generate(p).parts.filter((x) => x.role !== 'wand');
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            if (overlap(parts[i]!, parts[j]!)) throw new Error(`${parts[i]!.id} overlaps ${parts[j]!.id}`);
          }
        }
      }),
    );
  });

  it('bay widths never exceed the shelf span or 1200 mm; shelves sit on the 32 mm grid', () => {
    fc.assert(
      fc.property(carcassArb, (p) => {
        const b = generate(p);
        const limit = Math.min(b.derived.maxSpan, MAX_BAY);
        for (const w of b.derived.bayWidths) expect(w).toBeLessThanOrEqual(limit + 0.5);
        const bottoms = b.parts.filter((x) => x.role === 'unterboden');
        for (const s of b.parts.filter((x) => x.role === 'fachboden')) {
          expect(s.size[0]).toBeLessThanOrEqual(limit + 0.5);
          // The nearest Unterboden below the shelf that overlaps it in x (modules, Aufsatz).
          const bottom = bottoms
            .filter((u) => u.min[1] < s.min[1] && s.min[0] < u.min[0] + u.size[0] && u.min[0] < s.min[0] + s.size[0])
            .sort((a, b) => b.min[1] - a.min[1])[0]!;
          const inner = bottom.min[1] + bottom.size[1];
          expect((s.min[1] - inner + p.board / 2) % GRID).toBeCloseTo(0, 6);
        }
      }),
    );
  });

  it('doors are 300–600 mm wide, ≤ 2400 mm tall, with 3 mm gaps to their neighbours', () => {
    fc.assert(
      fc.property(carcassArb, (p) => {
        const b = generate(p);
        const doors = b.parts.filter((x) => x.role === 'tuer');
        if (p.front === 'tueren' || p.front === 'gemischt') expect(doors.length).toBeGreaterThan(0);
        expect(b.derived.doors).toBe(doors.length);
        const walls = b.parts.filter((x) => x.role === 'seite' || x.role === 'mittelwand');
        for (const d of doors) {
          expect(d.size[0]).toBeGreaterThanOrEqual(298.5); // see doorsPerBay
          expect(d.size[0]).toBeLessThanOrEqual(600);
          expect(d.size[1]).toBeLessThanOrEqual(2400);
          expect(d.motion?.kind).toBe('hinge');
          const left = d.min[0] - GAP;
          const right = d.min[0] + d.size[0] + GAP;
          const touches = (x: number) =>
            walls.some((w) => Math.abs(w.min[0] + w.size[0] - x) < EPS || Math.abs(w.min[0] - x) < EPS) ||
            doors.some((o) => o !== d && (Math.abs(o.min[0] + o.size[0] - x) < EPS || Math.abs(o.min[0] - x) < EPS));
          expect(touches(left)).toBe(true);
          expect(touches(right)).toBe(true);
        }
        if (doors.length) expect(b.derived.hinges).toBeGreaterThanOrEqual(2 * doors.length);
      }),
    );
  });

  it('drawer fronts are 120–300 mm high and ≤ 1000 mm wide, with a runner length', () => {
    fc.assert(
      fc.property(carcassArb, (p) => {
        const b = generate(p);
        const fronts = b.parts.filter((x) => x.role === 'schubkastenfront');
        const ih = p.height - (p.base.type === 'sockel' || p.base.type === 'fuesse' ? p.base.height : 0) - 2 * p.board;
        if (p.front === 'schubkaesten' || (p.front === 'gemischt' && ih >= 320)) {
          expect(fronts.length).toBeGreaterThan(0);
          expect(b.derived.runner).toBeGreaterThanOrEqual(270);
          expect(b.derived.runner).toBeLessThanOrEqual(650);
        }
        expect(b.derived.drawers).toBe(fronts.length);
        for (const f of fronts) {
          // A single front in a tiny opening (40 cm Regal on 25 cm feet) may be lower than 120 mm.
          expect(f.size[1]).toBeGreaterThanOrEqual(Math.min(120, ih - 2 * GAP) - EPS);
          expect(f.size[1]).toBeLessThanOrEqual(300 + EPS);
          expect(f.size[0]).toBeLessThanOrEqual(1000);
          expect(f.motion?.kind).toBe('slide');
        }
      }),
    );
  });

  it('ids are unique and stable across edits that keep the structure', () => {
    fc.assert(
      fc.property(carcassArb, finish, handle, (p, f, h) => {
        const a = generate(p);
        const ids = a.parts.map((x) => x.id);
        expect(new Set(ids).size).toBe(ids.length);
        const b = generate({
          ...p,
          finish: f,
          handle: p.handle === 'grifflos' ? 'grifflos' : h === 'grifflos' ? p.handle : h,
        });
        expect(b.parts.map((x) => x.id)).toEqual(ids);
        expect(a.dims.map((d) => d.id)).toEqual(
          new Set(a.dims.map((d) => d.id)).size === a.dims.length ? a.dims.map((d) => d.id) : [],
        );
      }),
    );
  });

  it('follows the grain rule', () => {
    fc.assert(
      fc.property(carcassArb, (p) => {
        for (const part of generate(p).parts) {
          switch (part.role) {
            case 'seite':
            case 'mittelwand':
            case 'rueckwand':
            case 'passleiste':
            case 'fuss':
              expect(part.grain).toBe(1);
              break;
            case 'oberboden':
            case 'unterboden':
            case 'fachboden':
            case 'blende':
              expect(part.grain).toBe(0);
              break;
            case 'tuer':
              expect(part.grain).toBe(p.kind === 'sideboard' ? 0 : 1);
              expect(part.uvAnchor).toBe(p.kind === 'sideboard' ? 'world' : 'local');
              break;
            case 'schubkastenfront':
              expect(part.grain).toBe(0);
              break;
            case 'sockel':
              expect(part.grain).toBe(part.size[0] >= part.size[2] ? 0 : 2);
              break;
          }
        }
      }),
    );
  });

  it('Sockel is recessed 30 mm and Füße are inset 30 mm', () => {
    const s = generate(REGAL).parts.find((x) => x.id === 'sockel')!;
    expect(s.min[2] + s.size[2]).toBe(350 - 30);
    expect(s.min[0]).toBe(30);
    const f = generate({ ...REGAL, base: { type: 'fuesse', height: 150 } }).parts.filter((x) => x.role === 'fuss');
    expect(f).toHaveLength(4);
    expect(f[0]!.min).toEqual([30, 0, 30]);
    expect(f[3]!.min[0] + f[3]!.size[0]).toBe(1200 - 30);
    const h = generate({ ...REGAL, base: { type: 'haengend', height: 400 } });
    expect(h.bounds.min[1]).toBe(400);
    expect(h.parts.some((x) => x.role === 'sockel' || x.role === 'fuss')).toBe(false);
  });

  it('Rückwand sits 8 mm thick in a groove 10 mm from the back; shelves stop in front of it', () => {
    const b = generate(REGAL);
    const rw = b.parts.find((x) => x.role === 'rueckwand')!;
    expect(rw.min[2]).toBe(10);
    expect(rw.size[2]).toBe(8);
    for (const s of b.parts.filter((x) => x.role === 'fachboden')) expect(s.min[2]).toBe(18);
    expect(generate({ ...REGAL, back: 'ohne' }).parts.some((x) => x.role === 'rueckwand')).toBe(false);
  });

  it('clamps shelvesPerBay to the 20–40 cm compartment range with a hint', () => {
    const b = generate({ ...REGAL, shelvesPerBay: 20 });
    expect(b.derived.shelves[0]).toBe(8);
    expect(b.hints.find((h) => h.code === 'faecher')?.text).toContain('Fachböden auf 8 je Feld angepasst');
    expect(generate({ ...REGAL, shelvesPerBay: 6 }).derived.shelves[0]).toBe(6);
  });

  it('Einbauschrank: Passleisten, Blende, ventilation gap, modules, Aufsatz and Dachschräge hint', () => {
    const p: CarcassParams = {
      ...REGAL,
      kind: 'einbauschrank',
      width: 2400,
      height: 2800,
      depth: 600,
      front: 'tueren',
      base: { type: 'sockel', height: 100 },
      niche: { fillerSide: 30, fillerTop: 40, dachschraege: true },
    };
    const b = generate(p);
    const ids = b.parts.map((x) => x.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'passleisteL',
        'passleisteR',
        'blende',
        'wandL',
        'wandR',
        'decke',
        'modul1/seiteL',
        'aufsatz2/seiteR',
      ]),
    );
    expect(b.derived.modules).toBe(2);
    expect(b.derived.aufsatz).toBe(true);
    expect(b.derived.bays).toBe(4);
    expect(b.parts.find((x) => x.id === 'modul1/seiteL')!.min[2]).toBe(20);
    expect(b.parts.find((x) => x.id === 'modul1/seiteL')!.size[1]).toBe(2250);
    expect(b.parts.find((x) => x.id === 'aufsatz1/seiteL')!.size[1]).toBe(2800 - 40 - 100 - 2250);
    expect(b.parts.find((x) => x.id === 'blende')!.size).toEqual([2400, 40, 19]);
    expect(b.hints.map((h) => h.code)).toEqual(expect.arrayContaining(['module', 'aufsatz', 'dachschraege']));
    expect(b.hints.find((h) => h.code === 'dachschraege')?.level).toBe('warn');
    expect(b.parts.filter((x) => x.role === 'wand').every((x) => !x.solid && x.surface === 'wand')).toBe(true);
    // Defaults for the niche (30 / 40) and no split below 2600 mm.
    const { niche: _niche, ...noNiche } = p;
    const small = generate({ ...noNiche, height: 2500 });
    expect(small.derived.aufsatz).toBe(false);
    expect(small.parts.find((x) => x.id === 'passleisteL')!.size[0]).toBe(30);
    expect(small.derived.modules).toBe(2);
  });

  it('dimension specs cover width, bay widths, height, shelf pitches and depth', () => {
    const b = generate(REGAL);
    const ids = b.dims.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'breite',
        'hoehe',
        'tiefe',
        'sockel',
        'feld1/breite',
        'feld2/breite',
        'feld1/pitch1',
        'feld1/pitch6',
      ]),
    );
    expect(b.dims.find((d) => d.id === 'breite')!.text).toBe('120');
    expect(b.dims.find((d) => d.id === 'feld1/breite')!.text).toBe('57,2');
    expect(b.dims.every((d) => d.views.length > 0 && Number.isFinite(d.a[0] + d.b[2]))).toBe(true);
  });

  it('warns when the depth is too small for drawer runners', () => {
    const b = generate({ ...REGAL, depth: 200, front: 'schubkaesten' });
    expect(b.derived.runner).toBe(270);
    expect(b.hints.find((h) => h.code === 'tiefe')?.level).toBe('warn');
  });
});
