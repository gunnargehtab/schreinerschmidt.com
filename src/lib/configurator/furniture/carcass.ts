// Carcass generator: Regal, Sideboard and Einbauschrank (docs/configurator.md §4.1–4.4).
// Pure: params in → Build out. All rules come from constraints.ts; ids are stable across edits
// (`feld2/fach3`, `modul1/feld1/tuer2`, `aufsatz1/seiteL`).
import {
  BACK_GROOVE,
  BACK_PANEL,
  GAP,
  INSET,
  MAX_BAY,
  MAX_MODULE,
  VENT_GAP,
  bayWidth,
  deriveBays,
  deriveShelves,
  doorRows,
  doorsPerBay,
  drawerCount,
  hingesFor,
  maxShelfSpan,
  runnerLength,
  shelfPositions,
  splitAufsatz,
} from './constraints';
import { NNBSP, boundsOf, cm, dim, part } from './dims';
import { SPECIES } from './species';
import type { Board, Build, CarcassParams, Derived, DimSpec, Hint, Mm, Part } from './types';

interface Ctx {
  p: CarcassParams;
  t: Board;
  parts: Part[];
  dims: DimSpec[];
  d: Derived;
  hints: Hint[];
  maxBay: Mm;
  /** True for the first bay of the first box only (shelf pitch chain). */
  pitched: boolean;
}

/** Adds a hint once per code (`box()` runs per module and Aufsatz). */
function hint(c: Ctx, code: string, level: Hint['level'], text: string, field?: string) {
  if (c.hints.some((h) => h.code === code)) return;
  const h: Hint = { code, level, text };
  if (field) h.field = field;
  c.hints.push(h);
}

