// Altbau: Gründerzeit door frame with a crown moulding, in elevation (service icon, 96 viewBox).
// Pass 1 is the floor and the cornice level, pass 2 the profiled architrave with plinth blocks and
// the double door behind it, pass 3 the shadow the cornice casts, pass 4 the cornice itself in red:
// the piece that gets restored.
import { construction, hatch, line, polyline, rect, box, type Drawing, type Point } from '../primitives';

const FLOOR = 88;
const OUTER = { x: 18, top: 30, w: 60 }; // architrave outside edge
const INNER = { x: 25, top: 37, w: 46 }; // door opening
const PLINTH = { h: 12, w: 8 };
const CORNICE = { x: 12, y: 22, w: 72, h: 8 };
const CAP = { x: 10, y: 19, w: 76 };
const DOOR = { x: INNER.x, y: INNER.top, w: INNER.w, h: FLOOR - INNER.top };

/** A Π-shaped line: down the left, across the top, down the right. */
const portal = (x: number, top: number, w: number, bottom: number): Point[] => [
  [x, bottom],
  [x, top],
  [x + w, top],
  [x + w, bottom],
];

const panelW = DOOR.w / 2 - 7;

export const altbau: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 43,
  roughness: 0.7,
  primitives: [
    // Pass 1: floor, cornice level.
    construction([4, FLOOR], [92, FLOOR], 4),
    construction([4, CAP.y], [92, CAP.y], 4),
    // Pass 2: architrave (two profile lines), plinth blocks, cap board, double door with panels.
    polyline(2, portal(OUTER.x, OUTER.top, OUTER.w, FLOOR - PLINTH.h), { preserveVertices: true }),
    polyline(2, portal(INNER.x, INNER.top, INNER.w, FLOOR), { preserveVertices: true }),
    polyline(2, portal(OUTER.x + 3.5, OUTER.top + 3.5, OUTER.w - 7, FLOOR - PLINTH.h), { preserveVertices: true }),
    rect(2, OUTER.x - 1, FLOOR - PLINTH.h, PLINTH.w, PLINTH.h, { preserveVertices: true }),
    rect(2, OUTER.x + OUTER.w - PLINTH.w + 1, FLOOR - PLINTH.h, PLINTH.w, PLINTH.h, { preserveVertices: true }),
    line(2, [CAP.x, CAP.y], [CAP.x + CAP.w, CAP.y]),
    line(2, [DOOR.x + DOOR.w / 2, DOOR.y], [DOOR.x + DOOR.w / 2, FLOOR]),
    rect(2, DOOR.x + 4, DOOR.y + 5, panelW, 22, { preserveVertices: true }),
    rect(2, DOOR.x + DOOR.w / 2 + 3, DOOR.y + 5, panelW, 22, { preserveVertices: true }),
    rect(2, DOOR.x + 4, DOOR.y + 32, panelW, 14, { preserveVertices: true }),
    rect(2, DOOR.x + DOOR.w / 2 + 3, DOOR.y + 32, panelW, 14, { preserveVertices: true }),
    // Pass 3: the cornice's shadow on the wall and the architrave.
    hatch(box(CORNICE.x, CORNICE.y + CORNICE.h, CORNICE.w, 4), -45, 2.6),
    // Pass 4: the cornice (Verdachung).
    rect(4, CORNICE.x, CORNICE.y, CORNICE.w, CORNICE.h, { preserveVertices: true, roughness: 0.6 }),
  ],
};
