import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DIST, describeDist, getBase, listFiles, loadPages, stripBase } from '../helpers/dist';

const pages = loadPages();
const base = getBase();

const URL_ATTRIBUTES = ['href', 'src', 'srcset', 'imagesrcset', 'poster', 'action', 'content'];

/** URL candidates in an attribute; `srcset` holds comma-separated `url descriptor` pairs. */
function urlsIn(attribute: string, value: string): string[] {
  if (attribute === 'srcset' || attribute === 'imagesrcset') {
    return value
      .split(',')
      .map((part) => part.trim().split(/\s+/)[0] ?? '')
      .filter(Boolean);
  }
  return [value.trim()];
}

/** Root-relative means a single leading slash; `//host` is protocol-relative and handled separately. */
const isRootRelative = (u: string): boolean => u.startsWith('/') && !u.startsWith('//');

describeDist('base path', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: no root-relative URL lacks the base', (_rel, page) => {
    const offenders: string[] = [];
    for (const el of page.root.querySelectorAll('*')) {
      for (const attr of URL_ATTRIBUTES) {
        const value = el.getAttribute(attr);
        if (!value) continue;
        for (const u of urlsIn(attr, value)) {
          if (isRootRelative(u) && !u.startsWith(base)) offenders.push(`<${el.tagName.toLowerCase()} ${attr}="${u}">`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: no protocol-relative URL', (_rel, page) => {
    const offenders: string[] = [];
    for (const el of page.root.querySelectorAll('*')) {
      for (const attr of URL_ATTRIBUTES) {
        const value = el.getAttribute(attr);
        if (value && urlsIn(attr, value).some((u) => u.startsWith('//'))) offenders.push(`${attr}="${value}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: speculation rules use the base', (_rel, page) => {
    for (const script of page.root.querySelectorAll('script[type="speculationrules"]')) {
      const patterns = [...script.rawText.matchAll(/"href_matches":"([^"]*)"/g)].map((m) => m[1] ?? '');
      expect(patterns.length).toBeGreaterThan(0);
      for (const pattern of patterns) expect(pattern.startsWith(base), pattern).toBe(true);
    }
  });
});

describeDist('fonts', () => {
  const FONT_URL = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/g;
  const isFont = (u: string): boolean => /\.(woff2?|ttf|otf|eot)(?:[?#].*)?$/i.test(u);

  /** Font URLs from preload links, inline `<style>` and built stylesheets. */
  function fontReferences(): { source: string; url: string }[] {
    const refs: { source: string; url: string }[] = [];
    for (const page of pages) {
      for (const link of page.root.querySelectorAll('link')) {
        const href = link.getAttribute('href');
        if (href && (link.getAttribute('as') === 'font' || isFont(href))) refs.push({ source: page.rel, url: href });
      }
      for (const style of page.root.querySelectorAll('style')) {
        for (const m of style.rawText.matchAll(FONT_URL)) {
          if (m[1] && isFont(m[1])) refs.push({ source: page.rel, url: m[1] });
        }
      }
    }
    for (const css of listFiles('.css')) {
      for (const m of readFileSync(css, 'utf8').matchAll(FONT_URL)) {
        if (m[1] && isFont(m[1])) refs.push({ source: css.slice(DIST.length + 1), url: m[1] });
      }
    }
    return refs;
  }

  it('only references .woff2 files', () => {
    const refs = fontReferences();
    expect(refs.filter((r) => !/\.woff2(?:[?#].*)?$/i.test(r.url))).toEqual([]);
  });

  it('references root-relative font files only with the base, and they exist', () => {
    for (const { source, url } of fontReferences()) {
      if (!isRootRelative(url)) continue;
      expect(url.startsWith(base), `${source}: ${url}`).toBe(true);
      expect(existsSync(join(DIST, stripBase(url.replace(/[?#].*$/, '')))), `${source}: ${url} exists`).toBe(true);
    }
  });
});
