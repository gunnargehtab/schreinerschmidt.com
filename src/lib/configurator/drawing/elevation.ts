// SVG elevation drawing (docs/configurator.md §4.8): a pure string renderer for a Build in the
// "Workshop Sketchbook" look: hairlines, 45° dimension ticks, a species wash and a title block.
// Used at build time, live in the browser, as the no-WebGL fallback, in the summary, for print and
// as the live-mode attachment. No DOM, no three.js.
//
// Theming: all colours are `currentColor` except the species wash (a `fill` attribute at 12 %) and
// two optional custom properties the page CSS may set on the host: `--ze-accent` (dimension lines
// and ticks) and `--ze-muted` (hidden lines). Presentation attributes only, no style="" (CSP).
import { describe, KIND_LABEL } from '../furniture/describe';
import { FINISH_LABEL, SPECIES } from '../furniture/species';
import type { Build, Part, Vec3 } from '../furniture/types';

export type ElevationView = 'vorne' | 'seite' | 'oben';

export interface ElevationOptions {
  view: ElevationView;
  /** Rendered width in CSS px (screen mode); print mode fits A4 landscape at a DIN scale. */
  widthPx: number;
  mode: 'screen' | 'print';
  /** Accessible <title>; defaults to "<Möbel>, <Ansicht>". */
  title?: string;
  /** Pre-formatted date for the title block, e.g. „09.10.2026“. Passed in so the output stays deterministic. */
  date?: string;
  /** Id prefix, so several drawings can share a page. */
  idPrefix?: string;
}

export const VIEW_LABEL: Record<ElevationView, string> = {
  vorne: 'Ansicht von vorne',
  seite: 'Seitenansicht',
  oben: 'Draufsicht',
};

/** Screen axes per view: [world axis, sign] for screen x and y, plus the depth axis (towards the viewer). */
const AXES: Record<ElevationView, { x: [0 | 1 | 2, 1 | -1]; y: [0 | 1 | 2, 1 | -1]; d: 0 | 1 | 2 }> = {
  vorne: { x: [0, 1], y: [1, -1], d: 2 },
  seite: { x: [2, -1], y: [1, -1], d: 0 },
  oben: { x: [0, 1], y: [2, 1], d: 1 },
};

/** A4 landscape printable area in mm and the DIN scales to try. */
const PRINT_W = 277;
const PRINT_H = 190;
const SCALES = [10, 20, 25, 50];
const ACCENT = 'var(--ze-accent, currentColor)';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  lo: number;
  hi: number;
  p: Part;
  hidden: boolean;
}

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const r1 = (v: number): string => String(Math.round(v * 10) / 10);

function project(parts: Part[], view: ElevationView): Rect[] {
  const ax = AXES[view];
  const span = (p: Part, [a, s]: [0 | 1 | 2, 1 | -1]) =>
    s > 0 ? [p.min[a], p.size[a]] : [-(p.min[a] + p.size[a]), p.size[a]];
  const rects: Rect[] = parts.map((p) => {
    const [x, w] = span(p, ax.x) as [number, number];
    const [y, h] = span(p, ax.y) as [number, number];
    return { x, y, w, h, lo: p.min[ax.d], hi: p.min[ax.d] + p.size[ax.d], p, hidden: false };
  });
  // Hidden-line test: a part is hidden when nearer solid parts cover at least half of its outline.
  for (const a of rects) {
    if (a.p.role === 'wand') continue;
    let covered = 0;
    for (const b of rects) {
      if (b === a || !b.p.solid || b.lo < a.hi - 0.01) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) covered += ox * oy;
    }
    a.hidden = covered >= 0.5 * a.w * a.h;
  }
  return rects.sort((a, b) => Number(b.hidden) - Number(a.hidden) || a.lo - b.lo);
}

interface Layout {
  tick: number;
  sheet: { x: number; y: number; w: number; h: number };
  body: string;
}

