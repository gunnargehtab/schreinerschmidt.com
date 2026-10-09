// Lighthouse gate on the audit build (docs/architecture.md §11, docs/plan.md §10.3).
// - expects `npm run build:audit` (BASE_PATH=/, production robots/canonical) in dist/
// - serves dist/ with scripts/serve-dist.mjs and env/audit.env on PORT (default 4173)
// - mobile (Lighthouse default), 3 runs per URL; gates on the median of each score and metric
// - URLs: every dist/**/index.html except meta-refresh pages
// - writes the representative median run per URL as HTML + JSON, plus summary.json, to
//   lighthouse-reports/; exits 1 when a target is missed
// Chrome: CHROME_PATH, else a system Chrome, else Playwright's Chromium (PLAYWRIGHT_BROWSERS_PATH).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse, { generateReport } from 'lighthouse';
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'lighthouse-reports');
const RUNS = Number(process.env['LH_RUNS'] ?? 3);
const PORT = Number(process.env['PORT'] ?? 4173);
const AUDIT_ENV = parseEnv(readFileSync(join(ROOT, 'env/audit.env'), 'utf8'));
const trimmed = (AUDIT_ENV['BASE_PATH'] ?? '/').replace(/^\/+|\/+$/g, '');
const BASE = trimmed ? `/${trimmed}/` : '/';
const ORIGIN = `http://localhost:${PORT}`;

/** @typedef {{ performance: number, accessibility: number, 'best-practices': number, seo: number, lcp: number, cls: number, tbt: number }} Targets */

/** Scores in 0–100; LCP and TBT in ms; CLS unitless. */
/** @type {Targets} */
const DEFAULT_TARGETS = {
  performance: 95,
  accessibility: 100,
  'best-practices': 95,
  seo: 95,
  lcp: 2000,
  cls: 0.02,
  tbt: 100,
};
/** Per-route overrides; the first match on the path below the base wins. */
/** @type {{ match: RegExp, targets: Partial<Targets> }[]} */
const ROUTE_TARGETS = [{ match: /^konfigurator\//, targets: { performance: 85 } }];

const CATEGORIES = /** @type {const} */ (['performance', 'accessibility', 'best-practices', 'seo']);
const METRICS = /** @type {const} */ ({
  lcp: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbt: 'total-blocking-time',
});
/** Higher is better for scores; lower is better for metrics. */
/** @param {keyof Targets} key */
const isScore = (key) => /** @type {readonly string[]} */ (CATEGORIES).includes(key);

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? NaN) : ((sorted[mid - 1] ?? NaN) + (sorted[mid] ?? NaN)) / 2;
}

/** Content pages below the base, e.g. `''`, `kontakt/`; meta-refresh pages are skipped. */
function routes() {
  return /** @type {string[]} */ (readdirSync(DIST, { recursive: true, encoding: 'utf8' }))
    .map((f) => f.replaceAll(sep, '/'))
    .filter((f) => f === 'index.html' || f.endsWith('/index.html'))
    .filter((f) => !/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(readFileSync(join(DIST, f), 'utf8')))
    .map((f) => f.slice(0, -'index.html'.length))
    .sort();
}

/** Refuse to audit a Pages build: noindex and the dotted base would skew SEO and URLs. */
function assertAuditBuild() {
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) throw new Error('dist/ not found. Run "npm run build:audit" first.');
  const html = readFileSync(index, 'utf8');
  const prefix = /["'(\s,](\/[^"'()\s,]*?)_astro\//.exec(html)?.[1];
  const noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
  if (noindex || (prefix !== undefined && prefix !== BASE)) {
    throw new Error('dist/ is not an audit build (noindex or wrong base). Run "npm run build:audit" first.');
  }
}

