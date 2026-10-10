#!/usr/bin/env node
// Draws the placeholder site icon (docs/plan.md §2, docs/owner-checklist.md "Favicon") and writes
// public/favicon.svg, favicon.ico (16 + 32), apple-touch-icon.png (180), icon-192.png, icon-512.png.
// No vector logo exists yet, so the mark is a blocky "S" built from three boards and two posts,
// as SVG paths only (no <text>, no fonts). Colours are the brand tokens in
// src/styles/tokens/color.css. Deterministic: same input gives same bytes.
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
const S_PATH = 'M16 14H48V22H24V28H48V50H16V42H40V36H16Z';

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <style>
    .bg { fill: ${RED}; }
    .s { fill: ${CREAM}; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: ${DARK}; }
      .s { fill: ${LIGHT_RED}; }
    }
  </style>
  <rect class="bg" width="64" height="64" rx="12" />
  <path class="s" d="${S_PATH}" />
</svg>
`;

/** Opaque paper tile for the raster icons: red S on cream, with the safe-zone padding from the 64 grid. */
/** @param {number} size */
const tile = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
      `<rect width="64" height="64" fill="${CREAM}" /><path d="${S_PATH}" fill="${RED}" /></svg>`,
  );

/** Small sizes use the rounded red tile, like the SVG favicon. */
/** @param {number} size */
const smallTile = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
      `<rect width="64" height="64" rx="12" fill="${RED}" /><path d="${S_PATH}" fill="${CREAM}" /></svg>`,
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
