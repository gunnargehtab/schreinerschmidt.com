// Assembly motion (src/lib/configurator/furniture/assembly.ts, docs/configurator.md §4.6 Phase C):
// hinge pivots and directions, drawer slides, handles that follow their front, explode vectors and
// the pose maths, checked against generated Builds.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DOOR_ANGLE_DEG,
  EXPLODE_RATIO,
  explodeDistance,
  explodeOf,
  motionOf,
  poseOf,
} from '../../../src/lib/configurator/furniture/assembly';
import { generate } from '../../../src/lib/configurator/furniture';
import type { Build, CarcassParams, Part, TableParams } from '../../../src/lib/configurator/furniture/types';

const carcassArb: fc.Arbitrary<CarcassParams> = fc.record({
  kind: fc.constantFrom('regal', 'sideboard', 'einbauschrank' as const),
  width: fc.integer({ min: 80, max: 280 }).map((v) => v * 10),
  height: fc.integer({ min: 50, max: 260 }).map((v) => v * 10),
  depth: fc.integer({ min: 35, max: 55 }).map((v) => v * 10),
  board: fc.constantFrom(19, 25, 40 as const),
  front: fc.constantFrom('offen', 'tueren', 'schubkaesten', 'gemischt' as const),
  base: fc.record({
    type: fc.constantFrom('sockel', 'fuesse', 'haengend', 'ohne' as const),
    height: fc.integer({ min: 60, max: 250 }),
  }),
  back: fc.constantFrom('ohne', 'eingenutet' as const),
  shelvesPerBay: fc.constant('auto' as const),
  handle: fc.constantFrom('grifflos', 'holz', 'metall' as const),
  species: fc.constant('eiche' as const),
  finish: fc.constant('natur-geoelt' as const),
});

const tableArb: fc.Arbitrary<TableParams> = fc.record({
  kind: fc.constant('esstisch' as const),
  length: fc.integer({ min: 120, max: 320 }).map((v) => v * 10),
  width: fc.integer({ min: 70, max: 110 }).map((v) => v * 10),
  height: fc.integer({ min: 72, max: 78 }).map((v) => v * 10),
  top: fc.constantFrom(25, 40, 60 as const),
  edge: fc.constantFrom('gerade', 'baumkante' as const),
  seed: fc.nat(),
  base: fc.constantFrom('vierfuss', 'kufen-holz', 'kufen-stahl' as const),
  species: fc.constant('eiche' as const),
  finish: fc.constant('natur-geoelt' as const),
});

const byId = (b: Build) => new Map(b.parts.map((p) => [p.id, p]));
const centre = (p: Part, i: number) => p.min[i]! + p.size[i]! / 2;
const EPS = 1e-6;

describe('motionOf', () => {
  it('doors hinge on their outer front edge and swing away from it; drawers slide 0.7 × depth', () => {
    fc.assert(
      fc.property(carcassArb, (params) => {
        const b = generate(params);
        for (const p of b.parts) {
          const m = motionOf(p, byId(b));
          if (p.role === 'tuer') {
            expect(m?.kind).toBe('hinge');
            if (m?.kind !== 'hinge') return;
            // The pivot sits on the front face, at the bottom corner of the hinge side.
            expect(m.pivot[1]).toBe(p.min[1]);
            expect(m.pivot[2]).toBeCloseTo(p.min[2] + p.size[2], 6);
            if (m.dir === 1) expect(m.pivot[0]).toBeCloseTo(p.min[0], 6);
            else expect(m.pivot[0]).toBeCloseTo(p.min[0] + p.size[0], 6);
          } else if (p.role === 'schubkastenfront') {
            expect(m?.kind).toBe('slide');
            if (m?.kind === 'slide') {
              expect(m.dist).toBeGreaterThan(0);
              expect(m.dist).toBeLessThanOrEqual(0.7 * params.depth + 1);
            }
          } else if (p.role !== 'griff') expect(m).toBeUndefined();
        }
      }),
    );
  });

  it('a handle takes the motion of the front it sits on', () => {
    fc.assert(
      fc.property(carcassArb, (params) => {
        const b = generate({ ...params, handle: 'metall' });
        const map = byId(b);
        const handles = b.parts.filter((p) => p.role === 'griff');
        if (params.front !== 'offen') expect(handles.length).toBeGreaterThan(0);
        for (const h of handles) {
          const front = map.get(h.id.slice(0, -'/griff'.length));
          expect(front?.motion).toBeDefined();
          expect(motionOf(h, map)).toBe(front!.motion);
        }
      }),
    );
  });

  it('two doors in a bay hinge on opposite sides (left door dir 1, right door dir −1)', () => {
    const b = generate({
      kind: 'sideboard',
      width: 1200,
      height: 800,
      depth: 450,
      board: 19,
      front: 'tueren',
      base: { type: 'sockel', height: 80 },
      back: 'eingenutet',
      shelvesPerBay: 'auto',
      handle: 'grifflos',
      species: 'eiche',
      finish: 'natur-geoelt',
    });
    const doors = b.parts.filter((p) => p.role === 'tuer').sort((x, y) => x.min[0] - y.min[0]);
    expect(doors).toHaveLength(2);
    expect(doors.map((d) => d.motion && d.motion.kind === 'hinge' && d.motion.dir)).toEqual([1, -1]);
  });
});

