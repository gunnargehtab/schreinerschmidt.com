// One-time build helper: renders the static Kontakt map (src/assets/map/kontakt.avif) from six
// OpenStreetMap tiles plus a marker. NOT part of the build or CI; run it by hand when the address
// or the pin changes, then commit the AVIF:
//
//   node scripts/make-static-map.mjs [--force]
//
// Why a static image (docs/design-system.md §5 "Other components", plan §7): the site makes no
// third-party requests, so there is no map embed. The page shows this image with a visible
// "© OpenStreetMap-Mitwirkende" attribution and links out to OSM; only a click loads anything external.
//
// OSM tile usage policy (https://operations.osmfoundation.org/policies/tiles/):
// - exactly the 3 × 2 tiles around the pin at one zoom level, fetched sequentially with a pause;
// - a User-Agent that names this project and gives the repo URL as contact;
// - tiles are cached under .cache/osm-tiles/ and reused, so re-running fetches nothing (use --force
//   to refetch); no bulk download, no prefetching of other zoom levels.
// Licence: map data © OpenStreetMap contributors (ODbL); the tile cartography is CC BY-SA 2.0.
// The attribution must stay visible next to the image (StaticMap.astro).
//
// Rights gate: the output lives in src/assets/map/, deliberately OUTSIDE the folders the asset
// rights gate checks (src/assets/{projects,services,team,brand,sketches}, tests/unit/assets.test.ts).
// That gate covers photos migrated from the old site and their derivatives, whose rights depend on
// the owner. This map is generated from OSM under an open licence with mandatory attribution, so it
// has no owner-rights status and does not belong in the asset manifest.
//
// Coordinates (needs-review): Nominatim (OSM) has no house number 33 for Andreas-Hofer-Straße,
// 68259 Mannheim (Feudenheim); the one-time lookup on 2026-10-10 returned the street itself
// (way 255539940, centre 49.4907376, 8.5231086). The pin therefore marks the street, not the
// house. Confirm or correct the position with the owner (e.g. from the workshop entrance).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache/osm-tiles');
const OUT = join(ROOT, 'src/assets/map/kontakt.avif');

/** Pin position (needs-review, see above). Keep in sync with MAP_POINT in src/lib/map.ts. */
export const MAP_POINT = { lat: 49.4907376, lon: 8.5231086 };
export const MAP_ZOOM = 16;
/** Output size in px: inside the 3 × 2 tile block (768 × 512). */
export const MAP_SIZE = { width: 640, height: 400 };

const TILE = 256;
const TILE_URL = (/** @type {number} */ z, /** @type {number} */ x, /** @type {number} */ y) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
const USER_AGENT =
  'schreinerschmidt-static-map/1.0 (one-time static map; +https://github.com/gunnargehtab/schreinerschmidt.com)';
const PAUSE_MS = 600;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** Brand red (--red-600) and paper cream (--cream) as sRGB. */
const PIN = '#9E2124';
const PAPER = '#FFFBF5';

/**
 * Web Mercator world pixel position at zoom z.
 * @param {number} lat @param {number} lon @param {number} z
 */
export function worldPixel(lat, lon, z) {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/**
 * The 3 × 2 tile block that keeps the point nearest the middle, and the crop inside it.
 * @param {{ lat: number, lon: number }} point @param {number} z @param {{ width: number, height: number }} size
 */
export function layout(point, z, size) {
  const p = worldPixel(point.lat, point.lon, z);
  const tx = Math.floor(p.x / TILE);
  const ty = Math.floor(p.y / TILE);
  const x0 = tx - 1;
  const y0 = p.y / TILE - ty < 0.5 ? ty - 1 : ty;
  const px = p.x - x0 * TILE;
  const py = p.y - y0 * TILE;
  const clamp = (/** @type {number} */ v, /** @type {number} */ max) => Math.round(Math.min(Math.max(v, 0), max));
  const left = clamp(px - size.width / 2, 3 * TILE - size.width);
  const top = clamp(py - size.height / 2, 2 * TILE - size.height);
  const tiles = [];
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) tiles.push({ x: x0 + dx, y: y0 + dy, dx, dy });
  return { tiles, crop: { left, top, ...size }, marker: { x: px - left, y: py - top } };
}

/** @param {number} z @param {number} x @param {number} y @param {boolean} force */
async function tile(z, x, y, force) {
  const file = join(CACHE, String(z), String(x), `${y}.png`);
  if (!force && existsSync(file)) return readFile(file);
  await new Promise((r) => setTimeout(r, PAUSE_MS));
  const res = await fetch(TILE_URL(z, x, y), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' },
    signal: AbortSignal.timeout(30_000),
  });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/png')) throw new Error(`tile ${z}/${x}/${y}: HTTP ${res.status} ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 4).equals(PNG_MAGIC)) throw new Error(`tile ${z}/${x}/${y}: not a PNG`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, buf);
  console.log(`fetched ${z}/${x}/${y}`);
  return buf;
}

/** A 32 × 44 pin whose tip is at (16, 42). */
const PIN_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
    <ellipse cx="16" cy="42" rx="7" ry="2" fill="#000" fill-opacity="0.25"/>
    <path d="M16 42C16 42 3 26 3 15a13 13 0 0 1 26 0c0 11-13 27-13 27z" fill="${PIN}" stroke="${PAPER}" stroke-width="2"/>
    <circle cx="16" cy="15" r="5" fill="${PAPER}"/>
  </svg>`,
);
const PIN_TIP = { x: 16, y: 42 };

async function main() {
  const force = process.argv.includes('--force');
  const { tiles, crop, marker } = layout(MAP_POINT, MAP_ZOOM, MAP_SIZE);
  /** @type {import('sharp').OverlayOptions[]} */
  const parts = [];
  for (const t of tiles) {
    parts.push({ input: await tile(MAP_ZOOM, t.x, t.y, force), left: t.dx * TILE, top: t.dy * TILE });
  }
  const block = await sharp({
    create: { width: 3 * TILE, height: 2 * TILE, channels: 3, background: PAPER },
  })
    .composite(parts)
    .png()
    .toBuffer();
  // Slightly muted so the brand-red pin stands out and the map sits on the cream paper palette.
  const base = await sharp(block).extract(crop).modulate({ saturation: 0.6 }).png().toBuffer();
  const out = await sharp(base)
    .composite([{ input: PIN_SVG, left: Math.round(marker.x - PIN_TIP.x), top: Math.round(marker.y - PIN_TIP.y) }])
    // High quality and 4:4:4 keep the street labels legible; sharp writes no metadata by default.
    .avif({ quality: 70, effort: 6, chromaSubsampling: '4:4:4' })
    .toBuffer();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, out);
  const sha = createHash('sha256').update(out).digest('hex');
  console.log(`wrote ${OUT} (${crop.width}×${crop.height}, ${out.length} bytes, sha256 ${sha})`);
  console.log(
    `pin at ${marker.x.toFixed(1)}, ${marker.y.toFixed(1)} px; tiles z${MAP_ZOOM}: ${tiles.map((t) => `${t.x}/${t.y}`).join(' ')}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
