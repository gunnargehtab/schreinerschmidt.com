import { expect, it } from 'vitest';
import { ROBOTS_NOINDEX, isAlwaysNoindex } from '../../src/lib/seo';
import { describeDist, isDemo, isRedirectPage, loadPages } from '../helpers/dist';

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
