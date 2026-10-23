// Per-page transfer budgets for dist/ (docs/architecture.md §11, CLAUDE.md "Budgets").
// Sizes are gzip (level 9) for HTML, CSS and JS; fonts and images count raw bytes, because
// woff2/AVIF/WebP are already compressed and GitHub Pages serves them as is.
//
// - HTML: the page file without its inline <style> blocks (those count as CSS).
// - CSS: inline <style> blocks + linked stylesheets.
// - JS: inline executable scripts + <script src> + modulepreloads + their static import graph.
//   Dynamic import() targets are excluded (loaded on request), except for the three.js and 3D checks.
// - Fonts: files every page loads: <link rel=preload as=font> + @font-face sources without a
//   unicode-range. Faces limited by unicode-range (latin-ext) only load for those characters.
// - LCP image: first img[fetchpriority=high]; the candidate a browser picks from the first matching
//   <source> of its <picture> (AVIF), else from the img itself. Evaluated for two viewports, a
//   1280 px desktop (DPR 1) and a 390 px phone (DPR 2.625); the larger file counts. The phone run
//   picks art-directed sources (Home: 4:5 crop below 48rem) via their `media` attribute.
// - three.js: no JS reachable from a page outside /konfigurator/ (static or dynamic) may contain it,
//   and the 3D loader (`load3d.*.js`) must not be reachable from there either.
// - Möbel preview: the chunk the configurator core import()s when Möbel is chosen (found by its
//   `data-preview-drawing` selector), plus the chunks it imports statically that the page does not
//   already load: ≤ 8.75 KB gz (docs/configurator.md §3 "JS budget", §7). Its own import() targets
//   (the table generator) are reported, not counted. Skipped with a log line while no page imports the chunk.
// - Möbel 3D loader: the preview import()s `load3d.*.js` as soon as it mounts, so it downloads whenever
//   Möbel is chosen and is budgeted explicitly (decided 2026-10-10): ≤ 1.5 KB gz, and page JS + preview +
//   loader ≤ 21.5 KB gz (PREVIEW.withCore).
// - 3D viewer (on request): the `viewer3d.*.js` chunk the loader import()s plus everything it imports
//   statically (three.js): ≤ 160 KB gz. Fails when the preview references the loader but no such chunk
//   exists; passes with a log line when the preview has no loader import (build with PUBLIC_3D=off).
// - Full flow: everything a completed demo or live enquiry downloads besides the preview, the photos
//   and three.js: the page JS plus every chunk reachable from it through import() (validation +
//   messages, summary, submit + mailto, payload), found by walking the core's import() graph without
//   entering the preview world, the photos chunk (`image/jpeg`) or three.js: FLOW.limit, and flow +
//   Möbel preview + 3D loader ≤ FLOW.withPreview (19.0 / 29.0 KB gz, see FLOW).
//
// Usage: node scripts/check-budgets.mjs  (reads BASE_PATH, falls back to env/pages.env)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// DIST_DIR checks a variant build (env/assistant.env); default dist/.
const DIST = resolve(ROOT, process.env['DIST_DIR'] || 'dist');
if (!process.env['BASE_PATH'] && existsSync(join(ROOT, 'env/pages.env'))) {
  process.loadEnvFile(join(ROOT, 'env/pages.env'));
}
const trimmed = (process.env['BASE_PATH'] ?? '/').replace(/^\/+|\/+$/g, '');
const BASE = trimmed ? `/${trimmed}/` : '/';

/** @typedef {{ html: number, css: number, js: number, fonts: number, lcp: number }} Budget */

/** Defaults in KB (1 KB = 1024 bytes). */
/** @type {Budget} */
const DEFAULT_BUDGET = { html: 30, css: 25, js: 15, fonts: 80, lcp: 120 };

/**
 * Per-route overrides; the first match on the page path below the base (`konfigurator/regal/`) wins.
 * @type {{ match: RegExp, budget: Partial<Budget> }[]}
 */
