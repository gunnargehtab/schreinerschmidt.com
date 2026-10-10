// species.ts stays consistent with docs/configurator.md §4.2/§4.4 and with the `configurator`
// blocks in src/content/woods.yaml (once they exist). Texture data lives in textures.ts (viewer only).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { FINISH_LABEL, SPECIES, SPECIES_KEYS } from '../../../src/lib/configurator/furniture/species';
import { SPECIES_TEXTURES } from '../../../src/lib/configurator/furniture/textures';

const SPEC_E = { eiche: 10.0, nussbaum: 10.8, esche: 12.3, kernbuche: 14.3, kirsche: 10.3 };
const SPEC_TEX = {
  eiche: 'oak_veneer_01',
  nussbaum: 'european_walnut_veneer_04',
  esche: 'ash_veneer',
  kernbuche: 'white_maple_veneer',
  kirsche: 'cherry_veneer',
};

describe('SPECIES', () => {
  it('lists the five configurator species with the spec E-moduli and textures', () => {
    expect(SPECIES_KEYS).toEqual(['eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche']);
    for (const k of SPECIES_KEYS) {
      expect(SPECIES[k].eModulusGPa).toBe(SPEC_E[k]);
      expect(SPECIES_TEXTURES[k].textureId).toBe(SPEC_TEX[k]);
      expect(SPECIES[k].avgColor).toMatch(/^#[0-9A-F]{6}$/);
      expect(SPECIES_TEXTURES[k].finishes.length).toBeGreaterThan(0);
      expect(SPECIES[k].name).toMatch(/^[A-ZÄÖÜ]/);
    }
    expect(Object.keys(FINISH_LABEL)).toEqual(['natur-geoelt', 'weiss-geoelt', 'lack-matt']);
    expect(Object.keys(SPECIES_TEXTURES)).toEqual(SPECIES_KEYS);
  });

  it('agrees with the configurator blocks in woods.yaml', () => {
    const woods = parse(readFileSync(new URL('../../../src/content/woods.yaml', import.meta.url), 'utf8')) as Record<
      string,
      { name: string; configurator?: { textureId: string; avgColor: string; eModulusGPa: number; finishes: string[] } }
    >;
    for (const k of SPECIES_KEYS) {
      expect(woods[k]?.name).toBe(SPECIES[k].name);
      const c = woods[k]?.configurator;
      if (!c) continue; // filled in by the content task of Phase 3
      expect(c.eModulusGPa).toBe(SPECIES[k].eModulusGPa);
      expect(c.textureId).toBe(SPECIES_TEXTURES[k].textureId);
      expect(c.avgColor.toUpperCase()).toBe(SPECIES[k].avgColor);
      expect(c.finishes).toEqual(SPECIES_TEXTURES[k].finishes);
    }
  });
});
