// Sketch registry (docs/design-system.md §3). Drawings render once per build and are cached.
import { altbau } from './drawings/altbau';
import {
  bodenFertigparkett,
  bodenHochkantlamellen,
  bodenKorkLinoleum,
  bodenMassivdielen,
  bodenMosaik,
  bodenStabparkett,
} from './drawings/boden-minis';
import { boeden } from './drawings/boeden';
import { fenster } from './drawings/fenster';
import { konfigurator } from './drawings/konfigurator';
import { moebel } from './drawings/moebel';
import { beratung, entwurf, fertigung, montage, pflege } from './drawings/prozess';
import { regal404 } from './drawings/regal-404';
import { terrassen } from './drawings/terrassen';
import { treppen } from './drawings/treppen';
import { tueren } from './drawings/tueren';
import type { Drawing } from './primitives';
import { renderDrawing, wrapSvg, type RenderOptions } from './render';

export const SKETCHES = {
  // Services: keys match src/content/services/*.md.
  moebel,
  boeden,
  treppen,
  fenster,
  tueren,
  altbau,
  terrassen,
  // Process steps.
  beratung,
  entwurf,
  fertigung,
  montage,
  pflege,
  // Hero art.
  'regal-404': regal404,
  konfigurator,
  // Floor-pattern minis for the Böden types.
  'boden-stabparkett': bodenStabparkett,
  'boden-hochkantlamellen': bodenHochkantlamellen,
  'boden-mosaik': bodenMosaik,
  'boden-fertigparkett': bodenFertigparkett,
  'boden-massivdielen': bodenMassivdielen,
  'boden-kork-linoleum': bodenKorkLinoleum,
} as const satisfies Record<string, Drawing>;

export type SketchName = keyof typeof SKETCHES;

export const SKETCH_NAMES = Object.keys(SKETCHES) as SketchName[];

export const SERVICE_SKETCHES = ['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen'] as const;
export const PROCESS_SKETCHES = ['beratung', 'entwurf', 'fertigung', 'montage', 'pflege'] as const;
export const HERO_SKETCHES = ['regal-404', 'konfigurator'] as const;
export const FLOOR_SKETCHES = [
  'boden-stabparkett',
  'boden-hochkantlamellen',
  'boden-mosaik',
  'boden-fertigparkett',
  'boden-massivdielen',
  'boden-kork-linoleum',
] as const;

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
