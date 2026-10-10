// Panel geometry (docs/configurator.md §4.4 "Grain rule" and the reference code): a box in metres
// with grain-aware real-scale UVs and at most two groups, 0 = side grain, 1 = end grain. The mesh is
// positioned at the part's centre (`centreOf`), so the vertices are symmetric about the origin.
// Niche walls (`surface: 'wand'`) become a single plane on the face next to the furniture
// (`wallGeometry`), so the camera can look into the niche from above and from the side.
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Axis, Part, Vec3 } from '../../../lib/configurator/furniture/types';

const AXES = [0, 1, 2] as const;
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** Centre of a part in metres (mesh.position). */
export const centreOf = (p: Part): Vec3 => p.min.map((m, i) => (m + (p.size[i] ?? 0) / 2) / 1000) as Vec3;

/**
 * Box geometry of a panel. `texMm` is the real size of one texture tile; `jitter` offsets the
 * tile per part (mm), so no two panels show the same grain. World-anchored parts (sideboard
 * fronts) take their UVs from the world position, so the grain runs continuously across fronts.
 */
export function panelGeometry(part: Part, texMm: number, jitter: [number, number]): BufferGeometry {
  const { size, grain } = part;
  const c = part.min.map((m, i) => m + (size[i] ?? 0) / 2) as Vec3;
  const anchor: Vec3 = part.uvAnchor === 'world' ? c : [0, 0, 0];
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const side: number[] = [];
  const end: number[] = [];
  for (const n of AXES) {
    for (const s of [1, -1] as const) {
      const [a, b] = AXES.filter((i) => i !== n) as [Axis, Axis];
      const endGrain = n === grain;
      const vAx = endGrain ? (size[a] >= size[b] ? a : b) : grain;
      const uAx = vAx === a ? b : a;
      const base = pos.length / 3;
      for (const [sa, sb] of CORNERS) {
        const p: Vec3 = [0, 0, 0];
        p[n] = (s * size[n]) / 2;
        p[a] = (sa * size[a]) / 2;
        p[b] = (sb * size[b]) / 2;
        pos.push(p[0] / 1000, p[1] / 1000, p[2] / 1000);
        nrm.push(n === 0 ? s : 0, n === 1 ? s : 0, n === 2 ? s : 0);
        uv.push((anchor[uAx] + p[uAx] + jitter[0]) / texMm, (anchor[vAx] + p[vAx] + jitter[1]) / texMm);
      }
      const ccw = s > 0 === ((a + 1) % 3 === b);
      const tri = (ccw ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map((i) => base + i);
      (endGrain && part.solid ? end : side).push(...tri);
    }
  }
  const g = new BufferGeometry();
  g.setIndex([...side, ...end]);
  g.addGroup(0, side.length, 0);
  if (end.length) g.addGroup(side.length, end.length, 1);
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * Plane of a niche wall: the face of the wall box that touches the furniture bounds, facing the
 * furniture; null when no face touches (the part is then drawn as a panel). Centred like a panel.
 */
export function wallGeometry(part: Part, bounds: { min: Vec3; max: Vec3 }): BufferGeometry | null {
  const { size } = part;
  for (const n of AXES) {
    const lo = part.min[n];
    const hi = lo + size[n];
    // Normal +n when the wall ends where the furniture starts, −n when it starts where it ends.
    const s: 1 | -1 | 0 = Math.abs(hi - bounds.min[n]) <= 1 ? 1 : Math.abs(lo - bounds.max[n]) <= 1 ? -1 : 0;
    if (!s) continue;
    const [a, b] = AXES.filter((i) => i !== n) as [Axis, Axis];
    const pos: number[] = [];
    const nrm: number[] = [];
    const uv: number[] = [];
    for (const [sa, sb] of CORNERS) {
      const p: Vec3 = [0, 0, 0];
      p[n] = (s * size[n]) / 2;
      p[a] = (sa * size[a]) / 2;
      p[b] = (sb * size[b]) / 2;
      pos.push(p[0] / 1000, p[1] / 1000, p[2] / 1000);
      nrm.push(n === 0 ? s : 0, n === 1 ? s : 0, n === 2 ? s : 0);
      uv.push((sa + 1) / 2, (sb + 1) / 2);
    }
    const ccw = s > 0 === ((a + 1) % 3 === b);
    const g = new BufferGeometry();
    g.setIndex(ccw ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    return g;
  }
  return null;
}

/** Deterministic texture offset (mm) from a part id (§4.4), within one tile. */
export function jitterOf(id: string, texMm: number): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return [(h % 1000) * (texMm / 1000), ((h >>> 10) % 1000) * (texMm / 1000)];
}
