// Panel geometry (src/scripts/configurator/viewer3d/panel-geometry.ts): a box in metres with
// grain-aware real-scale UVs, ≤ 2 groups (side / end grain), deterministic jitter, wall planes.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generate } from '../../../../src/lib/configurator/furniture';
import type { Axis, Part, Vec3 } from '../../../../src/lib/configurator/furniture/types';
import {
  centreOf,
  jitterOf,
  panelGeometry,
  wallGeometry,
} from '../../../../src/scripts/configurator/viewer3d/panel-geometry';

const partArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 12 }),
  min: fc.tuple(
    fc.integer({ min: -500, max: 4000 }),
    fc.integer({ min: 0, max: 3000 }),
    fc.integer({ min: 0, max: 700 }),
  ),
  size: fc.tuple(
    fc.integer({ min: 8, max: 4000 }),
    fc.integer({ min: 8, max: 3000 }),
    fc.integer({ min: 8, max: 700 }),
  ),
  grain: fc.constantFrom<Axis>(0, 1, 2),
  solid: fc.boolean(),
  uvAnchor: fc.constantFrom<'world' | 'local'>('world', 'local'),
});
interface PartInput {
  id: string;
  min: Vec3;
  size: Vec3;
  grain: Axis;
  solid: boolean;
  uvAnchor: 'world' | 'local';
}
const part = (p: PartInput): Part => ({ role: 'fachboden', label: 'Fachboden', surface: 'holz', ...p });

describe('panelGeometry', () => {
  it('builds 24 vertices, 36 indices and at most two groups covering every index', () => {
    fc.assert(
      fc.property(partArb, fc.integer({ min: 200, max: 3000 }), (p, texMm) => {
        const g = panelGeometry(part(p), texMm, [0, 0]);
        expect(g.getAttribute('position').count).toBe(24);
        expect(g.getAttribute('normal').count).toBe(24);
        expect(g.getAttribute('uv').count).toBe(24);
        expect(g.index!.count).toBe(36);
        expect(g.groups.length).toBeLessThanOrEqual(2);
        expect(g.groups.reduce((n, gr) => n + gr.count, 0)).toBe(36);
        // End grain (group 1) exists for solid parts only: two faces = 12 indices.
        const end = g.groups.find((gr) => gr.materialIndex === 1);
        if (p.solid) expect(end?.count).toBe(12);
        else expect(end).toBeUndefined();
      }),
    );
  });

  it('is centred on the origin with the part size in metres; the mesh position is the centre', () => {
    fc.assert(
      fc.property(partArb, (p) => {
        const g = panelGeometry(part(p), 1000, [0, 0]);
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        for (const i of [0, 1, 2] as const) {
          expect(bb.max.getComponent(i)).toBeCloseTo(p.size[i] / 2000, 6);
          expect(bb.min.getComponent(i)).toBeCloseTo(-p.size[i] / 2000, 6);
          expect(centreOf(part(p))[i]).toBeCloseTo((p.min[i] + p.size[i] / 2) / 1000, 9);
        }
      }),
    );
  });

  it('normals are unit axis vectors matching the face', () => {
    const g = panelGeometry(
      part({ id: 'a', min: [0, 0, 0], size: [100, 200, 300], grain: 1, solid: true, uvAnchor: 'local' }),
      1000,
      [0, 0],
    );
    const n = g.getAttribute('normal');
    const pos = g.getAttribute('position');
    for (let i = 0; i < 24; i++) {
      const v = [n.getX(i), n.getY(i), n.getZ(i)];
      expect(v.map(Math.abs).reduce((a, b) => a + b)).toBe(1);
      const axis = v.findIndex((c) => c !== 0);
      // The face lies on the ± half size of that axis.
      expect(Math.abs(pos.getComponent(i, axis))).toBeCloseTo([100, 200, 300][axis]! / 2000, 6);
    }
  });

  it('UVs run at real scale: v spans size/texMm along the grain on long-grain faces', () => {
    fc.assert(
      fc.property(partArb, fc.integer({ min: 200, max: 3000 }), (p, texMm) => {
        const g = panelGeometry(part(p), texMm, [0, 0]);
        const uv = g.getAttribute('uv');
        const n = g.getAttribute('normal');
        for (let f = 0; f < 6; f++) {
          const i = f * 4;
          const axis = [n.getX(i), n.getY(i), n.getZ(i)].findIndex((c) => c !== 0);
          if (axis === p.grain) continue; // end grain
          const vs = [0, 1, 2, 3].map((k) => uv.getY(i + k));
          expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(p.size[p.grain] / texMm, 4);
        }
      }),
    );
  });

  it('world-anchored parts take their UVs from the world position (continuous grain across fronts)', () => {
    const a = part({ id: 'a', min: [0, 0, 0], size: [400, 600, 19], grain: 0, solid: true, uvAnchor: 'world' });
    const b = part({ id: 'b', min: [400, 0, 0], size: [400, 600, 19], grain: 0, solid: true, uvAnchor: 'world' });
    const ua = panelGeometry(a, 1000, [0, 0]).getAttribute('uv');
    const ub = panelGeometry(b, 1000, [0, 0]).getAttribute('uv');
    // Front face (+z, face index 4): the grain (x) runs along v, so a's right edge v equals b's left edge v.
    const face = 4 * 4;
    const vA = [0, 1, 2, 3].map((k) => ua.getY(face + k));
    const vB = [0, 1, 2, 3].map((k) => ub.getY(face + k));
    expect(Math.max(...vA)).toBeCloseTo(Math.min(...vB), 6);
    expect(Math.max(...vA)).toBeCloseTo(0.4, 6);
  });

  it('jitter is deterministic and within one tile', () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 100, max: 3000 }), (id, texMm) => {
        const j = jitterOf(id, texMm);
        expect(j).toEqual(jitterOf(id, texMm));
        expect(j[0]).toBeGreaterThanOrEqual(0);
        expect(j[0]).toBeLessThan(texMm);
        expect(j[1]).toBeGreaterThanOrEqual(0);
        expect(j[1]).toBeLessThan(texMm);
      }),
    );
    expect(jitterOf('feld1/fach1', 1000)).not.toEqual(jitterOf('feld1/fach2', 1000));
  });
});

