// Manifest helper for DERIVED assets: files generated from a migrated source image
// (sketch→photo variants, the wordmark mask). Shared by scripts/make-sketch-variants.mjs and
// scripts/make-wordmark.mjs. Derived entries copy the provenance and rights of their source and
// carry `derivedFrom`; scripts/migrate-assets.mjs preserves them, tests/unit/assets.test.ts
// validates them (docs/architecture.md §6).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ASSETS_DIR = path.join(ROOT, 'src', 'assets');
export const MANIFEST = path.join(ASSETS_DIR, 'asset-manifest.json');

/** Roles of derived entries. Keep in sync with DERIVED_ROLES in src/lib/asset-manifest.ts. */
export const DERIVED_ROLES = ['sketch-variant', 'brand'];

/**
 * @typedef {object} ManifestEntry
 * @property {string} id
 * @property {string} [derivedFrom]
 * @property {string} sourceUrl
 * @property {string} sha256
 * @property {object} original
 * @property {{ path: string, w: number, h: number, bytes: number, sha256: string }} output
 * @property {boolean} cardOnly
 * @property {string} rights
 * @property {string} rightsEvidence
 * @property {string} alt
 * @property {string | null} category
 * @property {string | null} project
 * @property {string} role
 * @property {string} privacyCheck
 * @property {string} notes
 */

/** @param {Uint8Array} buf */
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** @returns {Promise<ManifestEntry[]>} */
export async function readManifest() {
  return /** @type {ManifestEntry[]} */ (JSON.parse(await readFile(MANIFEST, 'utf8')));
}

/**
 * Writes a file only when its bytes change; returns true if written.
 * @param {string} file
 * @param {Buffer | string} data
 */
export async function writeIfChanged(file, data) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  if (existsSync(file) && (await readFile(file)).equals(buf)) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return true;
}

/**
 * The publishable source entry of a derived asset, or an error.
 * @param {ManifestEntry[]} manifest
 * @param {string} id
 */
export function sourceEntry(manifest, id) {
  const source = manifest.find((e) => e.id === id);
  if (!source) throw new Error(`derived-assets: unknown source "${id}"`);
  if (source.derivedFrom) throw new Error(`derived-assets: "${id}" is itself derived`);
  if (!['own', 'own-legacy', 'own-unverified'].includes(source.rights)) {
    throw new Error(`derived-assets: source "${id}" has rights "${source.rights}"`);
  }
  return source;
}

/**
 * Asserts that an output carries no EXIF/XMP/IPTC and returns its dimensions.
 * @param {Buffer} out
 * @param {string} label
 */
export async function assertStripped(out, label) {
  const meta = await sharp(out).metadata();
  const leftovers = [meta.exif && 'EXIF', meta.xmp && 'XMP', meta.iptc && 'IPTC'].filter(Boolean);
  if (leftovers.length) throw new Error(`${label}: output still has ${leftovers.join(', ')}`);
  if (!meta.width || !meta.height) throw new Error(`${label}: output has no dimensions`);
  return { w: meta.width, h: meta.height };
}

/**
 * Inserts or replaces a derived entry. Provenance, rights, category and project come from the
 * source; hand-written `alt`/`notes` of an existing entry survive unless `fields` sets them.
 * @param {ManifestEntry[]} manifest
 * @param {{ id: string, derivedFrom: string, role: string, out: string, buffer: Buffer, evidence: string, alt?: string, notes?: string }} fields
 */
export async function upsertDerived(manifest, fields) {
  if (!DERIVED_ROLES.includes(fields.role)) throw new Error(`derived-assets: role "${fields.role}" is not derived`);
  const source = sourceEntry(manifest, fields.derivedFrom);
  const { w, h } = await assertStripped(fields.buffer, fields.id);
  const existing = manifest.find((e) => e.id === fields.id);
  /** @type {ManifestEntry} */
  const entry = {
    id: fields.id,
    derivedFrom: fields.derivedFrom,
    sourceUrl: source.sourceUrl,
    sha256: source.sha256,
    original: source.original,
    output: { path: `src/assets/${fields.out}`, w, h, bytes: fields.buffer.length, sha256: sha256(fields.buffer) },
    cardOnly: source.cardOnly,
    rights: source.rights,
    rightsEvidence: `Derived from ${source.id} (${fields.evidence}). ${source.rightsEvidence}`,
    alt: fields.alt ?? existing?.alt ?? '',
    category: source.category,
    project: source.project,
    role: fields.role,
    privacyCheck: source.privacyCheck,
    notes: fields.notes ?? existing?.notes ?? '',
  };
  const next = manifest.filter((e) => e.id !== fields.id);
  next.push(entry);
  next.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  manifest.splice(0, manifest.length, ...next);
  return entry;
}

/** @param {ManifestEntry[]} manifest */
export async function writeManifest(manifest) {
  return writeIfChanged(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}
