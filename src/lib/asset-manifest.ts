// Typed access to src/assets/asset-manifest.json (written by scripts/migrate-assets.mjs, docs/architecture.md §6).
// The rights gate in tests/unit/assets.test.ts keeps the manifest and src/assets in sync.
import manifestJson from '../assets/asset-manifest.json';

export const PUBLISHABLE_RIGHTS = ['own', 'own-legacy', 'own-unverified'] as const;
export type Rights = (typeof PUBLISHABLE_RIGHTS)[number];

export const ASSET_ROLES = [
  'cover',
  'gallery',
  'before',
  'after',
  'type',
  'portrait',
  'team',
  'brand-reference',
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const ASSET_CATEGORIES = ['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen'] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/** Long edge below which a photo is only good enough for cards (docs/architecture.md §6 step 4). */
export const CARD_ONLY_EDGE = 1200;

export interface AssetEntry {
  id: string;
  sourceUrl: string;
  /** sha256 of the original download. */
  sha256: string;
  original: {
    w: number;
    h: number;
    bytes: number;
    exif: {
      make: string | null;
      model: string | null;
      date: string | null;
      artist: string | null;
      copyright: string | null;
      gps: boolean;
    };
  };
  output: { path: string; w: number; h: number; bytes: number; sha256: string };
  /** Long edge < CARD_ONLY_EDGE, or rights 'own-legacy' (plan §3.3): use in cards only, never as a hero or lightbox image. */
  cardOnly: boolean;
  rights: Rights;
  rightsEvidence: string;
  /** German alt text draft; empty until drafted. */
  alt: string;
  /** Primary service (ServiceKey); null for team and brand assets. */
  category: AssetCategory | null;
  /** Project slug (docs/architecture.md §6 table); null for service, team and brand assets. */
  project: string | null;
  role: AssetRole;
  /** 'pending' until the photo has been checked for privacy issues (e.g. identifiable people). */
  privacyCheck: string;
  notes: string;
}

/** All manifest entries, sorted by id. */
export const assets: readonly AssetEntry[] = manifestJson as readonly AssetEntry[];

const byId = new Map(assets.map((a) => [a.id, a]));
const byPath = new Map(assets.map((a) => [a.output.path, a]));

/** True for a rights status (or an entry whose status) may be published. */
export function isPublishable(entryOrRights: { rights: string } | string): boolean {
  const rights = typeof entryOrRights === 'string' ? entryOrRights : entryOrRights.rights;
  return (PUBLISHABLE_RIGHTS as readonly string[]).includes(rights);
}

export function isAssetRole(role: string): role is AssetRole {
  return (ASSET_ROLES as readonly string[]).includes(role);
}

export function findAsset(id: string): AssetEntry | undefined {
  return byId.get(id);
}

/** Returns the entry for an id; throws for unknown or unpublishable ids so a build fails early. */
export function getAsset(id: string): AssetEntry {
  const entry = byId.get(id);
  if (!entry) throw new Error(`asset-manifest: unknown asset id "${id}"`);
  if (!isPublishable(entry)) throw new Error(`asset-manifest: asset "${id}" has rights "${entry.rights}"`);
  return entry;
}

/** Looks an entry up by its output path, with or without the leading "src/assets/". */
export function findAssetByPath(path: string): AssetEntry | undefined {
  const normalised = path.replace(/\\/g, '/').replace(/^\.?\/?(src\/assets\/)?/, 'src/assets/');
  return byPath.get(normalised);
}

/** Publishable photos of a project in their NN order (cover first). */
export function getProjectAssets(project: string): AssetEntry[] {
  return assets
    .filter((a) => a.project === project && isPublishable(a))
    .sort((a, b) => (a.output.path < b.output.path ? -1 : a.output.path > b.output.path ? 1 : 0));
}

/** Slugs of all projects that have at least one asset, sorted. */
export function getProjectSlugs(): string[] {
  return [...new Set(assets.flatMap((a) => (a.project ? [a.project] : [])))].sort();
}
