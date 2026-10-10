// Manifest lookups for project photos (docs/architecture.md §6). Used by the Referenzen pages.
import type { ImageMetadata } from 'astro';
import { findAssetByPath } from './asset-manifest';
import { sourcePath } from './dominant-color';

/**
 * True when the photo may only appear in cards (long edge < 1200 px or legacy rights): no large
 * hero, no lightbox. Looks the file up in the manifest by its source path; without a match the
 * pixel size decides.
 */
export function isCardOnly(img: ImageMetadata): boolean {
  const path = sourcePath(img)?.replace(/\\/g, '/');
  const rel = path && path.includes('/src/assets/') ? path.slice(path.indexOf('/src/assets/') + 1) : undefined;
  const entry = rel ? findAssetByPath(rel) : undefined;
  return entry?.cardOnly ?? Math.max(img.width, img.height) < 1200;
}
