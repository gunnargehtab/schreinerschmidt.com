#!/usr/bin/env node
// Reproducible asset migration with provenance and a rights gate (docs/architecture.md §6).
//
// For every entry in scripts/asset-sources.mjs:
//   1. fetch the original (cache first; CDN only on a miss or with --force)
//   2. record provenance BEFORE stripping (sha256, size, EXIF make/model/date/copyright/artist, GPS flag);
//      abort if a Copyright/Artist tag names anyone other than the owner
//   3. process with sharp (auto-rotate, ≤ 2400 px, mozjpeg q86; metadata dropped)
//   4. re-read the output and assert that no EXIF/XMP/IPTC/GPS remains; warn "card only" below 1200 px
//   5. write src/assets/asset-manifest.json (sorted, deterministic)
//
// Usage: node scripts/migrate-assets.mjs [--originals <dir>] [--force]
//   --originals <dir>  download cache (default: $ASSET_ORIGINALS or .cache/asset-originals).
//                      Files are looked up by their decoded CDN filename, the layout of scripts/archive-originals.mjs.
//   --force            re-download even when the cache has the file

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ASSET_SOURCES, CDN_BASE, OWNER_NAMES } from './asset-sources.mjs';

/** @typedef {import('./asset-sources.mjs').AssetSource} AssetSource */
/**
 * @typedef {object} Provenance
 * @property {string | null} make
 * @property {string | null} model
 * @property {string | null} date
 * @property {string[]} artist     Artist / XPAuthor / XMP dc:creator / IPTC By-line values
 * @property {string[]} copyright  Copyright / XMP dc:rights / IPTC Copyright Notice + Credit values
 * @property {boolean} gps
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'src', 'assets');
const MANIFEST = path.join(ASSETS_DIR, 'asset-manifest.json');

const TIMEOUT_MS = 60_000;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 2400;
const CARD_ONLY_EDGE = 1200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * @param {Uint8Array} buf
 * @returns {string}
 */
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Same file naming as scripts/archive-originals.mjs, so both share one cache.
 * @param {string} file
 * @returns {string}
 */
const cacheName = (file) => file.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');

/**
 * @param {string} file
 * @returns {string}
 */
export const sourceUrl = (file) => CDN_BASE + encodeURIComponent(file);

/**
 * @param {Uint8Array} buf
 * @returns {'jpeg' | 'png' | null}
 */
export function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length > 8 && png.every((b, i) => buf[i] === b)) return 'png';
  return null;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------------------
// Metadata parsing (EXIF/TIFF, XMP, IPTC). No dependency beyond sharp.
// ---------------------------------------------------------------------------
const TYPE_SIZE = /** @type {Record<number, number>} */ ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 });

/**
 * Parses the TIFF structure inside a raw EXIF block (as returned by sharp's metadata().exif).
 * @param {Buffer | undefined} exif
 * @returns {{ ifd0: Map<number, Buffer>, exifIfd: Map<number, Buffer>, gpsIfd: Map<number, Buffer> }}
 */
export function parseExif(exif) {
  /** @type {Map<number, Buffer>} */
  const empty = new Map();
  const result = { ifd0: empty, exifIfd: new Map(empty), gpsIfd: new Map(empty) };
  if (!exif || exif.length < 14) return result;
  const tiff = exif.subarray(0, 6).toString('latin1') === 'Exif\0\0' ? exif.subarray(6) : exif;
  const order = tiff.subarray(0, 2).toString('latin1');
  if (order !== 'II' && order !== 'MM') return result;
  const le = order === 'II';
  /** @param {number} o */
  const u16 = (o) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  /** @param {number} o */
  const u32 = (o) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));

  /**
   * @param {number} offset
   * @returns {Map<number, Buffer>}
   */
  const readIfd = (offset) => {
    /** @type {Map<number, Buffer>} */
    const tags = new Map();
    if (offset <= 0 || offset + 2 > tiff.length) return tags;
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 1) * n;
      const start = size <= 4 ? e + 8 : u32(e + 8);
      if (start + size > tiff.length) continue;
      tags.set(tag, tiff.subarray(start, start + size));
    }
    return tags;
  };
  /**
   * @param {Buffer | undefined} b
   * @returns {number}
   */
  const ptr = (b) => (b && b.length >= 4 ? (le ? b.readUInt32LE(0) : b.readUInt32BE(0)) : 0);

  const ifd0 = readIfd(u32(4));
  return { ifd0, exifIfd: readIfd(ptr(ifd0.get(0x8769))), gpsIfd: readIfd(ptr(ifd0.get(0x8825))) };
}

