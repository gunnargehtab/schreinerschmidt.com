// Fenster: double casement window with glazing bars, in elevation (service icon, 96 viewBox).
// Pass 1 is the wall (sill and lintel lines) with overshoot, pass 2 frame, casements, bars, sill
// and handle, pass 3 glass in two panes, pass 4 the opening triangle of the right casement in red:
// the architectural symbol pointing at the hinges.
import { construction, hatch, line, polygon, polyline, rect, box, type Drawing } from '../primitives';

const FRAME = { x: 16, y: 16, w: 64, h: 62 };
const INSET = 3;
const SASH_W = (FRAME.w - 3 * INSET) / 2;
const left = { x: FRAME.x + INSET, y: FRAME.y + INSET, w: SASH_W, h: FRAME.h - 2 * INSET };
const right = { ...left, x: FRAME.x + 2 * INSET + SASH_W };
const SILL = { x: FRAME.x - 5, y: FRAME.y + FRAME.h, w: FRAME.w + 10, h: 4 };
const bars = (s: typeof left) => [
  line(2, [s.x, s.y + s.h / 3], [s.x + s.w, s.y + s.h / 3]),
  line(2, [s.x, s.y + (2 * s.h) / 3], [s.x + s.w, s.y + (2 * s.h) / 3]),
  line(2, [s.x + s.w / 2, s.y], [s.x + s.w / 2, s.y + s.h]),
];

export const fenster: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 37,
  roughness: 0.7,
  primitives: [
    // Pass 1: lintel and sill level in the wall.
    construction([4, FRAME.y], [92, FRAME.y], 4),
    construction([4, SILL.y], [92, SILL.y], 4),
    // Pass 2: frame, two casements, glazing bars, sill, handle.
    rect(2, FRAME.x, FRAME.y, FRAME.w, FRAME.h, { preserveVertices: true }),
    rect(2, left.x, left.y, left.w, left.h, { preserveVertices: true }),
    rect(2, right.x, right.y, right.w, right.h, { preserveVertices: true }),
    ...bars(left),
    ...bars(right),
    polygon(2, box(SILL.x, SILL.y, SILL.w, SILL.h), { preserveVertices: true }),
    line(2, [left.x + left.w - 3, 43], [left.x + left.w - 3, 51]),
    // Pass 3: glass, hinted in two panes.
    hatch(box(right.x, right.y, right.w / 2, right.h / 3), -45, 3),
    hatch(box(left.x, left.y + (2 * left.h) / 3, left.w / 2, left.h / 3), -45, 3),
    // Pass 4: the right casement opens; the triangle points at its hinges.
    polyline(
      4,
      [
        [right.x, right.y],
        [right.x + right.w, right.y + right.h / 2],
        [right.x, right.y + right.h],
      ],
      { preserveVertices: true, roughness: 0.6 },
    ),
  ],
};
