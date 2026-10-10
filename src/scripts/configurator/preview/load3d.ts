// 3D loader (docs/configurator.md §4.9 "Loading", §4.10 "Context loss"): import()ed by the Möbel
// preview (./index.ts) as soon as Möbel is chosen (the preview chunk has no room for a gate of its
// own, so this chunk is the gate). Budget ≤ 1.5 KB gz. three.js is reachable only through the
// import() in load() below, which runs on the poster-button click or, on a desktop viewport
// (`(pointer: fine) and (min-width: 64rem)`), automatically once the panel is ≥ 50 % visible, the
// browser is idle, Save-Data is off, the connection is not 2g/3g and there was no pointer or key
// input in the last second.
//
// API
//   mount3d(panel, announce, describe, species) → { feed(build), snapshot(), dispose() }
//     panel     <figure data-preview>; see the DOM contract below.
//     announce  polite live-region writer; the texts come from the data-msg-viewer-* attributes of
//               the wizard root (loading / ready / unavailable).
//     describe, species   describe() and SPECIES from the preview chunk, handed in so this chunk
//               has no static imports (every dependency name would sit in the preview's preload map).
//     feed(b)   the current Build (null for bett/andere and other project types: the viewer is
//               disposed and the poster returns; the auto-load re-arms with the next Build).
//               Called by the preview on every render.
//     snapshot()  §4.12 through the viewer; resolves null without a ready viewer.
//     dispose() aborts everything and disposes the viewer (leaving the Möbel branch).
//
// DOM contract (`[data-preview]`)
//   [data-viewer]                 hidden while there is no viewer state; data-viewer-state =
//                                 unsupported | loading | ready | failed | lost. `ready` is the only
//                                 state with a visible canvas; the drawing stays in the DOM beneath.
//   [data-viewer-tools]           revealed here (JS only; stays hidden for ?3d=aus: SVG only):
//     [data-action="load-3d"]     the poster button; hidden while loading, ready, unsupported, lost.
//                                 Focus follows it: ready → first view button, failed → the poster,
//                                 unsupported → the figure (tabindex=-1, the drawing beneath it).
//     [data-action="reload-3d"]   „3D neu laden“ after a lost context; after the second loss the
//                                 viewer stays off (SVG only).
//     [data-view-controls]        the view buttons (viewer3d/index.ts); visible when ready.
//     [data-viewer-note]          „Holzbild beispielhaft“, shown by the viewer for Kernbuche.
// - No WebGL2 → `unsupported` before anything downloads. A failed chunk load → `failed`, the poster
//   button stays and retries. A context loss → `lost` (announced as unavailable).
// - Tests: wrap requestAnimationFrame via page.addInitScript() to count frames (0 while idle); lose
//   the context with canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext().
import type { SpeciesInfo } from '../../../lib/configurator/furniture/species';
import type { Build, Species } from '../../../lib/configurator/furniture/types';
import type { Viewer, ViewerState } from '../viewer3d/types';

export interface Host3d {
  feed(b: Build | null): void;
  snapshot(): Promise<Blob | null> | null;
  dispose(): void;
}

/** Idle wait before an auto-load (and the retry interval after recent input). */
const QUIET = 1000;
const MAX_LOSSES = 2;

interface NavigatorExtras {
  connection?: { saveData?: boolean; effectiveType?: string };
}