describe('explodeOf', () => {
  it('carcass: sides out, top up, back backwards, fronts and shelves forward, nothing below the floor', () => {
    fc.assert(
      fc.property(carcassArb, (params) => {
        const b = generate(params);
        const dist = explodeDistance(b);
        expect(dist).toBeCloseTo(EXPLODE_RATIO * Math.max(params.width, params.height, params.depth), 6);
        const einbau = params.kind === 'einbauschrank';
        for (const p of b.parts) {
          const e = explodeOf(p, b);
          if (p.role === 'wand' || p.role === 'sockel' || p.role === 'fuss') expect(e).toBeNull();
          else if (p.role === 'seite') {
            if (einbau) expect(e).toBeNull();
            else expect(e![0]).toBe(p.id.endsWith('L') ? -1 : 1);
          } else if (p.role === 'oberboden') {
            if (einbau) expect(e).toBeNull();
            else expect(e![1]).toBeGreaterThan(1);
          } else if (p.role === 'rueckwand') expect(e![2]).toBe(-1);
          else if (p.role === 'fachboden') expect(e![2]).toBeGreaterThan(0);
          else if (p.role === 'tuer' || p.role === 'schubkastenfront' || p.role === 'griff') {
            expect(e![2]).toBeGreaterThan(explodeOf({ ...p, role: 'fachboden' }, b)![2]);
          } else if (p.role === 'passleiste' || p.role === 'blende') expect(e![2]).toBeGreaterThan(0);
          // The exploded part never sinks below the floor.
          if (e) {
            const { pos } = poseOf(p, undefined, e, 0, 1, dist);
            expect(pos[1] - p.size[1] / 2).toBeGreaterThanOrEqual(-EPS);
          }
        }
      }),
    );
  });

  it('table: top up, legs diagonally away from the centre, Zargen outwards, Kufen apart, Traverse stays above the floor', () => {
    fc.assert(
      fc.property(tableArb, (params) => {
        const b = generate(params);
        const dist = explodeDistance(b);
        const cx = params.length / 2;
        const cz = params.width / 2;
        for (const p of b.parts) {
          const e = explodeOf(p, b)!;
          expect(e).not.toBeNull();
          const dx = centre(p, 0) - cx;
          const dz = centre(p, 2) - cz;
          if (p.role === 'platte') expect(e).toEqual([0, 1, 0]);
          else if (p.role === 'bein') {
            expect(Math.sign(e[0])).toBe(Math.sign(dx));
            expect(Math.sign(e[2])).toBe(Math.sign(dz));
            expect(e[1]).toBe(0);
          } else if (p.role === 'zarge') {
            // Away from the centre, perpendicular to the grain.
            if (p.grain === 0) expect(e).toEqual([0, 0, Math.sign(dz)]);
            else expect(e).toEqual([Math.sign(dx), 0, 0]);
          } else if (p.role === 'kufe') expect(e).toEqual([Math.sign(dx), 0, 0]);
          else if (p.role === 'traverse') {
            expect(e[1]).toBeLessThan(0);
            const { pos } = poseOf(p, undefined, e, 0, 1, dist);
            expect(pos[1] - p.size[1] / 2).toBeGreaterThan(0);
          }
        }
      }),
    );
  });

  it('a generator-provided Part.explode wins over the derived direction', () => {
    const b = generate({
      kind: 'esstisch',
      length: 2000,
      width: 900,
      height: 750,
      top: 40,
      edge: 'gerade',
      seed: 1,
      base: 'vierfuss',
      species: 'eiche',
      finish: 'natur-geoelt',
    });
    const top = { ...b.parts[0]!, explode: [1, 2, 3] as [number, number, number] };
    expect(explodeOf(top, b)).toEqual([1, 2, 3]);
  });
});

