// Floor-pattern minis for the Böden types (src/content/services/boeden.md), 96 viewBox at
// stroke 1.5, meant to render at 3–5 rem. Swatches in plan view: pass 1 marks the datum (top and
// left edge of the sample), pass 2 the pattern clipped to the tile, pass 3 grain on one or two
// pieces, pass 4 the next piece to be laid in red. Fertigparkett is the exception: its point is
// the layering, so it is drawn as a section detail in the shared cavalier oblique.
import {
  back,
  clipPolygon,
  construction,
  ellipse,
  hatch,
  line,
  polygon,
  polygonArea,
  rect,
  rightFace,
  slab,
  stipple,
  box,
  type Drawing,
  type Point,
  type Primitive,
} from '../primitives';

const TILE = { x: 12, y: 12, size: 72 };
const END = TILE.x + TILE.size;
const clip = (points: Point[]) => clipPolygon(points, TILE.x, TILE.y, END, END);

const datum: Primitive[] = [
  construction([TILE.x - 4, TILE.y], [END + 2, TILE.y], 0),
  construction([TILE.x, TILE.y - 4], [TILE.x, END + 2], 0),
];

const mini = (seed: number, primitives: Primitive[]): Drawing => ({
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed,
  roughness: 0.5,
  primitives: [...datum, ...primitives],
});

// Stabparkett: 12 × 36 strips in a staggered bond (Schiffsboden).
const stabRows = Array.from({ length: 6 }, (_, r) => r);
const stabPlanks = stabRows.flatMap((r) =>
  [-1, 0, 1, 2]
    .map((k) => ({ r, k, quad: clip(box(TILE.x + (r % 2) * 18 + k * 36, TILE.y + r * 12, 36, 12)) }))
    .filter(({ quad }) => quad.length >= 3 && polygonArea(quad) > 60),
);
const isStabAccent = ({ r, k }: { r: number; k: number }) => r === 3 && k === 0; // a whole plank, mid-tile

export const bodenStabparkett = mini(81, [
  ...stabPlanks.filter((p) => !isStabAccent(p)).map(({ quad }) => polygon(2, quad, { preserveVertices: true })),
  hatch(clip(box(TILE.x + 18, TILE.y + 12, 36, 12)), 0, 3),
  hatch(clip(box(TILE.x + 36, TILE.y + 60, 36, 12)), 0, 3),
  ...stabPlanks.filter(isStabAccent).map(({ quad }) => polygon(4, quad, { preserveVertices: true, roughness: 0.6 })),
]);

// Hochkantlamellenparkett: narrow strips on edge, 6 wide, joints wandering.
const LAMELLA = 6;
const columns = Array.from({ length: TILE.size / LAMELLA }, (_, i) => i);
const jointY = (i: number) => TILE.y + 8 + ((i * 29) % 56);
const LAMELLA_ACCENT = 6;

export const bodenHochkantlamellen = mini(83, [
  ...columns.slice(1).map((i) => line(2, [TILE.x + i * LAMELLA, TILE.y], [TILE.x + i * LAMELLA, END])),
  ...columns
    .filter((i) => i !== LAMELLA_ACCENT)
    .map((i) => line(2, [TILE.x + i * LAMELLA, jointY(i)], [TILE.x + (i + 1) * LAMELLA, jointY(i)])),
  hatch(box(TILE.x + 2 * LAMELLA, TILE.y, LAMELLA, jointY(2) - TILE.y), 90, 2.2),
  hatch(box(TILE.x + 9 * LAMELLA, jointY(9), LAMELLA, END - jointY(9)), 90, 2.2),
  rect(4, TILE.x + LAMELLA_ACCENT * LAMELLA, jointY(LAMELLA_ACCENT), LAMELLA, END - jointY(LAMELLA_ACCENT), {
    preserveVertices: true,
    roughness: 0.6,
  }),
]);

// Mosaikparkett: 3 × 3 fields of three strips, direction alternating.
const FIELD = 24;
const fields = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => [i, j] as const));
const fieldStrips = ([i, j]: readonly [number, number]): Primitive[] => {
  const x = TILE.x + i * FIELD;
  const y = TILE.y + j * FIELD;
  const horizontal = (i + j) % 2 === 0;
  return [1, 2].map((k) =>
    horizontal ? line(2, [x, y + k * 8], [x + FIELD, y + k * 8]) : line(2, [x + k * 8, y], [x + k * 8, y + FIELD]),
  );
};