/**
 * @param {Buffer | undefined} b
 * @returns {string | null}
 */
const ascii = (b) => {
  if (!b) return null;
  const s = b.toString('latin1').replace(/\0+$/, '').trim();
  // EXIF ASCII is nominally 7-bit, but cameras write UTF-8; decode as UTF-8 when it round-trips.
  const utf8 = b.toString('utf8').replace(/\0+$/, '').trim();
  const value = utf8.includes('�') ? s : utf8;
  return value === '' ? null : value;
};

/**
 * @param {Buffer | undefined} b
 * @returns {string | null}
 */
const ucs2 = (b) => {
  if (!b) return null;
  const s = b.toString('utf16le').replace(/\0+$/, '').trim();
  return s === '' ? null : s;
};

/**
 * @param {string | undefined} xmp
 * @param {string} element e.g. 'dc:creator'
 * @returns {string[]}
 */
function xmpValues(xmp, element) {
  if (!xmp) return [];
  /** @type {string[]} */
  const values = [];
  const block = new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)</${element}>`, 'g');
  for (const m of xmp.matchAll(block)) {
    const inner = m[1] ?? '';
    // Values sit in rdf:li items (Seq/Bag/Alt) or directly in the element; empty items (<rdf:li/>) are skipped.
    const items = [...inner.matchAll(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/g)].map((x) => x[1] ?? '');
    for (const v of items.length ? items : [inner]) {
      const text = v.replace(/<[^>]*>/g, '').trim();
      if (text) values.push(text);
    }
  }
  const attr = new RegExp(`\\b${element}="([^"]*)"`, 'g');
  for (const m of xmp.matchAll(attr)) if (m[1]?.trim()) values.push(m[1].trim());
  return values;
}

/**
 * Reads IPTC-IIM datasets (record 2) from a raw IPTC block.
 * @param {Buffer | undefined} iptc
 * @returns {Map<number, string[]>}
 */
function iptcDatasets(iptc) {
  /** @type {Map<number, string[]>} */
  const out = new Map();
  if (!iptc) return out;
  for (let i = 0; i + 5 <= iptc.length; i++) {
    if (iptc[i] !== 0x1c || iptc[i + 1] !== 0x02) continue;
    const ds = /** @type {number} */ (iptc[i + 2]);
    const len = iptc.readUInt16BE(i + 3);
    if (len & 0x8000 || i + 5 + len > iptc.length) continue;
    const value = iptc
      .subarray(i + 5, i + 5 + len)
      .toString('utf8')
      .trim();
    if (value) out.set(ds, [...(out.get(ds) ?? []), value]);
    i += 4 + len;
  }
  return out;
}

/**
 * Provenance from sharp metadata, read from the untouched original.
 * @param {import('sharp').Metadata} meta
 * @returns {Provenance}
 */
export function provenanceOf(meta) {
  const { ifd0, exifIfd, gpsIfd } = parseExif(meta.exif);
  const xmp = meta.xmp?.toString('utf8');
  const iptc = iptcDatasets(meta.iptc);
  /** @type {(string | null | undefined)[]} */
  const artist = [
    ascii(ifd0.get(0x013b)),
    ucs2(ifd0.get(0x9c9d)),
    ...xmpValues(xmp, 'dc:creator'),
    ...(iptc.get(80) ?? []),
  ];
  /** @type {(string | null | undefined)[]} */
  const copyright = [
    ascii(ifd0.get(0x8298)),
    ...xmpValues(xmp, 'dc:rights'),
    ...xmpValues(xmp, 'photoshop:Credit'),
    ...(iptc.get(116) ?? []),
    ...(iptc.get(110) ?? []),
  ];
  /** @param {(string | null | undefined)[]} list */
  const clean = (list) => [...new Set(list.filter((v) => typeof v === 'string' && v !== ''))].sort();
  return {
    make: ascii(ifd0.get(0x010f)),
    model: ascii(ifd0.get(0x0110)),
    date: ascii(exifIfd.get(0x9003)) ?? ascii(ifd0.get(0x0132)),
    artist: /** @type {string[]} */ (clean(artist)),
    copyright: /** @type {string[]} */ (clean(copyright)),
    // Coordinates count as location data; a GPS IFD with only a version tag does not.
    gps: gpsIfd.has(0x0002) || gpsIfd.has(0x0004) || /exif:GPS(Latitude|Longitude)/.test(xmp ?? ''),
  };
}

/**
 * True if a credit string names the owner (and nobody else).
 * @param {string} value
 * @returns {boolean}
 */
