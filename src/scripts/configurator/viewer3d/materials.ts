// Materials (docs/configurator.md §4.4 "Finishes", "Other materials"). One set per species × finish:
// `side` (long grain) and `end` (end grain, colour × 0.8). The first frame uses the flat species
// colour (the manifest's measured avgColor, else SPECIES[].avgColor handed in by the loader) with the
// finish approximated on the colour; textures swap in later
// (textures.ts) without a shader recompile, because every wood material carries 1×1 placeholder
// maps from the start. Metal and plaster walls are shared singletons.
import {
  Color,
  DataTexture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector2,
  type Material,
  type Texture,
} from 'three';
import type { Finish, Species } from '../../../lib/configurator/furniture/types';
import type { Quality } from './types';

export interface WoodSet {
  side: MeshStandardMaterial;
  end: MeshStandardMaterial;
}

export interface TextureSet {
  albedo: Texture;
  normal: Texture | null;
}

export interface Materials {
  wood(species: Species, finish: Finish): WoodSet;
  metal: MeshStandardMaterial;
  wall: MeshStandardMaterial;
  /** A Physical variant for the shader pre-warm (compileAsync). */
  warm: Material;
  /** Puts textures on a set (null = back to the flat colour). */
  apply(species: Species, finish: Finish, tex: TextureSet | null): void;
  dispose(): void;
}

interface FinishSpec {
  roughness: number;
  normalScale: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

const FINISH: Record<Finish, FinishSpec> = {
  'natur-geoelt': { roughness: 0.55, normalScale: 0.5 },
  'weiss-geoelt': { roughness: 0.62, normalScale: 0.45 },
  'lack-matt': { roughness: 0.5, normalScale: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.38 },
};

/** Screen overlay of „weiß geölt“ (§4.4): #F4EFE7 at α .18 (textures.ts applies the same to the albedo). */
const WHITE_OIL = new Color('#F4EFE7');
const WHITE_OIL_ALPHA = 0.18;

/** Flat species colour (sRGB hex) with the finish's albedo transform (textures.ts FILTER) approximated in sRGB HSL. */
export function flatColour(hex: string, finish: Finish): Color {
  const c = new Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, SRGBColorSpace);
  if (finish === 'natur-geoelt') c.setHSL(hsl.h, Math.min(1, hsl.s * 1.12), hsl.l * 0.93, SRGBColorSpace);
  else if (finish === 'lack-matt') c.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.02), SRGBColorSpace);
  else {
    c.setHSL(hsl.h, hsl.s * 0.8, Math.min(1, hsl.l * 1.05), SRGBColorSpace);
    // screen(c, w) = 1 − (1 − c)(1 − w), mixed in at WHITE_OIL_ALPHA
    const w = WHITE_OIL;
    const a = WHITE_OIL_ALPHA;
    c.setRGB(
      c.r + a * (1 - (1 - c.r) * (1 - w.r) - c.r),
      c.g + a * (1 - (1 - c.g) * (1 - w.g) - c.g),
      c.b + a * (1 - (1 - c.b) * (1 - w.b) - c.b),
    );
  }
  return c;
}

function pixel(rgb: [number, number, number], srgb: boolean): DataTexture {
  const t = new DataTexture(new Uint8Array([...rgb, 255]), 1, 1);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** `colourOf` is the species' average albedo as sRGB hex (manifest or placeholder). */
export function createMaterials(quality: Quality, colourOf: (s: Species) => string): Materials {
  const sets = new Map<string, WoodSet>();
  const white = pixel([255, 255, 255], true);
  const flatNormal = quality.normal ? pixel([128, 128, 255], false) : null;
  const END = 0.8;

  const make = (finish: Finish): MeshStandardMaterial => {
    const f = FINISH[finish];
    const m = f.clearcoat
      ? new MeshPhysicalMaterial({ clearcoat: f.clearcoat, clearcoatRoughness: f.clearcoatRoughness ?? 0 })
      : new MeshStandardMaterial();
    m.roughness = f.roughness;
    m.map = white;
    if (flatNormal) {
      m.normalMap = flatNormal;
      m.normalScale = new Vector2(f.normalScale, f.normalScale);
    }
    return m;
  };

  const wood: Materials['wood'] = (species, finish) => {
    const key = `${species}|${finish}`;
    let set = sets.get(key);
    if (!set) {
      const c = flatColour(colourOf(species), finish);
      set = { side: make(finish), end: make(finish) };
      set.side.color.copy(c);
      set.end.color.copy(c).multiplyScalar(END);
      sets.set(key, set);
    }
    return set;
  };

  const metal = new MeshStandardMaterial({ color: '#1E1E1E', metalness: 1, roughness: 0.35 });
  const wall = new MeshStandardMaterial({ color: '#F2EFE9', roughness: 0.95 });
  const warm = make('lack-matt');

  return {
    wood,
    metal,
    wall,
    warm,
    apply(species, finish, tex) {
      const set = wood(species, finish);
      for (const [m, k] of [
        [set.side, 1],
        [set.end, END],
      ] as const) {
        m.map = tex ? tex.albedo : white;
        if (flatNormal) m.normalMap = tex?.normal ?? flatNormal;
        if (tex) m.color.setScalar(k);
        else m.color.copy(flatColour(colourOf(species), finish)).multiplyScalar(k);
      }
    },
    dispose() {
      for (const s of sets.values()) {
        s.side.dispose();
        s.end.dispose();
      }
      sets.clear();
      metal.dispose();
      wall.dispose();
      warm.dispose();
      white.dispose();
      flatNormal?.dispose();
    },
  };
}
