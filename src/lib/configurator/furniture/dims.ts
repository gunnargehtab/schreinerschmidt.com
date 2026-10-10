// Shared helpers for the generators: number formatting (German, cm) and DimSpec/Part factories.
import type { Axis, DimSpec, Mm, Part, PartRole, Vec3, ViewName } from './types';

/** U+202F narrow no-break space between number and unit (CLAUDE.md). */
export const NNBSP = ' ';

/** mm → cm as a German number ("120", "74,1"), without unit. */
export function cm(mm: Mm): string {
  const v = Math.round(mm) / 10;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace('.', ',');
}

/** mm → "120 cm" with the narrow no-break space. */
export const cmUnit = (mm: Mm): string => `${cm(mm)}${NNBSP}cm`;

export function dim(
  id: string,
  a: Vec3,
  b: Vec3,
  offsetDir: [number, number, number],
  level: number,
  views: ViewName[],
): DimSpec {
  const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  return { id, a, b, offsetDir, level, text: cm(len), views };
}

export interface PartInit {
  surface?: Part['surface'];
  solid?: boolean;
  uvAnchor?: Part['uvAnchor'];
  outline?: [Mm, Mm][];
  motion?: Part['motion'];
}

/** German part names for the cut list and the summary. */
export const LABEL: Record<PartRole, string> = {
  seite: 'Seite',
  oberboden: 'Oberboden',
  unterboden: 'Unterboden',
  fachboden: 'Fachboden',
  mittelwand: 'Mittelwand',
  rueckwand: 'Rückwand',
  sockel: 'Sockel',
  fuss: 'Fuß',
  tuer: 'Tür',
  schubkastenfront: 'Schubkastenfront',
  griff: 'Griff',
  passleiste: 'Passleiste',
  blende: 'Blende',
  wand: 'Wand',
  platte: 'Tischplatte',
  bein: 'Tischbein',
  zarge: 'Zarge',
  kufe: 'Kufe',
  traverse: 'Traverse',
};

export function part(id: string, role: PartRole, min: Vec3, size: Vec3, grain: Axis, init: PartInit = {}): Part {
  const p: Part = {
    id,
    role,
    label: LABEL[role],
    min,
    size,
    grain,
    surface: init.surface ?? 'holz',
    solid: init.solid ?? true,
    uvAnchor: init.uvAnchor ?? 'local',
  };
  if (init.outline) p.outline = init.outline;
  if (init.motion) p.motion = init.motion;
  return p;
}

/** Bounding box of the furniture itself: niche walls and protruding handles are excluded. */
export function boundsOf(parts: Part[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if (p.role === 'wand' || p.role === 'griff') continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p.min[i]!);
      max[i] = Math.max(max[i]!, p.min[i]! + p.size[i]!);
    }
  }
  return { min, max };
}
