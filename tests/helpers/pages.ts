// Runner-agnostic helpers for reading dist/ (no vitest or Playwright imports), shared by the
// Vitest `dist` project and the Playwright specs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement } from 'node-html-parser';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DIST = join(ROOT, 'dist');
export const hasDist = existsSync(DIST);

/** `/schreinerschmidt.com/` style base: leading and trailing slash, or `/`. */
export function getBase(): string {
  const raw = (process.env['BASE_PATH'] ?? '/').replace(/^\/+|\/+$/g, '');
  return raw ? `/${raw}/` : '/';
}

/** Demo mode is the default; only an explicit `false` turns it off (see env/audit.env). */
export const isDemo = (): boolean => process.env['PUBLIC_DEMO'] !== 'false';

/** All files below dist/ with the given extension (e.g. `.html`), as absolute paths, sorted. */
export function listFiles(ext: string): string[] {
  if (!hasDist) return [];
  return (readdirSync(DIST, { recursive: true, encoding: 'utf8' }) as string[])
    .filter((f) => f.endsWith(ext))
    .map((f) => join(DIST, f))
    .sort();
}

export const listHtmlFiles = (): string[] => listFiles('.html');

export function parseHtml(html: string): HTMLElement {
  return parse(html, { comment: false });
}

/** Target of a `<meta http-equiv="refresh" content="0; url=…">`, or null when the page has none. */
export function metaRefreshTarget(root: HTMLElement): string | null {
  const meta = root.querySelectorAll('meta').find((m) => m.getAttribute('http-equiv')?.toLowerCase() === 'refresh');
  if (!meta) return null;
  const content = meta.getAttribute('content') ?? '';
  return /url\s*=\s*['"]?([^'";]+)/i.exec(content)?.[1]?.trim() ?? '';
}

export interface DistPage {
  /** Path relative to dist/, with forward slashes (`leistungen/boeden/index.html`). */
  rel: string;
  /** Public URL path including the base (`/schreinerschmidt.com/leistungen/boeden/`). */
  urlPath: string;
  html: string;
  root: HTMLElement;
  /** Meta-refresh target when this is a redirect page. */
  redirectTarget: string | null;
  is404: boolean;
}

export function loadPages(): DistPage[] {
  const base = getBase();
  return listHtmlFiles().map((file) => {
    const rel = file.slice(DIST.length + 1).replaceAll(sep, '/');
    const html = readFileSync(file, 'utf8');
    const root = parseHtml(html);
    const urlPath = rel.endsWith('index.html') ? base + rel.slice(0, -'index.html'.length) : base + rel;
    return { rel, urlPath, html, root, redirectTarget: metaRefreshTarget(root), is404: rel === '404.html' };
  });
}

export const isRedirectPage = (page: DistPage): boolean => page.redirectTarget !== null;

/**
 * Content pages to visit in a browser, as paths relative to the base (`''`, `kontakt/`):
 * every `dist/**\/index.html` except meta-refresh pages. The 404 page is not included.
 */
export function sitePaths(): string[] {
  return loadPages()
    .filter((p) => !isRedirectPage(p) && p.rel.endsWith('index.html'))
    .map((p) => p.rel.slice(0, -'index.html'.length));
}

/** Prefix a site-relative path (`/a/b/` or `a/b/`) with the base. */
export function withBase(path: string): string {
  return getBase() + path.replace(/^\/+/, '');
}

/** Remove the base from a root-relative URL path; returns the input unchanged if it lacks the base. */
export function stripBase(path: string): string {
  const base = getBase();
  return path.startsWith(base) ? path.slice(base.length) : path.replace(/^\/+/, '');
}

/**
 * Why dist/ does not fit the current test env (base path, demo mode), or null when it does.
 * Catches running `test:dist` against an audit build and vice versa, which would otherwise
 * surface as dozens of unrelated base-path and robots failures.
 */
export function distEnvMismatch(): string | null {
  const index = join(DIST, 'index.html');
  if (!existsSync(index)) return null;
  const html = readFileSync(index, 'utf8');
  const root = parseHtml(html);
  const problems: string[] = [];
  const base = getBase();
  const astroPrefix = /["'(\s,](\/[^"'()\s,]*?)_astro\//.exec(html)?.[1];
  if (astroPrefix !== undefined && astroPrefix !== base) {
    problems.push(`dist/ uses base "${astroPrefix}", the test env expects "${base}" (BASE_PATH)`);
  }
  const robots = root.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '';
  if (/noindex/i.test(robots) !== isDemo()) {
    problems.push(`dist/index.html has robots "${robots}", but PUBLIC_DEMO is ${isDemo() ? 'on' : 'off'}`);
  }
  if (problems.length === 0) return null;
  return `${problems.join('; ')}. Use "npm run build" + "npm run test:dist", or "npm run build:audit" + "npm run test:dist:audit".`;
}
