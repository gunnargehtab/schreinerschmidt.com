import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ROBOTS_NOINDEX, isAlwaysNoindex } from '../../src/lib/seo';
import { DIST, describeDist, getBase, isDemo, isRedirectPage, loadPages, stripBase } from '../helpers/dist';

const pages = loadPages().filter((p) => !isRedirectPage(p));

const robotsOf = (root: (typeof pages)[number]['root']): string =>
  root.querySelector('meta[name="robots"]')?.getAttribute('content')?.toLowerCase() ?? '';

describeDist('page basics', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.some((p) => p.rel === 'index.html')).toBe(true);
    expect(pages.some((p) => p.is404)).toBe(true);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: exactly one h1', (_rel, page) => {
    expect(page.root.querySelectorAll('h1')).toHaveLength(1);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: html[lang="de"]', (_rel, page) => {
    expect(page.root.querySelector('html')?.getAttribute('lang')).toBe('de');
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: has a non-empty title', (_rel, page) => {
    expect(page.root.querySelector('title')?.text.trim()).toBeTruthy();
  });

  it('titles are unique', () => {
    const titles = pages.map((p) => p.root.querySelector('title')?.text.trim() ?? '');
    const duplicates = titles.filter((t, i) => titles.indexOf(t) !== i);
    expect(duplicates).toEqual([]);
  });
});

describeDist('robots and canonical', () => {
  const demo = isDemo();

  it.each(pages.filter((p) => !p.is404).map((p) => [p.rel, p] as const))(
    `%s: robots and canonical match the mode (PUBLIC_DEMO ${demo ? 'on' : 'off'})`,
    (_rel, page) => {
      const robots = robotsOf(page.root);
      const canonical = page.root.querySelector('link[rel="canonical"]');
      if (demo) {
        expect(robots).toContain('noindex');
        expect(canonical).toBeNull();
      } else if (isAlwaysNoindex(page.urlPath)) {
        // Danke pages (and /intern/, absent in production): the same rule as Seo.astro (src/lib/seo.ts).
        expect(robots).toBe(ROBOTS_NOINDEX);
        expect(canonical).toBeNull();
      } else {
        expect(robots).not.toContain('noindex');
        expect(canonical?.getAttribute('href')).toMatch(/^https?:\/\//);
      }
    },
  );

  it('404.html is always noindex and has no canonical', () => {
    const page = pages.find((p) => p.is404);
    expect(page, '404.html').toBeDefined();
    if (!page) return;
    expect(robotsOf(page.root)).toContain('noindex');
    expect(page.root.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

describeDist('og:image', () => {
  // Every page that is not always-noindex carries an absolute og:image under site + base whose
  // file exists in dist/. (Legal, danke, 404 and /intern/ use the default image too, see src/lib/og-default.ts.)
  const shared = pages.filter((p) => !isAlwaysNoindex(p.urlPath) && !p.is404);

  it.each(shared.map((p) => [p.rel, p] as const))('%s: og:image is absolute and exists in dist', (_rel, page) => {
    const content = page.root.querySelector('meta[property="og:image"]')?.getAttribute('content');
    expect(content, 'og:image').toBeTruthy();
    const image = new URL(content ?? '');
    expect(image.protocol).toMatch(/^https?:$/);
    expect(image.pathname.startsWith(getBase())).toBe(true);
    expect(existsSync(join(DIST, stripBase(image.pathname))), image.pathname).toBe(true);
    expect(page.root.querySelector('meta[property="og:image:alt"]')?.getAttribute('content')).toBeTruthy();
  });
});