async function isUp() {
  try {
    await fetch(`${ORIGIN}${BASE}`, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/** Chrome for Lighthouse: CHROME_PATH or a system install (chrome-launcher), else Playwright's. */
async function chromePath() {
  if (process.env['CHROME_PATH']) return process.env['CHROME_PATH'];
  try {
    if (chromeLauncher.Launcher.getInstallations().length > 0) return undefined;
  } catch {
    // No system Chrome; fall through.
  }
  const { chromium } = await import('@playwright/test');
  const path = chromium.executablePath();
  if (existsSync(path)) return path;
  throw new Error('No Chrome found. Set CHROME_PATH or run "npx playwright install chromium".');
}

/** @param {string} route */
const slug = (route) => (route === '' ? 'home' : route.replace(/\/+$/, '').replaceAll('/', '_'));
/** @param {number} value @param {keyof Targets} key */
const fmt = (value, key) =>
  Number.isNaN(value)
    ? 'n/a'
    : isScore(key)
      ? String(Math.round(value))
      : key === 'cls'
        ? value.toFixed(3)
        : `${Math.round(value)} ms`;

/** @type {import('node:child_process').ChildProcess | null} */
let server = null;
/** @type {chromeLauncher.LaunchedChrome | null} */
let chrome = null;
let exitCode = 0;

try {
  assertAuditBuild();
  const pages = routes();
  if (pages.length === 0) throw new Error('No pages found in dist/.');
  if (await isUp()) throw new Error(`Port ${PORT} is busy. Stop the other server or set PORT.`);

  server = spawn(process.execPath, [join(ROOT, 'scripts/serve-dist.mjs')], {
    env: { ...process.env, ...AUDIT_ENV, BASE_PATH: BASE, PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const deadline = Date.now() + 15_000;
  while (!(await isUp())) {
    if (server.exitCode !== null) throw new Error(`serve-dist exited early with code ${server.exitCode}`);
    if (Date.now() > deadline) throw new Error(`serve-dist did not answer on ${ORIGIN}${BASE}`);
    await sleep(200);
  }

  const path = await chromePath();
  const chromeFlags = [
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    ...(process.env['CI'] ? ['--no-sandbox'] : []),
  ];
  chrome = await chromeLauncher.launch({ chromeFlags, ...(path ? { chromePath: path } : {}) });
  console.log(`Lighthouse ${RUNS}x per URL, mobile, ${pages.length} URL(s), Chrome: ${path ?? 'system'}`);

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  /** @type {{ url: string, values: Record<keyof Targets, number>, misses: string[], report: string }[]} */
  const results = [];
  for (const route of pages) {
    const url = `${ORIGIN}${BASE}${route}`;
    /** @type {import('lighthouse').Result[]} */
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: [...CATEGORIES],
      });
      if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
      if (result.lhr.runtimeError)
        throw new Error(`${url}: ${result.lhr.runtimeError.code} ${result.lhr.runtimeError.message}`);
      runs.push(result.lhr);
    }

    /** @type {Record<keyof Targets, number>} */
    const values = {
      performance: median(runs.map((r) => (r.categories['performance']?.score ?? NaN) * 100)),
      accessibility: median(runs.map((r) => (r.categories['accessibility']?.score ?? NaN) * 100)),
      'best-practices': median(runs.map((r) => (r.categories['best-practices']?.score ?? NaN) * 100)),
      seo: median(runs.map((r) => (r.categories['seo']?.score ?? NaN) * 100)),
      lcp: median(runs.map((r) => r.audits[METRICS.lcp]?.numericValue ?? NaN)),
      cls: median(runs.map((r) => r.audits[METRICS.cls]?.numericValue ?? NaN)),
      tbt: median(runs.map((r) => r.audits[METRICS.tbt]?.numericValue ?? NaN)),
    };
    const targets = { ...DEFAULT_TARGETS, ...ROUTE_TARGETS.find((r) => r.match.test(route))?.targets };
    const misses = /** @type {(keyof Targets)[]} */ (Object.keys(targets))
      .filter(
        (key) => Number.isNaN(values[key]) || (isScore(key) ? values[key] < targets[key] : values[key] > targets[key]),
      )
      .map((key) => `${key} ${fmt(values[key], key)} (target ${isScore(key) ? '≥' : '≤'} ${fmt(targets[key], key)})`);

    const representative = computeMedianRun(runs);
    const name = slug(route);
    writeFileSync(join(OUT, `${name}.report.json`), generateReport(representative, 'json'));
    writeFileSync(join(OUT, `${name}.report.html`), generateReport(representative, 'html'));
    results.push({ url, values, misses, report: `${name}.report.html` });

    const summary = /** @type {(keyof Targets)[]} */ (Object.keys(values)).map((k) => `${k} ${fmt(values[k], k)}`);
    console.log(`${misses.length ? 'MISS' : 'ok  '} ${url}  ${summary.join(' · ')}`);
    for (const miss of misses) console.error(`     ${miss}`);
    if (misses.length) exitCode = 1;
  }

  writeFileSync(
    join(OUT, 'summary.json'),
    `${JSON.stringify({ runs: RUNS, targets: DEFAULT_TARGETS, results }, null, 2)}\n`,
  );
  console.log(`Reports: ${OUT}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  try {
    chrome?.kill();
  } catch {
    // Windows sometimes fails to remove Chrome's temp profile; not a test failure.
  }
  if (server && server.exitCode === null) {
    const exited = new Promise((done) => server?.once('exit', done));
    server.kill();
    await exited;
  }
}
process.exitCode = exitCode;