const ROUTE_BUDGETS = [
  // Demo-only, noindex internal sheets (style guide, component and sketch catalogues) render many
  // components at once; they are never part of the public site.
  { match: /^intern\//, budget: { html: 45 } },
  // Configurator: 11.25 KB gz initial JS (docs/configurator.md §3 "JS budget"); the Möbel preview chunk
  // is checked separately below (PREVIEW, LOADER, VIEWER).
  { match: /^konfigurator\//, budget: { js: 11.25 } },
];

/** Möbel preview chunk (docs/configurator.md §3 "JS budget", §7 "Budgets"), KB gz. */
const PREVIEW = { match: /^konfigurator\//, signature: /data-preview-drawing/, limit: 8.75, withCore: 21.5 };
/** Möbel 3D loader (docs/configurator.md §3 "JS budget"), KB gz; the preview import()s it on mount. */
const LOADER = { name: /^load3d\./, limit: 1.5 };
/** 3D viewer chunk + the three.js chunk it imports, loaded on request, KB gz. */
const VIEWER = { name: /^viewer3d\./, limit: 160 };
/**
 * Full flow (core + validation + summary + submit + payload), KB gz; `withPreview` adds the Möbel
 * preview and the 3D loader. Set with the user on 2026-10-10 from the measurement after Phase 3 (18.6 / 27.1),
 * + 1.5 KB for the loader in Phase 4, then raised to 19.0 / 29.0 KB with the user on 2026-10-10 for the demo
 * snapshot (submit.ts). About 1 KB is Vite's module-preload helper plus the hashed dependency maps that
 * Astro's client build adds to every chunk with an import() (not switchable from astro.config in Astro 7.3;
 * docs/configurator.md §3).
 */
const FLOW = { limit: 19.0, withPreview: 29.0 };
/** The photos chunk (on file selection) re-encodes to JPEG; nothing else in the flow does. */
const PHOTOS_SIGNATURE = /image\/jpeg/;

/** Pages that may load three.js. */
const THREE_ALLOWED = /^konfigurator\//;
/** Strings that survive minification of three.js (`__THREE__` global, renderer and core class names). */
const THREE_SIGNATURE = /__THREE__|WebGLRenderer|BufferGeometry|MeshStandardMaterial/;

/** Viewports the LCP candidate is evaluated for: desktop and a typical phone (390 css px, DPR 2.625). */
const LCP_VIEWPORTS = [
  { name: 'desktop', width: 1280, dpr: 1 },
  { name: 'mobile', width: 390, dpr: 2.625 },
];
const REM = 16;

/** @param {number} bytes */
const kb = (bytes) => bytes / 1024;
/** @param {string | Buffer} data */
const gz = (data) => (data.length === 0 ? 0 : gzipSync(data, { level: 9 }).length);

/** @param {string} dir @returns {string[]} */
function listHtml(dir) {
  return /** @type {string[]} */ (readdirSync(dir, { recursive: true, encoding: 'utf8' }))
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replaceAll(sep, '/'))
    .sort();
}

/**
 * Map a URL found in a page to a dist file, or null for external, data: or missing files.
 * @param {string} ref
 * @param {string} fromUrlPath URL path of the referring document or module (with the base).
 */
function toDistFile(ref, fromUrlPath) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref)) return null;
  const path = posix.resolve(
    posix.dirname(fromUrlPath.endsWith('/') ? `${fromUrlPath}x` : fromUrlPath),
    ref.replace(/[?#].*$/, ''),
  );
  if (!path.startsWith(BASE)) return null;
  const file = join(DIST, ...path.slice(BASE.length).split('/'));
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/** @param {string} file */
const urlPathOf = (file) => BASE + file.slice(DIST.length + 1).replaceAll(sep, '/');

const STATIC_IMPORT = /(?:^|[;\s}])(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g;
// Rolldown emits import() specifiers as template literals (backticks).
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

/** @type {Map<string, string>} */
const textCache = new Map();
/** @param {string} file */
function read(file) {
  let text = textCache.get(file);
  if (text === undefined) {
    text = readFileSync(file, 'utf8');
    textCache.set(file, text);
  }
  return text;
}

/**
 * JS module graph from the entry files.
 * @param {string[]} entries
 * @param {boolean} dynamic Follow import() too.
 * @param {(file: string) => boolean} [skip] Files not to enter (nor list), e.g. the preview or three.js.
 */
function moduleGraph(entries, dynamic, skip = () => false) {
  const seen = new Set(entries);
  const queue = [...entries];
  for (let file = queue.shift(); file; file = queue.shift()) {
    const code = read(file);
    const refs = [...code.matchAll(STATIC_IMPORT)].map((m) => m[1] ?? '');
    if (dynamic) refs.push(...[...code.matchAll(DYNAMIC_IMPORT)].map((m) => m[1] ?? ''));
    for (const ref of refs) {
      const dep = toDistFile(ref, urlPathOf(file));
      if (dep && dep.endsWith('.js') && !seen.has(dep) && !skip(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...seen];
}

/** @param {string} file */
const baseName = (file) => file.slice(file.lastIndexOf(sep) + 1);

/**
 * Evaluate a `sizes` attribute at the given viewport width; supports (min-width)/(max-width) in
 * px/rem/em and lengths in px/rem/em/vw. Falls back to 100vw.
 * @param {string | undefined} sizes
 * @param {number} viewport
 */
function slotWidth(sizes, viewport) {
  /** @param {string} value */
  const length = (value) => {
    const m = /^(\d*\.?\d+)(px|rem|em|vw)$/.exec(value.trim());
    if (!m) return null;
    const n = Number(m[1]);
    return m[2] === 'px' ? n : m[2] === 'vw' ? (n * viewport) / 100 : n * REM;
  };
  for (const entry of (sizes ?? '').split(',')) {
    const m = /^\s*(?:\((min|max)-width:\s*([^)]+)\)\s+)?(.+?)\s*$/.exec(entry);
    if (!m || !m[3]) continue;
    const width = length(m[3]);
    if (width === null) continue;
    if (!m[1]) return width;
    const limit = length(m[2] ?? '');
    if (limit === null) continue;
    if (m[1] === 'min' ? viewport >= limit : viewport <= limit) return width;
  }
  return viewport;
}

/**
 * Candidate the browser picks from a srcset: the smallest `w` descriptor ≥ the needed width,
 * else the largest. Density-only srcsets pick 1x.
 * @param {string} srcset
 * @param {number} needed
 */
function pickCandidate(srcset, needed) {
  const candidates = srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter(([url]) => url)
    .map(([url = '', descriptor = '1x']) => ({
      url,
      w: descriptor.endsWith('w') ? Number.parseFloat(descriptor) : NaN,
    }));
  const widths = candidates.filter((c) => !Number.isNaN(c.w)).sort((a, b) => a.w - b.w);
  if (widths.length === 0) return candidates[0]?.url ?? null;
  return (widths.find((c) => c.w >= needed) ?? widths.at(-1))?.url ?? null;
}

/**
 * Does a `<source media>` query match? Supports `(min-width: X)` / `(max-width: X)` in px/rem/em;
 * anything else counts as not matching, so an unknown query falls through to the default source.
 * @param {string | undefined} media
 * @param {number} viewport
 */
function mediaMatches(media, viewport) {
  if (!media) return true;
  const m = /^\s*\(\s*(min|max)-width:\s*(\d*\.?\d+)(px|rem|em)\s*\)\s*$/.exec(media);
  if (!m) return false;
  const limit = Number(m[2]) * (m[3] === 'px' ? 1 : REM);
  return m[1] === 'min' ? viewport >= limit : viewport <= limit;
}

/**
 * The LCP candidate for one viewport: the first <source> whose `media` matches, else the <img>.
 * @param {import('node-html-parser').HTMLElement} img
 * @param {string} pageUrl
 * @param {{ name: string, width: number, dpr: number }} viewport
 */
function lcpCandidate(img, pageUrl, viewport) {
  const picture = img.parentNode?.tagName === 'PICTURE' ? img.parentNode : null;
  const source = picture?.querySelectorAll('source').find((s) => mediaMatches(s.getAttribute('media'), viewport.width));
  const from = source ?? img;
  const srcset = from.getAttribute('srcset');
  const sizes = from.getAttribute('sizes') ?? img.getAttribute('sizes');
  const needed = slotWidth(sizes, viewport.width) * viewport.dpr;
  const url = srcset ? pickCandidate(srcset, needed) : img.getAttribute('src');
  const file = url ? toDistFile(url, pageUrl) : null;
  return { name: viewport.name, url: url ?? '(none)', bytes: file ? statSync(file).size : 0, missing: !file };
}

/**
 * The larger of the desktop and the phone candidate, so a heavy art-directed mobile crop is caught.
 * @param {import('node-html-parser').HTMLElement} root
 * @param {string} pageUrl
 */
function lcpImage(root, pageUrl) {
  const img = root.querySelector('img[fetchpriority="high"]');
  if (!img) return null;
  const candidates = LCP_VIEWPORTS.map((viewport) => lcpCandidate(img, pageUrl, viewport));
  const missing = candidates.find((c) => c.missing);
  if (missing) return { ...missing, label: missing.url };
  const worst = candidates.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  const files = [...new Set(candidates.map((c) => c.url.slice(c.url.lastIndexOf('/') + 1)))];
  return { ...worst, label: files.join(' | ') };
}

const FONT_FACE = /@font-face\s*{([^}]*)}/g;
const URL_REF = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/g;

/**
 * @param {import('node-html-parser').HTMLElement} root
 * @param {string} pageUrl
 * @param {{ text: string, url: string }[]} css
 */
function pageFonts(root, pageUrl, css) {
  /** @type {Set<string>} */
  const files = new Set();
  for (const link of root.querySelectorAll('link[rel="preload"][as="font"]')) {
    const file = toDistFile(link.getAttribute('href') ?? '', pageUrl);
    if (file) files.add(file);
  }
  for (const { text, url } of css) {
    for (const face of text.matchAll(FONT_FACE)) {
      const body = face[1] ?? '';
      if (/unicode-range\s*:/i.test(body)) continue;
      for (const ref of body.matchAll(URL_REF)) {
        const file = toDistFile(ref[1] ?? '', url);
        if (file) files.add(file);
      }
    }
  }
  return [...files];
}

if (!existsSync(DIST)) {
  console.error('check-budgets: dist/ not found, run "npm run build" first.');
  process.exit(1);
}

/** @type {{ page: string, values: Budget, budget: Budget, notes: string[], failures: string[] }[]} */
const rows = [];
/** @type {string[]} */
const threeOffenders = [];
/** @type {string[]} */
const loaderOffenders = [];

for (const rel of listHtml(DIST)) {
  const file = join(DIST, rel);
  const html = read(file);
  const root = parse(html, { comment: false });
  const isRedirect = root
    .querySelectorAll('meta')
    .some((m) => m.getAttribute('http-equiv')?.toLowerCase() === 'refresh');
  if (isRedirect) continue;

  const route = rel === 'index.html' ? '' : rel.replace(/index\.html$/, '');
  const pageUrl = BASE + route;
  const budget = { ...DEFAULT_BUDGET, ...ROUTE_BUDGETS.find((r) => r.match.test(route))?.budget };
  /** @type {string[]} */
  const notes = [];
  /** Failures outside the per-key budgets (Möbel preview). @type {string[]} */
  const failures_extra = [];

  // CSS
  const inlineCss = root.querySelectorAll('style').map((s) => s.rawText);
  const cssLinks = root
    .querySelectorAll('link[rel="stylesheet"]')
    .map((l) => toDistFile(l.getAttribute('href') ?? '', pageUrl))
    .filter((f) => f !== null);
  const css = [
    ...inlineCss.map((text) => ({ text, url: pageUrl })),
    ...cssLinks.map((f) => ({ text: read(f), url: urlPathOf(f) })),
  ];
  const cssBytes = gz(inlineCss.join('\n')) + cssLinks.reduce((sum, f) => sum + gz(read(f)), 0);

  // JS
  const scripts = root.querySelectorAll('script');
  const inlineJs = scripts
    .filter((s) => !s.getAttribute('src'))
    .filter(
      (s) =>
        !/^(?:application\/ld\+json|speculationrules|importmap|application\/json)$/i.test(s.getAttribute('type') ?? ''),
    )
    .map((s) => s.rawText);
  const jsEntries = [
    ...scripts.map((s) => s.getAttribute('src')),
    ...root.querySelectorAll('link[rel="modulepreload"]').map((l) => l.getAttribute('href')),
  ]
    .map((ref) => (ref ? toDistFile(ref, pageUrl) : null))
    .filter((f) => f !== null);
  const jsFiles = moduleGraph(jsEntries, false);
  const jsBytes = gz(inlineJs.join('\n')) + jsFiles.reduce((sum, f) => sum + gz(read(f)), 0);

  // three.js outside the configurator
  if (!THREE_ALLOWED.test(route)) {
    const reachable = moduleGraph(jsEntries, true);
    const hits = [
      ...reachable.filter((f) => THREE_SIGNATURE.test(read(f))).map((f) => urlPathOf(f)),
      ...(inlineJs.some((code) => THREE_SIGNATURE.test(code)) ? ['(inline script)'] : []),
    ];
    if (hits.length > 0) threeOffenders.push(`${pageUrl}: ${hits.join(', ')}`);
    const loaders = reachable.filter((f) => LOADER.name.test(baseName(f))).map((f) => urlPathOf(f));
    if (loaders.length > 0) loaderOffenders.push(`${pageUrl}: ${loaders.join(', ')}`);
  }

  // Möbel preview chunk: import()ed by the core, so it is outside `js`; measured with its own static
  // imports that the page does not load anyway (rolldown splits a chunk shared with the table generator).
  if (PREVIEW.match.test(route)) {
    const reachable = moduleGraph(jsEntries, true);
    const entry = reachable.find((f) => !jsFiles.includes(f) && PREVIEW.signature.test(read(f)));
    if (entry) {
      const files = moduleGraph([entry], false).filter((f) => !jsFiles.includes(f));
      const bytes = kb(files.reduce((sum, f) => sum + gz(read(f)), 0));
      const previewGraph = moduleGraph([entry], true);

      // 3D loader (import()ed on mount) and the viewer + three.js it loads on request.
      const loaderEntry = previewGraph.find((f) => LOADER.name.test(baseName(f)));
      const loaderFiles = loaderEntry
        ? moduleGraph([loaderEntry], false).filter((f) => !jsFiles.includes(f) && !files.includes(f))
        : [];
      const loaderBytes = kb(loaderFiles.reduce((sum, f) => sum + gz(read(f)), 0));
      const viewerEntry = loaderEntry
        ? moduleGraph([loaderEntry], true).find((f) => VIEWER.name.test(baseName(f)))
        : undefined;
      const viewerFiles = viewerEntry ? moduleGraph([viewerEntry], false) : [];
      const viewerBytes = kb(viewerFiles.reduce((sum, f) => sum + gz(read(f)), 0));

      const withCore = kb(jsBytes) + bytes + loaderBytes;
      const onRequest = previewGraph
        .filter(
          (f) =>
            !files.includes(f) &&
            !jsFiles.includes(f) &&
            !loaderFiles.includes(f) &&
            !viewerFiles.includes(f) &&
            !THREE_SIGNATURE.test(read(f)),
        )
        .reduce((sum, f) => sum + gz(read(f)), 0);
      notes.push(
        `Möbel preview ${bytes.toFixed(2)} / ${PREVIEW.limit} KB (${files.map(baseName).join(' + ')}; +${kb(onRequest).toFixed(1)} KB on request); 3D loader ${loaderEntry ? `${loaderBytes.toFixed(2)} / ${LOADER.limit} KB (${loaderFiles.map(baseName).join(' + ')})` : 'none (3D off)'}; core + preview + 3D loader ${withCore.toFixed(2)} / ${PREVIEW.withCore} KB`,
      );
      if (bytes > PREVIEW.limit) failures_extra.push(`Möbel preview ${bytes.toFixed(2)} KB > ${PREVIEW.limit} KB`);
      if (loaderBytes > LOADER.limit)
        failures_extra.push(`Möbel 3D loader ${loaderBytes.toFixed(2)} KB > ${LOADER.limit} KB`);
      if (withCore > PREVIEW.withCore)
        failures_extra.push(`core + Möbel preview + 3D loader ${withCore.toFixed(2)} KB > ${PREVIEW.withCore} KB`);

      if (loaderEntry && viewerFiles.length === 0) {
        failures_extra.push('3D viewer chunk (viewer3d.*.js) not found although the preview references the loader');
      } else if (loaderEntry) {
        if (!viewerFiles.some((f) => THREE_SIGNATURE.test(read(f))))
          failures_extra.push('3D viewer chunk does not include three.js');
        notes.push(
          `3D viewer ${viewerBytes.toFixed(1)} / ${VIEWER.limit} KB (${viewerFiles.map(baseName).join(' + ')})`,
        );
        if (viewerBytes > VIEWER.limit)
          failures_extra.push(`3D viewer ${viewerBytes.toFixed(1)} KB > ${VIEWER.limit} KB`);
      } else if (previewGraph.some((f) => /load3d/.test(read(f)))) {
        failures_extra.push('preview references load3d but the loader chunk was not found in dist');
      } else {
        notes.push('3D viewer not built (PUBLIC_3D=off); check skipped');
      }

      // Full flow: the core's import() graph without the preview world (the preview files and every
      // chunk that statically imports one of them: table, print sheet, payload info), the photos chunk
      // and three.js.
      const previewWorld = (/** @type {string} */ f) => moduleGraph([f], false).some((d) => files.includes(d));
      const flowFiles = moduleGraph(
        jsEntries,
        true,
        (f) => previewWorld(f) || PHOTOS_SIGNATURE.test(read(f)) || THREE_SIGNATURE.test(read(f)),
      ).filter((f) => !jsFiles.includes(f));
      const flow = kb(jsBytes) + kb(flowFiles.reduce((sum, f) => sum + gz(read(f)), 0));
      const flowWithPreview = flow + bytes + loaderBytes;
      notes.push(
        `full flow ${flow.toFixed(2)} / ${FLOW.limit} KB (core ${kb(jsBytes).toFixed(2)} + ${flowFiles.map((f) => `${baseName(f)} ${kb(gz(read(f))).toFixed(2)}`).join(' + ')}); flow + preview + 3D loader ${flowWithPreview.toFixed(2)} / ${FLOW.withPreview} KB`,
      );
      if (flow > FLOW.limit) failures_extra.push(`full flow ${flow.toFixed(2)} KB > ${FLOW.limit} KB`);
      if (flowWithPreview > FLOW.withPreview)
        failures_extra.push(
          `full flow + Möbel preview + 3D loader ${flowWithPreview.toFixed(2)} KB > ${FLOW.withPreview} KB`,
        );
    } else if (route === 'konfigurator/') {
      notes.push('Möbel preview chunk not imported by this page yet (core not wired); check skipped');
    }
  }

  // Fonts
  const fonts = pageFonts(root, pageUrl, css);
  const fontBytes = fonts.reduce((sum, f) => sum + statSync(f).size, 0);

  // LCP image
  const lcp = lcpImage(root, pageUrl);
  if (lcp?.missing) notes.push(`LCP candidate not found in dist: ${lcp.url}`);
  else if (lcp) notes.push(`LCP ${lcp.label}`);

  const values = {
    // Inline <style> blocks are counted in the CSS budget; the site inlines all CSS on purpose
    // (build.inlineStylesheets: 'always'), so counting them here too would double-count them.
    html: kb(gz(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''))),
    css: kb(cssBytes),
    js: kb(jsBytes),
    fonts: kb(fontBytes),
    lcp: kb(lcp?.bytes ?? 0),
  };
  const failures = /** @type {(keyof Budget)[]} */ (Object.keys(values))
    .filter((key) => values[key] > budget[key])
    .map((key) => `${key} ${values[key].toFixed(1)} KB > ${budget[key]} KB`);
  if (lcp?.missing) failures.push('LCP candidate missing');
  failures.push(...failures_extra);
  rows.push({ page: pageUrl, values, budget, notes, failures });
}

// Report
const KEYS = /** @type {const} */ (['html', 'css', 'js', 'fonts', 'lcp']);
const header = ['page', ...KEYS.map((k) => `${k} KB`), 'status'];
const table = rows.map((r) => [
  r.page,
  ...KEYS.map((k) => `${r.values[k].toFixed(1)} / ${r.budget[k]}`),
  r.failures.length > 0 ? 'FAIL' : 'ok',
]);
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => (row[i] ?? '').length)));
/** @param {string[]} cells */
const line = (cells) =>
  cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
console.log(
  `Budgets (gz for HTML/CSS/JS, raw for fonts/LCP image; LCP: larger of ${LCP_VIEWPORTS.map((v) => `${v.width} px @ ${v.dpr}x`).join(' and ')}), base ${BASE}`,
);
console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of table) console.log(line(row));
for (const r of rows) for (const note of r.notes) console.log(`  ${r.page}: ${note}`);

let failed = false;
if (rows.length === 0) {
  console.error('check-budgets: no pages found in dist/.');
  failed = true;
}
for (const r of rows) {
  for (const failure of r.failures) {
    console.error(`BUDGET ${r.page}: ${failure}`);
    failed = true;
  }
}
for (const offender of threeOffenders) {
  console.error(`THREE.JS outside /konfigurator/: ${offender}`);
  failed = true;
}
for (const offender of loaderOffenders) {
  console.error(`3D LOADER outside /konfigurator/: ${offender}`);
  failed = true;
}
if (!failed) console.log(`All ${rows.length} page(s) within budget; no three.js or 3D loader outside /konfigurator/.`);
process.exitCode = failed ? 1 : 0;
