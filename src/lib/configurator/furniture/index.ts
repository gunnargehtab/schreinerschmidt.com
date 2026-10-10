// Isomorphic furniture library (docs/configurator.md §4.3). No three.js, no DOM: it runs in the
// Astro build, in the browser (Möbel preview chunk) and in Vitest. Bett and „andere“ have no
// generator; `generate()` only accepts the carcass and table params.
import { generateCarcass } from './carcass';
import { generateTable } from './table';
import type { Build, FurnitureParams } from './types';

export function generate(p: FurnitureParams): Build {
  return p.kind === 'esstisch' ? generateTable(p) : generateCarcass(p);
}

export { maxShelfSpan, deriveBays, deriveShelves } from './constraints';
export { liveEdgeOutline } from './live-edge';
export { describe, KIND_LABEL } from './describe';
export { cutList } from './cutlist';
export { SPECIES, SPECIES_KEYS, FINISH_LABEL } from './species';
export type * from './types';
