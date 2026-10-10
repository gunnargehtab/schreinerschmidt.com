// Konfigurator teaser: an exploded cabinet carcass in cavalier oblique (hero art, 640 × 480).
// Built to draw itself: pass 1 sets out the alignment lines the parts hang on, pass 2 adds the
// parts from the sides inwards, pass 3 the end grain on the side panels, pass 4 the width as a
// Maßlinie in red: the number the configurator asks for first.
import { construction, dimension, hatch, slab, topFace, type Drawing } from '../primitives';

const T = 12; // panel thickness
const D = 120; // carcass depth
const X = 190; // carcass left edge (front face)
const W = 200;
const TOP = 140; // top of the side panels
const H = 240;
const GAP = 50; // explosion distance

// The sides move out, the top up, the bottom down; the shelf stays where it belongs.
const sides = { y: TOP, h: H, left: X - T - GAP, right: X + W + GAP };
const top = { x: X, y: TOP - GAP, w: W };
const bottom = { x: X, y: TOP + H - T + GAP, w: W };
const shelf = { x: X + T, y: TOP + (H - T) / 2 + 4, w: W - 2 * T, d: D - 20 };
const DIM_Y = bottom.y + T + 24;

export const konfigurator: Drawing = {
  viewBox: [640, 480],
  strokeWidth: 2,
  seed: 77,
  roughness: 1.2,
  primitives: [
    // Pass 1: the parts line up on the carcass's outer edges, its top and the shelf height.
    construction([X, top.y - 20], [X, bottom.y + T + 8], 6),
    construction([X + W, top.y - 20], [X + W, bottom.y + T + 8], 6),
    construction([sides.left - 20, TOP], [sides.right + T + 20, TOP], 6),
    construction([sides.left - 20, shelf.y], [sides.right + T + 20, shelf.y], 6),
    // Pass 2: sides, top, bottom, shelf.
    ...slab(2, sides.left, sides.y, T, sides.h, D),
    ...slab(2, sides.right, sides.y, T, sides.h, D),
    ...slab(2, top.x, top.y, top.w, T, D),
    ...slab(2, bottom.x, bottom.y, bottom.w, T, D),
    ...slab(2, shelf.x, shelf.y, shelf.w, T, shelf.d),
    // Pass 3: end grain on the side panels' top edges.
    hatch(topFace(sides.left, sides.y, T, D), 45, 5),
    hatch(topFace(sides.right, sides.y, T, D), 45, 5),
    // Pass 4: the width.
    dimension(4, [X, DIM_Y], [X + W, DIM_Y], 6, { roughness: 0.8 }),
  ],
};
