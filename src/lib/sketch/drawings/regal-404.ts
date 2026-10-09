// 404: a wall shelf with one board missing (hero art, 640 × 480).
// The „? cm“ dimension is NOT part of the SVG: src/pages/404.astro places a Maßlinie with live
// text over the gap (SVGs carry no text, §3). Pass 4 is the ghost of the missing board in red.
import { arc, construction, hatch, line, polygon, polyline, rect, box, type Drawing } from '../primitives';

const UPRIGHT = { w: 16, top: 70, bottom: 440 };
const LEFT = 150;
const RIGHT = 474;
const INNER = { x: LEFT + UPRIGHT.w, w: RIGHT - LEFT - UPRIGHT.w };
const BOARD_H = 16;
const BOARDS = [140, 324, 424];
const MISSING = 232;

export const regal404: Drawing = {
  viewBox: [640, 480],
  strokeWidth: 2,
  seed: 404,
  roughness: 1.4,
  primitives: [
    // Pass 1: wall base line, the uprights' axes and the level of the missing board.
    construction([80, UPRIGHT.bottom], [560, UPRIGHT.bottom], 4),
    construction([LEFT, 40], [LEFT, 460], 3),
    construction([RIGHT + UPRIGHT.w, 40], [RIGHT + UPRIGHT.w, 460], 3),
    construction([116, MISSING + BOARD_H / 2], [524, MISSING + BOARD_H / 2], 4),
    // Pass 2: uprights, top board, boards.
    rect(2, LEFT, UPRIGHT.top, UPRIGHT.w, UPRIGHT.bottom - UPRIGHT.top, { preserveVertices: true }),
    rect(2, RIGHT, UPRIGHT.top, UPRIGHT.w, UPRIGHT.bottom - UPRIGHT.top, { preserveVertices: true }),
    rect(2, LEFT - 14, UPRIGHT.top - BOARD_H, RIGHT + UPRIGHT.w + 14 - (LEFT - 14), BOARD_H, {
      preserveVertices: true,
    }),
    ...BOARDS.map((y) => rect(2, INNER.x, y, INNER.w, BOARD_H, { preserveVertices: true })),
    // Books on the top compartment: three standing, one leaning.
    rect(2, 188, 88, 16, 52),
    rect(2, 206, 82, 14, 58),
    rect(2, 222, 86, 18, 54),
    polygon(2, [
      [250, 140],
      [268, 140],
      [284, 90],
      [268, 86],
    ]),
    // A hand plane on the lowest board.
    polygon(2, [
      [372, 424],
      [376, 402],
      [446, 402],
      [452, 424],
    ]),
    arc(2, 398, 402, 26, 30, Math.PI, 2 * Math.PI),
    line(2, [430, 402], [436, 386]),
    // A folding rule, half unfolded.
    polyline(
      2,
      [
        [186, 420],
        [224, 394],
        [262, 420],
        [300, 394],
        [338, 420],
      ],
      { preserveVertices: true, roughness: 0.9 },
    ),
    // Pass 3: the dados that the missing board should sit in, plus the top board's end grain.
    hatch(box(LEFT, MISSING, UPRIGHT.w, BOARD_H), -45, 5),
    hatch(box(RIGHT, MISSING, UPRIGHT.w, BOARD_H), -45, 5),
    hatch(box(LEFT - 14, UPRIGHT.top - BOARD_H, 14, BOARD_H), 60, 4),
    hatch(box(RIGHT + UPRIGHT.w, UPRIGHT.top - BOARD_H, 14, BOARD_H), 60, 4),
    // Pass 4: where the board belongs.
    rect(4, INNER.x, MISSING, INNER.w, BOARD_H, { preserveVertices: true, roughness: 1.1 }),
  ],
};
