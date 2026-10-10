// Cut list (Stückliste): identical wood and metal parts grouped with a count. Length runs along the
// grain; walls are not parts of the furniture and are left out.
import type { Build, CutItem, Part, PartRole } from './types';

const ORDER: PartRole[] = [
  'seite',
  'mittelwand',
  'oberboden',
  'unterboden',
  'fachboden',
  'rueckwand',
  'tuer',
  'schubkastenfront',
  'griff',
  'sockel',
  'fuss',
  'passleiste',
  'blende',
  'platte',
  'bein',
  'zarge',
  'kufe',
  'traverse',
  'wand',
];

function itemOf(p: Part): CutItem {
  const length = Math.round(p.size[p.grain]);
  const others = p.size.filter((_, i) => i !== p.grain).map(Math.round);
  return {
    id: p.id,
    label: p.label,
    role: p.role,
    count: 1,
    length,
    width: Math.max(...others),
    thickness: Math.min(...others),
    material: p.surface === 'metall' ? 'metall' : 'holz',
  };
}

export function cutList(b: Build): CutItem[] {
  const groups = new Map<string, CutItem>();
  for (const p of b.parts) {
    if (p.role === 'wand') continue;
    const item = itemOf(p);
    const key = [item.role, item.label, item.length, item.width, item.thickness, item.material].join('|');
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, item);
  }
  return [...groups.values()].sort(
    (a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || b.length - a.length || b.width - a.width,
  );
}
