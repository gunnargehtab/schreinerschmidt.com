// Sketch pipeline (docs/design-system.md §3 "Sketch system"): deterministic, within limits, and
// free of anything the CSP or html-validate would reject.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SKETCHES, SKETCH_NAMES, isSketchName, renderSketch, sketchSvg, type SketchName } from '../../src/lib/sketch';
import { clipPolygon, herringbone, polygonArea } from '../../src/lib/sketch/primitives';
import { renderDrawing } from '../../src/lib/sketch/render';

const MAX_PATHS = 40;
/** Icons stay under 4 KB (§3); hero art may be larger, but not by much. */
const MAX_BYTES: Record<SketchName, number> = { boeden: 4096, moebel: 4096, 'regal-404': 8192 };

const countPaths = (svg: string): number => (svg.match(/<path\b/g) ?? []).length;
const names = SKETCH_NAMES.map((name) => [name] as const);

describe('sketch registry', () => {
  it('has the first three drawings', () => {
    expect(SKETCH_NAMES.sort()).toEqual(['boeden', 'moebel', 'regal-404']);
    expect(isSketchName('boeden')).toBe(true);
    expect(isSketchName('nope')).toBe(false);
  });

  it('uses the §3 sizes and stroke widths', () => {
    expect(SKETCHES.boeden.viewBox).toEqual([96, 96]);
    expect(SKETCHES.boeden.strokeWidth).toBe(1.5);
    expect(SKETCHES.moebel.viewBox).toEqual([96, 96]);
    expect(SKETCHES['regal-404'].viewBox).toEqual([640, 480]);
    expect(SKETCHES['regal-404'].strokeWidth).toBe(2);
    for (const name of SKETCH_NAMES) expect(SKETCHES[name].seed, `${name} seed`).toBeGreaterThanOrEqual(1);
  });
});

describe.each(names)('sketch %s', (name) => {
  const drawing = SKETCHES[name];
  const svg = renderSketch(name);

  it('renders deterministically (same seed → identical SVG)', () => {
    expect(renderDrawing(drawing)).toBe(renderDrawing(drawing));
    expect(renderDrawing(drawing)).toBe(sketchSvg(name));
    expect(renderDrawing({ ...drawing, seed: drawing.seed + 1 })).not.toBe(sketchSvg(name));
  });

  it('stays within the path and size limits', () => {
    const paths = countPaths(svg);
    expect(paths).toBeGreaterThan(0);
    expect(paths, `${name}: ${paths} paths`).toBeLessThanOrEqual(MAX_PATHS);
    const bytes = Buffer.byteLength(svg);
    expect(bytes, `${name}: ${bytes} bytes (${gzipSync(svg).length} gz)`).toBeLessThanOrEqual(MAX_BYTES[name]);
  });

  it('carries the required root attributes', () => {
    const [w, h] = drawing.viewBox;
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${w} ${h}"`);
    expect(svg).toContain(`width="${w}"`);
    expect(svg).toContain(`height="${h}"`);
    expect(svg).toContain('class="sketch"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain(`stroke-width="${drawing.strokeWidth}"`);
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
  });

  it('puts pathLength="1" on every path and uses no vector-effect', () => {
    const paths = svg.match(/<path\b[^>]*>/g) ?? [];
    for (const p of paths) expect(p).toContain('pathLength="1"');
    expect(svg).not.toContain('vector-effect');
  });

  it('has no style, script, text or ids', () => {
    expect(svg).not.toMatch(/<style|<script|<text|<title|<desc/);
    expect(svg).not.toMatch(/\sstyle=/);
    expect(svg).not.toMatch(/\sid=/);
    expect(svg).not.toMatch(/\son[a-z]+=/i);
    expect(svg).not.toContain('xlink');
  });

  it('draws in ordered passes with hatching at 0.75/.55 and exactly one accent', () => {
    const groups = [...svg.matchAll(/<g\b([^>]*)>/g)].map((m) => m[1] ?? '');
    const passes = groups.map((g) => Number(/data-pass="(\d)"/.exec(g)?.[1]));
    expect(passes.every((p) => p >= 1 && p <= 4)).toBe(true);
    expect(passes).toEqual([...passes].sort());
    expect(new Set(passes).size).toBe(passes.length);
    expect(passes).toContain(2);
    const hatchGroup = groups.find((g) => g.includes('data-pass="3"'));
    if (hatchGroup) {
      expect(hatchGroup).toContain('stroke-width=".75"');
      expect(hatchGroup).toContain('opacity=".55"');
    }
    const accent = /<g data-pass="4"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
    expect(accent, 'one accent group').not.toBeNull();
    expect(countPaths(accent?.[1] ?? ''), 'one accent path').toBe(1);
    expect(svg.match(/data-pass="4"/g)).toHaveLength(1);
  });
});

describe('renderSketch options', () => {
  it('adds class, data-draw and the size custom property', () => {
    const svg = renderSketch('moebel', { class: 'service-card__sketch', draw: 'scroll', size: '7rem' });
    expect(svg).toContain('class="sketch service-card__sketch"');
    expect(svg).toContain('data-draw="scroll"');
    expect(svg).toContain('style="--sketch-size: 7rem"');
    expect(renderSketch('moebel')).not.toContain('data-draw');
    expect(renderSketch('moebel')).not.toContain('style=');
  });
});

describe('geometry helpers', () => {
  it('clips a polygon to a rectangle', () => {
    const square: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    expect(clipPolygon(square, 0, 0, 5, 5)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
    expect(clipPolygon(square, 2, 2, 5, 5)).toEqual([]);
    expect(polygonArea(square)).toBe(4);
  });

  it('tiles a herringbone without overlaps and covers the window', () => {
    const planks = herringbone(3, -3, 3, 0, 6);
    expect(planks.length).toBeGreaterThan(10);
    const total = planks.reduce((sum, p) => sum + polygonArea(p), 0);
    expect(total).toBeCloseTo(36, 1); // a gap-free, overlap-free tiling fills the 6 × 6 window
    expect(herringbone(3, -3, 3, 0, 6)).toEqual(planks);
  });
});