export function mount3d(
  panel: HTMLElement,
  announce: (text: string) => void,
  describe: (b: Build) => string,
  species: Record<Species, SpeciesInfo>,
): Host3d {
  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector<T>(sel);
  const root = panel.closest<HTMLElement>('[data-configurator]');
  const msg = (k: 'Loading' | 'Ready' | 'Unavailable') => root?.dataset[`msgViewer${k}`] ?? '';
  const el = $('[data-viewer]');
  const loadBtn = $('[data-action="load-3d"]');
  const reloadBtn = $('[data-action="reload-3d"]');
  const controls = $('[data-view-controls]');
  const ac = new AbortController();
  const { signal } = ac;
  let build: Build | null = null;
  let viewer: Viewer | null = null;
  let pending: Promise<void> | null = null;
  let state: ViewerState | null = null;
  let losses = 0;
  let auto = false;
  let armed = false;
  let io: IntersectionObserver | null = null;
  let lastInput = 0;
  const nav = navigator as Navigator & NavigatorExtras;

  const setState = (s: ViewerState | null) => {
    state = s;
    if (!el) return;
    if (s) el.dataset['viewerState'] = s;
    else delete el.dataset['viewerState'];
    el.hidden = !s;
    if (controls) controls.hidden = s !== 'ready';
    if (loadBtn)
      loadBtn.hidden = losses >= MAX_LOSSES || s === 'loading' || s === 'ready' || s === 'unsupported' || s === 'lost';
    if (reloadBtn) reloadBtn.hidden = !(s === 'lost' && losses < MAX_LOSSES);
  };

  const unavailable = () => announce(msg('Unavailable'));
  const drop = () => {
    viewer?.dispose();
    viewer = null;
  };

  const lost = () => {
    losses++;
    drop();
    setState('lost');
    unavailable();
  };

  function load(): void {
    if (viewer || pending || !build || !el || losses >= MAX_LOSSES) return;
    const canvas = document.createElement('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // §4.9 attributes: alpha, depth, premultipliedAlpha (true), stencil, preserveDrawingBuffer (false)
    // and powerPreference ('default') are the WebGL defaults; only antialias is set (none at DPR 2).
    const gl = canvas.getContext('webgl2', { antialias: dpr < 2 });
    // The poster hides in every state but `failed`; keep the keyboard user's focus in the panel.
    const focusAfter = !!tools?.contains(document.activeElement);
    const refocus = (to: HTMLElement | null) => focusAfter && to?.focus();
    if (!gl) {
      setState('unsupported');
      unavailable();
      panel.tabIndex = -1;
      refocus(panel);
      return;
    }
    setState('loading');
    announce(msg('Loading'));
    const b = build;
    pending = import('../viewer3d/index')
      .then((m) =>
        m.createViewer({
          canvas,
          gl,
          host: el,
          controls,
          note: $('[data-viewer-note]'),
          build: b,
          describe,
          colour: (s) => species[s].avgColor,
          label: el.dataset['label'] ?? '',
          onLost: lost,
        }),
      )
      .then(
        (v) => {
          pending = null;
          if (signal.aborted || !build) return v.dispose();
          viewer = v;
          if (build !== b) v.update(build);
          setState('ready');
          announce(msg('Ready'));
          refocus(controls?.querySelector('button') ?? null);
        },
        () => {
          pending = null;
          // A failed chunk load leaves the probed context alive otherwise (the viewer frees its own).
          gl.getExtension('WEBGL_lose_context')?.loseContext();
          setState('failed');
          unavailable();
          refocus(loadBtn);
        },
      );
  }

  /** Auto-load (§4.9): visible, idle, no Save-Data, no 2g/3g, no input for a second. */
  const arm = () => {
    const c = nav.connection;
    if (armed || c?.saveData || /2g|3g/.test(c?.effectiveType ?? '')) return;
    armed = true;
    const o = (io = new IntersectionObserver(
      ([e]) => {
        if (!e || e.intersectionRatio < 0.5) return;
        o.disconnect();
        const attempt = () => {
          if (signal.aborted || state) return;
          if (performance.now() - lastInput < QUIET) setTimeout(attempt, QUIET);
          else load();
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(attempt);
        else setTimeout(attempt, 200);
      },
      { threshold: 0.5 },
    ));
    o.observe(panel);
    signal.addEventListener('abort', () => o.disconnect());
  };
  const input = () => (lastInput = performance.now());
  addEventListener('pointerdown', input, { signal, passive: true });
  addEventListener('keydown', input, { signal, passive: true });

  // The poster tools are JS-only; `?3d=aus` keeps them hidden (SVG only, nothing else happens). The
  // wizard rewrites the query on the first change, so the navigation entry keeps the original URL.
  const tools = $('[data-viewer-tools]');
  const nav0 = performance.getEntriesByType('navigation')[0];
  if (tools && !/[?&]3d=aus\b/.test(location.search + (nav0?.name ?? ''))) {
    tools.hidden = false;
    auto = matchMedia('(pointer: fine) and (min-width: 64rem)').matches;
    loadBtn?.addEventListener('click', load, { signal });
    reloadBtn?.addEventListener('click', load, { signal });
  }

  return {
    feed(b) {
      if (!tools || tools.hidden) return;
      build = b;
      if (!b) {
        drop();
        io?.disconnect();
        setState(null);
        armed = false;
      } else if (viewer) viewer.update(b);
      else if (auto && !state) arm();
    },
    snapshot: () => viewer?.snapshot() ?? null,
    dispose() {
      ac.abort();
      drop();
    },
  };
}
