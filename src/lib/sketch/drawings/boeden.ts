// Böden: herringbone parquet in one-point perspective (service icon, 96 viewBox).
// Pass 1 draws the floor as construction lines with overshoot, pass 2 the planks, pass 3 a grain
// hint on two planks, pass 4 the next plank to be laid, in red. The back of the floor stays
// undrawn, the way a quick sketch trails off.
import {
  construction,
  floorProjector,
  hatch,
  herringbone,
  polygon,
  polygonArea,
  type Drawing,
  type Point,
} from '../primitives';

const CX = 48;
const HORIZON = -28.7;
const FOCAL = 106;
const EYE = 2.2;
const Z_FRONT = 2;
const Z_BACK = 4.6;
const HALF_WIDTH = 0.7; // floor units at the front edge → x from 11 to 85
const PLANK_W = 0.25; // floor units; planks are 3 widths long
const LAID_DEPTH = 0.75; // share of the depth that is drawn

const project = floorProjector(CX, HORIZON, FOCAL, EYE);

const corners = {
  frontLeft: project([-HALF_WIDTH, Z_FRONT]),
  frontRight: project([HALF_WIDTH, Z_FRONT]),
  backLeft: project([-HALF_WIDTH, Z_BACK]),
  backRight: project([HALF_WIDTH, Z_BACK]),
};

// Pattern space: u across in plank widths, v into the depth.
const uMax = HALF_WIDTH / PLANK_W;
const vMax = ((Z_BACK - Z_FRONT) * LAID_DEPTH) / PLANK_W;
const toFloor = ([u, v]: Point): Point => [u * PLANK_W, Z_FRONT + v * PLANK_W];
const planks = herringbone(3, -uMax, uMax, 0, vMax)
  .filter((quad) => polygonArea(quad) > 0.6)
  .map((quad) => ({
    screen: quad.map((p) => project(toFloor(p))),
    full: polygonArea(quad) > 2.9,
    depth: quad.reduce((s, p) => s + p[1], 0) / quad.length,
  }));

// The red accent: the front-most whole plank. Grain hints: two whole planks further back.
const whole = planks.filter((p) => p.full).sort((a, b) => a.depth - b.depth);
const accent = whole[0];
const grain = [whole[2], whole[5]].filter((p) => p !== undefined);

export const boeden: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 11,
  roughness: 0.5,
  primitives: [
    construction(corners.frontLeft, corners.backLeft, 4),
    construction(corners.frontRight, corners.backRight, 4),
    construction(corners.backLeft, corners.backRight, 4),
    construction(corners.frontLeft, corners.frontRight, 3),
    ...planks
      .filter((p) => p !== accent)
      .map((p) => polygon(2, p.screen, { preserveVertices: true, roughness: p.full ? 0.5 : 0.35 })),
    ...grain.map((p) => hatch(p.screen, -35, 2.2)),
    ...(accent ? [polygon(4, accent.screen, { preserveVertices: true, roughness: 0.6 })] : []),
  ],
};
