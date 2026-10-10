// Process steps (service-icon size, 96 viewBox, stroke 1.5): Beratung & Aufmaß, Entwurf & Angebot,
// Fertigung, Montage, Pflege. Everything lies on a table or the ground (pass 1, with overshoot);
// things with depth use the shared cavalier oblique; the red accent is the tool or mark that
// stands for the step.
import {
  along,
  arc,
  back,
  bar,
  construction,
  curve,
  dimension,
  ellipse,
  hatch,
  line,
  polygon,
  rect,
  rightFace,
  slab,
  box,
  type Drawing,
  type Point,
  type Primitive,
} from '../primitives';

// Beratung & Aufmaß: a notepad and a folding rule, half unfolded. Accent: the measurement noted
// on the pad, as a Maßlinie.
const PAD = { x: 14, y: 14, w: 46, h: 62 };
const RULE: Point[] = [
  [36, 86],
  [60, 58],
  [84, 70],
];
const RULE_W = 5;

function ruleSegment(from: Point, to: Point): Primitive[] {
  const ticks = [0.2, 0.4, 0.6, 0.8].map((t) => line(2, along(from, to, t, RULE_W / 2), along(from, to, t, 0.5)));
  return [polygon(2, bar(from, to, RULE_W), { preserveVertices: true }), ...ticks];
}

export const beratung: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 53,
  roughness: 0.7,
  primitives: [
    construction([4, 88], [92, 88], 4),
    construction([PAD.x, PAD.y + 10], [PAD.x + PAD.w, PAD.y + 10], 3),
    rect(2, PAD.x, PAD.y, PAD.w, PAD.h, { preserveVertices: true }),
    ...[34, 42, 50].map((y) => line(2, [PAD.x + 6, y], [PAD.x + PAD.w - 8, y], { roughness: 1.1 })),
    ...ruleSegment(RULE[0] as Point, RULE[1] as Point),
    ...ruleSegment(RULE[1] as Point, RULE[2] as Point),
    ellipse(2, (RULE[1] as Point)[0], (RULE[1] as Point)[1], 3, 3, { roughness: 0.4 }),
    hatch(box(PAD.x, PAD.y, PAD.w, 10), -45, 3),
    dimension(4, [PAD.x + 6, 64], [PAD.x + PAD.w - 8, 64]),
  ],
};

// Entwurf & Angebot: a sheet with a small cabinet elevation and title block, and a carpenter's
// pencil that has just drawn the width. Accent: that dimension line.
const SHEET = { x: 16, y: 10, w: 52, h: 70 };
const DRAWN = { x: 24, y: 22, w: 36, h: 26 };
const TITLE = { x: 24, y: 66, w: 36, h: 8 };
const TIP: Point = [60, 58];
const TIP_BASE: Point = [65.7, 63.7];
const PENCIL_END: Point = [88, 86];
const PENCIL_W = 7;
const tipSide = (PENCIL_W / 2) * Math.SQRT1_2;

export const entwurf: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 59,
  roughness: 0.7,
  primitives: [
    construction([4, 88], [92, 88], 4),
    // Extension lines from the drawn cabinet to its dimension.
    construction([DRAWN.x, DRAWN.y + DRAWN.h], [DRAWN.x, 58], 2),
    construction([DRAWN.x + DRAWN.w, DRAWN.y + DRAWN.h], [DRAWN.x + DRAWN.w, 58], 2),
    rect(2, SHEET.x, SHEET.y, SHEET.w, SHEET.h, { preserveVertices: true }),
    rect(2, DRAWN.x, DRAWN.y, DRAWN.w, DRAWN.h, { preserveVertices: true, roughness: 0.9 }),
    line(2, [DRAWN.x + DRAWN.w / 2, DRAWN.y], [DRAWN.x + DRAWN.w / 2, DRAWN.y + DRAWN.h], { roughness: 0.9 }),
    rect(2, TITLE.x, TITLE.y, TITLE.w, TITLE.h, { preserveVertices: true }),
    line(2, [TITLE.x + 22, TITLE.y], [TITLE.x + 22, TITLE.y + TITLE.h]),
    polygon(2, bar(TIP_BASE, PENCIL_END, PENCIL_W), { preserveVertices: true }),
    polygon(2, [TIP, [TIP_BASE[0] - tipSide, TIP_BASE[1] + tipSide], [TIP_BASE[0] + tipSide, TIP_BASE[1] - tipSide]], {
      preserveVertices: true,
    }),
    line(2, TIP, [TIP[0] + 2, TIP[1] + 2]),
    hatch(bar(TIP_BASE, PENCIL_END, PENCIL_W), 45, 2.6),
    dimension(4, [DRAWN.x, 56], [DRAWN.x + DRAWN.w, 56]),
  ],
};

// Fertigung: workbench, hand plane, shavings. Accent: the shaving curling off the bench.
const BENCH = { x: 8, y: 52, w: 72, h: 6, d: 28 };
const PLANE = { x: 34, y: 46, w: 28, h: 9 };
// One loose ribbon of shaving, curling off the end of the plane and over the bench edge.
const spiral: Point[] = [
  [64, 44],
  [70, 39],
  [77, 42],
  [76, 49],
  [70, 50],
  [68, 56],
  [73, 61],
  [80, 58],
];

