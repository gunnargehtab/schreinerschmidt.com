// Rights gate for migrated images (docs/architecture.md §6, docs/plan.md §3.3 step 5).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ASSET_SOURCES } from '../../scripts/asset-sources.mjs';
import {
  ASSET_CATEGORIES,
  ASSET_ROLES,
  CARD_ONLY_EDGE,
  PUBLISHABLE_RIGHTS,
  assets,
  findAsset,
  findAssetByPath,
  getAsset,
  getProjectAssets,
  getProjectSlugs,
  isAssetRole,
  isPublishable,
  type AssetEntry,
} from '../../src/lib/asset-manifest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ASSET_DIRS = ['projects', 'services', 'team', 'brand'];
const MAX_EDGE = 2400;

/** The 15 reference projects of docs/architecture.md §6. */
const PROJECT_SLUGS = [
  'altbau-eichendielen',
  'arbeitszimmer-wohnwand',
  'bad-nach-mass',
  'dachausbau-dielen',
  'draussen-mit-holz',
  'eichentreppe',
  'eingang-holzlamellen',
  'einbauschrankwand',
  'fischgraetparkett-eiche',
  'glasvitrine',
  'haustuer-gruenderzeit',
  'holzhaustuer-aufgearbeitet',
  'kernbuchenbett',
  'shoji-kleiderschrank',
  'treppenhaus-handlauf',
];

/** File names that must never be migrated (excluded groups of §6 plus the PaX/Admonter EXIF findings). */
const EXCLUDED =
  /PaX|_MG_2703|_MG_2939|Fenster Detail|Braubachstra|neorenaissance|AdobeStock|steel-interior|admonter|Naturholzplatte|schreiner_schmidt_(terasse|kuche|boden|Turen)|Bildschirmfoto|video_Schreiner|unsplash/i;

// Read from disk as well, so the gate does not depend on the typed import.
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/assets/asset-manifest.json'), 'utf8')) as AssetEntry[];

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(ROOT, join(d.parentPath, d.name)).replace(/\\/g, '/'));
}

const longEdge = (e: AssetEntry) => Math.max(e.output.w, e.output.h);

describe('asset manifest: rights gate', () => {
  it('lists every file under src/assets/{projects,services,team,brand} and nothing else', () => {
    const onDisk = ASSET_DIRS.flatMap((d) => listFiles(join(ROOT, 'src/assets', d))).sort();
    const listed = manifest.map((e) => e.output.path).sort();
    expect(onDisk).toEqual(listed);
  });

  it('has unique ids and output paths, sorted by id', () => {
    const ids = manifest.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(manifest.map((e) => e.output.path)).size).toBe(manifest.length);
    expect(ids).toEqual([...ids].sort());
  });

  it.each(manifest.map((e) => [e.id, e] as const))('%s has a publishable status and a known role', (_id, e) => {
    expect(PUBLISHABLE_RIGHTS).toContain(e.rights);
    expect(ASSET_ROLES).toContain(e.role);
    expect(e.rightsEvidence.length).toBeGreaterThan(20);
    expect(e.privacyCheck).toBeTruthy();
    expect(typeof e.alt).toBe('string');
    if (e.category !== null) expect(ASSET_CATEGORIES).toContain(e.category);
    expect(e.sourceUrl.startsWith('https://cdn.prod.website-files.com/62e8c86393d73a7acebb0e1f/')).toBe(true);
    expect(EXCLUDED.test(decodeURIComponent(e.sourceUrl))).toBe(false);
  });

  it.each(manifest.map((e) => [e.id, e] as const))('%s lives in the folder of its project/role', (_id, e) => {
    if (e.project !== null) {
      expect(PROJECT_SLUGS).toContain(e.project);
      expect(e.output.path).toMatch(new RegExp(`^src/assets/projects/${e.project}/\\d{2}-[a-z0-9-]+\\.jpg$`));
    } else if (e.role === 'brand-reference') {
      expect(e.output.path).toMatch(/^src\/assets\/brand\/[a-z0-9-]+\.png$/);
    } else if (e.role === 'team' || e.role === 'portrait') {
      expect(e.output.path).toMatch(/^src\/assets\/team\/[a-z0-9-]+\.jpg$/);
    } else {
      expect(e.output.path).toMatch(/^src\/assets\/services\/[a-z]+\/\d{2}-[a-z0-9-]+\.jpg$/);
    }
  });

  it('flags photos below the card-only edge and all own-legacy photos as card-only', () => {
    for (const e of manifest) {
      if (e.rights === 'own-legacy' && longEdge(e) < CARD_ONLY_EDGE) expect(e.cardOnly, e.id).toBe(true);
      // plan §3.3: own-legacy is "cards only" at any size; everything else only below the threshold.
      expect(e.cardOnly, e.id).toBe(longEdge(e) < CARD_ONLY_EDGE || e.rights === 'own-legacy');
    }
  });

  it('matches the allow-list in scripts/asset-sources.mjs', () => {
    expect(manifest.map((e) => e.id).sort()).toEqual(ASSET_SOURCES.map((s) => s.id).sort());
    for (const s of ASSET_SOURCES) {
      const e = manifest.find((m) => m.id === s.id);
      expect(e, s.id).toBeDefined();
      expect(e).toMatchObject({
        rights: s.rights,
        role: s.role,
        project: s.project,
        category: s.category,
        notes: s.notes,
        output: { path: `src/assets/${s.out}` },
      });
      expect(EXCLUDED.test(s.file), s.file).toBe(false);
    }
  });

  it('keeps the Phase 0 Fischgrät photo that the homepage imports', () => {
    const e = findAssetByPath('projects/fischgraetparkett-eiche/01-parkett.jpg');
    expect(e?.id).toBe('fischgraetparkett-eiche-01');
    expect(e?.alt.length).toBeGreaterThanOrEqual(12);
  });
});

