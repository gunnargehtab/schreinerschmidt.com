// Build-time SVG renderer for the sketch system (docs/design-system.md §3).
// rough.js's generator needs no DOM; SVGO tidies the path data. The result carries no <style>,
// no `style=` attribute and no text, so it passes the CSP, html-validate and the a11y gates.
// The bundled entry: rough.js's bin/*.js files use extensionless imports that Node cannot resolve.
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import { optimize } from 'svgo';
import type { Drawing, Pass, Point, Primitive } from './primitives';

export interface RenderOptions {
  /** Extra class names; `sketch` is always present. */
  class?: string | undefined;
  /** `data-draw`: 'scroll' draws on a view timeline, 'load' once after load (motion.css). */
  draw?: 'scroll' | 'load' | undefined;
  /** CSS length for `--sketch-size` (inline-size); the default is 100% of the container. */
  size?: string | undefined;
}

const PASSES: readonly Pass[] = [1, 2, 3, 4];

/** Hatching runs at half the drawing's stroke (§3: 0.75 on a 1.5 icon, 1 on hero art) at opacity .55. */
export const hatchStrokeWidth = (drawing: Drawing): number => drawing.strokeWidth / 2;

/** Formats a number the way SVGO's cleanupNumericValues does (no leading zero, ≤ 2 decimals). */
export const svgNumber = (n: number): string => String(Number(n.toFixed(2))).replace(/^0\./, '.');

/** Per-pass presentation attributes. */
function passAttrs(drawing: Drawing, pass: Pass): string {
  return pass === 3 ? ` stroke-width="${svgNumber(hatchStrokeWidth(drawing))}" opacity=".55"` : '';
}

const generator = rough.generator();

/** Each primitive gets its own seed so the wobble is uncorrelated but still deterministic. */
const seedFor = (base: number, index: number): number => ((base * 7919 + index * 104729) % 2147483646) + 1;

function roughOptions(drawing: Drawing, p: Primitive, index: number): Options {
  const options: Options = {
    seed: seedFor(drawing.seed, index),
    roughness: p.roughness ?? drawing.roughness,
    bowing: p.bowing ?? 0.8,
    stroke: '#000',
    strokeWidth: 1,
    disableMultiStroke: p.single ?? true,
    preserveVertices: p.preserveVertices ?? false,
    fixedDecimalPlaceDigits: 2,
  };
  if (p.kind === 'hatch') {
    options.stroke = 'none';
    options.fill = '#000';
    options.fillStyle = p.style ?? 'hachure';
    options.hachureAngle = p.angle ?? -45;
    options.hachureGap = p.gap ?? 4;
    options.fillWeight = 1;
    options.disableMultiStrokeFill = true;
  }
  return options;
}

/**
 * rough.js rotates polygon points in place while hatching and rotates them back, which leaves
 * floating-point residue on the drawing's own arrays and breaks determinism. Always hand it copies.
 */
const copy = (points: Point[]): Point[] => points.map(([x, y]) => [x, y]);

function pathData(drawing: Drawing, p: Primitive, index: number): string[] {
  const o = roughOptions(drawing, p, index);
  const g = generator;
  switch (p.kind) {
    case 'line': {
      const over = p.overshoot ?? 0;
      let [x1, y1] = p.from;
      let [x2, y2] = p.to;
      if (over > 0) {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const ux = ((x2 - x1) / len) * over;
        const uy = ((y2 - y1) / len) * over;
        x1 -= ux;
        y1 -= uy;
        x2 += ux;
        y2 += uy;
      }
      return g.toPaths(g.line(x1, y1, x2, y2, o)).map((info) => info.d);
    }
    case 'polyline':
      return g.toPaths(g.linearPath(copy(p.points), o)).map((info) => info.d);
    case 'polygon':
      return g.toPaths(g.polygon(copy(p.points), o)).map((info) => info.d);
    case 'rect':
      return g.toPaths(g.rectangle(p.x, p.y, p.w, p.h, o)).map((info) => info.d);
    case 'ellipse':
      return g.toPaths(g.ellipse(p.cx, p.cy, p.w, p.h, o)).map((info) => info.d);
    case 'arc':
      return g.toPaths(g.arc(p.cx, p.cy, p.w, p.h, p.start, p.end, false, o)).map((info) => info.d);
    case 'curve':
      return g.toPaths(g.curve(copy(p.points), o)).map((info) => info.d);
    case 'hatch':
      if (p.style === 'dots') return [stipplePath(p.points, p.gap ?? 6, o.seed ?? 1)];
      return g
        .toPaths(g.polygon(copy(p.points), o))
        .filter((info) => info.d.trim() !== '')
        .map((info) => info.d);
  }
}

