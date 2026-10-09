// Möbel: built-in cabinet with one door open (service icon, 96 viewBox).
// Pass 1 is the niche (walls, ceiling, floor) with overshoot, pass 2 the carcass, doors and
// shelves, pass 3 the shadow inside the open compartment, pass 4 the door swing in red.
import { construction, hatch, line, polygon, rect, arc, type Drawing } from '../primitives';

const NICHE = { left: 8, right: 80, top: 10, bottom: 88 };
const BODY = { x: 10, y: 12, w: 68, h: 74 };
const DOOR = { x: 13, y: 15, w: 30, h: 62 };
const OPEN = { hinge: 75, top: 15, bottom: 77, free: 90, freeTop: 11, freeBottom: 82 };
const INSIDE = { x: 45, y: 15, w: 30, h: 62 };

export const moebel: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 23,
  roughness: 0.7,
  primitives: [
    // Pass 1: the niche the cabinet is built into.
    construction([NICHE.left, NICHE.top], [NICHE.right, NICHE.top], 4),
    construction([NICHE.left, NICHE.bottom], [NICHE.right, NICHE.bottom], 4),
    construction([NICHE.left, NICHE.top], [NICHE.left, NICHE.bottom], 3),
    construction([NICHE.right, NICHE.top], [NICHE.right, NICHE.bottom], 3),
    // Pass 2: carcass, plinth, closed door with handle, shelves, open door.
    rect(2, BODY.x, BODY.y, BODY.w, BODY.h, { preserveVertices: true }),
    line(2, [BODY.x, 80], [BODY.x + BODY.w, 80]),
    rect(2, DOOR.x, DOOR.y, DOOR.w, DOOR.h, { preserveVertices: true }),
    line(2, [DOOR.x + DOOR.w - 4, 42], [DOOR.x + DOOR.w - 4, 50]),
    line(2, [INSIDE.x, 36], [INSIDE.x + INSIDE.w, 36]),
    line(2, [INSIDE.x, 56], [INSIDE.x + INSIDE.w, 56]),
    polygon(
      2,
      [
        [OPEN.hinge, OPEN.top],
        [OPEN.free, OPEN.freeTop],
        [OPEN.free, OPEN.freeBottom],
        [OPEN.hinge, OPEN.bottom],
      ],
      { preserveVertices: true },
    ),
    line(2, [OPEN.free - 3, 42], [OPEN.free - 3, 52]),
    // Pass 3: shadow in the open compartment.
    hatch(
      [
        [INSIDE.x, INSIDE.y],
        [INSIDE.x + 12, INSIDE.y],
        [INSIDE.x + 12, INSIDE.y + INSIDE.h],
        [INSIDE.x, INSIDE.y + INSIDE.h],
      ],
      -50,
      3.2,
    ),
    // Pass 4: the door swing, drawn the way a plan shows it.
    arc(4, OPEN.hinge, OPEN.bottom, 2 * INSIDE.w, 11, Math.PI / 3, Math.PI, { roughness: 0.5 }),
  ],
};
