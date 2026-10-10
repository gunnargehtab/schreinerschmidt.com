// Camera fit and presets (docs/configurator.md §4.6 "Camera fit"). Pure three.js maths, no DOM:
// tests/unit/configurator/viewer3d/camera.test.ts covers fitDistance() and needsRefit().
import { Box3, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { FurnitureParams } from '../../../lib/configurator/furniture/types';
import type { ViewPreset } from './types';

const _c = new Vector3();
const _r = new Vector3();
const _u = new Vector3();
const _p = new Vector3();

/** Distance along `forward` (camera → target) at which the box fits the view with `margin`. */
export function fitDistance(box: Box3, forward: Vector3, cam: PerspectiveCamera, margin = 1.1): number {
  const c = box.getCenter(_c);
  const right = _r.crossVectors(forward, cam.up).normalize();
  const up = _u.crossVectors(right, forward);
  const tanV = Math.tan(MathUtils.degToRad(cam.fov) / 2);
  const tanH = tanV * cam.aspect;
  let d = 0;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    const x = Math.abs(_p.dot(right)) * margin;
    const y = Math.abs(_p.dot(up)) * margin;
    const z = _p.dot(forward);
    d = Math.max(d, x / tanH - z, y / tanV - z);
  }
  return d; // near = d/100, far = d*10
}

/**
 * Refit hysteresis (§4.6): true when a corner leaves |NDC| 0.95 or the object fills less than 55 %
 * of the view in both directions. The camera matrices must be current.
 */
export function needsRefit(box: Box3, cam: PerspectiveCamera): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
    if (Math.abs(_p.x) > 0.95 || Math.abs(_p.y) > 0.95) return true;
    minX = Math.min(minX, _p.x);
    maxX = Math.max(maxX, _p.x);
    minY = Math.min(minY, _p.y);
    maxY = Math.max(maxY, _p.y);
  }
  return Math.max(maxX - minX, maxY - minY) / 2 < 0.55;
}

/** Azimuth (°) and elevation (°) of the camera relative to the target, 0° = in front. */
export const PRESETS: Record<ViewPreset, { az: number; el: number }> = {
  vorne: { az: 0, el: 4 },
  seite: { az: 90, el: 4 },
  dreiviertel: { az: 35, el: 18 },
  oben: { az: 0, el: 83 },
};

/** Unit vector from the target towards the camera for an azimuth/elevation in degrees. */
export function directionOf(az: number, el: number, out = new Vector3()): Vector3 {
  const a = MathUtils.degToRad(az);
  const e = MathUtils.degToRad(el);
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

/** Azimuth limit (°) per furniture kind (§4.6): ±60° in a niche, ±120° for carcasses, free for tables. */
export function azimuthLimit(kind: FurnitureParams['kind']): number {
  return kind === 'einbauschrank' ? 60 : kind === 'esstisch' ? Infinity : 120;
}

/** An azimuth (°) clamped to the kind's limit; a kind switch re-clamps the current camera with it. */
export function clampAzimuth(az: number, kind: FurnitureParams['kind']): number {
  const l = azimuthLimit(kind);
  return Math.max(-l, Math.min(l, az));
}

/** Polar angle limits (rad): never below the floor, never exactly on top. */
export const POLAR = { min: 0.12, max: Math.PI / 2 - 0.03 };