describe('asset files: stripped, sized and hashed as recorded', () => {
  it.each(manifest.map((e) => [e.output.path, e] as const))('%s', async (path, e) => {
    const buf = readFileSync(join(ROOT, path));
    expect(buf.length).toBe(e.output.bytes);
    expect(createHash('sha256').update(buf).digest('hex')).toBe(e.output.sha256);

    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe(path.endsWith('.png') ? 'png' : 'jpeg');
    expect(meta.exif, 'EXIF').toBeUndefined();
    expect(meta.xmp, 'XMP').toBeUndefined();
    expect(meta.iptc, 'IPTC').toBeUndefined();
    // GPS data lives in EXIF (GPS IFD) or XMP (exif:GPS*), both asserted absent above.
    expect(meta.orientation ?? 1, 'orientation is baked in').toBe(1);
    expect([meta.width, meta.height]).toEqual([e.output.w, e.output.h]);
    expect(longEdge(e)).toBeLessThanOrEqual(MAX_EDGE);
  });
});

describe('src/lib/asset-manifest', () => {
  it('exposes the same entries as the JSON file', () => {
    expect(assets).toEqual(manifest);
  });

  it('isPublishable accepts only the three publishable statuses', () => {
    for (const r of PUBLISHABLE_RIGHTS) expect(isPublishable(r)).toBe(true);
    for (const r of ['excluded', 'reference', 'stock', '', 'OWN']) expect(isPublishable(r)).toBe(false);
    expect(isPublishable({ rights: 'own-legacy' })).toBe(true);
    expect(isPublishable({ rights: 'third-party' })).toBe(false);
  });

  it('isAssetRole narrows known roles', () => {
    expect(isAssetRole('cover')).toBe(true);
    expect(isAssetRole('hero')).toBe(false);
  });

  it('finds entries by id and path', () => {
    expect(findAsset('eichentreppe-01')?.project).toBe('eichentreppe');
    expect(findAsset('nope')).toBeUndefined();
    expect(getAsset('eichentreppe-01').output.path).toBe('src/assets/projects/eichentreppe/01-treppe.jpg');
    expect(() => getAsset('nope')).toThrow(/unknown asset id/);
    for (const p of [
      'src/assets/projects/eichentreppe/01-treppe.jpg',
      'projects/eichentreppe/01-treppe.jpg',
      './src/assets/projects/eichentreppe/01-treppe.jpg',
      'src\\assets\\projects\\eichentreppe\\01-treppe.jpg',
    ]) {
      expect(findAssetByPath(p)?.id, p).toBe('eichentreppe-01');
    }
  });

  it('returns project photos in NN order, cover first', () => {
    const shots = getProjectAssets('treppenhaus-handlauf');
    expect(shots.map((s) => s.id)).toEqual([
      'treppenhaus-handlauf-01',
      'treppenhaus-handlauf-02',
      'treppenhaus-handlauf-03',
    ]);
    expect(shots[0]?.role).toBe('cover');
    expect(getProjectAssets('holzhaustuer-aufgearbeitet').map((s) => s.role)).toEqual(['before', 'after']);
    expect(getProjectAssets('unknown')).toEqual([]);
  });

  it('covers all 15 reference projects', () => {
    expect(getProjectSlugs()).toEqual([...PROJECT_SLUGS].sort());
  });
});
