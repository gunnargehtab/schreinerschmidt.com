// Jahresringe (docs/design-system.md §3 "Generated in code", §8 Über uns; plan §4.4).
// One growth ring per year from `from` to `to`, drawn as a closed polyline with a seeded wobble so
// the output is deterministic per build. Milestone years get `data-milestone="<n>"` (1-based, the
// order of the `milestones` array) so motion.css can bind them to per-milestone view timelines.
// No <style>, no text, no ids: the component supplies colours via CSS.

export interface RingsOptions {
  /** First year (the pith). */
  from: number;
  /** Last year (the bark), inclusive. */
  to: number;
  /** Years to mark; unknown years (outside from…to) throw. */
  milestones?: readonly number[];
  /** PRNG seed; the same seed always yields the same SVG. */
  seed?: number;
  /** viewBox edge length. */
  size?: number;
}

/** Points per ring: 10° steps keep the polyline within a pixel of a true curve at display size. */
const STEPS = 36;
/** Low-frequency wobble shared by all rings (the trunk's shape) and a per-ring high-frequency ripple. */
const WOBBLE = [
  { harmonic: 2, amplitude: 0.04 },
  { harmonic: 3, amplitude: 0.022 },
  { harmonic: 5, amplitude: 0.01 },
] as const;
const RIPPLE_AMPLITUDE = 0.0045;
/** Radius of the pith and the share of the box the rings may fill. */
const PITH = 5;
const FILL = 0.92;

/** mulberry32: small, seedable, good enough for wobble. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Ring {
  year: number;
  /** Mean radius in viewBox units. */
  radius: number;
  /** 1-based milestone index, or 0. */
  milestone: number;
  /** Path data (`M … Z`, integer-rounded, relative segments). */
  d: string;
}

export interface RingsResult {
  svg: string;
  rings: Ring[];
  size: number;
}

/** Annual growth: wide early years, narrower later, with seeded variation (a tree, not a target). */
function growths(count: number, rand: () => number): number[] {
  const raw: number[] = [];
  for (let i = 0; i < count; i++) {
    const age = i / Math.max(count - 1, 1);
    raw.push((1.35 - 0.6 * age) * (0.7 + 0.6 * rand()));
  }
  return raw;
}

function ringPath(radius: number, phases: readonly number[], ripplePhase: number, cx: number, cy: number): string {
  const points: [number, number][] = [];
  for (let i = 0; i < STEPS; i++) {
    const theta = (i / STEPS) * Math.PI * 2;
    let r = radius;
    WOBBLE.forEach(({ harmonic, amplitude }, k) => {
      r += radius * amplitude * Math.sin(harmonic * theta + (phases[k] ?? 0));
    });
    r += radius * RIPPLE_AMPLITUDE * Math.sin(11 * theta + ripplePhase);
    points.push([Math.round(cx + r * Math.cos(theta)), Math.round(cy + r * Math.sin(theta))]);
  }
  const [first] = points;
  if (!first) return '';
  let d = `M${first[0]} ${first[1]}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (!prev || !cur) continue;
    const dx = cur[0] - prev[0];
    const dy = cur[1] - prev[1];
    d += `l${dx}${dy < 0 ? '' : ' '}${dy}`;
  }
  return `${d}z`;
}

/** Builds the rings; throws on an empty range or a milestone outside it. */
export function buildRings(options: RingsOptions): RingsResult {
  const { from, to, milestones = [], seed = 2010, size = 480 } = options;
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) {
    throw new Error(`rings: invalid range ${from}–${to}`);
  }
  for (const year of milestones) {
    if (year < from || year > to) throw new Error(`rings: milestone ${year} is outside ${from}–${to}`);
  }
  const count = to - from + 1;
  const rand = mulberry32(seed);
  const phases = WOBBLE.map(() => rand() * Math.PI * 2);
  const raw = growths(count, rand);
  const total = raw.reduce((sum, g) => sum + g, 0);
  const outer = (size / 2) * FILL;
  const scale = (outer - PITH) / total;
  const cx = size / 2;
  const cy = size / 2;

  const rings: Ring[] = [];
  let radius = PITH;
  for (let i = 0; i < count; i++) {
    radius += (raw[i] ?? 0) * scale;
    const year = from + i;
    const index = milestones.indexOf(year);
    rings.push({
      year,
      radius,
      milestone: index === -1 ? 0 : index + 1,
      d: ringPath(radius, phases, rand() * Math.PI * 2, cx, cy),
    });
  }

  const paths = rings
    .map((ring) =>
      ring.milestone
        ? `<path class="rings__ring rings__ring--mark" data-year="${ring.year}" data-milestone="${ring.milestone}" d="${ring.d}"/>`
        : `<path class="rings__ring" data-year="${ring.year}" d="${ring.d}"/>`,
    )
    .join('');
  const pith = `<circle class="rings__pith" cx="${cx}" cy="${cy}" r="${PITH * 0.5}"/>`;
  const svg =
    `<svg class="rings" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" ` +
    'fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" ' +
    `aria-hidden="true" focusable="false">${pith}${paths}</svg>`;
  return { svg, rings, size };
}

/** The inline SVG for the given years. */
export function renderRings(options: RingsOptions): string {
  return buildRings(options).svg;
}
