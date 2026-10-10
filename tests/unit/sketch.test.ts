// Sketch pipeline (docs/design-system.md §3 "Sketch system"): deterministic, within limits, and
// free of anything the CSP or html-validate would reject.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  FLOOR_SKETCHES,
  HERO_SKETCHES,
  PROCESS_SKETCHES,
  SERVICE_SKETCHES,
  SKETCHES,
  SKETCH_NAMES,
  isSketchName,
  renderSketch,
  sketchSvg,
  type SketchName,
} from '../../src/lib/sketch';
import { ICONS, ICON_NAMES, isIconName } from '../../src/lib/sketch/icons';
import { bar, clipPolygon, dimension, herringbone, polygonArea, slab } from '../../src/lib/sketch/primitives';
import { hatchStrokeWidth, renderDrawing, svgNumber } from '../../src/lib/sketch/render';

/**
 * Limits. Icons (96 viewBox): at most ~40 paths and 4 KB (§3). Hero art (640 × 480) has more
 * parts and longer path data; we hold it to 64 paths and 8 KB (about 3 KB gzipped).
 */
const LIMITS = {
  icon: { paths: 40, bytes: 4096 },
  hero: { paths: 64, bytes: 8192 },
};
const limitsFor = (name: SketchName) => (SKETCHES[name].viewBox[0] === 96 ? LIMITS.icon : LIMITS.hero);

const countPaths = (svg: string): number => (svg.match(/<path\b/g) ?? []).length;
const names = SKETCH_NAMES.map((name) => [name] as const);

