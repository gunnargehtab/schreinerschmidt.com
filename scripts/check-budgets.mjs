// Per-page transfer budgets for dist/ (docs/architecture.md §11, CLAUDE.md "Budgets").
// Sizes are gzip (level 9) for HTML, CSS and JS; fonts and images count raw bytes, because
// woff2/AVIF/WebP are already compressed and GitHub Pages serves them as is.
//
// - HTML: the page file.
// - CSS: inline <style> blocks + linked stylesheets.
// - JS: inline executable scripts + <script src> + modulepreloads + their static import graph.
//   Dynamic import() targets are excluded (loaded on request), except for the three.js check.
// - Fonts: files every page loads: <link rel=preload as=font> + @font-face sources without a
//   unicode-range. Faces limited by unicode-range (latin-ext) only load for those characters.
// - LCP image: first img[fetchpriority=high]; the candidate a browser picks at a 1280 px wide
//   viewport (DPR 1) from the first <source> of its <picture> (AVIF), else from the img itself.
// - three.js: no JS reachable from a page outside /konfigurator/ (static or dynamic) may contain it.
//
// Usage: node scripts/check-budgets.mjs  (reads BASE_PATH, falls back to env/pages.env)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
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
 * Add the configurator budgets here (13 KB initial JS, docs/configurator.md).
 * @type {{ match: RegExp, budget: Partial<Budget> }[]}
 */
const ROUTE_BUDGETS = [];

/** Pages that may load three.js. */
const THREE_ALLOWED = /^konfigurator\//;
/** Strings that survive minification of three.js (`__THREE__` global, renderer and core class names). */
const THREE_SIGNATURE = /__THREE__|WebGLRenderer|BufferGeometry|MeshStandardMaterial/;

const LCP_VIEWPORT = 1280;
const LCP_DPR = 1;
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
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

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
 */
function moduleGraph(entries, dynamic) {
  const seen = new Set(entries);
  const queue = [...entries];
  for (let file = queue.shift(); file; file = queue.shift()) {
    const code = read(file);
    const refs = [...code.matchAll(STATIC_IMPORT)].map((m) => m[1] ?? '');
    if (dynamic) refs.push(...[...code.matchAll(DYNAMIC_IMPORT)].map((m) => m[1] ?? ''));
    for (const ref of refs) {
      const dep = toDistFile(ref, urlPathOf(file));
      if (dep && dep.endsWith('.js') && !seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...seen];
}

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
 * @param {import('node-html-parser').HTMLElement} root
 * @param {string} pageUrl
 */
function lcpImage(root, pageUrl) {
  const img = root.querySelector('img[fetchpriority="high"]');
  if (!img) return null;
  const picture = img.parentNode?.tagName === 'PICTURE' ? img.parentNode : null;
  const source = picture?.querySelectorAll('source').find((s) => !s.getAttribute('media')) ?? null;
  const from = source ?? img;
  const srcset = from.getAttribute('srcset');
  const sizes = from.getAttribute('sizes') ?? img.getAttribute('sizes');
  const needed = slotWidth(sizes, LCP_VIEWPORT) * LCP_DPR;
  const url = srcset ? pickCandidate(srcset, needed) : img.getAttribute('src');
  const file = url ? toDistFile(url, pageUrl) : null;
  return { url: url ?? '(none)', bytes: file ? statSync(file).size : 0, missing: !file };
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
  }

  // Fonts
  const fonts = pageFonts(root, pageUrl, css);
  const fontBytes = fonts.reduce((sum, f) => sum + statSync(f).size, 0);

  // LCP image
  const lcp = lcpImage(root, pageUrl);
  if (lcp?.missing) notes.push(`LCP candidate not found in dist: ${lcp.url}`);
  else if (lcp) notes.push(`LCP ${lcp.url.slice(lcp.url.lastIndexOf('/') + 1)}`);

  const values = {
    html: kb(gz(html)),
    css: kb(cssBytes),
    js: kb(jsBytes),
    fonts: kb(fontBytes),
    lcp: kb(lcp?.bytes ?? 0),
  };
  const failures = /** @type {(keyof Budget)[]} */ (Object.keys(values))
    .filter((key) => values[key] > budget[key])
    .map((key) => `${key} ${values[key].toFixed(1)} KB > ${budget[key]} KB`);
  if (lcp?.missing) failures.push('LCP candidate missing');
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
  `Budgets (gz for HTML/CSS/JS, raw for fonts/LCP image; LCP at ${LCP_VIEWPORT} px, DPR ${LCP_DPR}), base ${BASE}`,
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
if (!failed) console.log(`All ${rows.length} page(s) within budget; no three.js outside /konfigurator/.`);
process.exitCode = failed ? 1 : 0;
