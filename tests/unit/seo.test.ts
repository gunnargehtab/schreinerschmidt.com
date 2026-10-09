import { describe, expect, it, vi } from 'vitest';
import type { ImageMetadata } from 'astro';
import {
  assertDescription,
  buildTitle,
  HOME_TITLE,
  indexing,
  isAlwaysNoindex,
  ogImage,
  ROBOTS_DEMO,
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
} from '../../src/lib/seo';

const SITE = 'https://gunnargehtab.github.io';
const BASE = '/schreinerschmidt.com/';

describe('buildTitle', () => {
  it('appends the brand', () => {
    expect(buildTitle('Parkett & Massivholzdielen in Mannheim')).toBe(
      'Parkett & Massivholzdielen in Mannheim | Schreinerei Schmidt',
    );
  });

  it('uses the fixed home title without a page title', () => {
    expect(buildTitle()).toBe(HOME_TITLE);
    expect(buildTitle('  ')).toBe(HOME_TITLE);
    expect(HOME_TITLE).toBe('Schreinerei Schmidt Mannheim | Möbel, Böden, Treppen');
  });

  it('throws above 60 characters', () => {
    const ok = 'x'.repeat(38);
    expect([...buildTitle(ok)]).toHaveLength(60);
    expect(() => buildTitle(`${ok}y`)).toThrow(/61 characters/);
  });

  it('counts umlauts once', () => {
    expect(() => buildTitle('ä'.repeat(38))).not.toThrow();
  });
});

describe('assertDescription', () => {
  it('accepts 110–158 characters', () => {
    expect(assertDescription('a'.repeat(110))).toHaveLength(110);
    expect(assertDescription(` ${'ü'.repeat(158)} `)).toBe('ü'.repeat(158));
  });

  it('throws outside 110–158', () => {
    expect(() => assertDescription('a'.repeat(109))).toThrow(/109 characters/);
    expect(() => assertDescription('a'.repeat(159))).toThrow(/159 characters/);
  });
});

describe('indexing', () => {
  it('demo: noindex, nofollow, noimageindex and no canonical', () => {
    expect(indexing({ demo: true, pathname: `${BASE}kontakt/`, site: SITE })).toEqual({
      robots: ROBOTS_DEMO,
      canonical: undefined,
      indexable: false,
    });
    expect(ROBOTS_DEMO).toBe('noindex, nofollow, noimageindex');
  });

  it('production: index + self-canonical', () => {
    expect(indexing({ demo: false, pathname: `${BASE}kontakt/`, site: SITE })).toEqual({
      robots: ROBOTS_INDEX,
      canonical: `${SITE}${BASE}kontakt/`,
      indexable: true,
    });
    expect(ROBOTS_INDEX).toBe('index, follow, max-image-preview:large');
  });

  it('production: canonical override (konfigurator deep links)', () => {
    const r = indexing({
      demo: false,
      pathname: `${BASE}konfigurator/tisch/`,
      site: SITE,
      canonicalPath: `${BASE}konfigurator/`,
    });
    expect(r.canonical).toBe(`${SITE}${BASE}konfigurator/`);
  });

  it.each([
    `${BASE}kontakt/danke/`,
    `${BASE}karriere/danke/`,
    `${BASE}404/`,
    `${BASE}404.html`,
    `${BASE}intern/pruefliste/`,
  ])('production: %s is always noindex without canonical', (pathname) => {
    expect(isAlwaysNoindex(pathname)).toBe(true);
    expect(indexing({ demo: false, pathname, site: SITE })).toEqual({
      robots: ROBOTS_NOINDEX,
      canonical: undefined,
      indexable: false,
    });
  });

  it('production: forced noindex', () => {
    expect(indexing({ demo: false, pathname: `${BASE}kontakt/`, site: SITE, noindex: true }).robots).toBe(
      ROBOTS_NOINDEX,
    );
  });

  it('does not treat similar paths as noindex', () => {
    expect(isAlwaysNoindex(`${BASE}referenzen/internationale-kueche/`)).toBe(false);
    expect(isAlwaysNoindex(`${BASE}referenzen/404-projekt/`)).toBe(false);
  });

  it('production without site throws', () => {
    expect(() => indexing({ demo: false, pathname: '/' })).toThrow(/site/);
  });
});

describe('ogImage', () => {
  const src = (width: number, height: number): ImageMetadata => ({ src: '/x.jpg', width, height, format: 'jpg' });
  const fakeGetImage = vi.fn(async (options: { width: number; height: number }) => ({
    src: `${BASE}_astro/hero.${options.width}x${options.height}.jpg`,
  }));

  it('requests a 1200×630 cover JPEG and returns an absolute URL', async () => {
    const og = await ogImage(fakeGetImage as never, { src: src(2400, 1600), alt: 'Eichentreppe', site: SITE });
    expect(fakeGetImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1200, height: 630, fit: 'cover', format: 'jpg', quality: 80 }),
    );
    expect(og).toEqual({
      url: `${SITE}${BASE}_astro/hero.1200x630.jpg`,
      width: 1200,
      height: 630,
      alt: 'Eichentreppe',
      type: 'image/jpeg',
    });
  });

  it('does not upscale small sources', async () => {
    const og = await ogImage(fakeGetImage as never, { src: src(800, 600), alt: 'Haustür', site: SITE });
    expect(og.width).toBe(800);
    expect(og.height).toBe(420);
  });

  it('requires alt text', async () => {
    await expect(ogImage(fakeGetImage as never, { src: src(2400, 1600), alt: ' ', site: SITE })).rejects.toThrow(/alt/);
  });
});
