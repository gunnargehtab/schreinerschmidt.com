// Live edge outline: deterministic and within ±40 mm of the nominal edge (docs/configurator.md §7).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LIVE_EDGE_DEV, liveEdgeOutline } from '../../../src/lib/configurator/furniture/live-edge';

describe('liveEdgeOutline', () => {
  it('is deterministic per seed and differs between seeds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1200, max: 3200 }), fc.integer({ min: 700, max: 1100 }), fc.nat(), (l, w, seed) => {
        const a = liveEdgeOutline(l, w, seed);
        expect(liveEdgeOutline(l, w, seed)).toEqual(a);
        expect(liveEdgeOutline(l, w, seed + 1)).not.toEqual(a);
      }),
    );
  });

  it('stays within 40 mm of the nominal long edges and inside the slab', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1200, max: 3200 }), fc.integer({ min: 700, max: 1100 }), fc.nat(), (l, w, seed) => {
        const pts = liveEdgeOutline(l, w, seed);
        expect(pts.length).toBeGreaterThanOrEqual(26);
        expect(pts.length % 2).toBe(0);
        const half = pts.length / 2;
        pts.forEach(([x, y], i) => {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(l);
          const nominal = i < half ? 0 : w;
          expect(Math.abs(y - nominal)).toBeLessThanOrEqual(LIVE_EDGE_DEV);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(w);
        });
        // Straight short ends: first and last point of each edge share the x of the slab ends.
        expect(pts[0]![0]).toBe(0);
        expect(pts[half - 1]![0]).toBe(l);
        expect(pts[half]![0]).toBe(l);
        expect(pts[pts.length - 1]![0]).toBe(0);
      }),
    );
  });

  it('actually wanders (not a straight line)', () => {
    const ys = liveEdgeOutline(2000, 900, 7)
      .slice(0, 10)
      .map(([, y]) => y);
    expect(new Set(ys).size).toBeGreaterThan(3);
  });
});
