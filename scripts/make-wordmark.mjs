#!/usr/bin/env node
// Crops the wordmark out of the old logo PNG into an alpha mask (docs/design-system.md §5
// "Wordmark", docs/plan.md Phase 1): src/assets/brand/wordmark.png, opaque where the lettering is,
// transparent elsewhere. The grey tagline below the wordmark is NOT included; it becomes live text.
// Deterministic: same input → same bytes. Registers the result in the manifest as a derived
// `brand` asset of brand-logo-reference.
//
// Usage: node scripts/make-wordmark.mjs
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  ASSETS_DIR,
  ROOT,
  readManifest,
  sourceEntry,
  upsertDerived,
  writeIfChanged,
  writeManifest,
} from './derived-assets.mjs';

const SOURCE_ID = 'brand-logo-reference';
const OUT = 'brand/wordmark.png';
const ID = 'brand-wordmark';
/** Alpha below this counts as background when measuring the crop. */
const ALPHA_MIN = 8;

/**
 * Row/column bounds of the first block of non-transparent rows (the wordmark). The tagline is
 * the second block, separated by fully transparent rows.
 * @param {Buffer} rgba
 * @param {number} width
 * @param {number} height
 */
function wordmarkBounds(rgba, width, height) {
  /** @param {number} y */
  const rowHasInk = (y) => {
    for (let x = 0; x < width; x++) if ((rgba[(y * width + x) * 4 + 3] ?? 0) >= ALPHA_MIN) return true;
    return false;
  };
  let top = 0;
  while (top < height && !rowHasInk(top)) top++;
  let bottom = top;
  while (bottom < height && rowHasInk(bottom)) bottom++;
  if (top >= height || bottom === top) throw new Error('make-wordmark: no opaque rows found');
  let left = width;
  let right = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      if ((rgba[(y * width + x) * 4 + 3] ?? 0) >= ALPHA_MIN) {
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top };
}

async function main() {
  const manifest = await readManifest();
  const source = sourceEntry(manifest, SOURCE_ID);
  const input = await readFile(path.join(ROOT, source.output.path));
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const crop = wordmarkBounds(data, info.width, info.height);

  // Mask: black lettering with the original anti-aliased alpha. The colour is irrelevant for
  // mask-image (alpha mode), but black keeps the file small and readable in a file browser.
  const alpha = await sharp(input).ensureAlpha().extract(crop).extractChannel('alpha').raw().toBuffer();
  const out = await sharp(Buffer.alloc(crop.width * crop.height * 3, 0), {
    raw: { width: crop.width, height: crop.height, channels: 3 },
  })
    .joinChannel(alpha, { raw: { width: crop.width, height: crop.height, channels: 1 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  const written = await writeIfChanged(path.join(ASSETS_DIR, OUT), out);
  await upsertDerived(manifest, {
    id: ID,
    derivedFrom: SOURCE_ID,
    role: 'brand',
    out: OUT,
    buffer: out,
    evidence: `wordmark rows cropped at ${crop.left},${crop.top} ${crop.width}×${crop.height} by scripts/make-wordmark.mjs`,
    alt: '',
    notes:
      'Alpha mask of the wordmark only (tagline excluded, it is live text). Used by src/components/ui/Wordmark.astro as a CSS mask filled with --wordmark. Replace with the vector logo once the owner supplies it.',
  });
  const changed = await writeManifest(manifest);
  console.log(
    `wordmark: ${crop.width}×${crop.height} px from ${source.output.path} (crop at ${crop.left},${crop.top}); ` +
      `${written ? 'written' : 'unchanged'}; manifest ${changed ? 'updated' : 'unchanged'}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