/** One box: sides, top, bottom, back, Mittelwände, shelves and fronts. `count` adds its bays to Derived. */
function box(
  c: Ctx,
  prefix: string,
  x: Mm,
  y: Mm,
  z: Mm,
  w: Mm,
  h: Mm,
  d: Mm,
  front: CarcassParams['front'],
  count: boolean,
) {
  const { t, p } = c;
  const id = (s: string) => prefix + s;
  const add = (...ps: Part[]) => c.parts.push(...ps);
  const back = p.back === 'eingenutet' || p.kind === 'einbauschrank';
  const backInset = back ? BACK_GROOVE + BACK_PANEL : 0;
  add(
    part(id('seiteL'), 'seite', [x, y, z], [t, h, d], 1),
    part(id('seiteR'), 'seite', [x + w - t, y, z], [t, h, d], 1),
    part(id('unterboden'), 'unterboden', [x + t, y, z], [w - 2 * t, t, d], 0),
    part(id('oberboden'), 'oberboden', [x + t, y + h - t, z], [w - 2 * t, t, d], 0),
  );
  if (back) {
    add(part(id('rueckwand'), 'rueckwand', [x + t, y + t, z + BACK_GROOVE], [w - 2 * t, h - 2 * t, BACK_PANEL], 1));
  }
  const inner = w - 2 * t;
  const ih = h - 2 * t;
  // A top drawer plus doors needs room; tiny openings get doors only.
  if (front === 'gemischt' && ih < 320) front = 'tueren';
  const n = deriveBays(inner, t, c.maxBay);
  const bw = bayWidth(inner, t, n);
  const zFront = z + d;
  const hasDoors = front === 'tueren' || front === 'gemischt';
  const hasDrawers = front === 'schubkaesten' || front === 'gemischt';
  const frontInset = hasDoors || hasDrawers ? t + GAP : 0;
  const shelfDepth = d - backInset - frontInset;
  const shelfZ = z + backInset;
  for (let i = 1; i <= n; i++) {
    const bx = x + t + (i - 1) * (bw + t);
    const fid = (s: string) => id(`feld${i}/${s}`);
    if (i > 1) {
      add(part(id(`mittelwand${i - 1}`), 'mittelwand', [bx - t, y + t, shelfZ], [t, ih, d - backInset], 1));
    }
    if (count) c.d.bayWidths.push(Math.round(bw));
    const yi = y + t; // inner bottom
    let shelfRegion = ih;
    let doorRegion = ih;
    // Drawers: a full stack, or one top drawer for 'gemischt'.
    if (hasDrawers) {
      const nd = front === 'gemischt' ? 1 : drawerCount(ih);
      const fh = front === 'gemischt' ? Math.min(300, Math.max(120, Math.round(ih / 4))) : (ih - GAP * (nd + 1)) / nd;
      const fw = bw - 2 * GAP;
      for (let k = 1; k <= nd; k++) {
        const fy = front === 'gemischt' ? yi + ih - GAP - fh : yi + GAP + (k - 1) * (fh + GAP);
        add(
          part(fid(`schub${k}`), 'schubkastenfront', [bx + GAP, fy, zFront - t], [fw, fh, t], 0, {
            uvAnchor: p.kind === 'sideboard' ? 'world' : 'local',
            motion: { kind: 'slide', dist: Math.round(0.7 * d) },
          }),
        );
        if (p.handle !== 'grifflos') {
          const gw = Math.min(160, Math.round(fw / 2));
          add(handle(c, fid(`schub${k}/griff`), bx + GAP + (fw - gw) / 2, fy + fh / 2 - 6, zFront, gw, 12));
        }
      }
      c.d.drawers += nd;
      if (front === 'gemischt') {
        shelfRegion = ih - fh - 2 * GAP;
        doorRegion = ih - fh - GAP;
      } else shelfRegion = 0;
    }
    // Doors: inset, 3 mm gaps, ≤ 600 mm wide, ≤ 2400 mm tall, hinged on the outer edge.
    if (hasDoors) {
      const rows = doorRows(doorRegion);
      const dh = (doorRegion - GAP * (rows + 1)) / rows;
      const nd = doorsPerBay(bw);
      const dw = (bw - GAP * (nd + 1)) / nd;
      const hinges = hingesFor(dh);
      for (let r = 0; r < rows; r++) {
        for (let j = 0; j < nd; j++) {
          const k = r * nd + j + 1;
          const dx = bx + GAP + j * (dw + GAP);
          const dy = yi + GAP + r * (dh + GAP);
          const left = nd === 2 ? j === 0 : bx + bw / 2 < x + w / 2;
          add(
            part(fid(`tuer${k}`), 'tuer', [dx, dy, zFront - t], [dw, dh, t], p.kind === 'sideboard' ? 0 : 1, {
              uvAnchor: p.kind === 'sideboard' ? 'world' : 'local',
              motion: { kind: 'hinge', pivot: [left ? dx : dx + dw, dy, zFront], dir: left ? 1 : -1 },
            }),
          );
          if (p.handle !== 'grifflos') {
            const gx = left ? dx + dw - 40 - 12 : dx + 40;
            const gy = dy + Math.min(dh / 2, 1000) - 60;
            add(handle(c, fid(`tuer${k}/griff`), gx, gy, zFront, 12, 120));
          }
          c.d.doors++;
          c.d.hinges += hinges;
        }
      }
    }
    // Shelves on the 32 mm grid.
    let shelves = 0;
    if (shelfRegion >= 2 * t + 200) {
      const { min, max, def } = deriveShelves(shelfRegion);
      let k = def;
      if (p.shelvesPerBay !== 'auto') {
        k = Math.min(max, Math.max(min, p.shelvesPerBay + 1));
        // Only the main boxes report the adjustment: an Aufsatz is low and always clamps.
        if (k !== p.shelvesPerBay + 1 && count) {
          hint(
            c,
            'faecher',
            'info',
            `Fachböden auf ${k - 1} je Feld angepasst: Fächer sind 20${NNBSP}cm bis 40${NNBSP}cm hoch.`,
            'moebel_faecher',
          );
        }
      }
      const pos = shelfPositions(shelfRegion, k, t);
      pos.forEach((sy, j) => {
        add(part(fid(`fach${j + 1}`), 'fachboden', [bx, yi + sy, shelfZ], [bw, t, shelfDepth], 0));
      });
      shelves = pos.length;
      if (c.pitched) {
        c.pitched = false;
        const ys = [0, ...pos, shelfRegion];
        for (let j = 1; j < ys.length; j++) {
          c.dims.push(
            dim(fid(`pitch${j}`), [bx, yi + ys[j - 1]!, zFront], [bx, yi + ys[j]!, zFront], [-1, 0, 0], 0, ['vorne']),
          );
        }
      }
    }
    if (count) {
      c.d.shelves.push(shelves);
      c.d.bays++;
    }
    c.dims.push(dim(fid('breite'), [bx, yi, zFront], [bx + bw, yi, zFront], [0, -1, 0], 0, ['vorne']));
  }
  if (hasDrawers) {
    const clear = d - backInset - t - 10;
    c.d.runner = runnerLength(clear);
    if (clear < 270) {
      hint(
        c,
        'tiefe',
        'warn',
        `Für Schubkästen empfehlen wir mindestens ${cm(270 + backInset + t + 10)}${NNBSP}cm Tiefe (kürzeste Führung 27${NNBSP}cm).`,
        'moebel_tiefe',
      );
    }
  }
  return n;
}

