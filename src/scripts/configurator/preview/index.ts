// Möbel live preview (docs/configurator.md §3 "Files", §4.8, §4.11): the chunk the wizard core
// import()s once typ=moebel. Budget ≤ 8.75 KB gz (scripts/check-budgets.mjs, tests/unit/configurator/
// preview-size.test.ts). It draws the front elevation of the configured furniture as SVG.
//
// API
//   mountPreview(form, panel, announce) → { update(), dispose() }
//     form      the wizard <form id="anfrage">; field names are the FIELDS keys.
//     panel     <figure data-preview> containing <div data-preview-drawing> (holds the build-time
//               Beispielskizze until the first live render) and a <figcaption>. An optional
//               <ul data-preview-hints> lists the derived hints (Mittelwand ergänzt …); without it
//               they are only announced.
//     announce  polite live-region writer of the core; receives new or changed hints, debounced.
//     update()  records that the form changed; the work runs in the next animation frame (INP rule:
//               handlers only record state). Also called for `input` events on the form itself.
//     dispose() cancels pending work, stops observing and releases the listeners.
//   faecherRange(values) → [min, max] for moebel_faecher, or null (for the core's range narrowing).
//   paramsFromValues(values) → generator params (pure, params.ts).
//   buildFor(values) → Promise<Build | null>: the Build of the values (table generator on request);
//               ./info.ts (live payload, on request) derives the cut list and the description from it.
//   screenDrawing(values, widthPx, idPrefix) → Promise<string>: the front view at a given width (the
//               success view shows the drawing narrower than the preview panel, so it re-renders).
//   printSheet(values, date) → Promise<string>: the DIN print sheet of the values (full renderer,
//               loaded on request) for the success view's print action, '' when there is no drawing.
//   The payload info and the print sheet go through this module on purpose: everything they need is
//   already in this chunk, so the bundler keeps the generators and the SVG core in it instead of
//   splitting them into shared chunks (each extra file costs gzip overhead against the budget).
//
// Behaviour
// - Values come from FormData (disabled fieldsets are left out), empty fields use fieldDefault().
// - moebel_art = esstisch loads the table generator on request (a second small chunk); regal,
//   sideboard and einbauschrank render at once. Bett and „andere“ have no generator: the panel keeps
//   whatever it shows (sketch or last drawing) and gets data-preview-state="inactive"; the markup or
//   CSS may hide it. The attribute is "live" after a render.
// - Only the screen front view is in this chunk. The print sheet and the Seite/Oben views come from
//   src/lib/configurator/drawing/elevation (full renderer), import()ed by printSheet().
// - The drawing is re-rendered when the panel width changes (ResizeObserver), coalesced per frame.
// - 3D (docs/configurator.md §4.9; ./load3d.ts holds the contract): when the markup has the poster
//   tools `[data-viewer-tools]` (PUBLIC_3D), the loader chunk is import()ed with the preview; it
//   reveals the tools (not for `?3d=aus`), probes WebGL2 on the poster click or the desktop auto-load
//   and loads the viewer chunk on request. Every Build goes to it (feed), null for bett/andere
//   disposes the viewer, and dispose() takes it down with the preview. The module-level snapshot3d()
//   exposes §4.12 to submit.ts (live attachment) without a path through the core: null (sync) before
//   the loader mounted, resolves null without a ready viewer.
import { PUBLIC_3D } from 'astro:env/client';
import { renderScreen } from '../../../lib/configurator/drawing/svg';
import { generateCarcass } from '../../../lib/configurator/furniture/carcass';
import { describe } from '../../../lib/configurator/furniture/describe';
import { SPECIES } from '../../../lib/configurator/furniture/species';
import type { Build, Hint } from '../../../lib/configurator/furniture/types';
import type { Values } from '../../../lib/configurator/fields';
import type { Host3d } from './load3d';
import { paramsFromValues } from './params';

export { faecherRange, paramsFromValues } from './params';
/** For ./info.ts: through this entry, so the describe modules stay in this chunk instead of a shared one. */
export { describe };

/** The Build of the values, or null for bett/andere and other project types. */
export async function buildFor(v: Values): Promise<Build | null> {
  const p = paramsFromValues(v);
  if (!p) return null;
  if (p.kind !== 'esstisch') return generateCarcass(p);
  return (await (tablePromise ??= import('../../../lib/configurator/furniture/table'))).generateTable(p);
}