export function namesOwner(value) {
  const normalised = value
    .toLowerCase()
    .replace(/©|\(c\)|copyright|all rights reserved|alle rechte vorbehalten/g, ' ')
    .replace(/\b\d{4}\b/g, ' ')
    .replace(/[^\p{L}\p{N}.]+/gu, ' ')
    .replace(/\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return OWNER_NAMES.includes(normalised) || OWNER_NAMES.includes(normalised.replace(/\.com$/, ''));
}

// ---------------------------------------------------------------------------
// 1. Fetch (cache-aware)
// ---------------------------------------------------------------------------
/**
 * @param {string} dir
 * @returns {Promise<Map<string, string>>} cache filename → sha256 from the archive's index.json
 */
async function readCacheIndex(dir) {
  /** @type {Map<string, string>} */
  const index = new Map();
  const file = path.join(dir, 'index.json');
  if (!existsSync(file)) return index;
  const records = /** @type {{ file?: string, sha256?: string }[]} */ (JSON.parse(await readFile(file, 'utf8')));
  for (const r of records) if (r.file && r.sha256) index.set(r.file, r.sha256);
  return index;
}

/**
 * @param {AssetSource} src
 * @param {{ dir: string, force: boolean, index: Map<string, string> }} cache
 * @returns {Promise<{ raw: Buffer, from: 'cache' | 'cdn' }>}
 */
async function fetchOriginal(src, cache) {
  const name = cacheName(src.file);
  const target = path.join(cache.dir, name);
  const expectedType = src.file.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';

  if (!cache.force && existsSync(target)) {
    const st = await stat(target);
    if (st.size > MAX_BYTES) throw new Error(`${name}: cached file exceeds the 25 MB cap`);
    const raw = await readFile(target);
    if (sniff(raw) !== expectedType) throw new Error(`${name}: cached file is not a ${expectedType} (magic bytes)`);
    const known = cache.index.get(name);
    if (known && known !== sha256(raw)) throw new Error(`${name}: sha256 differs from the archive's index.json`);
    return { raw, from: 'cache' };
  }

  const url = sourceUrl(src.file);
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
  if (res.status !== 200) {
    await res.body?.cancel();
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!/^image\/(jpeg|png)\b/i.test(type)) {
    await res.body?.cancel();
    throw new Error(`${url}: unexpected content type "${type}"`);
  }
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) {
    await res.body?.cancel();
    throw new Error(`${url}: larger than the 25 MB cap`);
  }
  /** @type {Uint8Array[]} */
  const chunks = [];
  let bytes = 0;
  const reader = /** @type {ReadableStream<Uint8Array>} */ (res.body).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error(`${url}: larger than the 25 MB cap`);
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  const magic = sniff(raw);
  if (magic !== expectedType || !type.toLowerCase().includes(magic)) {
    throw new Error(`${url}: magic bytes (${magic}) do not match the content type "${type}"`);
  }
  await mkdir(cache.dir, { recursive: true });
  await writeFile(`${target}.part`, raw);
  await rename(`${target}.part`, target);
  return { raw, from: 'cdn' };
}

// ---------------------------------------------------------------------------
// 3./4. Process and verify
// ---------------------------------------------------------------------------
/**
 * @param {Buffer} raw
 * @param {'jpeg' | 'png'} format
 * @returns {Promise<Buffer>}
 */
