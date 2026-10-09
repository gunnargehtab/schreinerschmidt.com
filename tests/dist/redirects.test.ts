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

describeDist('legacy redirects', () => {
  it('has redirect entries', () => {
    expect(legacyRedirects.length).toBeGreaterThan(0);
  });

  it.each(internal)('%s -> %s: target exists in dist', (_from, to) => {
    expect(existsSync(distFile(clean(to))), `dist file for ${to}`).toBe(true);
  });

  it.each(internal)('%s -> %s: redirect page meta-refreshes to the base-prefixed target', (from, to) => {
    const fromClean = clean(from);
    const page = pages.find((p) => p.rel === (isFile(fromClean) ? fromClean : `${fromClean}/index.html`));
    expect(page, `redirect page for ${from}`).toBeDefined();
    const target = clean(to);
    const suffix = /[?#].*$/.exec(to)?.[0] ?? "";
    expect(page?.redirectTarget).toBe(withBase(isFile(target) ? target : `${target}/`) + suffix);
  });
});

describeDist('redirect pages', () => {
  const redirects = pages.filter(isRedirectPage);

  it.each(redirects.map((p) => [p.rel, p] as const))('%s: refreshes to an existing, base-prefixed page', (_rel, page) => {
    const target = page.redirectTarget ?? '';
    expect(target.startsWith(base), `${target} starts with ${base}`).toBe(true);
    expect(existsSync(distFile(clean(target))), `dist file for ${target}`).toBe(true);
  });

  it.each(redirects.map((p) => [p.rel, p] as const))('%s: has a 0-second delay', (_rel, page) => {
    const meta = page.root
      .querySelectorAll('meta')
      .find((m) => m.getAttribute('http-equiv')?.toLowerCase() === 'refresh');
    expect(meta?.getAttribute('content')).toMatch(/^\s*0\s*[;,]/);
  });
});