describe('poseOf', () => {
  const door: Part = {
    id: 'feld1/tuer1',
    role: 'tuer',
    label: 'Tür',
    min: [3, 3, 331],
    size: [400, 700, 19],
    grain: 1,
    surface: 'holz',
    solid: true,
    uvAnchor: 'local',
  };

  it('closed and assembled: the part centre, no rotation', () => {
    const left = { kind: 'hinge' as const, pivot: [3, 3, 350] as [number, number, number], dir: 1 as const };
    const { pos, rotY } = poseOf(door, left, [0, 0, 1.5], 0, 0, 300);
    expect(pos).toEqual([203, 353, 340.5]);
    expect(rotY).toBe(0);
  });

  it('a left-hinged door swings 100° forward about its left front edge, a right-hinged one mirrors it', () => {
    const left = { kind: 'hinge' as const, pivot: [3, 3, 350] as [number, number, number], dir: 1 as const };
    const l = poseOf(door, left, null, 1, 0, 300);
    expect(Math.abs(l.rotY)).toBeCloseTo((DOOR_ANGLE_DEG * Math.PI) / 180, 9);
    // The centre is still 200 mm (half the width, plus half the thickness) from the pivot …
    const r0 = Math.hypot(203 - 3, 340.5 - 350);
    expect(Math.hypot(l.pos[0] - 3, l.pos[2] - 350)).toBeCloseTo(r0, 6);
    // … and in front of the carcass (z > front), slightly past 90°, so x is left of the pivot.
    expect(l.pos[2]).toBeGreaterThan(350 + 150);
    expect(l.pos[0]).toBeLessThan(3);
    expect(l.pos[1]).toBe(353);

    const right = { kind: 'hinge' as const, pivot: [403, 3, 350] as [number, number, number], dir: -1 as const };
    const r = poseOf(door, right, null, 1, 0, 300);
    expect(r.rotY).toBeCloseTo(-l.rotY, 9);
    expect(r.pos[2]).toBeCloseTo(l.pos[2], 6);
    expect(r.pos[0] - 403).toBeCloseTo(-(l.pos[0] - 3), 6);
  });

  it('half open is half the angle; a drawer slides straight out by its distance × open', () => {
    const left = { kind: 'hinge' as const, pivot: [3, 3, 350] as [number, number, number], dir: 1 as const };
    expect(poseOf(door, left, null, 0.5, 0, 300).rotY).toBeCloseTo(-(DOOR_ANGLE_DEG / 2) * (Math.PI / 180), 9);
    const slide = { kind: 'slide' as const, dist: 315 };
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (k) => {
        const { pos, rotY } = poseOf(door, slide, null, k, 0, 300);
        expect(rotY).toBe(0);
        expect(pos[0]).toBe(203);
        expect(pos[2]).toBeCloseTo(340.5 + 315 * k, 9);
      }),
    );
  });

  it('explode adds direction × distance × state on top of the motion', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 50, max: 500 }),
        (open, ex, dist) => {
          const slide = { kind: 'slide' as const, dist: 315 };
          const a = poseOf(door, slide, null, open, 0, dist);
          const b = poseOf(door, slide, [0, 0.6, 1.5], open, ex, dist);
          expect(b.pos[0]).toBeCloseTo(a.pos[0], 9);
          expect(b.pos[1]).toBeCloseTo(a.pos[1] + 0.6 * dist * ex, 9);
          expect(b.pos[2]).toBeCloseTo(a.pos[2] + 1.5 * dist * ex, 9);
        },
      ),
    );
  });
});
