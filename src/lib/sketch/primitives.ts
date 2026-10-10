// Sketch primitives (docs/design-system.md §3 "Sketch system").
// A drawing is a list of primitives, each assigned to one of the four draw passes:
//   1 construction lines (2–4 px overshoot), 2 outlines, 3 hatching, 4 the single red accent.
// Everything here is plain data; render.ts turns it into SVG with rough.js at build time.

export type Pass = 1 | 2 | 3 | 4;
export type Point = [number, number];

/** rough.js options a primitive may override (the renderer sets stroke colour and width). */
export interface RoughTweaks {
  roughness?: number;
  bowing?: number;
  /** Draw each stroke once instead of rough.js's default double stroke. */
  single?: boolean;
  /** Keep polygon/polyline vertices exact; only the segments wobble. */
  preserveVertices?: boolean;
}

interface Base extends RoughTweaks {
  pass: Pass;
}

export interface Line extends Base {
  kind: 'line';
  from: Point;
  to: Point;
  /** Extend both ends by this many viewBox units (construction lines). */
  overshoot?: number;
}

export interface Polyline extends Base {
  kind: 'polyline';
  points: Point[];
}

export interface Polygon extends Base {
  kind: 'polygon';
  points: Point[];
}

export interface Rect extends Base {
  kind: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Ellipse extends Base {
  kind: 'ellipse';
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Elliptical arc; angles in radians, measured clockwise from 3 o'clock (SVG orientation). */
export interface Arc extends Base {
  kind: 'arc';
  cx: number;
  cy: number;
  w: number;
  h: number;
  start: number;
  end: number;
}

export interface Curve extends Base {
  kind: 'curve';
  points: Point[];
}

/** Hachure (or stipple) fill of a polygon without an outline. Belongs in pass 3. */
export interface Hatch extends Base {
  kind: 'hatch';
  points: Point[];
  angle?: number;
  gap?: number;
  /** `dots` stipples instead of hatching (cork, granular surfaces). */
  style?: 'hachure' | 'dots';
}

export type Primitive = Line | Polyline | Polygon | Rect | Ellipse | Arc | Curve | Hatch;

export interface Drawing {
  /** 96 for icons, [640, 480] for hero art. */
  viewBox: [number, number];
  /** 1.5 for icons, 2 for hero art. */
  strokeWidth: number;
  /** rough.js seed; must be ≥ 1 (0 means random). Each primitive derives its own seed from it. */
  seed: number;
  /** Default rough.js roughness for this drawing. */
  roughness: number;
  primitives: Primitive[];
}

// Constructors keep the drawing files short and readable.

export const line = (
  pass: Pass,
  from: Point,
  to: Point,
  extra: Partial<Omit<Line, 'kind' | 'pass' | 'from' | 'to'>> = {},
): Line => ({
  kind: 'line',
  pass,
  from,
  to,
  ...extra,
});

export const construction = (from: Point, to: Point, overshoot = 3): Line =>
  line(1, from, to, { overshoot, single: true });

export const polyline = (pass: Pass, points: Point[], extra: RoughTweaks = {}): Polyline => ({
  kind: 'polyline',
  pass,
  points,
  ...extra,
});

export const polygon = (pass: Pass, points: Point[], extra: RoughTweaks = {}): Polygon => ({
  kind: 'polygon',
  pass,
  points,
  ...extra,
});

export const rect = (pass: Pass, x: number, y: number, w: number, h: number, extra: RoughTweaks = {}): Rect => ({
  kind: 'rect',
  pass,
  x,
  y,
  w,
  h,
  ...extra,
});

export const ellipse = (
  pass: Pass,
  cx: number,
  cy: number,
  w: number,
  h: number,
  extra: RoughTweaks = {},
): Ellipse => ({
  kind: 'ellipse',
  pass,
  cx,
  cy,
  w,
  h,
  ...extra,
});

export const arc = (
  pass: Pass,
  cx: number,
  cy: number,
  w: number,
  h: number,
  start: number,
  end: number,
  extra: RoughTweaks = {},
): Arc => ({ kind: 'arc', pass, cx, cy, w, h, start, end, ...extra });

export const curve = (pass: Pass, points: Point[], extra: RoughTweaks = {}): Curve => ({
  kind: 'curve',
  pass,
  points,
  ...extra,
});

export const hatch = (points: Point[], angle = -45, gap = 4): Hatch => ({ kind: 'hatch', pass: 3, points, angle, gap });

export const stipple = (points: Point[], gap = 6): Hatch => ({ kind: 'hatch', pass: 3, points, gap, style: 'dots' });

// Geometry helpers for the drawings.

/** Axis-aligned rectangle as a polygon, clockwise from the top-left corner. */
export const box = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * Cavalier oblique: the shared convention for everything with depth that is not a floor.
 * Depth runs up and to the right at 45°, foreshortened to one half (d → +d/2, −d/2).
 */
export const back = ([x, y]: Point, d: number): Point => [x + d / 2, y - d / 2];

/** The top face of a box whose front face is `box(x, y, w, h)`, receding by `d`. */
export const topFace = (x: number, y: number, w: number, d: number): Point[] => [
  [x, y],
  [x + w, y],
  back([x + w, y], d),
  back([x, y], d),
];

/** The right face of the same box. */
export const rightFace = (x: number, y: number, w: number, h: number, d: number): Point[] => [
  [x + w, y],
  back([x + w, y], d),
  back([x + w, y + h], d),
  [x + w, y + h],
];

/** A slab in cavalier oblique: front, top and right faces as three polygons in one pass. */
export const slab = (pass: Pass, x: number, y: number, w: number, h: number, d: number, extra: RoughTweaks = {}) => [
  polygon(pass, box(x, y, w, h), { preserveVertices: true, ...extra }),
  polygon(pass, topFace(x, y, w, d), { preserveVertices: true, ...extra }),
  polygon(pass, rightFace(x, y, w, h, d), { preserveVertices: true, ...extra }),
];

/** A straight bar of `width` from `from` to `to` (rule segments, pencils, handrails) as a polygon. */
export function bar(from: Point, to: Point, width: number): Point[] {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const nx = (-(to[1] - from[1]) / len) * (width / 2);
  const ny = ((to[0] - from[0]) / len) * (width / 2);
  return [
    [from[0] + nx, from[1] + ny],
    [to[0] + nx, to[1] + ny],
    [to[0] - nx, to[1] - ny],
    [from[0] - nx, from[1] - ny],
  ];
}

/** Point at fraction `t` along a segment, offset sideways by `side` (perpendicular, left-hand). */
export function along(from: Point, to: Point, t: number, side = 0): Point {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const nx = (-(to[1] - from[1]) / len) * side;
  const ny = ((to[0] - from[0]) / len) * side;
  return [from[0] + (to[0] - from[0]) * t + nx, from[1] + (to[1] - from[1]) * t + ny];
}

/**
 * A dimension line as ONE path: tick, line, tick, drawn with the pen retracing at both ends
 * (the Maßlinie motif from docs/design-system.md). `tick` is the half length of the end ticks.
 */
export function dimension(pass: Pass, from: Point, to: Point, tick = 3, extra: RoughTweaks = {}): Polyline {
  const a = along(from, to, 0, tick);
  const b = along(from, to, 0, -tick);
  const c = along(from, to, 1, tick);
  const d = along(from, to, 1, -tick);
  return polyline(pass, [a, b, from, to, c, d], { preserveVertices: true, roughness: 0.5, ...extra });
}

/** Sutherland–Hodgman clip of a polygon against an axis-aligned rectangle. */
export function clipPolygon(points: Point[], minX: number, minY: number, maxX: number, maxY: number): Point[] {
  type Edge = (p: Point) => boolean;
  type Cut = (a: Point, b: Point) => Point;
  const edges: [Edge, Cut][] = [
    [(p) => p[0] >= minX, (a, b) => lerpAt(a, b, (minX - a[0]) / (b[0] - a[0]))],
    [(p) => p[0] <= maxX, (a, b) => lerpAt(a, b, (maxX - a[0]) / (b[0] - a[0]))],
    [(p) => p[1] >= minY, (a, b) => lerpAt(a, b, (minY - a[1]) / (b[1] - a[1]))],
    [(p) => p[1] <= maxY, (a, b) => lerpAt(a, b, (maxY - a[1]) / (b[1] - a[1]))],
  ];
  let out = points;
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i] as Point;
      const previous = input[(i + input.length - 1) % input.length] as Point;
      if (inside(current)) {
        if (!inside(previous)) out.push(cut(previous, current));
        out.push(current);
      } else if (inside(previous)) {
        out.push(cut(previous, current));
      }
    }
    if (out.length === 0) return out;
  }
  return out;
}

