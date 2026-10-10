// Texture data per species (docs/configurator.md §4.4), kept apart from species.ts so the Möbel
// preview chunk carries no viewer-only strings. Loaded by the 3D viewer and the texture pipeline;
// tests/unit/configurator/species.test.ts keeps it in sync with src/content/woods.yaml.
import type { Finish, Species } from './types';

export interface SpeciesTextures {
  /** Poly Haven texture id (§4.4). */
  textureId: string;
  finishes: Finish[];
}

const ALL: Finish[] = ['natur-geoelt', 'weiss-geoelt', 'lack-matt'];

export const SPECIES_TEXTURES: Record<Species, SpeciesTextures> = {
  eiche: { textureId: 'oak_veneer_01', finishes: ALL },
  nussbaum: { textureId: 'european_walnut_veneer_04', finishes: ALL },
  esche: { textureId: 'ash_veneer', finishes: ALL },
  // No CC0 Kernbuche texture exists; white maple is tinted with a seeded heart overlay (§4.4).
  kernbuche: { textureId: 'white_maple_veneer', finishes: ALL },
  kirsche: { textureId: 'cherry_veneer', finishes: ALL },
};
