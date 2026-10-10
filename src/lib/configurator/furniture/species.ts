// Species data for the configurator (docs/configurator.md §4.2 and §4.4).
// Mirrors the `configurator` block of src/content/woods.yaml; tests/unit/configurator/species.test.ts
// keeps the two in sync. The pure library can't read the content collection (it also runs in the browser).
//
// Only what the generators and the drawing need lives here, because this module is part of the
// Möbel preview chunk (≤ 8.75 KB gz). Texture ids, the species key list and the finish list are in
// ./textures.ts, which only the 3D viewer (and the texture pipeline) loads.
//
// OWNER TO CONFIRM (docs/owner-checklist.md "Shelf span values"): the E-moduli drive the shelf-span
// rule and need the owner's sign-off. The average colours are the swatch/first-frame colours: the
// values scripts/textures/prepare.mjs measured on the calibrated CC0 textures (2026-10-10,
// src/assets/textures/manifest.json); the calibration itself is needs-review against real samples.
import type { Finish, Species } from './types';

export interface SpeciesInfo {
  name: string;
  /** Modulus of elasticity in GPa (needs-review). */
  eModulusGPa: number;
  /** Average albedo colour of the calibrated texture, sRGB hex. */
  avgColor: string;
}

export const SPECIES: Record<Species, SpeciesInfo> = {
  eiche: { name: 'Eiche', eModulusGPa: 10.0, avgColor: '#A17E57' },
  nussbaum: { name: 'Nussbaum', eModulusGPa: 10.8, avgColor: '#654836' },
  esche: { name: 'Esche', eModulusGPa: 12.3, avgColor: '#B9A082' },
  kernbuche: { name: 'Kernbuche', eModulusGPa: 14.3, avgColor: '#DEC1A4' },
  kirsche: { name: 'Kirsche', eModulusGPa: 10.3, avgColor: '#A16E56' },
};

export const FINISH_LABEL: Record<Finish, string> = {
  'natur-geoelt': 'natur geölt',
  'weiss-geoelt': 'weiß geölt',
  'lack-matt': 'matt lackiert',
};
