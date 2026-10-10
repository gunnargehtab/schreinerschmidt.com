// Dominant colour of an imported image, computed at build time with sharp. Used as the placeholder
// background behind lazy images (docs/design-system.md §5 Picture / ProjectCard). Never ships sharp
// to the browser: only the resulting hex string ends up in the HTML.
import { fileURLToPath } from 'node:url';
import type { ImageMetadata } from 'astro';
import sharp from 'sharp';

export const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }): string =>
  `#${[r, g, b]
    .map((n) =>
      Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** Source file of an ESM image import (Astro adds `fsPath`; dev may prefix `/@fs/` and a query). */
export function sourcePath(img: ImageMetadata): string | undefined {
  const raw = (img as ImageMetadata & { fsPath?: string }).fsPath;
  if (!raw) return undefined;
  const clean = raw.replace(/\?.*$/, '').replace(/^\/@fs/, '');
  if (clean.startsWith('file:')) return fileURLToPath(clean);
  return /^\/[A-Za-z]:/.test(clean) ? clean.slice(1) : clean;
}

const cache = new Map<string, Promise<string | undefined>>();

/** `#rrggbb`, or undefined when the file can't be read (the card then just has no placeholder). */
export function dominantColor(img: ImageMetadata): Promise<string | undefined> {
  const path = sourcePath(img);
  if (!path) return Promise.resolve(undefined);
  let result = cache.get(path);
  if (!result) {
    result = sharp(path)
      .resize(64, 64, { fit: 'inside' })
      .stats()
      .then((s) => rgbToHex(s.dominant))
      .catch(() => undefined);
    cache.set(path, result);
  }
  return result;
}
