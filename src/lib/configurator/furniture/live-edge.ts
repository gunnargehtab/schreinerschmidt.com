// Live edge (Baumkante) outline: a deterministic, seeded plan outline for a table top.
// The two long edges wander inward by 0–40 mm (spec: within ±40 mm of the nominal edge), the short
// ends stay straight, so the nominal length × width is the slab's maximum extent.
import type { Mm } from './types';

/** Maximum inward deviation of a live edge from the nominal edge. */
export const LIVE_EDGE_DEV: Mm = 40;

/** mulberry32: tiny seedable PRNG (same as src/lib/rings.ts; duplicated to keep this chunk standalone). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 0..1 wave along x (mm) made of three seeded sines. */
function wave(seed: number): (x: Mm) => number {
  const r = rng(seed);
  const terms = [0.55, 0.3, 0.15].map((amp, i) => ({
    amp,
    f: ((2 * Math.PI) / (1400 - i * 450)) * (0.8 + 0.4 * r()),
    p: 2 * Math.PI * r(),
  }));
  return (x) => 0.5 + 0.5 * terms.reduce((s, t) => s + t.amp * Math.sin(t.f * x + t.p), 0);
}

/**
 * Closed outline in the top's local plane: x along the length (0..length), y across the width
 * (0..width). Starts at the back-left corner and runs clockwise when seen from above; the same
 * `seed` always yields the same points. Coordinates are rounded to 0.1 mm.
 */
export function liveEdgeOutline(length: Mm, width: Mm, seed: number): [Mm, Mm][] {
  const n = Math.max(12, Math.round(length / 80));
  const back = wave(seed);
  const front = wave(seed + 1);
  const pts: [Mm, Mm][] = [];
  const r = (v: number) => Math.round(v * 10) / 10;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * length;
    pts.push([r(x), r(LIVE_EDGE_DEV * back(x))]);
  }
  for (let i = n; i >= 0; i--) {
    const x = (i / n) * length;
    pts.push([r(x), r(width - LIVE_EDGE_DEV * front(x))]);
  }
  return pts;
}