describe('wallGeometry', () => {
  it('turns the Einbauschrank walls into single planes facing the furniture', () => {
    const b = generate({
      kind: 'einbauschrank',
      width: 2400,
      height: 2500,
      depth: 600,
      board: 19,
      front: 'tueren',
      base: { type: 'sockel', height: 100 },
      back: 'eingenutet',
      shelvesPerBay: 'auto',
      handle: 'grifflos',
      niche: { fillerSide: 30, fillerTop: 40 },
      species: 'eiche',
      finish: 'natur-geoelt',
    });
    const walls = b.parts.filter((p) => p.surface === 'wand');
    expect(walls.length).toBe(3);
    for (const w of walls) {
      const g = wallGeometry(w, b.bounds)!;
      expect(g).not.toBeNull();
      expect(g.getAttribute('position').count).toBe(4);
      expect(g.index!.count).toBe(6);
      const n = g.getAttribute('normal');
      const normal = [n.getX(0), n.getY(0), n.getZ(0)];
      // Left wall faces +x, right wall −x, ceiling −y.
      if (w.id === 'wandL') expect(normal).toEqual([1, 0, 0]);
      if (w.id === 'wandR') expect(normal).toEqual([-1, 0, 0]);
      if (w.id === 'decke') expect(normal).toEqual([0, -1, 0]);
    }
  });

  it('returns null when no face touches the bounds', () => {
    const p = part({ id: 'x', min: [5000, 0, 0], size: [100, 100, 100], grain: 1, solid: false, uvAnchor: 'local' });
    expect(wallGeometry(p, { min: [0, 0, 0], max: [1000, 1000, 500] })).toBeNull();
  });
});
