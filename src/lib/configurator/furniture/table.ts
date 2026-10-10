// Table generator: Esstisch with Vierfuß (legs + Zarge) or Kufen in wood or steel, optional Baumkante.
import { KNEE_ROOM, kufenOffset, legInset, legSize, seatRange, zargeHeight } from './constraints';
import { NNBSP, boundsOf, cm, dim, part } from './dims';
import { liveEdgeOutline } from './live-edge';
import type { Build, Hint, Mm, Part, TableParams } from './types';

export function generateTable(p: TableParams): Build {
  const { length: L, width: W, height: H, top } = p;
  const parts: Part[] = [];
  const hints: Hint[] = [];
  const liveEdge = p.edge === 'baumkante' && top >= 40;
  if (p.edge === 'baumkante' && !liveEdge) {
    hints.push({
      code: 'baumkante',
      level: 'warn',
      field: 'tisch_platte',
      text: `Baumkante braucht mindestens 40${NNBSP}mm Plattenstärke; die Vorschau zeigt eine gerade Kante.`,
    });
  }
  parts.push(
    part(
      'platte',
      'platte',
      [0, H - top, 0],
      [L, top, W],
      0,
      liveEdge ? { outline: liveEdgeOutline(L, W, p.seed) } : {},
    ),
  );
  const zh = zargeHeight(H, top);
  const zy = H - top - zh;
  if (zh < 80) {
    hints.push({
      code: 'zarge',
      level: 'warn',
      field: 'tisch_hoehe',
      text: `Zarge auf ${zh}${NNBSP}mm verringert, damit unter dem Tisch ${cm(KNEE_ROOM)}${NNBSP}cm frei bleiben.`,
    });
  }
  const steel = p.base === 'kufen-stahl';
  if (p.base === 'vierfuss') {
    const ls = legSize(L);
    const li = legInset(L);
    const xs = [li, L - li - ls];
    const zs = [li, W - li - ls];
    let k = 1;
    for (const z of zs) for (const x of xs) parts.push(part(`bein${k++}`, 'bein', [x, 0, z], [ls, H - top, ls], 1));
    const zl = L - 2 * (li + ls);
    const zw = W - 2 * (li + ls);
    parts.push(
      part('zargeV', 'zarge', [li + ls, zy, W - li - 5 - 25], [zl, zh, 25], 0),
      part('zargeH', 'zarge', [li + ls, zy, li + 5], [zl, zh, 25], 0),
      part('zargeL', 'zarge', [li + 5, zy, li + ls], [25, zh, zw], 2),
      part('zargeR', 'zarge', [L - li - 5 - 25, zy, li + ls], [25, zh, zw], 2),
    );
  } else {
    const kt = steel ? 12 : 60;
    const ko = kufenOffset(L);
    const kd = W - 200;
    const init = { surface: steel ? ('metall' as const) : ('holz' as const) };
    const x1 = L / 2 - ko - kt / 2;
    const x2 = L / 2 + ko - kt / 2;
    parts.push(
      part('kufe1', 'kufe', [x1, 0, 100], [kt, H - top, kd], 1, init),
      part('kufe2', 'kufe', [x2, 0, 100], [kt, H - top, kd], 1, init),
      part('traverse', 'traverse', [x1 + kt, zy, W / 2 - 30], [x2 - x1 - kt, zh, 60], 0, init),
    );
  }
  const bounds = boundsOf(parts);
  const front = W;
  const dims = [
    dim('laenge', [0, 0, front], [L, 0, front], [0, -1, 0], 1, ['vorne', 'oben', '3d']),
    dim('hoehe', [0, 0, front], [0, H, front], [-1, 0, 0], 1, ['vorne', 'seite', '3d']),
    dim('breite', [L, 0, 0], [L, 0, W], [0, -1, 0], 0, ['seite', 'oben', '3d']),
    dim('platte', [0, H - top, front], [0, H, front], [-1, 0, 0], 0, ['vorne', 'seite']),
  ];
  const seats = seatRange(L, W);
  const derived = {
    bays: 0,
    bayWidths: [] as Mm[],
    shelves: [] as number[],
    maxSpan: 0,
    doors: 0,
    drawers: 0,
    hinges: 0,
    seats,
    outer: [L, H, W] as [Mm, Mm, Mm],
  };
  return { params: p, parts, dims, derived, hints, bounds };
}
