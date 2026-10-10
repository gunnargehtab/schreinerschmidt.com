import { expect, it } from 'vitest';
import { describeDist, isRedirectPage, loadPages, type DistPage } from '../helpers/dist';

// Cascade layers are ordered by their FIRST appearance in the page's CSS. global.css opens with the
// layer statement, but Astro orders a page's stylesheets by cumulative import index
// (docs/design-system.md §4): a component stylesheet that lands ahead of global.css declares its
// layer first and demotes it (e.g. `components` below `reset`), which silently breaks colours.
const EXPECTED = ['reset', 'tokens', 'base', 'layout', 'components', 'utilities', 'motion'];

const pages = loadPages().filter((p) => !isRedirectPage(p));

/** Every stylesheet of the page in document order (build.inlineStylesheets: 'always'). */
const pageCss = (page: DistPage): string =>
  page.root
    .querySelectorAll('style')
    .map((s) => s.rawText)
    .join('\n');

/** Top-level layer names in order of first appearance (`@layer a, b;` and `@layer a.b {`). */
export function layerOrder(css: string): string[] {
  const order: string[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/@layer\s+([^{;]+)[{;]/g)) {
    for (const raw of (m[1] ?? '').split(',')) {
      const name = raw.trim().split('.')[0] ?? '';
      if (name && !order.includes(name)) order.push(name);
    }
  }
  return order;
}

describeDist('Cascade layer order', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: layers first appear in the design-system order', (_rel, page) => {
    // Layers of other origins (Astro's responsive-image `astro` layer) may follow, never precede.
    expect(layerOrder(pageCss(page)).slice(0, EXPECTED.length)).toEqual(EXPECTED);
  });
});
