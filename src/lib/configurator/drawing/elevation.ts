// SVG elevation drawing (docs/configurator.md §4.8): a pure string renderer for a Build in the
// "Workshop Sketchbook" look: hairlines, 45° dimension ticks, a species wash and a title block.
// Used at build time, live in the browser, as the no-WebGL fallback, in the summary, for print and
// as the live-mode attachment. No DOM, no three.js.
//
// The projection, layout and screen fitting live in ./svg.ts (the Möbel preview chunk imports
// `renderScreen` from there); this module adds the print fitting and is the full public renderer.
import { layout, project, r1, renderScreen, wrap, type ScreenOptions } from './svg';
import type { Build } from '../furniture/types';

export { escapeXml, renderScreen, VIEW_LABEL, type ElevationView } from './svg';

export interface ElevationOptions extends ScreenOptions {
  /** Screen: fit to `widthPx`, 12 px labels. Print: DIN 1:10/20/25/50 on A4 landscape, 3.5 mm text. */
  mode: 'screen' | 'print';
}

/** A4 landscape printable area in mm and the DIN scales to try. */
const PRINT_W = 277;
const PRINT_H = 190;
const SCALES = [10, 20, 25, 50];

/** Print mode: the smallest DIN scale that fits A4 landscape; strokes 0.5 / 0.25 mm, text 3.5 mm on paper. */
export function renderPrint(b: Build, o: ScreenOptions): string {
  const rects = project(b.parts, o.view);
  let s = SCALES[SCALES.length - 1]!;
  for (const c of SCALES) {
    const probe = layout(b, o, rects, 3.5 * c, c);
    if (probe.sheet.w / c <= PRINT_W && probe.sheet.h / c <= PRINT_H) {
      s = c;
      break;
    }
  }
  const fs = 3.5 * s;
  const l = layout(b, o, rects, fs, s);
  return wrap(b, o, l, fs, s, `${r1(l.sheet.w / s)}mm`, `${r1(l.sheet.h / s)}mm`);
}

export function renderElevation(b: Build, o: ElevationOptions): string {
  return o.mode === 'print' ? renderPrint(b, o) : renderScreen(b, o);
}
