// Dimension overlay maths (src/scripts/configurator/viewer3d/overlay.ts): angle folding, offset
// projection and the 48 px minimum.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DimSpec, Vec3 } from '../../../../src/lib/configurator/furniture/types';
import { MIN_PX, dimLine, foldAngle, type Project } from '../../../../src/scripts/configurator/viewer3d/overlay';

describe('foldAngle', () => {
  it('lands in (−90, 90] and keeps the line direction modulo 180°', () => {
    fc.assert(
      fc.property(fc.double({ min: -720, max: 720, noNaN: true }), (deg) => {
        const a = foldAngle(deg);
        expect(a).toBeGreaterThan(-90);
        expect(a).toBeLessThanOrEqual(90);
        const diff = Math.abs(((((a - deg) % 180) + 180) % 180) - 0);
        expect(Math.min(diff, 180 - diff)).toBeLessThan(1e-6);
      }),
    );
  });

  it('never flips text upside down', () => {
    expect(foldAngle(0)).toBe(0);
    expect(foldAngle(180)).toBe(0);
    expect(foldAngle(-180)).toBe(0);
    expect(foldAngle(135)).toBe(-45);
    expect(foldAngle(-135)).toBe(45);
    expect(foldAngle(90)).toBe(90);
    expect(foldAngle(-90)).toBe(90);
  });
});

/** Orthographic projection: x right, y down, 0.1 px per mm, nothing behind the camera. */
const ortho: Project = (p: Vec3) => [p[0] * 0.1, -p[1] * 0.1];
const dim = (a: Vec3, b: Vec3, offsetDir: [number, number, number], level: number): DimSpec => ({
  id: 'd',
  a,
  b,
  offsetDir,
  level,
  text: '120',
  views: ['3d'],
});

describe('dimLine', () => {
  it('offsets the chain 60 + 40·level mm from the object and keeps the extension starts', () => {
    const l = dimLine(dim([0, 0, 0], [1200, 0, 0], [0, -1, 0], 1), ortho)!;
    expect(l).not.toBeNull();
    expect(l.a).toEqual([0, 10]); // 100 mm below, 0.1 px/mm, y down
    expect(l.b).toEqual([120, 10]);
    expect(l.a0[0]).toBe(0);
    expect(Math.abs(l.a0[1])).toBe(0);
    expect(l.len).toBeCloseTo(120, 9);
    expect(l.angle).toBe(0);
    expect(l.text).toBe('120');
  });

  it('skips dimensions shorter than 48 px or behind the camera', () => {
    expect(dimLine(dim([0, 0, 0], [400, 0, 0], [0, -1, 0], 0), ortho)).toBeNull();
    expect(dimLine(dim([0, 0, 0], [MIN_PX * 10, 0, 0], [0, -1, 0], 0), ortho)).not.toBeNull();
    const behind: Project = () => null;
    expect(dimLine(dim([0, 0, 0], [2000, 0, 0], [0, -1, 0], 0), behind)).toBeNull();
  });

  it('folds the text angle for a vertical chain drawn bottom-up', () => {
    const l = dimLine(dim([0, 0, 0], [0, 2000, 0], [-1, 0, 0], 1), ortho)!;
    expect(l.a[0]).toBeCloseTo(-10, 9);
    expect(l.angle).toBe(90);
  });
});
