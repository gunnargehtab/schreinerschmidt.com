// Live-edge geometry (src/scripts/configurator/viewer3d/live-edge-geometry.ts, docs/configurator.md
// §4.4): the extruded outline in metres, centred like a panel, two groups (caps / Waldkante), the top
// grain along x at the texture scale, and it follows the seed.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generate } from '../../../../src/lib/configurator/furniture';
import { LIVE_EDGE_DEV } from '../../../../src/lib/configurator/furniture/live-edge';
import type { Part, TableParams } from '../../../../src/lib/configurator/furniture/types';
import { centreOf } from '../../../../src/scripts/configurator/viewer3d/panel-geometry';
import { liveEdgeGeometry } from '../../../../src/scripts/configurator/viewer3d/live-edge-geometry';

const tableArb: fc.Arbitrary<TableParams> = fc.record({
  kind: fc.constant('esstisch' as const),
  length: fc.integer({ min: 120, max: 320 }).map((v) => v * 10),
  width: fc.integer({ min: 70, max: 110 }).map((v) => v * 10),
  height: fc.constant(750),
  top: fc.constantFrom(40, 60 as const),
  edge: fc.constant('baumkante' as const),
  seed: fc.nat(),
  base: fc.constant('vierfuss' as const),
  species: fc.constant('eiche' as const),
  finish: fc.constant('natur-geoelt' as const),
});

const topOf = (p: TableParams): Part => generate(p).parts.find((x) => x.role === 'platte')!;

describe('liveEdgeGeometry', () => {
  it('is centred on the part, L × T × W in metres with the live edges within 40 mm of the nominal width', () => {
    fc.assert(
      fc.property(tableArb, fc.integer({ min: 800, max: 2000 }), (p, texMm) => {
        const part = topOf(p);
        expect(part.outline).toBeDefined();
        const g = liveEdgeGeometry(part, texMm, [0, 0]);
        g.computeBoundingBox();
        const { min, max } = g.boundingBox!;
        expect(min.x).toBeCloseTo(-p.length / 2000, 6);
        expect(max.x).toBeCloseTo(p.length / 2000, 6);
        expect(min.y).toBeCloseTo(-p.top / 2000, 6);
        expect(max.y).toBeCloseTo(p.top / 2000, 6);
        expect(min.z).toBeGreaterThanOrEqual(-p.width / 2000 - 1e-9);
        expect(min.z).toBeLessThanOrEqual((-p.width / 2 + LIVE_EDGE_DEV) / 1000 + 1e-9);
        expect(max.z).toBeLessThanOrEqual(p.width / 2000 + 1e-9);
        expect(max.z).toBeGreaterThanOrEqual((p.width / 2 - LIVE_EDGE_DEV) / 1000 - 1e-9);
        // The mesh position is the part centre, like a panel.
        expect(centreOf(part)).toEqual([p.length / 2000, (p.height - p.top / 2) / 1000, p.width / 2000]);
      }),
    );
  });

  it('has two groups covering every vertex: 0 the caps, 1 the side walls (Waldkante)', () => {
    fc.assert(
      fc.property(tableArb, (p) => {
        const g = liveEdgeGeometry(topOf(p), 1000, [0, 0]);
        const n = g.getAttribute('position').count;
        expect(g.index).toBeNull();
        expect(g.groups.map((gr) => gr.materialIndex)).toEqual([0, 1]);
        expect(g.groups.reduce((s, gr) => s + gr.count, 0)).toBe(n);
        expect(g.getAttribute('normal').count).toBe(n);
        expect(g.getAttribute('uv').count).toBe(n);
        // Caps: two faces of (points − 2) triangles each. Side walls: one quad (two triangles) per edge.
        const pts = topOf(p).outline!.length;
        expect(g.groups[0]!.count).toBe(2 * (pts - 2) * 3);
        expect(g.groups[1]!.count).toBe(pts * 6);
      }),
    );
  });

  it('top grain runs along x at the texture scale: v spans length / texMm, u spans ≤ width / texMm', () => {
    fc.assert(
      fc.property(tableArb, fc.integer({ min: 800, max: 2000 }), (p, texMm) => {
        const g = liveEdgeGeometry(topOf(p), texMm, [0, 0]);
        const uv = g.getAttribute('uv');
        const pos = g.getAttribute('position');
        const cap = g.groups[0]!;
        let minU = Infinity;
        let maxU = -Infinity;
        let minV = Infinity;
        let maxV = -Infinity;
        for (let i = cap.start; i < cap.start + cap.count; i++) {
          // Top cap only (y > 0).
          if (pos.getY(i) < 0) continue;
          minU = Math.min(minU, uv.getX(i));
          maxU = Math.max(maxU, uv.getX(i));
          minV = Math.min(minV, uv.getY(i));
          maxV = Math.max(maxV, uv.getY(i));
          // Real scale: v = x / texMm, u = z / texMm (both centred).
          expect(uv.getY(i)).toBeCloseTo((pos.getX(i) * 1000) / texMm, 5);
          expect(uv.getX(i)).toBeCloseTo((pos.getZ(i) * 1000) / texMm, 5);
        }
        expect(maxV - minV).toBeCloseTo(p.length / texMm, 5);
        expect(maxU - minU).toBeLessThanOrEqual(p.width / texMm + 1e-6);
        expect(maxU - minU).toBeGreaterThanOrEqual((p.width - 2 * LIVE_EDGE_DEV) / texMm - 1e-6);
      }),
    );
  });

  it('the top cap faces up, the jitter shifts the UVs by jitter / texMm', () => {
    const part = topOf({ ...fc.sample(tableArb, 1)[0]!, seed: 7 });
    const g = liveEdgeGeometry(part, 1000, [0, 0]);
    const nrm = g.getAttribute('normal');
    const pos = g.getAttribute('position');
    const cap = g.groups[0]!;
    let up = 0;
    let top = 0;
    for (let i = cap.start; i < cap.start + cap.count; i++) {
      if (pos.getY(i) < 0) continue;
      top++;
      if (nrm.getY(i) > 0.999) up++;
    }
    expect(top).toBeGreaterThan(0);
    expect(up).toBe(top);
    const j = liveEdgeGeometry(part, 1000, [250, 400]).getAttribute('uv');
    const u = g.getAttribute('uv');
    expect(j.getX(0) - u.getX(0)).toBeCloseTo(0.25, 6);
    expect(j.getY(0) - u.getY(0)).toBeCloseTo(0.4, 6);
  });

  it('follows the seed (tisch_brett): a different seed is a different slab, the same seed the same one', () => {
    const a = fc.sample(tableArb, 1)[0]!;
    const posOf = (seed: number) =>
      Array.from(liveEdgeGeometry(topOf({ ...a, seed }), 1000, [0, 0]).getAttribute('position').array);
    expect(posOf(1)).toEqual(posOf(1));
    expect(posOf(1)).not.toEqual(posOf(2));
  });
});