/**
 * Stipple as ONE path of tiny circles on a jittered grid, clipped to the polygon. rough.js's own
 * dot filler calls Math.random() and cannot be seeded, so this uses the same LCG rough.js uses.
 */
function stipplePath(points: Point[], gap: number, seed: number): string {
  let state = seed;
  const next = () => ((2 ** 31 - 1) & (state = Math.imul(48271, state))) / 2 ** 31;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const r = 0.55;
  const parts: string[] = [];
  for (let y = Math.min(...ys) + gap / 2; y < Math.max(...ys); y += gap) {
    for (let x = Math.min(...xs) + gap / 2; x < Math.max(...xs); x += gap) {
      const cx = x + (next() - 0.5) * gap * 0.6;
      const cy = y + (next() - 0.5) * gap * 0.6;
      if (!pointInPolygon([cx, cy], points)) continue;
      parts.push(`M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0`);
    }
  }
  return parts.join('');
}

const f = (n: number): string => String(Number(n.toFixed(1)));

function pointInPolygon([x, y]: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as Point;
    const [xj, yj] = polygon[j] as Point;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Renders the drawing to a bare SVG (no class, no data-draw): the cacheable part. */
export function renderDrawing(drawing: Drawing): string {
  const groups = PASSES.map((pass) => {
    const paths = drawing.primitives
      .map((p, i) => [p, i] as const)
      .filter(([p]) => p.pass === pass)
      .flatMap(([p, i]) => pathData(drawing, p, i))
      .map((d) => `<path d="${d}" pathLength="1"/>`);
    return paths.length ? `<g data-pass="${pass}"${passAttrs(drawing, pass)}>${paths.join('')}</g>` : '';
  });
  const [w, h] = drawing.viewBox;
  // The root stroke width is present during optimisation so SVGO does not treat the hatching
  // group's stroke-width="1" (hero art) as the default and strip it. The root tag is rebuilt below.
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" stroke-width="${drawing.strokeWidth}">${groups.join('')}</svg>`;
  const { data } = optimize(raw, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            // Groups carry the pass, paths carry pathLength; neither may be merged or moved.
            collapseGroups: false,
            mergePaths: false,
            moveElemsAttrsToGroup: false,
            moveGroupAttrsToElems: false,
            convertPathData: { floatPrecision: 1 },
            cleanupNumericValues: { floatPrecision: 2 },
          },
        },
      },
      'convertStyleToAttrs',
    ],
  });
  // SVGO drops unknown root attributes (focusable) and reorders the rest: rebuild the root tag.
  const inner = data.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  if (inner.includes('<style') || /\sstyle=/.test(inner)) throw new Error('sketch: SVGO left a style in the SVG');
  return `<svg viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

/** Attributes shared by every sketch (§3): no fill, currentColor strokes, round caps and joins. */
export function svgAttributes(drawing: Drawing, options: RenderOptions = {}): string {
  const [w, h] = drawing.viewBox;
  const classes = ['sketch', options.class].filter(Boolean).join(' ');
  const attrs = [
    `class="${classes}"`,
    `viewBox="0 0 ${w} ${h}"`,
    `width="${w}"`,
    `height="${h}"`,
    'fill="none"',
    'stroke="currentColor"',
    `stroke-width="${drawing.strokeWidth}"`,
    'stroke-linecap="round"',
    'stroke-linejoin="round"',
    'aria-hidden="true"',
    'focusable="false"',
  ];
  if (options.draw) attrs.push(`data-draw="${options.draw}"`);
  if (options.size) attrs.push(`style="--sketch-size: ${options.size}"`);
  return attrs.join(' ');
}

/** Full inline SVG for a drawing with the component attributes applied. */
export function wrapSvg(drawing: Drawing, bare: string, options: RenderOptions = {}): string {
  return bare.replace(/^<svg[^>]*>/, `<svg ${svgAttributes(drawing, options)}>`);
}
