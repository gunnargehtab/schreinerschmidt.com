#!/usr/bin/env node
// Sketch → photo variants (docs/design-system.md §3 "Sketch → photo", docs/architecture.md §6
// "Sketch→photo candidates"). For each candidate photo this writes a pixel-aligned pencil
// version to src/assets/sketches/<source-id>.jpg and registers it in the manifest as a derived
// `sketch-variant` entry of the photo (same rights, same provenance).
//
// Pipeline (sharp, deterministic): greyscale → edge extraction by colour-dodge against the
// blurred negative (a Gaussian-difference convolution: fine lines at a small radius, soft tone at
// a large one, multiplied) → invert/levels → espresso-on-cream tint → JPEG without metadata.
//
// Usage: node scripts/make-sketch-variants.mjs
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

/** The five candidates of docs/architecture.md §6 (Schrankwand, Eichentreppe, Shoji, KOWA, Fischgrät). */
export const CANDIDATES = [
  'einbauschrankwand-01',
  'eichentreppe-01',
  'shoji-kleiderschrank-01',
  'haustuer-gruenderzeit-01',
  'fischgraetparkett-eiche-01',
];

/** Design-system primitives (docs/design-system.md §1.1). */
const CREAM = [255, 251, 245];
const ESPRESSO = [44, 20, 3];

/** Blur radii as a share of the long edge: fine lines and broad tone. */
const LINE_SIGMA = 0.0012;
const TONE_SIGMA = 0.01;
/** Levels: output = gain * input + offset (white stays white). */
const LINE_GAIN = 2.3;
const TONE_GAIN = 0.55;

/**
 * Colour-dodge of a greyscale image against its blurred negative: white where the image is
 * smooth, dark along edges. The classic "pencil sketch" operation.
 * @param {Buffer} grey  8-bit greyscale PNG
 * @param {number} sigma
 * @param {number} gain
 */
async function dodgeSketch(grey, sigma, gain) {
  const negativeBlur = await sharp(grey).negate().blur(sigma).png().toBuffer();
  return sharp(grey)
    .composite([{ input: negativeBlur, blend: 'colour-dodge' }])
    .linear(gain, 255 * (1 - gain))
    .png()
    .toBuffer();
}

/**
 * @param {Buffer} input  source JPEG
 * @returns {Promise<Buffer>} JPEG, same dimensions as the input
 */
export async function makeSketch(input) {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) throw new Error('make-sketch-variants: input has no dimensions');
  const longEdge = Math.max(meta.width, meta.height);
  // A median filter removes JPEG noise and wall texture before the edges are extracted.
  const grey = await sharp(input).greyscale().median(3).png().toBuffer();

  const lines = await dodgeSketch(grey, longEdge * LINE_SIGMA, LINE_GAIN);
  const tone = await dodgeSketch(grey, longEdge * TONE_SIGMA, TONE_GAIN);
  const combined = await sharp(lines)
    .composite([{ input: tone, blend: 'multiply' }])
    .greyscale()
    .raw()
    .toBuffer();

  // Tint: value 255 → cream paper, 0 → espresso ink.
  const rgb = Buffer.alloc(combined.length * 3);
  for (let i = 0; i < combined.length; i++) {
    const t = (combined[i] ?? 255) / 255;
    for (let c = 0; c < 3; c++) {
      rgb[i * 3 + c] = Math.round((ESPRESSO[c] ?? 0) + ((CREAM[c] ?? 255) - (ESPRESSO[c] ?? 0)) * t);
    }
  }
  return sharp(rgb, { raw: { width: meta.width, height: meta.height, channels: 3 } })
    .jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function main() {
  const manifest = await readManifest();
  let written = 0;
  for (const id of CANDIDATES) {
    const source = sourceEntry(manifest, id);
    const input = await readFile(path.join(ROOT, source.output.path));
    const out = await makeSketch(input);
    const outPath = `sketches/${id}.jpg`;
    if (await writeIfChanged(path.join(ASSETS_DIR, outPath), out)) written++;
    const entry = await upsertDerived(manifest, {
      id: `${id}-sketch`,
      derivedFrom: id,
      role: 'sketch-variant',
      out: outPath,
      buffer: out,
      evidence: 'pencil variant by scripts/make-sketch-variants.mjs',
      alt: '',
      notes:
        'Pixel-aligned pencil variant for the sketch→photo reveal (SketchPhoto). Decorative: the photo carries the alt text.',
    });
    if (entry.output.w !== source.output.w || entry.output.h !== source.output.h) {
      throw new Error(
        `${id}: sketch is ${entry.output.w}×${entry.output.h}, photo is ${source.output.w}×${source.output.h}`,
      );
    }
    console.log(`${id.padEnd(28)} ${entry.output.w}×${entry.output.h} ${(out.length / 1024).toFixed(0)} KB`);
  }
  const changed = await writeManifest(manifest);
  console.log(
    `\nsketch variants: ${CANDIDATES.length}; written: ${written}; manifest ${changed ? 'updated' : 'unchanged'}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
