// Contact shadow footprints (src/scripts/configurator/viewer3d/contact-shadow.ts): parts whose floor
// footprint lies inside a lower part's footprint add nothing; the outer parts do.
import { describe, expect, it } from 'vitest';
import { generate, type CarcassParams } from '../../../../src/lib/configurator/furniture';
import type { Part } from '../../../../src/lib/configurator/furniture/types';
import { footprints } from '../../../../src/scripts/configurator/viewer3d/contact-shadow';

const regal: CarcassParams = {
  kind: 'regal',
  width: 1200,
  height: 2000,
  depth: 350,
  board: 19,
  front: 'offen',
  base: { type: 'sockel', height: 80 },
  back: 'eingenutet',
  shelvesPerBay: 'auto',
  handle: 'grifflos',
  species: 'eiche',
  finish: 'natur-geoelt',
};

const part = (over: Partial<Part> & Pick<Part, 'min' | 'size'>): Part => ({
  id: 'p',
  role: 'fachboden',
  label: 'Teil',
  grain: 0,
  surface: 'holz',
  solid: true,
  uvAnchor: 'world',
  ...over,
});

describe('footprints', () => {
  it('keeps a lower part and drops a shelf inside its footprint', () => {
    const fps = footprints([
      part({ id: 'boden', role: 'unterboden', min: [0, 80, 0], size: [1200, 19, 350] }),
      part({ id: 'fach', min: [19, 700, 10], size: [1162, 19, 330] }),
      part({ id: 'mitte', role: 'mittelwand', min: [600, 99, 0], size: [19, 1800, 350] }),
    ]);
    expect(fps).toEqual([{ x0: 0, x1: 1200, z0: 0, z1: 350, h: 80 }]);
  });

  it('keeps parts that reach beyond a lower footprint, and ignores wall surfaces', () => {
    const fps = footprints([
      part({ id: 'boden', role: 'unterboden', min: [0, 80, 0], size: [1200, 19, 350] }),
      part({ id: 'ueberstand', role: 'oberboden', min: [-20, 1981, 0], size: [1240, 19, 360] }),
      part({ id: 'wand', surface: 'wand', min: [-500, 0, -20], size: [2200, 2600, 20] }),
    ]);
    expect(fps.map((f) => f.h)).toEqual([80, 1981]);
  });

  it('on a generated Regal, shelves and Mittelwände add no footprint but the outer parts do', () => {
    const build = generate(regal);
    const drawn = build.parts.filter((p) => p.surface !== 'wand');
    const fps = footprints(build.parts);
    expect(fps.length).toBeGreaterThan(0);
    expect(fps.length).toBeLessThan(drawn.length);
    const shelves = drawn.filter((p) => p.role === 'fachboden' || p.role === 'mittelwand');
    expect(shelves.length).toBeGreaterThan(0);
    // Every kept footprint belongs to a part of the carcass shell (sides, top, bottom, plinth, back).
    for (const f of fps) {
      const owner = drawn.find((p) => p.min[0] === f.x0 && p.min[2] === f.z0 && p.min[1] === f.h);
      expect(owner, JSON.stringify(f)).toBeDefined();
      expect(['fachboden', 'mittelwand']).not.toContain(owner!.role);
    }
    // The footprint union reaches the full width of the carcass.
    expect(Math.min(...fps.map((f) => f.x0))).toBeCloseTo(build.bounds.min[0], 0);
    expect(Math.max(...fps.map((f) => f.x1))).toBeCloseTo(build.bounds.max[0], 0);
  });
});