function processImage(raw, format) {
  const pipeline = sharp(raw, { limitInputPixels: 50e6 })
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  // PNG stays lossless (brand reference for the wordmark mask); photos use the §6 JPEG settings.
  return format === 'png'
    ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
    : pipeline.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

/**
 * Asserts that an output carries no EXIF/XMP/IPTC/GPS.
 * @param {Buffer} out
 * @param {string} label
 * @returns {Promise<import('sharp').Metadata>}
 */
async function assertStripped(out, label) {
  const meta = await sharp(out).metadata();
  const leftovers = [meta.exif && 'EXIF', meta.xmp && 'XMP', meta.iptc && 'IPTC'].filter(Boolean);
  if (leftovers.length) throw new Error(`${label}: output still has ${leftovers.join(', ')}`);
  if (!meta.width || !meta.height) throw new Error(`${label}: output has no dimensions`);
  if (Math.max(meta.width, meta.height) > MAX_EDGE) throw new Error(`${label}: output exceeds ${MAX_EDGE} px`);
  return meta;
}

// ---------------------------------------------------------------------------
// 5. Manifest
// ---------------------------------------------------------------------------
const GROUP_EVIDENCE = {
  own: 'Rights group "own" (company phones 2018–2023, docs/architecture.md §0 finding 3, §6).',
  'own-legacy':
    'Rights group "own-legacy" (Oct-2022 upload batch of Fujifilm photos from about 2010–2012, docs/architecture.md §0 finding 3, §6). Cards only; owner must confirm the project (UWG).',
  'own-unverified': 'Rights group "own-unverified" (docs/architecture.md §6). Origin pending owner confirmation.',
};

/**
 * @param {AssetSource} src
 * @param {Provenance} p
 * @returns {string}
 */
function rightsEvidence(src, p) {
  const camera = [p.make, p.model].filter(Boolean).join(' ');
  const exif = camera
    ? `EXIF camera ${camera}${p.date ? `, ${p.date}` : ''}`
    : `No EXIF camera data${p.date ? ` (EXIF date ${p.date})` : ''}`;
  const credit =
    p.artist.length || p.copyright.length
      ? `credit tags name the owner (${[...p.artist, ...p.copyright].join('; ')})`
      : 'no Copyright/Artist tag';
  const group =
    src.role === 'brand-reference'
      ? 'Company logo from the old site (reference only, docs/architecture.md §6).'
      : GROUP_EVIDENCE[src.rights];
  return `${exif}; ${credit}. ${group}`;
}

/**
 * Keeps hand-written fields (alt) from an existing manifest entry.
 * @returns {Promise<Map<string, { alt?: string }>>}
 */
async function readExistingManifest() {
  /** @type {Map<string, { alt?: string }>} */
  const map = new Map();
  if (!existsSync(MANIFEST)) return map;
  const entries = /** @type {{ id: string, alt?: string }[]} */ (JSON.parse(await readFile(MANIFEST, 'utf8')));
  for (const e of entries) map.set(e.id, e);
  return map;
}

/**
 * Writes a file only when its bytes change; returns true if written.
 * @param {string} file
 * @param {Buffer | string} data
 * @returns {Promise<boolean>}
 */
async function writeIfChanged(file, data) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  if (existsSync(file) && (await readFile(file)).equals(buf)) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return true;
}

/**
 * @param {string[]} argv
 * @returns {{ dir: string, force: boolean }}
 */
function parseArgs(argv) {
  let dir = process.env['ASSET_ORIGINALS'] || path.join(ROOT, '.cache', 'asset-originals');
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') force = true;
    else if (a === '--originals') dir = argv[++i] ?? '';
    else if (a?.startsWith('--originals=')) dir = a.slice('--originals='.length);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!dir) throw new Error('--originals needs a directory');
  return { dir: path.resolve(dir), force };
}

/**
 * Validates the allow-list itself (unique ids/paths/files, path shape).
 * @returns {void}
 */
function validateSources() {
  /** @param {(s: AssetSource) => string} key @param {string} what */
  const unique = (key, what) => {
    const seen = new Set();
    for (const s of ASSET_SOURCES) {
      const k = key(s);
      if (seen.has(k)) throw new Error(`asset-sources: duplicate ${what} "${k}"`);
      seen.add(k);
    }
  };
  unique((s) => s.id, 'id');
  unique((s) => s.file, 'file');
  unique((s) => s.out, 'out');
  for (const s of ASSET_SOURCES) {
    const ok =
      (s.project !== null && new RegExp(`^projects/${s.project}/\\d{2}-[a-z0-9-]+\\.jpg$`).test(s.out)) ||
      (s.project === null && /^(team|services\/[a-z]+)\/[a-z0-9-]+\.jpg$/.test(s.out)) ||
      (s.role === 'brand-reference' && /^brand\/[a-z0-9-]+\.png$/.test(s.out));
    if (!ok) throw new Error(`asset-sources: ${s.id}: unexpected out path "${s.out}"`);
  }
}

