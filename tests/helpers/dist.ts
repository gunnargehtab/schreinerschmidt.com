import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type HTMLElement } from 'node-html-parser';
import { describe } from 'vitest';

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

/** Like `describe`, but skipped with a clear message when dist/ has not been built. */
export function describeDist(name: string, fn: () => void): void {
  if (hasDist) describe(name, fn);
  else describe.skip(`${name} [skipped: dist/ not found, run "npm run build" first]`, fn);
}

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

/** Prefix a site-relative path (`/a/b/` or `a/b/`) with the base. */
export function withBase(path: string): string {
  return getBase() + path.replace(/^\/+/, '');
}

/** Remove the base from a root-relative URL path; returns the input unchanged if it lacks the base. */
export function stripBase(path: string): string {
  const base = getBase();
  return path.startsWith(base) ? path.slice(base.length) : path.replace(/^\/+/, '');
}

export const sha256 = (code: string): string =>
  `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`;

/** Parse a CSP header/meta value into `{ directive: [sources…] }`. */
export function parseCsp(content: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of content.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name.toLowerCase()] = sources;
  }
  return out;
}

export function cspOf(root: HTMLElement): Record<string, string[]> | null {
  const meta = root
    .querySelectorAll('meta')
    .find((m) => m.getAttribute('http-equiv')?.toLowerCase() === 'content-security-policy');
  return meta ? parseCsp(meta.getAttribute('content') ?? '') : null;
}
