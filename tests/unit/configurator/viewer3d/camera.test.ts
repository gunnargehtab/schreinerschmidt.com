// Camera fit (src/scripts/configurator/viewer3d/camera.ts): fitDistance() places every corner
// inside the view with the margin and is tight; needsRefit() hysteresis; presets and limits.
import fc from 'fast-check';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  azimuthLimit,
  clampAzimuth,
  directionOf,
  fitDistance,
  needsRefit,
} from '../../../../src/scripts/configurator/viewer3d/camera';

const boxArb = fc
  .tuple(
    fc.double({ min: 0.05, max: 4, noNaN: true }),
    fc.double({ min: 0.05, max: 3.2, noNaN: true }),
    fc.double({ min: 0.05, max: 1.2, noNaN: true }),
  )
  .map(([w, h, d]) => new Box3(new Vector3(0, 0, 0), new Vector3(w, h, d)));
const dirArb = fc
  .tuple(fc.integer({ min: -170, max: 170 }), fc.integer({ min: 2, max: 85 }))
  .map(([az, el]) => directionOf(az, el));
const aspectArb = fc.double({ min: 0.5, max: 2.5, noNaN: true });

/** Places the camera at `d` along −forward from the box centre and projects the corners. */
function corners(box: Box3, forward: Vector3, cam: PerspectiveCamera, d: number): Vector3[] {
  const c = box.getCenter(new Vector3());
  cam.position.copy(c).addScaledVector(forward, -d);
  cam.lookAt(c);
  cam.near = d / 100;
  cam.far = d * 10;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const out: Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    out.push(
      new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(
        cam,
      ),
    );
  }
  return out;
}

describe('fitDistance', () => {
  it('keeps every corner inside |NDC| ≤ 1/margin and is tight (a closer camera cuts a corner)', () => {
    fc.assert(
      fc.property(boxArb, dirArb, aspectArb, (box, dir, aspect) => {
        const cam = new PerspectiveCamera(30, aspect, 0.01, 100);
        const forward = dir.clone().negate();
        const d = fitDistance(box, forward, cam, 1.1);
        expect(d).toBeGreaterThan(0);
        const inside = corners(box, forward, cam, d).every(
          (p) => Math.abs(p.x) <= 1 / 1.1 + 1e-3 && Math.abs(p.y) <= 1 / 1.1 + 1e-3,
        );
        expect(inside).toBe(true);
        const closer = corners(box, forward, cam, d * 0.85).some(
          (p) => Math.abs(p.x) > 1 / 1.1 || Math.abs(p.y) > 1 / 1.1,
        );
        expect(closer).toBe(true);
      }),
    );
  });

  it('grows with the box and shrinks with a wider aspect for a wide object', () => {
    const cam = new PerspectiveCamera(30, 1, 0.01, 100);
    const fwd = new Vector3(0, 0, -1);
    const small = fitDistance(new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 0.3)), fwd, cam);
    const big = fitDistance(new Box3(new Vector3(0, 0, 0), new Vector3(2, 2, 0.3)), fwd, cam);
    expect(big).toBeGreaterThan(small);
    cam.aspect = 2;
    expect(fitDistance(new Box3(new Vector3(0, 0, 0), new Vector3(2, 0.5, 0.3)), fwd, cam)).toBeLessThan(
      fitDistance(
        new Box3(new Vector3(0, 0, 0), new Vector3(2, 0.5, 0.3)),
        fwd,
        new PerspectiveCamera(30, 1, 0.01, 100),
      ),
    );
  });
});

describe('needsRefit', () => {
  const cam = new PerspectiveCamera(30, 4 / 3, 0.01, 100);
  const box = new Box3(new Vector3(0, 0, 0), new Vector3(1.2, 2, 0.35));
  const fwd = directionOf(35, 18).negate();

  it('is false right after a fit', () => {
    corners(box, fwd, cam, fitDistance(box, fwd, cam));
    expect(needsRefit(box, cam)).toBe(false);
  });

  it('is true when the object outgrows the view or fills less than 55 %', () => {
    const d = fitDistance(box, fwd, cam);
    corners(box, fwd, cam, d * 0.6);
    expect(needsRefit(box, cam)).toBe(true);
    corners(box, fwd, cam, d * 2.5);
    expect(needsRefit(box, cam)).toBe(true);
  });

  it('tolerates moderate changes (hysteresis)', () => {
    const d = fitDistance(box, fwd, cam);
    corners(box, fwd, cam, d * 1.3);
    expect(needsRefit(box, cam)).toBe(false);
  });
});

describe('presets and limits', () => {
  it('directionOf returns unit vectors; the front preset looks from +z', () => {
    fc.assert(
      fc.property(fc.integer({ min: -180, max: 180 }), fc.integer({ min: -89, max: 89 }), (az, el) => {
        expect(directionOf(az, el).length()).toBeCloseTo(1, 9);
      }),
    );
    const v = directionOf(PRESETS.vorne.az, PRESETS.vorne.el);
    expect(v.z).toBeGreaterThan(0.99);
    expect(Math.abs(v.x)).toBeLessThan(1e-9);
    expect(directionOf(PRESETS.seite.az, PRESETS.seite.el).x).toBeGreaterThan(0.99);
    expect(directionOf(PRESETS.oben.az, PRESETS.oben.el).y).toBeGreaterThan(0.99);
  });

  it('azimuth limits per kind (§4.6)', () => {
    expect(azimuthLimit('einbauschrank')).toBe(60);
    expect(azimuthLimit('regal')).toBe(120);
    expect(azimuthLimit('sideboard')).toBe(120);
    expect(azimuthLimit('esstisch')).toBe(Infinity);
  });

  it('clampAzimuth: Regal ±120°, Einbauschrank ±60°, Esstisch free; a kind switch re-clamps the camera', () => {
    expect(clampAzimuth(120, 'regal')).toBe(120);
    expect(clampAzimuth(135, 'regal')).toBe(120);
    expect(clampAzimuth(-135, 'sideboard')).toBe(-120);
    expect(clampAzimuth(120, 'einbauschrank')).toBe(60); // Regal → Einbauschrank at 120°
    expect(clampAzimuth(-120, 'einbauschrank')).toBe(-60);
    expect(clampAzimuth(170, 'esstisch')).toBe(170);
    expect(clampAzimuth(-179, 'esstisch')).toBe(-179);
    fc.assert(
      fc.property(fc.integer({ min: -180, max: 180 }), (az) => {
        expect(Math.abs(clampAzimuth(az, 'einbauschrank'))).toBeLessThanOrEqual(60);
        expect(Math.abs(clampAzimuth(az, 'regal'))).toBeLessThanOrEqual(120);
        expect(clampAzimuth(az, 'esstisch')).toBe(az);
        // Within the limit the value is untouched; outside it lands on the limit with the same sign.
        const c = clampAzimuth(az, 'einbauschrank');
        if (Math.abs(az) <= 60) expect(c).toBe(az);
        else expect(c).toBe(Math.sign(az) * 60);
      }),
    );
  });
});