async function main() {
  const { dir, force } = parseArgs(process.argv.slice(2));
  validateSources();
  const cache = { dir, force, index: await readCacheIndex(dir) };
  console.log(`originals: ${path.relative(ROOT, dir) || dir}${force ? ' (--force)' : ''}`);

  // Steps 1–2 for every source first, so a rights abort leaves src/assets untouched.
  /** @type {{ src: AssetSource, raw: Buffer, meta: import('sharp').Metadata, prov: Provenance }[]} */
  const inputs = [];
  /** @type {string[]} */
  const aborts = [];
  for (const src of ASSET_SOURCES) {
    const { raw, from } = await fetchOriginal(src, cache);
    const meta = await sharp(raw, { limitInputPixels: 50e6 }).metadata();
    const prov = provenanceOf(meta);
    const foreign = [...prov.artist, ...prov.copyright].filter((v) => !namesOwner(v));
    if (foreign.length) aborts.push(`${src.id} (${src.file}): credit names a third party: ${foreign.join('; ')}`);
    console.log(
      `${from.padEnd(5)} ${src.id.padEnd(32)} ${meta.width}×${meta.height} ${[prov.make, prov.model, prov.date].filter(Boolean).join(' ') || 'no EXIF camera'}${prov.gps ? ' [GPS]' : ''}`,
    );
    inputs.push({ src, raw, meta, prov });
  }
  if (aborts.length) {
    console.error('\nABORT: third-party copyright/artist found. Remove these from scripts/asset-sources.mjs:');
    for (const a of aborts) console.error(`  - ${a}`);
    process.exit(1);
  }

  const existing = await readExistingManifest();
  /** @type {string[]} */
  const cardOnly = [];
  let written = 0;
  const entries = [];
  for (const { src, raw, meta, prov } of inputs) {
    const format = src.out.endsWith('.png') ? 'png' : 'jpeg';
    const out = await processImage(raw, format);
    const outMeta = await assertStripped(out, src.id);
    const w = /** @type {number} */ (outMeta.width);
    const h = /** @type {number} */ (outMeta.height);
    // Card only: below the size threshold (§6 step 4), or own-legacy, which plan §3.3 limits to cards at any size.
    const tooSmall = Math.max(w, h) < CARD_ONLY_EDGE;
    const isCardOnly = tooSmall || src.rights === 'own-legacy';
    if (tooSmall && src.role !== 'brand-reference') cardOnly.push(`${src.id} (${w}×${h})`);
    if (await writeIfChanged(path.join(ASSETS_DIR, src.out), out)) written++;

    // EXIF orientation 5–8 swaps the axes; report the original as displayed.
    const swap = (meta.orientation ?? 1) >= 5;
    entries.push({
      id: src.id,
      sourceUrl: sourceUrl(src.file),
      sha256: sha256(raw),
      original: {
        w: swap ? meta.height : meta.width,
        h: swap ? meta.width : meta.height,
        bytes: raw.length,
        exif: {
          make: prov.make,
          model: prov.model,
          date: prov.date,
          artist: prov.artist.join('; ') || null,
          copyright: prov.copyright.join('; ') || null,
          gps: prov.gps,
        },
      },
      output: { path: `src/assets/${src.out}`, w, h, bytes: out.length, sha256: sha256(out) },
      cardOnly: isCardOnly,
      rights: src.rights,
      rightsEvidence: rightsEvidence(src, prov),
      alt: existing.get(src.id)?.alt ?? '',
      category: src.category,
      project: src.project,
      role: src.role,
      privacyCheck: 'pending',
      notes: src.notes,
    });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const manifestChanged = await writeIfChanged(MANIFEST, JSON.stringify(entries, null, 2) + '\n');

  // Outputs on disk that the allow-list no longer produces would fail the rights gate; report them.
  const expected = new Set(ASSET_SOURCES.map((s) => path.join(ASSETS_DIR, s.out)));
  /** @type {string[]} */
  const strays = [];
  for (const top of ['projects', 'services', 'team', 'brand']) {
    const base = path.join(ASSETS_DIR, top);
    if (!existsSync(base)) continue;
    for (const f of await readdir(base, { recursive: true, withFileTypes: true })) {
      const full = path.join(f.parentPath, f.name);
      if (f.isFile() && !expected.has(full)) strays.push(path.relative(ROOT, full));
    }
  }

  console.log('\n--- summary ---');
  console.log(
    `sources: ${entries.length}; images written: ${written}; manifest ${manifestChanged ? 'updated' : 'unchanged'}`,
  );
  /** @type {Record<string, number>} */
  const byRights = {};
  for (const e of entries) byRights[e.rights] = (byRights[e.rights] ?? 0) + 1;
  console.log(`by rights: ${JSON.stringify(byRights)}`);
  const gps = entries.filter((e) => e.original.exif.gps).map((e) => e.id);
  if (gps.length) console.log(`GPS removed from: ${gps.join(', ')}`);
  for (const c of cardOnly) console.warn(`WARN card only (< ${CARD_ONLY_EDGE} px): ${c}`);
  for (const s of strays) console.warn(`WARN unlisted file in src/assets (delete it or add a source): ${s}`);
  if (strays.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exit(1);
  });
}