/** `scale` is the DIN scale denominator in print mode and 0 on screen (no fixed scale). */
function layout(b: Build, o: ElevationOptions, rects: Rect[], fs: number, scale: number): Layout {
  const [sw, dw] = scale ? [r1(0.5 * scale), r1(0.25 * scale)] : ['1', '.75'];
  const view = o.view;
  const ax = AXES[view];
  const tick = fs * 0.6;
  const sp = SPECIES[b.params.species];
  const pid = o.idPrefix ?? 'ze';
  const vo = scale ? '' : ' vector-effect="non-scaling-stroke"';
  // Object rect (walls and handles excluded) → where dimension lines are offset from.
  const own = rects.filter((r) => r.p.role !== 'wand' && r.p.role !== 'griff');
  const lim = (rs: Rect[]) => [
    Math.min(...rs.map((r) => r.x)),
    Math.min(...rs.map((r) => r.y)),
    Math.max(...rs.map((r) => r.x + r.w)),
    Math.max(...rs.map((r) => r.y + r.h)),
  ];
  const R = lim(own);
  let [x1, y1, x2, y2] = lim(rects) as [number, number, number, number];
  const grow = (x: number, y: number) => {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  };
  // Parts: hidden ones dashed (drawn first), then the wash + outline and door symbols.
  let hidden = '';
  let shown = '';
  for (const r of rects) {
    const { p } = r;
    const rect = `x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.w)}" height="${r1(r.h)}"${vo}/>`;
    if (r.hidden) {
      hidden += `<rect ${rect}`;
      continue;
    }
    let fill = `fill="${sp.avgColor}" fill-opacity=".12"`;
    if (p.role === 'wand') fill = `fill="url(#${pid}-h)"`;
    else if (p.role === 'griff') fill = 'fill="currentColor"';
    else if (p.surface === 'metall') fill = 'fill="currentColor" fill-opacity=".3"';
    if (p.outline && view === 'oben') {
      const d = p.outline.map(([lx, lz], i) => `${i ? 'L' : 'M'}${r1(p.min[0] + lx)} ${r1(p.min[2] + lz)}`).join('');
      shown += `<path d="${d}Z" ${fill}${vo}/>`;
    } else shown += `<rect ${fill} ${rect}`;
    // Door-opening triangle (DIN 1356 convention): from the free-edge corners to the middle of the
    // hinge edge, so the apex points to the Bandseite, away from the handle.
    if (view === 'vorne' && p.role === 'tuer' && p.motion?.kind === 'hinge') {
      const hx = p.motion.pivot[0];
      const fx = hx === p.min[0] ? p.min[0] + p.size[0] : p.min[0];
      shown += `<path class="ze__s" d="M${r1(fx)} ${r1(r.y)}L${r1(hx)} ${r1(r.y + r.h / 2)}L${r1(fx)} ${r1(r.y + r.h)}" stroke-width="${dw}"${vo}/>`;
    }
  }
  // Dimension chains: offset 60 + 40·level mm from the object, at least 2 + 1.5·level text heights.
  // Each dimension is laid out along u (its direction) and v (the offset axis), then mapped to x/y.
  const pt = (v: Vec3): [number, number] => [ax.x[1] * v[ax.x[0]], ax.y[1] * v[ax.y[0]]];
  let dims = '';
  for (const d of b.dims) {
    if (!d.views.includes(view)) continue;
    const [ax1, ay1] = pt(d.a);
    const [bx1, by1] = pt(d.b);
    const horizontal = Math.abs(bx1 - ax1) >= Math.abs(by1 - ay1);
    const [ua, va, ub, vb] = horizontal ? [ax1, ay1, bx1, by1] : [ay1, ax1, by1, bx1];
    if (Math.abs(ub - ua) < fs * 1.2) continue;
    const ox = ax.x[1] * d.offsetDir[ax.x[0]];
    const oy = ax.y[1] * d.offsetDir[ax.y[0]];
    let od = horizontal ? oy : ox;
    if (Math.abs(ox) + Math.abs(oy) < 0.5) od = horizontal ? 1 : -1;
    const off = Math.max(60 + 40 * d.level, fs * (2 + 1.5 * d.level));
    const lv = od > 0 ? R[horizontal ? 3 : 2]! + off : R[horizontal ? 1 : 0]! - off;
    const ext = lv + (od > 0 ? tick : -tick);
    const u1 = Math.min(ua, ub);
    const u2 = Math.max(ua, ub);
    const P = (u: number, v: number) => (horizontal ? `${r1(u)} ${r1(v)}` : `${r1(v)} ${r1(u)}`);
    const G = (u: number, v: number) => (horizontal ? grow(u, v) : grow(v, u));
    const tu = (u1 + u2) / 2;
    const tv = lv - fs * 0.3;
    dims +=
      `<path d="M${P(u1, va)}L${P(u1, ext)}M${P(u2, vb)}L${P(u2, ext)}"/>` +
      `<path d="M${P(u1, lv)}L${P(u2, lv)}" marker-start="url(#${pid}-k)" marker-end="url(#${pid}-k)"/>` +
      `<text x="${r1(horizontal ? tu : tv)}" y="${r1(horizontal ? tv : tu)}"${horizontal ? '' : ` transform="rotate(-90 ${P(tu, tv)})"`} stroke="none">${escapeXml(d.text)}</text>`;
    G(u1, Math.min(va, lv - fs * 1.3));
    G(u2, Math.max(vb, ext, lv - fs * 1.3));
  }
  // Title block (Schriftfeld) under the drawing, full sheet width.
  x1 -= fs;
  y1 -= fs;
  x2 += fs;
  y2 += fs;
  const rows = [
    `Schreinerei Schmidt · ${KIND_LABEL[b.params.kind]} · ${sp.name} ${FINISH_LABEL[b.params.finish]}`,
    `Maße in cm · ${scale ? `M 1:${scale}` : 'o. M.'}${o.date ? ` · ${o.date}` : ''}`,
  ];
  const tf = fs * 0.85;
  const oneLine = rows.join(' · ');
  const lines = oneLine.length * tf * 0.55 <= x2 - x1 - 2 * tf ? [oneLine] : rows;
  const body =
    `<g class="ze__h" stroke="var(--ze-muted, currentColor)" stroke-width="${dw}" stroke-dasharray="${r1(fs * 0.4)} ${r1(fs * 0.25)}">${hidden}</g>` +
    `<g class="ze__p" stroke-width="${sw}">${shown}</g>` +
    `<g class="ze__d" stroke="${ACCENT}" fill="${ACCENT}" stroke-width="${dw}" text-anchor="middle"${vo}>${dims}</g>` +
    `<g class="ze__sf" font-size="${r1(tf)}" stroke="none" fill="currentColor"><path d="M${r1(x1)} ${r1(y2)}H${r1(x2)}" stroke="currentColor" stroke-width="${sw}"${vo}/>` +
    lines
      .map((l, i) => `<text x="${r1(x1 + tf)}" y="${r1(y2 + tf * (1.4 + 1.2 * i))}">${escapeXml(l)}</text>`)
      .join('') +
    '</g>';
  return { tick, sheet: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 + tf * (1.2 * lines.length + 1) }, body };
}

