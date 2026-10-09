// Sketch registry (docs/design-system.md §3). Drawings render once per build and are cached.
import { boeden } from './drawings/boeden';
import { moebel } from './drawings/moebel';
import { regal404 } from './drawings/regal-404';
import type { Drawing } from './primitives';
import { renderDrawing, wrapSvg, type RenderOptions } from './render';

export const SKETCHES = {
  boeden,
  moebel,
  'regal-404': regal404,
} as const satisfies Record<string, Drawing>;

export type SketchName = keyof typeof SKETCHES;

export const SKETCH_NAMES = Object.keys(SKETCHES) as SketchName[];

export function isSketchName(name: string): name is SketchName {
  return Object.hasOwn(SKETCHES, name);
}

const cache = new Map<SketchName, string>();

/** The optimised SVG of a drawing without component attributes (deterministic, cached). */
export function sketchSvg(name: SketchName): string {
  let svg = cache.get(name);
  if (svg === undefined) {
    svg = renderDrawing(SKETCHES[name]);
    cache.set(name, svg);
  }
  return svg;
}

/** The inline SVG with class, data-draw and the §3 presentation attributes. */
export function renderSketch(name: SketchName, options: RenderOptions = {}): string {
  return wrapSvg(SKETCHES[name], sketchSvg(name), options);
}

export type { Drawing, RenderOptions };