export const fertigung: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 61,
  roughness: 0.7,
  primitives: [
    construction([4, 88], [92, 88], 4),
    construction([BENCH.x, BENCH.y], back([BENCH.x, BENCH.y], BENCH.d), 5),
    ...slab(2, BENCH.x, BENCH.y, BENCH.w, BENCH.h, BENCH.d),
    rect(2, 12, BENCH.y + BENCH.h, 6, 30, { preserveVertices: true }),
    rect(2, 70, BENCH.y + BENCH.h, 6, 30, { preserveVertices: true }),
    line(2, back([76, BENCH.y + BENCH.h], BENCH.d), [90, 80]),
    line(2, [18, 76], [70, 76]),
    polygon(
      2,
      [
        [PLANE.x, PLANE.y],
        [PLANE.x + 2, PLANE.y - PLANE.h],
        [PLANE.x + PLANE.w - 2, PLANE.y - PLANE.h],
        [PLANE.x + PLANE.w, PLANE.y],
      ],
      { preserveVertices: true },
    ),
    arc(2, PLANE.x + 8, PLANE.y - PLANE.h, 9, 10, Math.PI, 2 * Math.PI),
    line(2, [PLANE.x + 19, PLANE.y - PLANE.h], [PLANE.x + 22, PLANE.y - PLANE.h - 8]),
    curve(2, [
      [PLANE.x + PLANE.w, PLANE.y - 2],
      [PLANE.x + PLANE.w + 5, PLANE.y - 6],
      [PLANE.x + PLANE.w + 8, PLANE.y - 2],
      [PLANE.x + PLANE.w + 4, PLANE.y + 1],
    ]),
    hatch(rightFace(BENCH.x, BENCH.y, BENCH.w, BENCH.h, BENCH.d), 45, 2.5),
    curve(4, spiral, { roughness: 0.6 }),
  ],
};

// Montage: the Montagebus and a spirit level in front of it. Accent: the level.
const VAN = { left: 10, right: 82, roof: 31, floor: 64, cabX: 35 };
const WHEELS = [24, 70];
const GROUND = 71;
const LEVEL = { x: 30, y: 75, w: 60, h: 8 };

export const montage: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 67,
  roughness: 0.7,
  primitives: [
    construction([4, GROUND], [92, GROUND], 4),
    construction([VAN.left + 10, VAN.roof], [VAN.right, VAN.roof], 4),
    polygon(
      2,
      [
        [VAN.left, VAN.floor],
        [VAN.left, 44],
        [VAN.left + 10, VAN.roof],
        [VAN.right, VAN.roof],
        [VAN.right, VAN.floor],
      ],
      { preserveVertices: true },
    ),
    polygon(
      2,
      [
        [VAN.left + 2, 44],
        [VAN.left + 11, 33],
        [VAN.cabX - 2, 33],
        [VAN.cabX - 2, 44],
      ],
      { preserveVertices: true },
    ),
    line(2, [VAN.cabX, VAN.roof], [VAN.cabX, VAN.floor]),
    rect(2, VAN.cabX + 2, 34, 12, 10, { preserveVertices: true }),
    line(2, [60, 34], [60, VAN.floor]),
    ...WHEELS.map((cx) => ellipse(2, cx, VAN.floor, 14, 14)),
    rect(2, LEVEL.x + 25, LEVEL.y + 1.5, 10, 5, { preserveVertices: true }),
    ellipse(2, LEVEL.x + 30, LEVEL.y + 4, 3.5, 2.4, { roughness: 0.4 }),
    hatch(
      [
        [VAN.left + 2, 44],
        [VAN.left + 11, 33],
        [VAN.cabX - 2, 33],
        [VAN.cabX - 2, 44],
      ],
      -45,
      2.6,
    ),
    rect(4, LEVEL.x, LEVEL.y, LEVEL.w, LEVEL.h, { preserveVertices: true, roughness: 0.6 }),
  ],
};

// Pflege: an oil can with a long spout and the shop rag. Accent: the rag (red, as they are).
const CAN = { x: 24, y: 52, w: 28, h: 32 };
const AXIS = CAN.x + CAN.w / 2;

export const pflege: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 71,
  roughness: 0.7,
  primitives: [
    construction([4, 88], [92, 88], 4),
    construction([AXIS, 30], [AXIS, 88], 3),
    rect(2, CAN.x, CAN.y, CAN.w, CAN.h, { preserveVertices: true }),
    polygon(
      2,
      [
        [CAN.x, CAN.y],
        [CAN.x + CAN.w, CAN.y],
        [AXIS + 8, 38],
        [AXIS - 8, 38],
      ],
      { preserveVertices: true },
    ),
    ellipse(2, AXIS, 38, 16, 5),
    curve(2, [
      [AXIS - 1, 36],
      [AXIS + 5, 26],
      [AXIS + 16, 18],
      [72, 14],
    ]),
    curve(2, [
      [AXIS + 3, 36],
      [AXIS + 8, 29],
      [AXIS + 18, 22],
      [72, 17.5],
    ]),
    line(2, [72, 14], [72, 17.5]),
    arc(2, CAN.x + CAN.w, 66, 14, 22, -Math.PI / 2, Math.PI / 2),
    hatch(box(CAN.x, CAN.y, 7, CAN.h), -70, 2.8),
    // A soft closed curve (the first two points repeat so the spline closes without a corner).
    curve(
      4,
      [
        [58, 78],
        [64, 68],
        [74, 66],
        [84, 70],
        [88, 80],
        [82, 88],
        [68, 87],
        [58, 84],
        [58, 78],
        [64, 68],
      ],
      { roughness: 0.9 },
    ),
  ],
};
