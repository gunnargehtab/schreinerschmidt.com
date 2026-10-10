// Isomorphic furniture library (docs/configurator.md §4.3). No three.js, no DOM: it runs in the
// Astro build, in the browser and in Vitest. Bett and „andere“ have no generator; `generate()` only
// accepts the carcass and table params.
//
// The browser's Möbel preview chunk does not import this barrel: it imports carcass.ts directly and
// import()s table.ts on request, so the table generator stays out of its 7 KB gz budget.
import { generateCarcass } from './carcass';
import { generateTable } from './table';
import type { Build, FurnitureParams } from './types';

export function generate(p: FurnitureParams): Build {
  return p.kind === 'esstisch' ? generateTable(p) : generateCarcass(p);
}

export { maxShelfSpan, deriveBays, deriveShelves } from './constraints';
export { liveEdgeOutline } from './live-edge';
export { describe, KIND_LABEL, registerDescriber } from './describe';
export { cutList } from './cutlist';
export { SPECIES, FINISH_LABEL } from './species';
export { SPECIES_KEYS, SPECIES_TEXTURES } from './textures';
export type * from './types';
