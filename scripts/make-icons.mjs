#!/usr/bin/env node
// Draws the placeholder site icon (docs/plan.md §2, docs/owner-checklist.md "Favicon") and writes
// public/favicon.svg, favicon.ico (16 + 32), apple-touch-icon.png (180), icon-192.png, icon-512.png.
// No vector logo exists yet, so the mark is a condensed "S" in the spirit of the wordmark
// (src/assets/brand/wordmark.png: a tall, bold grotesque with flat terminals): one stroked path of
// two tangent arcs, cut square at both ends. As SVG paths only (no <text>, no fonts), on a square
// tile (the brand draws square corners). Colours are the brand tokens in src/styles/tokens/color.css.
// Deterministic: same input gives same bytes.
//
// Usage: npm run assets:icons
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public');

const RED = '#8B101B'; // --red-700 (logo)
const CREAM = '#FFFBF5'; // --cream
const DARK = '#160D07'; // --walnut-950
const LIGHT_RED = '#EB8278'; // --red-300

/*
 * The S on a 64 grid: upper arc centred (32, 22), lower arc centred (32, 42), radius 10, so the two
 * bowls touch at (32, 32). The path starts at the right of the upper bowl heading up (counter-clockwise
 * over the top and down the left side), crosses the centre, and runs clockwise round the lower bowl
 * to end at its left, heading up. Butt caps on a vertical heading give the flat, horizontal terminals
 * of the wordmark; stroke 9 keeps the counters open at 16 px (2.25 px line, 2.75 px gap).
 */
const S_PATH = 'M42 22A10 10 0 1 0 32 32A10 10 0 1 1 22 42';
const STROKE = 9;
const S_ATTRS = `fill="none" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="round"`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <style>
    .bg { fill: ${RED}; }
    .s { stroke: ${CREAM}; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: ${DARK}; }
      .s { stroke: ${LIGHT_RED}; }
    }
  </style>
  <rect class="bg" width="64" height="64" />
  <path class="s" d="${S_PATH}" ${S_ATTRS} />
</svg>
`;

/** Opaque paper tile for the large raster icons: red S on cream. */
/** @param {number} size */
const tile = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
      `<rect width="64" height="64" fill="${CREAM}" /><path d="${S_PATH}" stroke="${RED}" ${S_ATTRS} /></svg>`,
  );

/** Small sizes use the red tile, like the SVG favicon: more contrast against a light tab strip. */
/** @param {number} size */
const smallTile = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
      `<rect width="64" height="64" fill="${RED}" /><path d="${S_PATH}" stroke="${CREAM}" ${S_ATTRS} /></svg>`,
  );

/** @param {Buffer} svg @param {number} size */
const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** ICO container with embedded PNG images. @param {{ size: number; data: Buffer }[]} images */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dirs = images.map(({ size, data }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size, 0);
    d.writeUInt8(size, 1);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...images.map((i) => i.data)]);
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'favicon.svg'), favicon);
await writeFile(
  path.join(OUT, 'favicon.ico'),
  ico([
    { size: 16, data: await png(smallTile(16), 16) },
    { size: 32, data: await png(smallTile(32), 32) },
  ]),
);
await writeFile(path.join(OUT, 'apple-touch-icon.png'), await png(tile(180), 180));
await writeFile(path.join(OUT, 'icon-192.png'), await png(tile(192), 192));
await writeFile(path.join(OUT, 'icon-512.png'), await png(tile(512), 512));
console.log('icons written to public/');
