import { describe, expect, it } from 'vitest';
import { createLinker } from '../../src/lib/url';

describe.each([
  ['/schreinerschmidt.com/', '/schreinerschmidt.com/'],
  ['/schreinerschmidt.com', '/schreinerschmidt.com/'],
  ['/', '/'],
])('createLinker(%j)', (base, root) => {
  const { url, asset, absolute, root: linkerRoot } = createLinker(base);

  it('normalises the root to end with a slash', () => {
    expect(linkerRoot).toBe(root);
  });

  it('url("") and url("/") are the root', () => {
    expect(url('')).toBe(root);
    expect(url()).toBe(root);
    expect(url('/')).toBe(root);
  });

  it('strips leading slashes', () => {
    expect(url('/kontakt/')).toBe(`${root}kontakt/`);
    expect(url('kontakt/')).toBe(`${root}kontakt/`);
  });

  it('adds a trailing slash to pages', () => {
    expect(url('kontakt')).toBe(`${root}kontakt/`);
    expect(url('/leistungen/boeden')).toBe(`${root}leistungen/boeden/`);
    expect(url('/leistungen/boeden/')).toBe(`${root}leistungen/boeden/`);
  });

  it('keeps query and hash', () => {
    expect(url('/kontakt?x=1')).toBe(`${root}kontakt/?x=1`);
    expect(url('/kontakt#formular')).toBe(`${root}kontakt/#formular`);
    expect(url('/kontakt/?x=1&y=2#formular')).toBe(`${root}kontakt/?x=1&y=2#formular`);
    expect(url('#main')).toBe(`${root}#main`);
    expect(url('?q=1')).toBe(`${root}?q=1`);
  });

  it.each(['https://example.com/', 'http://example.com', '//example.com/x', 'mailto:a@b.de', 'tel:+49621000'])(
    'throws for external URL %s',
    (external) => {
      expect(() => url(external)).toThrow(/internal paths only/);
    },
  );

  it('asset() prefixes the base and never adds a trailing slash', () => {
    expect(asset('/fonts/a.woff2')).toBe(`${root}fonts/a.woff2`);
    expect(asset('fonts/a.woff2')).toBe(`${root}fonts/a.woff2`);
    expect(asset('favicon.svg')).toBe(`${root}favicon.svg`);
    expect(asset('/img/hero')).toBe(`${root}img/hero`);
  });

  it('absolute() resolves against the site', () => {
    expect(absolute(url('kontakt'), 'https://example.com')).toBe(`https://example.com${root}kontakt/`);
    expect(absolute(url('kontakt'), new URL('https://example.com'))).toBe(`https://example.com${root}kontakt/`);
  });
});
