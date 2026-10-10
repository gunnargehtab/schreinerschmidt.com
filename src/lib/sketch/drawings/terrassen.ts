// Terrassen: deck boards on a substructure, cut away, in cavalier oblique (service icon, 96 viewBox).
// Pass 1 is the ground and the depth direction, pass 2 the laid boards (front edge + top face),
// the joist and its pads, pass 3 the joist's face, pass 4 the next board in red, lifted into place.
import { back, construction, hatch, line, polygon, rect, topFace, box, type Drawing } from '../primitives';

const FRONT_Y = 64;
const BOARD = { w: 11, gap: 2, thickness: 3, depth: 44 };
const FIRST_X = 10;
const COUNT = 5;
const JOIST = { x: 13, y: FRONT_Y + BOARD.thickness, w: 59, h: 7 };
const PADS = [18, 58];
const GROUND = JOIST.y + JOIST.h + 5;

const boardX = (i: number) => FIRST_X + i * (BOARD.w + BOARD.gap);
const laid = Array.from({ length: COUNT - 1 }, (_, i) => boardX(i));
const nextX = boardX(COUNT - 1);
const LIFT: [number, number] = [6, -12];

export const terrassen: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 47,
  roughness: 0.7,
  primitives: [
    // Pass 1: ground line and the depth direction along the deck's left edge.
    construction([4, GROUND], [92, GROUND], 4),
    construction([FIRST_X, FRONT_Y], back([FIRST_X, FRONT_Y], BOARD.depth), 5),
    // Pass 2: four laid boards, the joist below, two pads, the back joist's end.
    ...laid.flatMap((x) => [
      polygon(2, topFace(x, FRONT_Y, BOARD.w, BOARD.depth), { preserveVertices: true }),
      rect(2, x, FRONT_Y, BOARD.w, BOARD.thickness, { preserveVertices: true }),
    ]),
    rect(2, JOIST.x, JOIST.y, JOIST.w, JOIST.h, { preserveVertices: true }),
    ...PADS.map((x) => rect(2, x, JOIST.y + JOIST.h, 7, GROUND - JOIST.y - JOIST.h, { preserveVertices: true })),
    line(2, [JOIST.x + JOIST.w, JOIST.y], back([JOIST.x + JOIST.w, JOIST.y], 12)),
    // Pass 3: the joist face.
    hatch(box(JOIST.x, JOIST.y, JOIST.w, JOIST.h), -30, 3),
    // Pass 4: the fifth board, not yet down.
    polygon(4, topFace(nextX + LIFT[0], FRONT_Y + LIFT[1], BOARD.w, BOARD.depth), {
      preserveVertices: true,
      roughness: 0.6,
    }),
  ],
};
