// Build-time SVG renderer for the sketch system (docs/design-system.md §3).
// rough.js's generator needs no DOM; SVGO tidies the path data. The result carries no <style>,
// no `style=` attribute and no text, so it passes the CSP, html-validate and the a11y gates.
// The bundled entry: rough.js's bin/*.js files use extensionless imports that Node cannot resolve.
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import { optimize } from 'svgo';
import type { Drawing, Pass, Primitive } from './primitives';

export interface RenderOptions {
  /** Extra class names; `sketch` is always present. */
  class?: string | undefined;
  /** `data-draw`: 'scroll' draws on a view timeline, 'load' once after load (motion.css). */
  draw?: 'scroll' | 'load' | undefined;
  /** CSS length for `--sketch-size` (inline-size); the default is 100% of the container. */
  size?: string | undefined;
}

const PASSES: readonly Pass[] = [1, 2, 3, 4];
/** Per-pass presentation attributes (§3: hatching at 0.75 stroke, opacity .55). */
const PASS_ATTRS: Record<Pass, string> = {
  1: '',
  2: '',
  3: ' stroke-width=".75" opacity=".55"',
  4: '',
};

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
    options.fillStyle = 'hachure';
    options.hachureAngle = p.angle ?? -45;
    options.hachureGap = p.gap ?? 4;
    options.fillWeight = 1;
    options.disableMultiStrokeFill = true;
  }
  return options;
}

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
      return g.toPaths(g.linearPath(p.points, o)).map((info) => info.d);
    case 'polygon':
      return g.toPaths(g.polygon(p.points, o)).map((info) => info.d);
    case 'rect':
      return g.toPaths(g.rectangle(p.x, p.y, p.w, p.h, o)).map((info) => info.d);
    case 'ellipse':
      return g.toPaths(g.ellipse(p.cx, p.cy, p.w, p.h, o)).map((info) => info.d);
    case 'arc':
      return g.toPaths(g.arc(p.cx, p.cy, p.w, p.h, p.start, p.end, false, o)).map((info) => info.d);
    case 'curve':
      return g.toPaths(g.curve(p.points, o)).map((info) => info.d);
    case 'hatch':
      return g
        .toPaths(g.polygon(p.points, o))
        .filter((info) => info.d.trim() !== '')
        .map((info) => info.d);
  }
}

/** Renders the drawing to a bare SVG (no class, no data-draw): the cacheable part. */
export function renderDrawing(drawing: Drawing): string {
  const groups = PASSES.map((pass) => {
    const paths = drawing.primitives
      .map((p, i) => [p, i] as const)
      .filter(([p]) => p.pass === pass)
      .flatMap(([p, i]) => pathData(drawing, p, i))
      .map((d) => `<path d="${d}" pathLength="1"/>`);
    return paths.length ? `<g data-pass="${pass}"${PASS_ATTRS[pass]}>${paths.join('')}</g>` : '';
  });
  const [w, h] = drawing.viewBox;
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${groups.join('')}</svg>`;
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