describe('sketch registry', () => {
  it('holds the §3 set: 7 services, 5 process steps, 2 hero drawings, 6 floor minis', () => {
    const groups = [...SERVICE_SKETCHES, ...PROCESS_SKETCHES, ...HERO_SKETCHES, ...FLOOR_SKETCHES];
    expect([...SKETCH_NAMES].sort()).toEqual([...groups].sort());
    expect(SERVICE_SKETCHES).toHaveLength(7);
    expect(PROCESS_SKETCHES).toHaveLength(5);
    expect(FLOOR_SKETCHES).toHaveLength(6);
    expect(isSketchName('boeden')).toBe(true);
    expect(isSketchName('nope')).toBe(false);
  });

  it('uses the §3 sizes and stroke widths', () => {
    for (const name of [...SERVICE_SKETCHES, ...PROCESS_SKETCHES, ...FLOOR_SKETCHES]) {
      expect(SKETCHES[name].viewBox, `${name} viewBox`).toEqual([96, 96]);
      expect(SKETCHES[name].strokeWidth, `${name} stroke`).toBe(1.5);
    }
    for (const name of HERO_SKETCHES) {
      expect(SKETCHES[name].viewBox, `${name} viewBox`).toEqual([640, 480]);
      expect(SKETCHES[name].strokeWidth, `${name} stroke`).toBe(2);
    }
    for (const name of SKETCH_NAMES) expect(SKETCHES[name].seed, `${name} seed`).toBeGreaterThanOrEqual(1);
  });

  it('gives every drawing its own seed', () => {
    const seeds = SKETCH_NAMES.map((name) => SKETCHES[name].seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe.each(names)('sketch %s', (name) => {
  const drawing = SKETCHES[name];
  const svg = renderSketch(name);
  const limits = limitsFor(name);

  it('renders deterministically (same seed → identical SVG)', () => {
    expect(renderDrawing(drawing)).toBe(renderDrawing(drawing));
    expect(renderDrawing(drawing)).toBe(sketchSvg(name));
    expect(renderDrawing({ ...drawing, seed: drawing.seed + 1 })).not.toBe(sketchSvg(name));
  });

  it('stays within the path and size limits', () => {
    const paths = countPaths(svg);
    expect(paths).toBeGreaterThan(0);
    expect(paths, `${name}: ${paths} paths`).toBeLessThanOrEqual(limits.paths);
    const bytes = Buffer.byteLength(svg);
    expect(bytes, `${name}: ${bytes} bytes (${gzipSync(svg).length} gz)`).toBeLessThanOrEqual(limits.bytes);
  });

  it('keeps every point inside the viewBox (allowing for overshoot)', () => {
    const [w, h] = drawing.viewBox;
    const margin = 8;
    const numbers = [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) => absolutePoints(m[1] ?? ''));
    expect(numbers.length).toBeGreaterThan(0);
    for (const [x, y] of numbers) {
      expect(x, `${name}: x ${x}`).toBeGreaterThanOrEqual(-margin);
      expect(x, `${name}: x ${x}`).toBeLessThanOrEqual(w + margin);
      expect(y, `${name}: y ${y}`).toBeGreaterThanOrEqual(-margin);
      expect(y, `${name}: y ${y}`).toBeLessThanOrEqual(h + margin);
    }
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

  it('draws in ordered passes, hatching at half stroke and .55, exactly one accent', () => {
    const groups = [...svg.matchAll(/<g\b([^>]*)>/g)].map((m) => m[1] ?? '');
    const passes = groups.map((g) => Number(/data-pass="(\d)"/.exec(g)?.[1]));
    expect(passes.every((p) => p >= 1 && p <= 4)).toBe(true);
    expect(passes).toEqual([...passes].sort());
    expect(new Set(passes).size).toBe(passes.length);
    expect(passes).toContain(1);
    expect(passes).toContain(2);
    const hatchGroup = groups.find((g) => g.includes('data-pass="3"'));
    if (hatchGroup) {
      expect(hatchGroup).toContain(`stroke-width="${svgNumber(hatchStrokeWidth(drawing))}"`);
      expect(hatchGroup).toContain('opacity=".55"');
    }
    const accent = /<g data-pass="4"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
    expect(accent, 'one accent group').not.toBeNull();
    expect(countPaths(accent?.[1] ?? ''), 'one accent path').toBe(1);
    expect(svg.match(/data-pass="4"/g)).toHaveLength(1);
  });
});

describe('hatching stroke', () => {
  it('is half the drawing stroke: .75 on icons, 1 on hero art', () => {
    expect(hatchStrokeWidth(SKETCHES.moebel)).toBe(0.75);
    expect(hatchStrokeWidth(SKETCHES['regal-404'])).toBe(1);
    expect(svgNumber(0.75)).toBe('.75');
    expect(svgNumber(1)).toBe('1');
    // SVGO reorders attributes, so match each one on the pass-3 group.
    const hatchGroup = (name: SketchName) => /<g\b[^>]*data-pass="3"[^>]*>/.exec(sketchSvg(name))?.[0] ?? '';
    expect(hatchGroup('moebel')).toContain('stroke-width=".75"');
    expect(hatchGroup('regal-404')).toContain('stroke-width="1"');
    expect(hatchGroup('konfigurator')).toContain('stroke-width="1"');
    expect(hatchGroup('konfigurator')).toContain('opacity=".55"');
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

describe('UI icons', () => {
  it('resolve by name and carry one clean path each', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(14);
    for (const name of ICON_NAMES) {
      expect(isIconName(name)).toBe(true);
      const d = ICONS[name];
      expect(d, name).toMatch(/^M[\d.\- ]/);
      expect(d, `${name}: path grammar`).toMatch(/^[MmLlHhVvAaCcSsQqTtZz\d.\- ,]+$/);
      expect(name).toMatch(/^[a-z][a-z-]*$/);
    }
    expect(isIconName('nope')).toBe(false);
    for (const needed of ['phone', 'mail', 'map-pin', 'clock', 'arrow-right', 'arrow-left', 'chevron-down', 'close']) {
      expect(isIconName(needed), needed).toBe(true);
    }
    for (const needed of ['menu', 'external', 'check', 'star', 'play', 'plus', 'minus', 'sun', 'moon', 'monitor']) {
      expect(isIconName(needed), needed).toBe(true);
    }
  });

  it('stay inside the 24 px viewBox', () => {
    for (const name of ICON_NAMES) {
      for (const [x, y] of absolutePoints(ICONS[name])) {
        expect(x, `${name} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${name} x`).toBeLessThanOrEqual(24);
        expect(y, `${name} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${name} y`).toBeLessThanOrEqual(24);
      }
    }
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

  it('builds bars, slabs and dimension lines', () => {
    expect(polygonArea(bar([0, 0], [10, 0], 4))).toBeCloseTo(40);
    const faces = slab(2, 0, 10, 20, 4, 10);
    expect(faces).toHaveLength(3);
    expect(faces.every((f) => f.pass === 2)).toBe(true);
    expect(polygonArea(faces[1]!.points)).toBeCloseTo(100); // top face: 20 wide, depth 10 → 5 high
    const dim = dimension(4, [0, 50], [100, 50], 3);
    expect(dim.points).toHaveLength(6);
    expect(dim.points[2]).toEqual([0, 50]);
    expect(dim.points[3]).toEqual([100, 50]);
  });
});

/**
 * Absolute end points of a path's drawing commands (enough to bound a drawing; curve control
 * points are included too, which only makes the check stricter).
 */
function absolutePoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const m of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const cmd = m[1] ?? '';
    const nums = (m[2] ?? '').match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
    const rel = cmd === cmd.toLowerCase();
    const step = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 }[cmd.toUpperCase()] ?? 0;
    for (let i = 0; step > 0 && i + step <= nums.length; i += step) {
      const seg = nums.slice(i, i + step);
      if (cmd.toUpperCase() === 'H') x = rel ? x + seg[0]! : seg[0]!;
      else if (cmd.toUpperCase() === 'V') y = rel ? y + seg[0]! : seg[0]!;
      else {
        const [px, py] = [seg[step - 2]!, seg[step - 1]!];
        x = rel ? x + px : px;
        y = rel ? y + py : py;
      }
      out.push([x, y]);
    }
  }
  return out;
}
