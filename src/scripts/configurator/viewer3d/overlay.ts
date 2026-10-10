// Dimension overlay (docs/configurator.md §4.7): an aria-hidden SVG over the canvas, drawn from the
// DimSpecs with `views` containing '3d' on rendered frames only. Each chain is offset
// `60 + 40·level` mm from the object; a dimension shorter than 48 px on screen is skipped; the
// text angle is folded into ±90°, so it never reads upside down. The label halo comes from CSS
// (`paint-order: stroke`). `foldAngle()` and `dimLine()` are pure for the unit tests.
import { Vector3, type Camera } from 'three';
import type { DimSpec, Vec3 } from '../../../lib/configurator/furniture/types';

const SVG = 'http://www.w3.org/2000/svg';
/** Minimum projected length (px) for a dimension to be drawn. */
export const MIN_PX = 48;
/** Tick length (px) at the ends of a dimension line. */
const TICK = 5;

/** Screen point of a world point (mm), or null when behind the camera. */
export type Project = (p: Vec3) => [number, number] | null;

/** Folds a screen angle (°) into (−90, 90], so rotated text stays readable. */
export function foldAngle(deg: number): number {
  let a = ((deg + 90) % 180) - 90;
  if (a <= -90) a += 180;
  return a;
}

export interface DimLine {
  a: [number, number];
  b: [number, number];
  /** Extension-line starts (the object points). */
  a0: [number, number];
  b0: [number, number];
  len: number;
  angle: number;
  text: string;
}

/** The screen geometry of a dimension, or null when it is hidden or too short. */
export function dimLine(d: DimSpec, project: Project): DimLine | null {
  const off = 60 + 40 * d.level;
  const shift = (p: Vec3): Vec3 => [
    p[0] + d.offsetDir[0] * off,
    p[1] + d.offsetDir[1] * off,
    p[2] + d.offsetDir[2] * off,
  ];
  const a = project(shift(d.a));
  const b = project(shift(d.b));
  const a0 = project(d.a);
  const b0 = project(d.b);
  if (!a || !b || !a0 || !b0) return null;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < MIN_PX) return null;
  const angle = foldAngle((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
  return { a, b, a0, b0, len, angle, text: d.text };
}

export interface Overlay {
  el: SVGSVGElement;
  /** Draws the 3D dimensions for the camera at the given size (CSS px). */
  draw(dims: DimSpec[], camera: Camera, w: number, h: number): void;
  clear(): void;
  dispose(): void;
}

const _v = new Vector3();

export function createOverlay(host: HTMLElement): Overlay {
  const el = document.createElementNS(SVG, 'svg');
  el.setAttribute('class', 'preview__overlay');
  el.setAttribute('aria-hidden', 'true');
  host.append(el);
  let last = '';
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

  const draw: Overlay['draw'] = (dims, camera, w, h) => {
    const project: Project = (p) => {
      _v.set(p[0] / 1000, p[1] / 1000, p[2] / 1000).project(camera);
      return _v.z > 1 ? null : [((_v.x + 1) / 2) * w, ((1 - _v.y) / 2) * h];
    };
    let out = '';
    for (const d of dims) {
      if (!d.views.includes('3d')) continue;
      const l = dimLine(d, project);
      if (!l) continue;
      const f = (n: number) => n.toFixed(1);
      // Tick direction: 45° to the dimension line.
      const ux = (l.b[0] - l.a[0]) / l.len;
      const uy = (l.b[1] - l.a[1]) / l.len;
      const tx = (ux - uy) * TICK;
      const ty = (uy + ux) * TICK;
      const mx = (l.a[0] + l.b[0]) / 2;
      const my = (l.a[1] + l.b[1]) / 2;
      out +=
        `<g><line x1="${f(l.a0[0])}" y1="${f(l.a0[1])}" x2="${f(l.a[0])}" y2="${f(l.a[1])}" class="ov-ext"/>` +
        `<line x1="${f(l.b0[0])}" y1="${f(l.b0[1])}" x2="${f(l.b[0])}" y2="${f(l.b[1])}" class="ov-ext"/>` +
        `<line x1="${f(l.a[0])}" y1="${f(l.a[1])}" x2="${f(l.b[0])}" y2="${f(l.b[1])}"/>` +
        `<line x1="${f(l.a[0] - tx)}" y1="${f(l.a[1] - ty)}" x2="${f(l.a[0] + tx)}" y2="${f(l.a[1] + ty)}"/>` +
        `<line x1="${f(l.b[0] - tx)}" y1="${f(l.b[1] - ty)}" x2="${f(l.b[0] + tx)}" y2="${f(l.b[1] + ty)}"/>` +
        `<text transform="translate(${f(mx)} ${f(my)}) rotate(${f(l.angle)})" dy="-4" text-anchor="middle">${esc(l.text)}</text></g>`;
    }
    if (out !== last) {
      el.innerHTML = out;
      last = out;
    }
  };

  return {
    el,
    draw,
    clear() {
      el.innerHTML = '';
      last = '';
    },
    dispose() {
      el.remove();
    },
  };
}
