import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { legacyRedirects as rawRedirects } from '../../src/data/redirects.mjs';
import { DIST, describeDist, getBase, isRedirectPage, loadPages, stripBase, withBase } from '../helpers/dist';

const legacyRedirects = rawRedirects as unknown as [string, string][];
const internal = legacyRedirects.filter(([, to]) => !isExternal(to));
const pages = loadPages();
const base = getBase();

/** `/leistungen/boden/` -> `leistungen/boden`, accepting paths with or without the base. */
function clean(path: string): string {
  return stripBase(path.replace(/[?#].*$/, '')).replace(/^\/+|\/+$/g, '');
}

function isExternal(u: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(u);
}

const isFile = (path: string): boolean => /\.[a-z0-9]+$/i.test(path.split('/').pop() ?? '');

/** dist file backing a public path: `a/b` -> `a/b/index.html`; `a.html` stays. */
const distFile = (path: string): string => (isFile(path) ? join(DIST, path) : join(DIST, path, 'index.html'));

/** dist page generated for a legacy path (`/leistungen/boden` -> `leistungen/boden/index.html`). */
const pageFor = (from: string) => {
  const fromClean = clean(from);
  return pages.find((p) => p.rel === (isFile(fromClean) ? fromClean : `${fromClean}/index.html`));
};

const metaContent = (page: (typeof pages)[number], name: string): string | undefined =>
  page.root.querySelector(`meta[name="${name}"]`)?.getAttribute('content');

describeDist('legacy redirects', () => {
  it('has redirect entries', () => {
    expect(legacyRedirects.length).toBeGreaterThan(0);
  });

  it('every entry is unique and site-relative', () => {
    const froms = legacyRedirects.map(([from]) => clean(from));
    expect(new Set(froms).size).toBe(froms.length);
    for (const [from] of legacyRedirects) expect(from, from).toMatch(/^\/[^/]/);
  });

  it.each(internal)('%s -> %s: target exists in dist', (_from, to) => {
    expect(existsSync(distFile(clean(to))), `dist file for ${to}`).toBe(true);
  });

  it.each(internal)('%s -> %s: redirect page meta-refreshes to the base-prefixed target', (from, to) => {
    const page = pageFor(from);
    expect(page, `redirect page for ${from}`).toBeDefined();
    const target = clean(to);
    const suffix = /[?#].*$/.exec(to)?.[0] ?? '';
    const expected = withBase(isFile(target) || target === '' ? target : `${target}/`) + suffix;
    expect(page?.redirectTarget).toBe(expected);
    // The visible fallback link points to the same place.
    expect(page?.root.querySelector('main a')?.getAttribute('href')).toBe(expected);
  });

  it('every redirect page in dist comes from legacyRedirects', () => {
    const expected = new Set(legacyRedirects.map(([from]) => pageFor(from)?.rel));
    const stray = pages.filter(isRedirectPage).filter((p) => !expected.has(p.rel));
    expect(stray.map((p) => p.rel)).toEqual([]);
  });
});

describeDist('redirect pages', () => {
  const redirects = pages.filter(isRedirectPage);
  const each = redirects.map((p) => [p.rel, p] as const);

  it('exist', () => {
    expect(redirects.length).toBeGreaterThan(0);
  });

  it.each(each)('%s: refreshes to an existing, base-prefixed page', (_rel, page) => {
    const target = page.redirectTarget ?? '';
    expect(target.startsWith(base), `${target} starts with ${base}`).toBe(true);
    expect(existsSync(distFile(clean(target))), `dist file for ${target}`).toBe(true);
  });

  it.each(each)('%s: has a 0-second delay', (_rel, page) => {
    const meta = page.root
      .querySelectorAll('meta')
      .find((m) => m.getAttribute('http-equiv')?.toLowerCase() === 'refresh');
    expect(meta?.getAttribute('content')).toMatch(/^\s*0\s*[;,]/);
  });

  it.each(each)('%s: html[lang="de"], <meta charset="utf-8"> first in <head>', (_rel, page) => {
    expect(page.root.querySelector('html')?.getAttribute('lang')).toBe('de');
    expect(page.html.startsWith('<!DOCTYPE html>'), 'uppercase doctype first').toBe(true);
    const first = page.root.querySelector('head')?.childNodes.find((n) => n.nodeType === 1);
    expect(first?.toString().toLowerCase()).toMatch(/^<meta charset="?utf-8"?\s*\/?>$/);
  });

  it.each(each)('%s: noindex in every mode and no canonical', (_rel, page) => {
    expect(metaContent(page, 'robots')).toMatch(/\bnoindex\b/);
    expect(page.root.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it.each(each)('%s: German title and body copy', (_rel, page) => {
    expect(page.root.querySelector('title')?.text.trim()).toBe('Seite umgezogen | Schreinerei Schmidt');
    expect(page.root.querySelectorAll('h1')).toHaveLength(1);
    expect(page.root.querySelector('h1')?.text.trim()).toBe('Diese Seite ist umgezogen.');
    expect(page.root.querySelector('main a')?.text.trim()).toMatch(/^Weiter zu /);
  });

  it.each(each)('%s: no scripts, and any CSP meta directly follows <meta charset>', (_rel, page) => {
    expect(page.root.querySelectorAll('script')).toHaveLength(0);
    const csp = [...page.html.matchAll(/<meta\b[^>]*\shttp-equiv\s*=\s*["']?content-security-policy\b/gi)];
    expect(csp.length, 'at most one CSP meta').toBeLessThanOrEqual(1);
    const [meta] = csp;
    if (!meta) return;
    const charset = /<meta\s+charset\s*=[^>]*>/i.exec(page.html);
    expect(charset, '<meta charset>').not.toBeNull();
    expect(meta.index).toBe((charset?.index ?? 0) + (charset?.[0].length ?? 0));
  });
});
