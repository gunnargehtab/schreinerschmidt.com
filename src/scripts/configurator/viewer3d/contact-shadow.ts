// Contact shadow (docs/configurator.md §4.6 "Contact shadow"): a 256 px Canvas2D footprint texture
// made from the part list, on a floor plane with an unlit transparent material. Per part the blur
// is `4 mm + 0.12·h` and the alpha `0.55·e^(−h/350) + 0.08`, h being the underside height above
// the floor. Parts whose footprint lies inside a lower part's footprint (shelves, Mittelwände,
// fronts) add nothing: they are already shadowed by the carcass bottom. The overall strength comes
// from the CSS variable `--shadow-strength` on the viewer host.
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { Build, Part } from '../../../lib/configurator/furniture/types';

const SIZE = 256;

export interface ContactShadow {
  mesh: Mesh;
  update(b: Build, strength: number): void;
  dispose(): void;
}

interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  h: number;
}

/** Floor footprints of the parts that actually cast onto the floor (pure, for the unit tests). */
export function footprints(parts: Part[]): Footprint[] {
  const all = parts
    .filter((p) => p.surface !== 'wand')
    .map((p) => ({ x0: p.min[0], x1: p.min[0] + p.size[0], z0: p.min[2], z1: p.min[2] + p.size[2], h: p.min[1] }))
    .sort((a, b) => a.h - b.h);
  const kept: Footprint[] = [];
  for (const f of all) {
    const covered = kept.some(
      (k) => k.h <= f.h && k.x0 <= f.x0 + 1 && k.x1 >= f.x1 - 1 && k.z0 <= f.z0 + 1 && k.z1 >= f.z1 - 1,
    );
    if (!covered) kept.push(f);
  }
  return kept;
}

export function createContactShadow(): ContactShadow {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const map = new CanvasTexture(canvas);
  const material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });
  const geometry = new PlaneGeometry(1, 1);
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;

  return {
    mesh,
    update(b, strength) {
      const { min, max } = b.bounds;
      const w = max[0] - min[0];
      const d = max[2] - min[2];
      // Margin for the blur of the highest parts.
      const m = 0.15 * Math.max(w, d) + 100;
      // A square texture centred on the furniture: S mm map to SIZE px.
      const S = Math.max(w, d) + 2 * m;
      const scale = SIZE / S;
      const cx = (min[0] + max[0]) / 2;
      const cz = (min[2] + max[2]) / 2;
      const ox = cx - S / 2;
      const oz = cz - S / 2;
      if (ctx) {
        ctx.clearRect(0, 0, SIZE, SIZE);
        const fps = footprints(b.parts).sort((a, c) => c.h - a.h);
        const filters = 'filter' in ctx;
        for (const f of fps) {
          const blur = (4 + 0.12 * f.h) * scale;
          const alpha = 0.55 * Math.exp(-f.h / 350) + 0.08;
          if (filters) ctx.filter = `blur(${blur.toFixed(1)}px)`;
          ctx.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
          // Canvas y grows downwards; +z (front) maps to the bottom of the texture (the plane is
          // rotated −90° about x, so texture v runs along −z).
          ctx.fillRect((f.x0 - ox) * scale, (f.z0 - oz) * scale, (f.x1 - f.x0) * scale, (f.z1 - f.z0) * scale);
        }
        if (filters) ctx.filter = 'none';
      }
      map.needsUpdate = true;
      material.opacity = strength;
      mesh.scale.set(S / 1000, S / 1000, 1);
      mesh.position.set(cx / 1000, 0.0005, cz / 1000);
    },
    dispose() {
      map.dispose();
      material.dispose();
      geometry.dispose();
    },
  };
}