function handle(c: Ctx, id: string, x: Mm, y: Mm, z: Mm, w: Mm, h: Mm): Part {
  const metal = c.p.handle === 'metall';
  return part(id, 'griff', [x, y, z], [w, h, metal ? 25 : 18], w >= h ? 0 : 1, {
    surface: metal ? 'metall' : 'holz',
  });
}

export function generateCarcass(p: CarcassParams): Build {
  const t = p.board;
  const sp = SPECIES[p.species];
  const maxSpan = maxShelfSpan(p.species, t);
  let maxBay = Math.min(maxSpan, MAX_BAY);
  if (p.front === 'schubkaesten' || p.front === 'gemischt') maxBay = Math.min(maxBay, 1000 - 2 * GAP);
  const c: Ctx = {
    p,
    t,
    parts: [],
    dims: [],
    hints: [],
    maxBay,
    pitched: true,
    d: {
      bays: 0,
      bayWidths: [],
      shelves: [],
      maxSpan,
      doors: 0,
      drawers: 0,
      hinges: 0,
      outer: [p.width, p.height, p.depth],
    },
  };
  const W = p.width;
  const H = p.height;
  const D = p.depth;
  const einbau = p.kind === 'einbauschrank';
  const fs = einbau ? (p.niche?.fillerSide ?? 30) : 0;
  let ft = einbau ? (p.niche?.fillerTop ?? 40) : 0;
  const baseH = p.base.type === 'sockel' || p.base.type === 'fuesse' ? p.base.height : 0;
  const y0 = p.base.type === 'haengend' ? p.base.height : baseH;
  const x0 = fs;
  const cw = W - 2 * fs;
  const z0 = einbau ? VENT_GAP : 0;
  const cd = D - z0;
  let ch = H - ft - baseH;
  const split = einbau ? splitAufsatz(ch) : { main: ch, aufsatz: 0, extraBlende: 0 };
  ft += split.extraBlende;
  ch = split.main;
  const modules = einbau ? Math.max(1, Math.ceil(cw / MAX_MODULE)) : 1;
  const mw = cw / modules;

  for (let m = 1; m <= modules; m++) {
    const prefix = einbau ? `modul${m}/` : '';
    const mx = x0 + (m - 1) * mw;
    box(c, prefix, mx, y0, z0, mw, ch, cd, p.front, true);
    if (split.aufsatz) {
      box(c, `aufsatz${m}/`, mx, y0 + ch, z0, mw, split.aufsatz, cd, p.front === 'offen' ? 'offen' : 'tueren', false);
    }
  }
  const zFront = z0 + cd;
  // Base: Sockel recessed 30 mm, Füße inset 30 mm, hängend floats.
  if (p.base.type === 'sockel' && baseH > 0) {
    const sx = einbau ? x0 : x0 + INSET;
    const sw = einbau ? cw : cw - 2 * INSET;
    c.parts.push(part('sockel', 'sockel', [sx, 0, zFront - INSET - t], [sw, baseH, t], 0));
    if (!einbau) {
      const sd = cd - INSET - t;
      c.parts.push(
        part('sockelL', 'sockel', [sx, 0, z0], [t, baseH, sd], 2),
        part('sockelR', 'sockel', [sx + sw - t, 0, z0], [t, baseH, sd], 2),
      );
    }
  } else if (p.base.type === 'fuesse' && baseH > 0) {
    const xs = [x0 + INSET, x0 + cw - INSET - 40];
    const zs = [z0 + INSET, zFront - INSET - 40];
    let k = 1;
    for (const fz of zs) for (const fx of xs) c.parts.push(part(`fuss${k++}`, 'fuss', [fx, 0, fz], [40, baseH, 40], 1));
  }
  if (einbau) {
    const ph = H - baseH - ft;
    c.parts.push(
      part('passleisteL', 'passleiste', [0, baseH, D - t], [fs, ph, t], 1),
      part('passleisteR', 'passleiste', [W - fs, baseH, D - t], [fs, ph, t], 1),
      part('blende', 'blende', [0, H - ft, D - t], [W, ft, t], 0),
      part('wandL', 'wand', [-100, 0, 0], [100, H, D], 1, { surface: 'wand', solid: false }),
      part('wandR', 'wand', [W, 0, 0], [100, H, D], 1, { surface: 'wand', solid: false }),
      part('decke', 'wand', [-100, H, 0], [W + 200, 100, D], 0, { surface: 'wand', solid: false }),
    );
    c.d.modules = modules;
    c.d.aufsatz = split.aufsatz > 0;
    if (modules > 1) {
      hint(
        c,
        'module',
        'info',
        `In ${modules} Module aufgeteilt: ein Modul ist höchstens ${cm(MAX_MODULE)}${NNBSP}cm breit.`,
      );
    }
    if (split.aufsatz) {
      hint(
        c,
        'aufsatz',
        'info',
        `Korpus über ${cm(2600)}${NNBSP}cm: Schrank (${cm(ch)}${NNBSP}cm) mit Aufsatz (${cm(split.aufsatz)}${NNBSP}cm).`,
      );
    } else if (split.extraBlende) {
      hint(
        c,
        'blende',
        'info',
        `Blende auf ${cm(ft)}${NNBSP}cm vergrößert, damit kein Aufsatz unter ${cm(300)}${NNBSP}cm entsteht.`,
      );
    }
    if (p.niche?.dachschraege) {
      hint(
        c,
        'dachschraege',
        'warn',
        'Dachschräge: bitte Foto oder Skizze beifügen. Die Vorschau zeigt die Nische ohne Schräge.',
        'moebel_dachschraege',
      );
    }
  }
  // Mittelwand hint, with the thicker board as an alternative.
  const firstInner = mw - 2 * t;
  const n = deriveBays(firstInner, t, maxBay);
  if (n > 1) {
    const what = n === 2 ? 'Mittelwand ergänzt' : `${n - 1} Mittelwände ergänzt`;
    let text = `${what}: ein Feld ist höchstens ${cm(MAX_BAY)}${NNBSP}cm breit.`;
    if (maxSpan < MAX_BAY) {
      const thicker = (t === 19 ? 25 : 40) as Board;
      const alt = Math.min(maxShelfSpan(p.species, thicker), MAX_BAY);
      const fewer = t < 40 && deriveBays(firstInner, thicker, alt) < n;
      text =
        `${what}: ${t}${NNBSP}mm ${sp.name} spannt maximal ${cm(maxSpan)}${NNBSP}cm.` +
        (fewer ? ` Mit ${thicker}${NNBSP}mm wären es ${cm(alt)}${NNBSP}cm.` : '');
    }
    c.hints.unshift({ code: 'mittelwand', level: 'info', field: 'moebel_staerke', text });
  }
  const bounds = boundsOf(c.parts);
  // The Einbauschrank's outer size is the niche: the carcass starts behind the ventilation gap.
  if (einbau) bounds.min[2] = 0;
  const [bx, by] = bounds.min;
  const ty = bounds.max[1];
  c.dims.unshift(
    dim('breite', [bx, by, zFront], [bounds.max[0], by, zFront], [0, -1, 0], 1, ['vorne', 'oben', '3d']),
    dim('hoehe', [bx, by, zFront], [bx, ty, zFront], [-1, 0, 0], 1, ['vorne', 'seite', '3d']),
    dim('tiefe', [W, by, 0], [W, by, D], [0, -1, 0], 0, ['seite', 'oben', '3d']),
  );
  if (baseH > 0 && p.base.type !== 'haengend') {
    c.dims.push(dim('sockel', [bx, 0, zFront], [bx, baseH, zFront], [-1, 0, 0], 0, ['vorne']));
  }
  return { params: p, parts: c.parts, dims: c.dims, derived: c.d, hints: c.hints, bounds };
}
