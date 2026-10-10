// The furniture rig (docs/configurator.md §4.10 "Parameter changes"): one mesh per part, diffed by
// part id on every Build, so a slider drag only rebuilds the panels whose box changed. Wood parts
// carry the [side, end] material pair of their species × finish (two geometry groups), metal parts
// the metal material and niche walls the plaster plane. Geometry is in metres; the Build is in mm.
import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import type { Build, Part } from '../../../lib/configurator/furniture/types';
import type { Materials } from './materials';
import { centreOf, jitterOf, panelGeometry, wallGeometry } from './panel-geometry';

export interface Rig {
  group: Group;
  /** Applies a Build; returns true when any geometry changed (a refit may be due). */
  apply(b: Build): boolean;
  dispose(): void;
}

interface Entry {
  mesh: Mesh;
  /** Geometry signature: size (position only when it shapes the UVs), grain, anchor, surface, solidity, tile. */
  sig: string;
}

export function createRig(materials: Materials, texMm: (b: Build) => number): Rig {
  const group = new Group();
  const entries = new Map<string, Entry>();

  // The box position only matters for world-anchored UVs and wall planes; a moved panel keeps its geometry.
  const signature = (p: Part, tile: number, bounds: string) =>
    `${p.uvAnchor === 'world' || p.surface === 'wand' ? p.min.join() : ''},${p.size.join()},${p.grain},${p.uvAnchor},${p.surface},${p.solid ? 1 : 0},${tile},${p.surface === 'wand' ? bounds : ''}`;

  const geometryOf = (p: Part, b: Build, tile: number): BufferGeometry =>
    (p.surface === 'wand' && wallGeometry(p, b.bounds)) ||
    panelGeometry(p, tile, p.uvAnchor === 'world' ? [0, 0] : jitterOf(p.id, tile));

  const materialOf = (p: Part, b: Build): Material | Material[] => {
    if (p.surface === 'metall') return materials.metal;
    if (p.surface === 'wand') return materials.wall;
    const set = materials.wood(b.params.species, b.params.finish);
    return [set.side, set.end];
  };

  return {
    group,
    apply(b) {
      const tile = texMm(b);
      const bounds = `${b.bounds.min.join()}/${b.bounds.max.join()}`;
      const seen = new Set<string>();
      let changed = false;
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
          e = { mesh: new Mesh(geometryOf(p, b, tile)), sig };
          e.mesh.name = p.id;
          entries.set(p.id, e);
          group.add(e.mesh);
          changed = true;
        }
        e.mesh.material = materialOf(p, b);
        const c = centreOf(p);
        e.mesh.position.set(c[0], c[1], c[2]);
      }
      for (const [id, e] of entries) {
        if (seen.has(id)) continue;
        group.remove(e.mesh);
        e.mesh.geometry.dispose();
        entries.delete(id);
        changed = true;
      }
      return changed;
    },
    dispose() {
      for (const e of entries.values()) {
        group.remove(e.mesh);
        e.mesh.geometry.dispose();
      }
      entries.clear();
    },
  };
}
