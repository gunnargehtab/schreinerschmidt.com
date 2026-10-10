// Texture streaming (docs/configurator.md §4.4 "Pipeline", "Loading", "Finishes"). The files come
// from scripts/textures/prepare.mjs: src/assets/textures/<species>/{albedo-1024,albedo-512,normal-512}.webp
// plus src/assets/textures/manifest.json ({ <species>: { textureId, avgColor, texMm, files } }).
// Both are read through import.meta.glob without eager file imports of the images themselves (only
// their hashed URLs), so a missing manifest simply yields no textures and the viewer stays on the
// flat species colours.
//
// - Only the requested species × finish loads; a swatch hover/focus warms the HTTP cache (prefetch()).
// - Decoding runs off the main thread (ImageBitmapLoader, `imageOrientation: 'flipY'`); the finish is
//   a Canvas2D filter on an OffscreenCanvas (an HTML canvas without filters as the fallback).
// - The old textures stay until the new ones are uploaded (initTexture when idle), then `onSet` fires.
// - LRU of 3 sets; an evicted set reports `null`, so its materials fall back to the flat colour.
// - Kernbuche has no CC0 scan: white maple is tinted and gets a seeded reddish heart overlay (§4.4).
import { ImageBitmapLoader, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import type { Finish, Species } from '../../../lib/configurator/furniture/types';
import type { Backend } from './renderer';
import type { TextureSet } from './materials';
import type { Quality } from './types';

interface ManifestEntry {
  textureId: string;
  avgColor: string;
  /** Real size of one tile in mm. */
  texMm: number;
  files: { albedo1024: string; albedo512: string; normal512: string };
}

const manifests = import.meta.glob<Record<string, ManifestEntry>>('../../../assets/textures/manifest.json', {
  eager: true,
  import: 'default',
});
const urls = import.meta.glob<string>('../../../assets/textures/*/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const MANIFEST: Partial<Record<Species, ManifestEntry>> = Object.values(manifests)[0] ?? {};
const urlOf = (file: string): string | undefined => urls[`../../../assets/textures/${file}`];

/** Default tile size (mm) when the manifest has none. */
export const DEFAULT_TEX_MM = 1200;
const LRU = 3;

const FILTER: Record<Finish, string> = {
  'natur-geoelt': 'saturate(1.12) brightness(0.93) sepia(0.06)',
  'weiss-geoelt': 'saturate(0.7) brightness(1.1)',
  'lack-matt': 'saturate(1.05) brightness(0.97)',
};
/** Kernbuche from white maple: a warm tint before the finish filter. */
const KERNBUCHE_TINT = 'sepia(0.35) saturate(1.4) brightness(0.92)';

/** mulberry32: a tiny seeded PRNG for the heart overlay. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** The albedo with the finish applied; returns a bitmap (flipped once, like the normal map) or a canvas. */
function finishAlbedo(bmp: ImageBitmap, species: Species, finish: Finish): ImageBitmap | Canvas2D {
  const { width: w, height: h } = bmp;
  const offscreen = typeof OffscreenCanvas !== 'undefined';
  const canvas: Canvas2D = offscreen ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  if (!offscreen) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d') as Ctx2D | null;
  if (!ctx) return bmp;
  const filters = 'filter' in ctx;
  if (!offscreen) {
    // An HTML canvas uploads with flipY, so undo the bitmap's pre-flip here.
    ctx.translate(0, h);
    ctx.scale(1, -1);
  }
  if (filters) ctx.filter = `${species === 'kernbuche' ? `${KERNBUCHE_TINT} ` : ''}${FILTER[finish]}`;
  ctx.drawImage(bmp, 0, 0);
  if (filters) ctx.filter = 'none';
  if (species === 'kernbuche') {
    // Seeded reddish heart streaks along the grain (V), multiplied in.
    const rnd = prng(0x4b45524e);
    ctx.globalCompositeOperation = 'multiply';
    if (filters) ctx.filter = `blur(${Math.round(w / 64)}px)`;
    ctx.fillStyle = 'rgba(176, 96, 64, 0.32)';
    for (let i = 0; i < 5; i++) {
      const x = rnd() * w;
      const sw = (0.05 + rnd() * 0.1) * w;
      ctx.fillRect(x, -h * 0.1, sw, h * 1.2);
      if (x + sw > w) ctx.fillRect(x - w, -h * 0.1, sw, h * 1.2);
    }
    if (filters) ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }
  if (finish === 'weiss-geoelt') {
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(244, 239, 231, 0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  return offscreen ? (canvas as OffscreenCanvas).transferToImageBitmap() : canvas;
}

function texture(img: ImageBitmap | Canvas2D, srgb: boolean, anisotropy: number): Texture {
  const t = new Texture(img);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = anisotropy;
  // An ImageBitmap cannot be flipped at upload; the loader pre-flipped it.
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export interface TextureStore {
  /** Requests a species × finish; `onSet(species, finish, set)` fires once the textures are uploaded. */
  request(species: Species, finish: Finish): void;
  /** Warms the HTTP cache for a species (swatch hover or focus). */
  prefetch(species: Species): void;
  texMm(species: Species): number;
  /** Measured average colour from the manifest, undefined without textures. */
  avgColor(species: Species): string | undefined;
  dispose(): void;
}

export function createTextureStore(
  quality: Quality,
  backend: Backend,
  onSet: (species: Species, finish: Finish, set: TextureSet | null) => void,
): TextureStore {
  const cache = new Map<string, TextureSet>();
  const loading = new Set<string>();
  let disposed = false;
  const loader = new ImageBitmapLoader().setOptions({
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const files = (s: Species): { albedo: string; normal: string | undefined } | null => {
    const m = MANIFEST[s];
    if (!m) return null;
    const albedo = urlOf(quality.albedo === 1024 ? m.files.albedo1024 : m.files.albedo512);
    if (!albedo) return null;
    return { albedo, normal: quality.normal ? urlOf(m.files.normal512) : undefined };
  };
  const idle = (fn: () => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 16);
  const free = (set: TextureSet) => {
    set.albedo.dispose();
    set.normal?.dispose();
  };

  return {
    request(species, finish) {
      const key = `${species}|${finish}`;
      const hit = cache.get(key);
      if (hit) {
        // Touch for the LRU order.
        cache.delete(key);
        cache.set(key, hit);
        return;
      }
      const f = files(species);
      if (!f || loading.has(key)) return;
      loading.add(key);
      void Promise.all([loader.loadAsync(f.albedo), f.normal ? loader.loadAsync(f.normal) : null])
        .then(([albedoBmp, normalBmp]) => {
          if (disposed) return;
          const aniso = 4;
          const set: TextureSet = {
            albedo: texture(finishAlbedo(albedoBmp, species, finish), true, aniso),
            normal: normalBmp ? texture(normalBmp, false, aniso) : null,
          };
          albedoBmp.close();
          idle(() => {
            if (disposed) return free(set);
            backend.initTexture(set.albedo);
            if (set.normal) backend.initTexture(set.normal);
            cache.set(key, set);
            while (cache.size > LRU) {
              const [oldKey, old] = cache.entries().next().value as [string, TextureSet];
              cache.delete(oldKey);
              free(old);
              const [s, fi] = oldKey.split('|') as [Species, Finish];
              onSet(s, fi, null);
            }
            onSet(species, finish, set);
          });
        })
        .catch(() => {
          // Flat colours stay; a later request retries.
        })
        .finally(() => loading.delete(key));
    },
    prefetch(species) {
      const f = files(species);
      if (!f) return;
      for (const u of [f.albedo, f.normal]) {
        if (u)
          void fetch(u, { priority: 'low' } as RequestInit).then(
            (r) => r.blob(),
            () => undefined,
          );
      }
    },
    texMm: (species) => MANIFEST[species]?.texMm ?? DEFAULT_TEX_MM,
    avgColor: (species) => MANIFEST[species]?.avgColor,
    dispose() {
      disposed = true;
      for (const set of cache.values()) free(set);
      cache.clear();
    },
  };
}