export const bodenMosaik = mini(89, [
  ...[1, 2].map((k) => line(2, [TILE.x + k * FIELD, TILE.y], [TILE.x + k * FIELD, END])),
  ...[1, 2].map((k) => line(2, [TILE.x, TILE.y + k * FIELD], [END, TILE.y + k * FIELD])),
  ...fields.flatMap(fieldStrips),
  hatch(box(TILE.x, TILE.y + 8, FIELD, 8), 0, 2.4),
  hatch(box(TILE.x + 2 * FIELD + 8, TILE.y + 2 * FIELD, 8, FIELD), 90, 2.4),
  rect(4, TILE.x + FIELD, TILE.y + FIELD + 8, FIELD, 8, { preserveVertices: true, roughness: 0.6 }),
]);

// Fertigparkett: a plank corner in section, three layers; the wear layer in red.
const PLANK = { x: 12, y: 52, w: 60, h: 14, d: 36 };
const WEAR = 4;
const CARRIER = 6;

export const bodenFertigparkett: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 97,
  roughness: 0.5,
  primitives: [
    construction([4, PLANK.y + PLANK.h], [92, PLANK.y + PLANK.h], 4),
    construction([PLANK.x, PLANK.y], back([PLANK.x, PLANK.y], PLANK.d), 5),
    ...slab(2, PLANK.x, PLANK.y, PLANK.w, PLANK.h, PLANK.d),
    line(2, [PLANK.x, PLANK.y + WEAR + CARRIER], [PLANK.x + PLANK.w, PLANK.y + WEAR + CARRIER]),
    line(2, [PLANK.x + PLANK.w, PLANK.y + WEAR], back([PLANK.x + PLANK.w, PLANK.y + WEAR], PLANK.d)),
    line(
      2,
      [PLANK.x + PLANK.w, PLANK.y + WEAR + CARRIER],
      back([PLANK.x + PLANK.w, PLANK.y + WEAR + CARRIER], PLANK.d),
    ),
    hatch(box(PLANK.x, PLANK.y + WEAR, PLANK.w, CARRIER), 90, 2.4),
    hatch(rightFace(PLANK.x, PLANK.y + WEAR, PLANK.w, CARRIER, PLANK.d), 90, 2.4),
    rect(4, PLANK.x, PLANK.y, PLANK.w, WEAR, { preserveVertices: true, roughness: 0.6 }),
  ],
};

// Massivdielen und Landhausdielen: wide boards, staggered joints, a knot or two.
const BOARD_H = 24;
const joints = [58, 30, 70];
const boards = joints.flatMap((jx, r) => [
  box(TILE.x, TILE.y + r * BOARD_H, jx - TILE.x, BOARD_H),
  box(jx, TILE.y + r * BOARD_H, END - jx, BOARD_H),
]);
const DIELE_ACCENT = 3; // second board of the middle row

export const bodenMassivdielen = mini(101, [
  ...boards.filter((_, i) => i !== DIELE_ACCENT).map((q) => polygon(2, q, { preserveVertices: true })),
  ellipse(2, 38, 24, 5, 3.5, { roughness: 0.4 }),
  ellipse(2, 44, 72, 4, 3, { roughness: 0.4 }),
  hatch(box(TILE.x, TILE.y, joints[0]! - TILE.x, BOARD_H), 0, 4.5),
  polygon(4, boards[DIELE_ACCENT] as Point[], { preserveVertices: true, roughness: 0.6 }),
]);

// Kork und Linoleum: 2 × 2 tiles; cork is stippled, linoleum plain; the next tile in red.
const CORK = 36;
const corkTiles = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

export const bodenKorkLinoleum = mini(103, [
  ...corkTiles
    .slice(0, 3)
    .map(([i, j]) => rect(2, TILE.x + i * CORK, TILE.y + j * CORK, CORK, CORK, { preserveVertices: true })),
  stipple(box(TILE.x + 3, TILE.y + 3, CORK - 6, CORK - 6), 6),
  stipple(box(TILE.x + CORK + 3, TILE.y + CORK + 3, CORK - 6, CORK - 6), 6),
  rect(4, TILE.x + CORK, TILE.y + CORK, CORK, CORK, { preserveVertices: true, roughness: 0.6 }),
]);
