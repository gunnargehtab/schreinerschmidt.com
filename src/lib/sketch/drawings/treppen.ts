// Treppen: closed-stringer stair in side elevation (service icon, 96 viewBox).
// Pass 1 is the floor, the upper landing slab and the pitch line through the nosings, pass 2 the
// step profile with the stringer underside and the balusters, pass 3 the landing slab in section,
// pass 4 the handrail in red.
import { construction, hatch, line, polygon, box, type Drawing, type Point } from '../primitives';

const FLOOR = 90;
const RUN = 13;
const RISE = 11;
const START: Point = [10, 78]; // first nosing
const STEPS = 5;
const STRINGER = 12; // thickness, measured vertically under the nosings
const RAIL_HEIGHT = 24;

// Nosings of each step, bottom to top; the last one is the landing edge.
const nosings: Point[] = Array.from({ length: STEPS }, (_, i) => [START[0] + i * RUN, START[1] - i * RISE]);
const landing = nosings[STEPS - 1] as Point;
const LANDING = { x: landing[0], y: landing[1], end: landing[0] + 16, right: 92, thickness: STRINGER };

// The sawtooth profile, then the stringer's underside (parallel to the pitch) back to the floor.
const profile: Point[] = [[START[0], FLOOR]];
for (const [x, y] of nosings.slice(0, -1)) profile.push([x, y], [x + RUN, y]);
profile.push([LANDING.x, LANDING.y], [LANDING.end, LANDING.y], [LANDING.end, LANDING.y + STRINGER]);
const pitch = RISE / RUN;
profile.push([LANDING.end - (FLOOR - LANDING.y - STRINGER) / pitch, FLOOR]);

// Balusters on the first, third and last step; the handrail follows the pitch above them.
const balusters = nosings
  .filter((_, i) => i % 2 === 0)
  .map(([x, y]): [Point, Point] => [
    [x + RUN / 2, y],
    [x + RUN / 2, y - RAIL_HEIGHT],
  ]);
const railFrom: Point = [START[0] + 1, START[1] - RAIL_HEIGHT + 1];
const railTo: Point = [LANDING.end - 4, LANDING.y - RAIL_HEIGHT - 2];

export const treppen: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 31,
  roughness: 0.7,
  primitives: [
    // Pass 1: floor, landing slab, pitch line.
    construction([4, FLOOR], [92, FLOOR], 4),
    construction([LANDING.end, LANDING.y], [LANDING.right, LANDING.y], 3),
    construction([LANDING.end, LANDING.y + LANDING.thickness], [LANDING.right, LANDING.y + LANDING.thickness], 3),
    construction(START, landing, 6),
    // Pass 2: step profile and balusters.
    polygon(2, profile, { preserveVertices: true }),
    ...balusters.map(([a, b]) => line(2, a, b)),
    // Pass 3: the landing slab, cut.
    hatch(box(LANDING.end, LANDING.y, LANDING.right - LANDING.end, LANDING.thickness), -45, 3.2),
    // Pass 4: the handrail.
    line(4, railFrom, railTo, { roughness: 0.6 }),
  ],
};
