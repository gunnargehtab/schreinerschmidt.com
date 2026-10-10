// The furniture rig (docs/configurator.md §4.10 "Parameter changes", §4.6 "Phase C additions"): one
// mesh per part, diffed by part id on every Build, so a slider drag only rebuilds the panels whose
// box changed. Wood parts carry the [side, end] material pair of their species × finish (two
// geometry groups), a live-edge top [side, edge] (ExtrudeGeometry, live-edge-geometry.ts), metal
// parts the metal material and niche walls the plaster plane. Geometry is in metres; the Build is
// in mm.
//
// Pose: every mesh is placed by poseOf() (furniture/assembly.ts) for the current open (doors and
// drawers) and explode state, both 0…1 and tweened by animate()/tick() over the viewer's duration
// (0 = jump under reduced motion). pose() places a state without touching the animation (the
// snapshot shows the closed, assembled furniture and restores afterwards).
import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import {
  explodeDistance,
  explodeOf,
  motionOf,
  poseOf,
  type Explode,
  type Pose,
} from '../../../lib/configurator/furniture/assembly';
import type { Build, Part } from '../../../lib/configurator/furniture/types';
import { liveEdgeGeometry } from './live-edge-geometry';
import type { Materials } from './materials';
import { jitterOf, panelGeometry, wallGeometry } from './panel-geometry';

export interface RigState {
  open: number;
  explode: number;
}

export interface Rig {
  group: Group;
  /** Applies a Build; returns true when any geometry changed (a refit may be due). */
  apply(b: Build): boolean;
  /** True when the current Build has fronts that open (doors or drawers). */
  movable(): boolean;
  /** Tweens to a state over `ms` (0 = jump); an unfinished tween continues from where it is. */
  animate(open: number, explode: number, ms: number): void;
  /** Advances the tween and places the parts; true while it runs. */
  tick(now: number): boolean;
  /** Places the parts for a state without touching the tween. */
  pose(open: number, explode: number): void;
  state(): RigState;
  dispose(): void;
}

interface Entry {
  mesh: Mesh;
  /** Geometry signature: size (position only when it shapes the UVs), grain, anchor, surface, solidity, tile, outline. */
  sig: string;
  part: Part;
  motion: Part['motion'] | undefined;
  explode: Explode | null;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Cheap signature of an outline: the seed changes the points, not the size. */
function outlineKey(o: [number, number][] | undefined): string {
  if (!o) return '';
  let h = o.length;
  for (const [x, y] of o) h = (h * 31 + x * 7 + y) % 1e9;
  return String(h);
}

export function createRig(materials: Materials, texMm: (b: Build) => number): Rig {
  const group = new Group();
  const entries = new Map<string, Entry>();
  const pose: Pose = { pos: [0, 0, 0], rotY: 0 };
  let dist = 0;
  let movable = false;
  const cur: RigState = { open: 0, explode: 0 };
  const from: RigState = { open: 0, explode: 0 };
  const to: RigState = { open: 0, explode: 0 };
  let start = -1;
  let dur = 0;

  // The box position only matters for world-anchored UVs and wall planes; a moved panel keeps its geometry.
  const signature = (p: Part, tile: number, bounds: string) =>
    `${p.uvAnchor === 'world' || p.surface === 'wand' ? p.min.join() : ''},${p.size.join()},${p.grain},${p.uvAnchor},${p.surface},${p.solid ? 1 : 0},${tile},${p.surface === 'wand' ? bounds : ''},${outlineKey(p.outline)}`;

  const geometryOf = (p: Part, b: Build, tile: number): BufferGeometry => {
    const jitter: [number, number] = p.uvAnchor === 'world' ? [0, 0] : jitterOf(p.id, tile);
    if (p.outline) return liveEdgeGeometry(p, tile, jitter);
    return (p.surface === 'wand' && wallGeometry(p, b.bounds)) || panelGeometry(p, tile, jitter);
  };

  const materialOf = (p: Part, b: Build): Material | Material[] => {
    if (p.surface === 'metall') return materials.metal;
    if (p.surface === 'wand') return materials.wall;
    const set = materials.wood(b.params.species, b.params.finish);
    return [set.side, p.outline ? set.edge : set.end];
  };

  const place = (open: number, explode: number) => {
    for (const e of entries.values()) {
      const { pos, rotY } = poseOf(e.part, e.motion, e.explode, open, explode, dist, pose);
      e.mesh.position.set(pos[0] / 1000, pos[1] / 1000, pos[2] / 1000);
      e.mesh.rotation.y = rotY;
    }
  };

  return {
    group,
    apply(b) {
      const tile = texMm(b);
      const bounds = `${b.bounds.min.join()}/${b.bounds.max.join()}`;
      const byId = new Map(b.parts.map((p) => [p.id, p]));
      const seen = new Set<string>();
      let changed = false;
      dist = explodeDistance(b);
      movable = false;
      for (const p of b.parts) {
        seen.add(p.id);
        const sig = signature(p, tile, bounds);
        let e = entries.get(p.id);
        if (e && e.sig !== sig) {
          e.mesh.geometry.dispose();
          e.mesh.geometry = geometryOf(p, b, tile);
          e.sig = sig;
          changed = true;
        } else if (!e) {
          e = { mesh: new Mesh(geometryOf(p, b, tile)), sig, part: p, motion: undefined, explode: null };
          e.mesh.name = p.id;
          entries.set(p.id, e);
          group.add(e.mesh);
          changed = true;
        }
        e.mesh.material = materialOf(p, b);
        e.part = p;
        e.motion = motionOf(p, byId);
        e.explode = explodeOf(p, b);
        if (p.motion) movable = true;
      }
      for (const [id, e] of entries) {
        if (seen.has(id)) continue;
        group.remove(e.mesh);
        e.mesh.geometry.dispose();
        entries.delete(id);
        changed = true;
      }
      place(cur.open, cur.explode);
      return changed;
    },
    movable: () => movable,
    animate(open, explode, ms) {
      to.open = open;
      to.explode = explode;
      if (!(ms > 0)) {
        cur.open = open;
        cur.explode = explode;
        start = -1;
        place(open, explode);
        return;
      }
      from.open = cur.open;
      from.explode = cur.explode;
      dur = ms;
      start = -2; // starts on the next tick
    },
    tick(now) {
      if (start === -1) return false;
      if (start === -2) start = now;
      const k = easeOut(Math.min(1, (now - start) / dur));
      cur.open = from.open + (to.open - from.open) * k;
      cur.explode = from.explode + (to.explode - from.explode) * k;
      place(cur.open, cur.explode);
      if (k >= 1) start = -1;
      return true;
    },
    pose: place,
    state: () => ({ open: cur.open, explode: cur.explode }),
    dispose() {
      for (const e of entries.values()) {
        group.remove(e.mesh);
        e.mesh.geometry.dispose();
      }
      entries.clear();
    },
  };
}
