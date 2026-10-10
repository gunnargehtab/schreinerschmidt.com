// Species data for the configurator (docs/configurator.md §4.2 and §4.4).
// Mirrors the `configurator` block of src/content/woods.yaml; tests/unit/configurator/species.test.ts
// keeps the two in sync. The pure library can't read the content collection (it also runs in the browser).
//
// Only what the generators and the drawing need lives here, because this module is part of the
// Möbel preview chunk (≤ 7 KB gz). Texture ids and the finish list are in ./textures.ts, which only
// the 3D viewer loads.
//
// OWNER TO CONFIRM (docs/owner-checklist.md "Shelf span values"): the E-moduli drive the shelf-span
// rule and need the owner's sign-off. The average colours are the swatch/first-frame colours and are
// placeholders until scripts/textures/prepare.mjs writes the measured values from the CC0 textures.
import type { Finish, Species } from './types';

export interface SpeciesInfo {
  name: string;
  /** Modulus of elasticity in GPa (needs-review). */
  eModulusGPa: number;
  /** Average albedo colour, sRGB hex (placeholder until measured). */
  avgColor: string;
}

export const SPECIES: Record<Species, SpeciesInfo> = {
  eiche: { name: 'Eiche', eModulusGPa: 10.0, avgColor: '#C9A97C' },
  nussbaum: { name: 'Nussbaum', eModulusGPa: 10.8, avgColor: '#6E4B36' },
  esche: { name: 'Esche', eModulusGPa: 12.3, avgColor: '#D9C6A3' },
  kernbuche: { name: 'Kernbuche', eModulusGPa: 14.3, avgColor: '#C98F63' },
  kirsche: { name: 'Kirsche', eModulusGPa: 10.3, avgColor: '#B5704A' },
};

export const SPECIES_KEYS = Object.keys(SPECIES) as Species[];

export const FINISH_LABEL: Record<Finish, string> = {
  'natur-geoelt': 'natur geölt',
  'weiss-geoelt': 'weiß geölt',
  'lack-matt': 'matt lackiert',
};