export function renderElevation(b: Build, o: ElevationOptions): string {
  const rects = project(b.parts, o.view);
  const pid = o.idPrefix ?? 'ze';
  let l: Layout;
  let width: string;
  let height: string;
  let fs: number;
  let s = 0;
  if (o.mode === 'print') {
    // DIN scale: the smallest that fits A4 landscape; strokes 0.5 / 0.25 mm, text 3.5 mm on paper.
    s = SCALES[SCALES.length - 1]!;
    for (const c of SCALES) {
      const probe = layout(b, o, rects, 3.5 * c, c);
      if (probe.sheet.w / c <= PRINT_W && probe.sheet.h / c <= PRINT_H) {
        s = c;
        break;
      }
    }
    fs = 3.5 * s;
    l = layout(b, o, rects, fs, s);
    width = `${r1(l.sheet.w / s)}mm`;
    height = `${r1(l.sheet.h / s)}mm`;
  } else {
    // Screen: fit to widthPx with 12 px labels. The sheet grows with the labels, so iterate the unit.
    const px = Math.max(120, o.widthPx);
    let u = (b.bounds.max[0] - b.bounds.min[0] + 200) / px;
    for (let i = 0; i < 6; i++) u = layout(b, o, rects, 12 * u, 0).sheet.w / px;
    fs = 12 * u;
    l = layout(b, o, rects, fs, 0);
    width = String(px);
    height = String(Math.round((px * l.sheet.h) / l.sheet.w));
  }
  const title = escapeXml(o.title ?? `${KIND_LABEL[b.params.kind]}, ${VIEW_LABEL[o.view]}`);
  const { sheet, tick } = l;
  const hatch = Math.max(8, Math.round(fs * 0.5));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="ze" data-view="${o.view}" role="img" aria-labelledby="${pid}-t ${pid}-d" ` +
    `viewBox="${r1(sheet.x)} ${r1(sheet.y)} ${r1(sheet.w)} ${r1(sheet.h)}" width="${width}" height="${height}" ` +
    `fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="miter" font-family="system-ui, sans-serif" font-size="${r1(fs)}">` +
    `<title id="${pid}-t">${title}</title><desc id="${pid}-d">${escapeXml(describe(b))}</desc>` +
    `<defs><pattern id="${pid}-h" patternUnits="userSpaceOnUse" width="${hatch}" height="${hatch}" patternTransform="rotate(45)">` +
    `<path d="M0 0V${hatch}" stroke-opacity=".5" stroke-width="${r1(hatch / 12)}"/></pattern>` +
    `<marker id="${pid}-k" markerUnits="userSpaceOnUse" markerWidth="${r1(tick)}" markerHeight="${r1(tick)}" refX="${r1(tick / 2)}" refY="${r1(tick / 2)}" orient="auto">` +
    `<path d="M0 ${r1(tick)}L${r1(tick)} 0" stroke="${ACCENT}" stroke-width="${s ? r1(0.25 * s) : '1'}"${s ? '' : ' vector-effect="non-scaling-stroke"'}/></marker></defs>` +
    l.body +
    '</svg>'
  );
}
