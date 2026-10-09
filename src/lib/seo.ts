// SEO helpers (docs/architecture.md §7, docs/plan.md §1.2 and §7). Build-time only.
import type { getImage as astroGetImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

export const SITE_NAME = 'Schreinerei Schmidt';
export const TITLE_SEPARATOR = ' | ';
export const HOME_TITLE = 'Schreinerei Schmidt Mannheim | Möbel, Böden, Treppen';
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 110;
export const DESCRIPTION_MAX = 158;
export const OG_LOCALE = 'de_DE';
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Length in code points, so "ä" or "–" count once. */
const length = (s: string): number => [...s].length;

/**
 * `${title} | Schreinerei Schmidt`, at most 60 characters. Without a title (Home) the fixed
 * home title is used. Throws when the result is too long, so overlong titles fail the build.
 */
export function buildTitle(title?: string): string {
  const page = title?.trim();
  const full = page ? `${page}${TITLE_SEPARATOR}${SITE_NAME}` : HOME_TITLE;
  if (length(full) > TITLE_MAX) {
    throw new Error(
      `SEO title is ${length(full)} characters (max ${TITLE_MAX}, so the page part may have at most ` +
        `${TITLE_MAX - length(TITLE_SEPARATOR + SITE_NAME)}): "${full}"`,
    );
  }
  return full;
}

/** Throws unless the description is 110–158 characters. Returns it trimmed. */
export function assertDescription(description: string): string {
  const text = description.trim();
  const n = length(text);
  if (n < DESCRIPTION_MIN || n > DESCRIPTION_MAX) {
    throw new Error(`SEO description is ${n} characters (needs ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}): "${text}"`);
  }
  return text;
}

export const ROBOTS_DEMO = 'noindex, nofollow, noimageindex';
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large';
export const ROBOTS_NOINDEX = 'noindex, follow';

/** Danke pages, the 404 and `/intern/…` are never indexed, whatever the build mode. */
export function isAlwaysNoindex(pathname: string): boolean {
  return (
    /\/danke\/?$/.test(pathname) || /(?:^|\/)intern(?:\/|$)/.test(pathname) || /\/404(?:\.html|\/)?$/.test(pathname)
  );
}

export interface IndexingInput {
  /** `PUBLIC_DEMO` from astro:env. */
  demo: boolean;
  /** `Astro.url.pathname` (includes the base). */
  pathname: string;
  /** `Astro.site`; required for production builds (canonical). */
  site?: URL | string | undefined;
  /** Force noindex for this page. */
  noindex?: boolean | undefined;
  /** Canonical target pathname incl. base, if not the page itself (e.g. `/konfigurator/[typ]/`). */
  canonicalPath?: string | undefined;
}

export interface Indexing {
  robots: string;
  /** Absolute canonical URL; only in production on indexable pages. */
  canonical: string | undefined;
  indexable: boolean;
}

/**
 * Demo: `noindex, nofollow, noimageindex`, no canonical.
 * Production: `index, follow, max-image-preview:large` + self-canonical; forced/always-noindex
 * pages get `noindex, follow` and no canonical.
 */
export function indexing({ demo, pathname, site, noindex = false, canonicalPath }: IndexingInput): Indexing {
  if (demo) return { robots: ROBOTS_DEMO, canonical: undefined, indexable: false };
  if (noindex || isAlwaysNoindex(pathname)) return { robots: ROBOTS_NOINDEX, canonical: undefined, indexable: false };
  if (!site) throw new Error('SEO: production builds need `site` for the canonical URL');
  return { robots: ROBOTS_INDEX, canonical: new URL(canonicalPath ?? pathname, site).href, indexable: true };
}

export interface OgImage {
  url: string;
  width: number;
  height: number;
  alt: string;
  type: 'image/jpeg';
}

type GetImage = typeof astroGetImage;

/**
 * 1200×630 JPEG crop of the page hero as an absolute URL. `getImage` is passed in from the
 * component (`import { getImage } from 'astro:assets'`) so this module stays testable.
 * Sources smaller than 1200×630 are cropped at the largest 1200:630 size they allow instead
 * of being upscaled, so the reported width/height match the file.
 */
export async function ogImage(
  getImage: GetImage,
  { src, alt, site }: { src: ImageMetadata; alt: string; site: URL | string },
): Promise<OgImage> {
  if (!alt.trim()) throw new Error('ogImage(): alt text is required');
  const scale = Math.min(1, src.width / OG_WIDTH, src.height / OG_HEIGHT);
  const width = Math.floor(OG_WIDTH * scale);
  const height = Math.floor(OG_HEIGHT * scale);
  const image = await getImage({ src, width, height, fit: 'cover', format: 'jpg', quality: 80 });
  return { url: new URL(image.src, site).href, width, height, alt: alt.trim(), type: 'image/jpeg' };
}
