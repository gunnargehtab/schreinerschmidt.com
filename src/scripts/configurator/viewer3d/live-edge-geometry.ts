// Live edge (Baumkante) geometry (docs/configurator.md §4.4): the table top's plan outline
// (`Part.outline`, from liveEdgeOutline()) extruded by the top thickness with a custom UVGenerator,
// so the top grain runs along x at the real texture scale like panelGeometry(): u across the width,
// v along the length (the pipeline rotates the grain along V), offset by the part's jitter. Group 0
// is the two caps (species material), group 1 the side walls (the darker „Waldkante“ material).
// Like a panel the geometry is centred on the part's centre, in metres.
import { ExtrudeGeometry, Shape, Vector2, type BufferGeometry } from 'three';
import type { Part } from '../../../lib/configurator/furniture/types';

export function liveEdgeGeometry(part: Part, texMm: number, jitter: [number, number]): BufferGeometry {
  const outline = part.outline ?? [];
  const [L, T, W] = part.size;
  const cx = L / 2;
  const cy = W / 2;
  const shape = new Shape();
  outline.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  // Shape space: x along the length, y across the width, z the extrusion (thickness).
  const top = (v: number[], i: number) =>
    new Vector2((v[i * 3 + 1]! - cy + jitter[0]) / texMm, (v[i * 3]! - cx + jitter[1]) / texMm);
  const wall = (v: number[], i: number) =>
    new Vector2((v[i * 3 + 2]! + jitter[0]) / texMm, (v[i * 3]! - cx + jitter[1]) / texMm);
  const g = new ExtrudeGeometry(shape, {
    depth: T,
    bevelEnabled: false,
    steps: 1,
    UVGenerator: {
      generateTopUV: (_g, v, a, b, c) => [top(v, a), top(v, b), top(v, c)],
      generateSideWallUV: (_g, v, a, b, c, d) => [wall(v, a), wall(v, b), wall(v, c), wall(v, d)],
    },
  });
  // Shape (x, y, z) → world (x, −z, y): the plan lies in x/z, the thickness runs along y, the cap
  // at z = 0 becomes the top face. Then centre and convert to metres.
  g.rotateX(Math.PI / 2);
  g.translate(-cx, T / 2, -cy);
  g.scale(1 / 1000, 1 / 1000, 1 / 1000);
  return g;
}
