// Assembly motion of a Build (docs/configurator.md §4.6 "Phase C additions"): the opening motion of
// fronts, the explode directions and the pose maths that places a part for a given open/explode
// state. Pure (no three.js, no DOM), in mm; the viewer's rig converts to metres.
//
// Only the viewer chunk imports this module: the Möbel preview chunk bundles the carcass generator
// and has no room left, so the explode vectors are derived here from role, id and position instead
// of being written into every Part by the generators. A generator may still set `Part.explode`
// (table.ts does not need to); it wins over the derived direction.
//
// Explode rules (directions are multiplied by `explodeDistance()` = 15 % of the largest outer size):
// - Carcass (Regal, Sideboard): the Sockel or the Füße stay on the floor; the box lifts 0.6 and
//   opens up: sides out (±x), top further up, back backwards, shelves a little and fronts (with their
//   handles) further forward. Mittelwände only lift. Nothing moves below the floor.
// - Einbauschrank: the box stays between its walls; the Passleisten and the Blende come forward,
//   shelves and fronts as above, the back goes backwards.
// - Table: the top lifts; legs move diagonally away from the centre along the floor; Zargen move
//   outwards across their length; Kufen move apart along x; the Traverse drops a little (it stays
//   above the floor: its underside is ≥ 620 mm up and the drop is ≤ 290 mm).
import type { Build, Mm, Part, Vec3 } from './types';

export type Explode = [number, number, number];

/** Explode distance as a share of the largest outer dimension (§4.6). */
export const EXPLODE_RATIO = 0.15;
/** Fully open door angle (§4.6). */
export const DOOR_ANGLE_DEG = 100;
/** The box lift of an exploded carcass (share of the explode distance), so nothing sinks below the floor. */
const LIFT = 0.6;

export const explodeDistance = (b: Build): Mm => EXPLODE_RATIO * Math.max(...b.derived.outer);

const sign = (v: number): 1 | -1 => (v < 0 ? -1 : 1);
const centre = (p: Part, i: number): Mm => p.min[i]! + p.size[i]! / 2;
const isLeft = (p: Part): boolean => p.id.endsWith('L');

/**
 * The opening motion of a part: its own, or for a handle (`…/griff`) the motion of the front it sits
 * on. `byId` maps part ids to parts (one Build).
 */
export function motionOf(p: Part, byId: Map<string, Part>): Part['motion'] | undefined {
  if (p.motion || p.role !== 'griff') return p.motion;
  return byId.get(p.id.slice(0, -'/griff'.length))?.motion;
}

/** Explode direction of a part, or null for the parts that anchor the exploded view (and the walls). */
export function explodeOf(p: Part, b: Build): Explode | null {
  if (p.explode) return p.explode;
  const einbau = b.params.kind === 'einbauschrank';
  // A niche box cannot open up: walls and ceiling are in the way.
  const lift = einbau ? 0 : LIFT;
  const dx = centre(p, 0) - (b.bounds.min[0] + b.bounds.max[0]) / 2;
  const dz = centre(p, 2) - (b.bounds.min[2] + b.bounds.max[2]) / 2;
  switch (p.role) {
    case 'seite':
      return einbau ? null : [isLeft(p) ? -1 : 1, lift, 0];
    case 'oberboden':
      return einbau ? null : [0, 1 + lift, 0];
    case 'unterboden':
    case 'mittelwand':
      return einbau ? null : [0, lift, 0];
    case 'rueckwand':
      return [0, lift, -1];
    case 'fachboden':
      return [0, lift, 0.5];
    case 'tuer':
    case 'schubkastenfront':
    case 'griff':
      return [0, lift, 1.5];
    case 'passleiste':
      return [isLeft(p) ? -0.4 : 0.4, 0, 1.5];
    case 'blende':
      return [0, 0.4, 1.5];
    case 'platte':
      return [0, 1, 0];
    case 'bein':
      return [0.8 * sign(dx), 0, 0.8 * sign(dz)];
    case 'zarge':
      return p.grain === 0 ? [0, 0, sign(dz)] : [sign(dx), 0, 0];
    case 'kufe':
      return [sign(dx), 0, 0];
    case 'traverse':
      return [0, -LIFT, 0];
    default:
      return null; // sockel, fuss, wand
  }
}

export interface Pose {
  /** Centre of the part (mm). */
  pos: Vec3;
  /** Rotation about the vertical axis (rad), 0 unless a door is open. */
  rotY: number;
}

/**
 * Places a part for an open state (0 closed … 1 open) and an explode state (0 assembled … 1 exploded)
 * with the explode distance `dist` (mm). A door swings about its hinge pivot (see the three.js
 * rotation convention: x' = x·cos + z·sin, z' = −x·sin + z·cos), a drawer slides forward.
 */
export function poseOf(
  p: Part,
  motion: Part['motion'] | undefined,
  explode: Explode | null,
  open: number,
  exploded: number,
  dist: Mm,
  out: Pose = { pos: [0, 0, 0], rotY: 0 },
): Pose {
  let x = centre(p, 0);
  let y = centre(p, 1);
  let z = centre(p, 2);
  let rot = 0;
  if (motion && open > 0) {
    if (motion.kind === 'slide') z += motion.dist * open;
    else {
      rot = (-motion.dir * open * DOOR_ANGLE_DEG * Math.PI) / 180;
      const [px, , pz] = motion.pivot;
      const dx = x - px;
      const dz = z - pz;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      x = px + dx * c + dz * s;
      z = pz - dx * s + dz * c;
    }
  }
  if (explode && exploded > 0) {
    const k = dist * exploded;
    x += explode[0] * k;
    y += explode[1] * k;
    z += explode[2] * k;
  }
  out.pos[0] = x;
  out.pos[1] = y;
  out.pos[2] = z;
  out.rotY = rot;
  return out;
}