/**
 * The DIN print sheet (A4 landscape, 1:10–1:50) of the values; '' when there is nothing to draw.
 * The default id prefix differs from the screen drawing's ('vorschau'), so both can share a page.
 */
/** The screen front view of the values at `widthPx` ('' when there is nothing to draw): the success view re-renders at its own width. */
export async function screenDrawing(v: Values, widthPx: number, idPrefix: string): Promise<string> {
  const b = await buildFor(v);
  return b ? renderScreen(b, { view: 'vorne', widthPx, idPrefix }) : '';
}

export async function printSheet(v: Values, date: string): Promise<string> {
  const b = await buildFor(v);
  if (!b) return '';
  return (await import('../../../lib/configurator/drawing/elevation')).renderPrint(b, {
    view: 'vorne',
    widthPx: 640,
    date,
  });
}

export interface Preview {
  update(): void;
  dispose(): void;
}

type TableModule = typeof import('../../../lib/configurator/furniture/table');
let tablePromise: Promise<TableModule> | null = null;

/** The 3D host of the mounted preview (one at a time); submit.ts takes the snapshot through it. */
let host3d: Host3d | null = null;
export const snapshot3d = (): Promise<Blob | null> | null => host3d?.snapshot() ?? null;

/** Hints are announced 800 ms after the last change, so a slider drag yields one announcement. */
const HINT_DELAY = 800;

export function valuesOf(form: HTMLFormElement): Values {
  const v: Values = {};
  for (const [k, x] of new FormData(form)) if (typeof x === 'string') v[k] = x;
  return v;
}

export function mountPreview(form: HTMLFormElement, panel: HTMLElement, announce: (text: string) => void): Preview {
  const drawing = panel.querySelector<HTMLElement>('[data-preview-drawing]');
  const caption = panel.querySelector<HTMLElement>('figcaption');
  const hintList = panel.querySelector<HTMLElement>('[data-preview-hints]');
  const ac = new AbortController();
  let raf = 0;
  let timer = 0;
  let width = 0;
  /** Hints of the last render, keyed by code, so only new or changed texts are announced. */
  let shown: Record<string, string> = {};
  const widthOf = () => Math.round(drawing?.getBoundingClientRect().width || 0);

  const render = (b: Build) => {
    width = widthOf();
    if (drawing) drawing.innerHTML = renderScreen(b, { view: 'vorne', widthPx: width || 640, idPrefix: 'vorschau' });
    // The first clause of the sentence („Regal aus Eiche, natur geölt, 120 cm breit, …“); the SVG <desc> has it all.
    if (caption) caption.textContent = `Vorschau: ${describe(b).split('; ')[0]}`;
    panel.dataset['previewState'] = 'live';
    hints(b.hints);
  };

  const hints = (list: Hint[]) => {
    hintList?.replaceChildren(
      ...list.map((h) => {
        const li = document.createElement('li');
        li.dataset['level'] = h.level;
        li.textContent = h.text;
        return li;
      }),
    );
    const fresh = list.filter((h) => shown[h.code] !== h.text).map((h) => h.text);
    shown = Object.fromEntries(list.map((h) => [h.code, h.text]));
    if (fresh.length) {
      clearTimeout(timer);
      timer = window.setTimeout(() => announce(fresh.join(' ')), HINT_DELAY);
    }
  };

  const frame = () => {
    raf = 0;
    // Carcasses resolve at once (same frame); the table generator is a chunk of its own, on request.
    void buildFor(valuesOf(form)).then((b) => {
      if (ac.signal.aborted) return;
      if (b) render(b);
      else panel.dataset['previewState'] = 'inactive';
      last = b;
      host3d?.feed(b);
    });
  };

  const update = () => {
    raf ||= requestAnimationFrame(frame);
  };

  form.addEventListener('input', update, { signal: ac.signal });
  const ro = new ResizeObserver(() => Math.abs(widthOf() - width) > 8 && update());
  if (drawing) ro.observe(drawing);
  update();

  // 3D: the loader chunk (poster button, probe, auto-load gate). PUBLIC_3D is inlined at build time,
  // so with PUBLIC_3D=false this branch and the import() are compiled out (no tools in the markup).
  let last: Build | null = null;
  if (PUBLIC_3D) {
    import('./load3d').then(
      (m) => {
        if (!ac.signal.aborted) (host3d = m.mount3d(panel, announce, describe, SPECIES)).feed(last);
      },
      () => {},
    );
  }

  return {
    update,
    dispose() {
      ac.abort();
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      raf = 0;
      host3d?.dispose();
    },
  };
}
