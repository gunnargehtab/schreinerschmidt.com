// Möbel live preview (docs/configurator.md §3 "Files", §4.8, §4.11): the chunk the wizard core
// import()s once typ=moebel. Budget ≤ 7 KB gz (scripts/check-budgets.mjs, tests/unit/configurator/
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
//
// Behaviour
// - Values come from FormData (disabled fieldsets are left out), empty fields use fieldDefault().
// - moebel_art = esstisch loads the table generator on request (a second small chunk); regal,
//   sideboard and einbauschrank render at once. Bett and „andere“ have no generator: the panel keeps
//   whatever it shows (sketch or last drawing) and gets data-preview-state="inactive"; the markup or
//   CSS may hide it. The attribute is "live" after a render.
// - Only the screen front view is in this chunk. The print sheet and the Seite/Oben views come from
//   src/lib/configurator/drawing/elevation (full renderer), which the core imports on `beforeprint`.
// - The drawing is re-rendered when the panel width changes (ResizeObserver), coalesced per frame.
import { renderScreen } from '../../../lib/configurator/drawing/svg';
import { generateCarcass } from '../../../lib/configurator/furniture/carcass';
import { describe } from '../../../lib/configurator/furniture/describe';
import type { Build, FurnitureParams, Hint } from '../../../lib/configurator/furniture/types';
import type { Values } from '../../../lib/configurator/fields';
import { paramsFromValues } from './params';

export { faecherRange, paramsFromValues } from './params';

export interface Preview {
  update(): void;
  dispose(): void;
}

type TableModule = typeof import('../../../lib/configurator/furniture/table');
let tablePromise: Promise<TableModule> | null = null;

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
  let generateTable: TableModule['generateTable'] | undefined;
  /** Hints of the last render, keyed by code, so only new or changed texts are announced. */
  let shown: Record<string, string> = {};
  const widthOf = () => Math.round(drawing?.getBoundingClientRect().width || 0);

  const render = (p: FurnitureParams) => {
    const b: Build = p.kind === 'esstisch' ? generateTable!(p) : generateCarcass(p);
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
    const p = paramsFromValues(valuesOf(form));
    if (!p) panel.dataset['previewState'] = 'inactive';
    else if (p.kind === 'esstisch' && !generateTable) {
      // The table generator (and its describe sentence) is a chunk of its own, loaded on request.
      (tablePromise ??= import('../../../lib/configurator/furniture/table')).then((m) => {
        generateTable = m.generateTable;
        if (!ac.signal.aborted) update();
      });
    } else render(p);
  };

  const update = () => {
    raf ||= requestAnimationFrame(frame);
  };

  form.addEventListener('input', update, { signal: ac.signal });
  const ro = new ResizeObserver(() => Math.abs(widthOf() - width) > 8 && update());
  if (drawing) ro.observe(drawing);
  update();

  return {
    update,
    dispose() {
      ac.abort();
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      raf = 0;
    },
  };
}
