// Türen: panelled front door with a transom light, in elevation (service icon, 96 viewBox).
// Pass 1 is the floor and the transom level, pass 2 frame, transom with bars, leaf, panels and
// knob, pass 3 the transom glass, pass 4 the opening triangle in red (same symbol as Fenster).
import { construction, ellipse, hatch, line, polyline, rect, box, type Drawing } from '../primitives';

const FRAME = { x: 20, y: 8, w: 56, bottom: 88 };
const INSET = 3;
const TRANSOM = { x: FRAME.x + INSET, y: FRAME.y + INSET, w: FRAME.w - 2 * INSET, h: 14 };
const LEAF = { x: FRAME.x + INSET, y: TRANSOM.y + TRANSOM.h + INSET, w: FRAME.w - 2 * INSET };
const LEAF_H = FRAME.bottom - LEAF.y;
const PANEL_INSET = 5;
const upper = { x: LEAF.x + PANEL_INSET, y: LEAF.y + PANEL_INSET, w: LEAF.w - 2 * PANEL_INSET, h: 22 };
const lowerY = upper.y + upper.h + 6;
const lowerW = (upper.w - 4) / 2;
const lowerH = FRAME.bottom - 5 - lowerY;
const KNOB = { cx: LEAF.x + LEAF.w - 3, cy: 60, r: 2.4 };

export const tueren: Drawing = {
  viewBox: [96, 96],
  strokeWidth: 1.5,
  seed: 41,
  roughness: 0.7,
  primitives: [
    // Pass 1: floor and the transom level.
    construction([4, FRAME.bottom], [92, FRAME.bottom], 4),
    construction([8, LEAF.y - INSET / 2], [88, LEAF.y - INSET / 2], 3),
    // Pass 2: frame (open at the floor), transom with two bars, leaf, panels, knob.
    polyline(
      2,
      [
        [FRAME.x, FRAME.bottom],
        [FRAME.x, FRAME.y],
        [FRAME.x + FRAME.w, FRAME.y],
        [FRAME.x + FRAME.w, FRAME.bottom],
      ],
      { preserveVertices: true },
    ),
    rect(2, TRANSOM.x, TRANSOM.y, TRANSOM.w, TRANSOM.h, { preserveVertices: true }),
    line(2, [TRANSOM.x + TRANSOM.w / 3, TRANSOM.y], [TRANSOM.x + TRANSOM.w / 3, TRANSOM.y + TRANSOM.h]),
    line(2, [TRANSOM.x + (2 * TRANSOM.w) / 3, TRANSOM.y], [TRANSOM.x + (2 * TRANSOM.w) / 3, TRANSOM.y + TRANSOM.h]),
    rect(2, LEAF.x, LEAF.y, LEAF.w, LEAF_H, { preserveVertices: true }),
    rect(2, upper.x, upper.y, upper.w, upper.h, { preserveVertices: true }),
    rect(2, upper.x, lowerY, lowerW, lowerH, { preserveVertices: true }),
    rect(2, upper.x + lowerW + 4, lowerY, lowerW, lowerH, { preserveVertices: true }),
    ellipse(2, KNOB.cx, KNOB.cy, 2 * KNOB.r, 2 * KNOB.r, { roughness: 0.4 }),
    // Pass 3: the transom glass.
    hatch(box(TRANSOM.x, TRANSOM.y, TRANSOM.w, TRANSOM.h), -45, 3.2),
    // Pass 4: the leaf is hinged on the left; the triangle points at the hinges.
    polyline(
      4,
      [
        [LEAF.x + LEAF.w, LEAF.y],
        [LEAF.x, LEAF.y + LEAF_H / 2],
        [LEAF.x + LEAF.w, LEAF.y + LEAF_H],
      ],
      { preserveVertices: true, roughness: 0.6 },
    ),
  ],
};