function lerpAt(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Shoelace area; zero for degenerate polygons. */
export function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] as Point;
    const [x2, y2] = points[(i + 1) % points.length] as Point;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * One-point perspective of a floor plane: X runs across, Z into the depth (Z > 0).
 * `horizon` is the screen y of the vanishing point, `focal` the camera scale, `height` the eye
 * height above the floor in floor units.
 */
export function floorProjector(cx: number, horizon: number, focal: number, height: number) {
  return ([X, Z]: Point): Point => [cx + (focal * X) / Z, horizon + (focal * height) / Z];
}

/**
 * Herringbone tiling of planks with a length:width ratio `ratio`, in plank-width units, rotated
 * by 45° so the chevrons point along +v. Returns the planks (as quads) whose clipped shape lies
 * inside the rectangle [minU, maxU] × [minV, maxV]. Based on the lattice {(1,1), (ratio, -ratio)}
 * with horizontal planks at the lattice points and vertical ones at (ratio, 1 - ratio).
 */
export function herringbone(ratio: number, minU: number, maxU: number, minV: number, maxV: number): Point[][] {
  const r = ratio;
  const s = Math.SQRT1_2;
  // 45° rotation from tiling space (a, b) into pattern space (u, v).
  const rot = ([a, b]: Point): Point => [(a - b) * s, (a + b) * s];
  const out: Point[][] = [];
  const reach = Math.ceil((Math.max(maxU - minU, maxV - minV) + 2 * r) / r) + 2;
  // Walk the lattice around the centre of the target rectangle.
  const centre: Point = [((minU + maxU) / 2 + (minV + maxV) / 2) * s, ((minV + maxV) / 2 - (minU + maxU) / 2) * s];
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const ox = Math.round(centre[0]) + i + r * j;
      const oy = Math.round(centre[1]) + i - r * j;
      const planks: Point[][] = [box(ox, oy, r, 1), box(ox + r, oy + 1 - r, 1, r)];
      for (const plank of planks) {
        const clipped = clipPolygon(plank.map(rot), minU, minV, maxU, maxV);
        if (clipped.length >= 3 && polygonArea(clipped) > 0.05) out.push(clipped);
      }
    }
  }
  // Deterministic order: back to front, left to right.
  return out.sort((a, b) => centroid(b)[1] - centroid(a)[1] || centroid(a)[0] - centroid(b)[0]);
}

export function centroid(points: Point[]): Point {
  const n = points.length;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}
