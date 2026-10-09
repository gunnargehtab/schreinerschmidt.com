// Review items for the Prüfliste and the production guard (docs/architecture.md §5, plan §3.2).
// Pure functions only: no astro:content, no fs. src/lib/review-content.ts loads the data.
import { isFact } from './jsonld';
import type { Status } from './content-schema';

/** Display groups of the Prüfliste, in page order. */
export const AREAS = [
  'Rechtliches',
  'Kontakt',
  'Zeiten',
  'Gehalt',
  'Bilder & Rechte',
  'Einwilligungen',
  'Werbeaussagen (UWG)',
  'Inhalte',
] as const;
export type Area = (typeof AREAS)[number];

/** Data groups the production guard checks for placeholders (plan §1.2, §3.2). */
export type GuardCategory = 'legal' | 'contact' | 'hours' | 'salary';

export type ReviewKind = 'entry' | 'fact' | 'consent' | 'asset' | 'green-claim';

export interface ReviewItem {
  area: Area;
  /** Content collection, `assets` for the asset manifest, `src` for source files. */
  collection: string;
  /** Entry id, asset id or source file path. */
  id: string;
  /** Dotted data path (`settings.site.legal.craftsRegisterNo`) or `file:line` for source files. */
  path: string;
  status: Status;
  note?: string | undefined;
  source?: string | undefined;
  kind: ReviewKind;
  /** Site-relative route where the item appears (`leistungen/boeden/`), when known. */
  page?: string | undefined;
  /** Set when the production guard checks this item. */
  guard?: GuardCategory | undefined;
}

/** A content collection entry, reduced to what the collector needs. */
export interface ReviewEntry {
  collection: string;
  id: string;
  data: Record<string, unknown>;
  body?: string | undefined;
}

/** The asset-manifest fields the collector needs (src/lib/asset-manifest.ts). */
export interface ReviewAsset {
  id: string;
  rights: string;
  privacyCheck: string;
  alt: string;
  category: string | null;
  project: string | null;
  role: string;
  rightsEvidence?: string | undefined;
  notes?: string | undefined;
  output: { path: string };
}

export interface SourceFile {
  /** Repo-relative path with forward slashes (`src/components/layout/Header.astro`). */
  path: string;
  text: string;
}

export interface ReviewInput {
  entries: readonly ReviewEntry[];
  assets?: readonly ReviewAsset[] | undefined;
  sources?: readonly SourceFile[] | undefined;
}

/* --------------------------------------------------------------- green claims */

/**
 * Generic environmental claims (CLAUDE.md, plan §3.4; UWG / EU 2024/825). Patterns are stems, so
 * inflections and compounds (`Nachhaltigkeit`, `Umweltbewusstsein`, `ökologischer`) match too.
 * Each pattern must start at a word start; letters are Unicode-aware (`\p{L}`).
 */
export const GREEN_CLAIM_TERMS: readonly { term: string; pattern: string }[] = [
  { term: 'umweltfreundlich', pattern: 'umweltfreundlich' },
  { term: 'umweltschonend', pattern: 'umweltschonend' },
  { term: 'umweltbewusst', pattern: 'umweltbewusst' },
  { term: 'umweltgerecht', pattern: 'umweltgerecht' },
  { term: 'umweltverträglich', pattern: 'umweltverträglich' },
  { term: 'nachhaltig', pattern: 'nachhaltig' },
  { term: 'ökologisch', pattern: 'ökolog' },
  { term: 'öko', pattern: 'öko(?!nom|log)' },
  { term: 'natürlich', pattern: 'natürlich' },
  { term: 'naturnah', pattern: 'naturnah' },
  { term: 'klimaneutral', pattern: 'klima(?:neutral|freundlich|positiv|schonend)' },
  { term: 'CO₂-neutral', pattern: 'co[2₂][\\s\\u00a0\\u202f-]*(?:neutral|frei|arm|kompensiert)' },
  { term: 'ressourcenschonend', pattern: 'ressourcen(?:schonend|sparend)' },
  { term: 'schadstofffrei', pattern: 'schadstoff(?:frei|arm)' },
  { term: 'emissionsfrei', pattern: 'emissions(?:frei|arm)' },
  { term: 'biologisch', pattern: 'biolog' },
  // "Bio" alone or as "Bio-…", not "Biografie".
  { term: 'bio', pattern: 'bio(?![\\p{L}])' },
  // The adjective only: not "Gründerzeit" or "gründlich", and not "ins Grüne" / "im Grünen" (scenery).
  { term: 'grün', pattern: '(?<!\\b(?:ins|im) )grün(?:e[nmrs]?)?(?![\\p{L}])' },
];

const WORD_START = '(?<![\\p{L}\\p{N}])';
const GREEN_RE = new RegExp(GREEN_CLAIM_TERMS.map((t) => `${WORD_START}(${t.pattern})`).join('|'), 'giu');

export interface GreenClaimHit {
  /** The list term that matched (`nachhaltig`). */
  term: string;
  /** The matched text as written (`Nachhaltigkeit`, with the rest of the word). */
  match: string;
  /** Character offset of the match. */
  index: number;
  /** ~40 characters of context on either side. */
  excerpt: string;
}

/** Finds every generic green-claim word in a text (case-insensitive, stem-aware). */
export function findGreenClaims(text: string): GreenClaimHit[] {
  const hits: GreenClaimHit[] = [];
  for (const m of text.matchAll(GREEN_RE)) {
    const group = m.slice(1).findIndex((g) => g !== undefined);
    const term = GREEN_CLAIM_TERMS[group]?.term ?? m[0];
    const index = m.index ?? 0;
    // Extend the match to the end of the word so the hit reads "Umweltbewusstsein", not "Umweltbewusst".
    const rest = /^[\p{L}\p{N}-]*/u.exec(text.slice(index + m[0].length))?.[0] ?? '';
    const match = m[0] + rest;
    const from = Math.max(0, index - 40);
    const to = Math.min(text.length, index + match.length + 40);
    const snippet = text
      .slice(from, to)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const excerpt = `${from > 0 ? '…' : ''}${snippet}${to < text.length ? '…' : ''}`;
    hits.push({ term, match, index, excerpt });
  }
  return hits;
}

/**
 * Comments in source files are not published copy. Blanks them out (keeping line breaks so line
 * numbers stay right): `<!-- -->`, `/* *\/`, `{/* *\/}` and `//` line comments (not `https://`).
 */
export function stripSourceComments(text: string): string {
  const blank = (s: string): string => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/gm, (all, pre: string) => pre + blank(all.slice(pre.length)));
}

/* ------------------------------------------------------------------ helpers */

type Data = Record<string, unknown>;

const isRecord = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `image()` results and `reference()`s are not copy and hold no facts. */
const isOpaque = (v: Data): boolean =>
  ('width' in v && 'height' in v && 'format' in v) || (Object.keys(v).length === 2 && 'collection' in v && 'id' in v);

const joinPath = (base: string, key: string | number): string =>
  typeof key === 'number' ? `${base}[${key}]` : `${base}.${key}`;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);

function reviewOf(data: Data): { status: Status; note?: string | undefined; source?: string | undefined } {
  const r = isRecord(data['review']) ? data['review'] : {};
  const status = r['status'];
  return {
    status: status === 'confirmed' || status === 'placeholder' ? status : 'needs-review',
    note: str(r['note']),
    source: str(r['source']),
  };
}

/** Walks `data` and calls `visit` for every `fact()` object (not descending into facts). */
function walkFacts(
  value: unknown,
  path: string,
  visit: (fact: { status: Status; note?: unknown; source?: unknown }, path: string) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkFacts(v, joinPath(path, i), visit));
    return;
  }
  if (!isRecord(value) || value instanceof Date || isOpaque(value)) return;
  if (isFact(value)) {
    visit(value as { status: Status }, path);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === 'review') continue;
    walkFacts(v, joinPath(path, k), visit);
  }
}

/** Keys whose strings are internal metadata, not published copy. */
const NON_COPY_KEYS = new Set(['review', 'note', 'source', 'status', 'src', 'sketch', 'swatch', 'textureId']);

/** Walks every published string in `data` (skipping review metadata, image and reference objects). */
function walkStrings(value: unknown, path: string, visit: (text: string, path: string) => void): void {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, joinPath(path, i), visit));
    return;
  }
  if (!isRecord(value) || value instanceof Date || isOpaque(value)) return;
  for (const [k, v] of Object.entries(value)) {
    if (NON_COPY_KEYS.has(k)) continue;
    walkStrings(v, joinPath(path, k), visit);
  }
}

/* ------------------------------------------------------------ classification */

const SETTINGS_AREAS: readonly [RegExp, Area, GuardCategory | undefined][] = [
  [/^(legalName|legal)(\.|\[|$)/, 'Rechtliches', 'legal'],
  [/^(phone|email|address)(\.|\[|$)/, 'Kontakt', 'contact'],
  [/^geo(\.|\[|$)/, 'Kontakt', undefined],
  [/^hours(\.|\[|$)/, 'Zeiten', 'hours'],
];

/** Area and guard category of a settings field path (relative to the entry, e.g. `legal.vatId`). */
export function classifySettingsPath(field: string): { area: Area; guard?: GuardCategory | undefined } {
  for (const [re, area, guard] of SETTINGS_AREAS) if (re.test(field)) return { area, guard };
  return { area: 'Inhalte' };
}

function settingsPage(field: string): string | undefined {
  if (/^(legalName|legal|owner)(\.|$)/.test(field)) return 'impressum/';
  if (/^(phone|email|address|hours|geo)(\.|$)/.test(field)) return 'kontakt/';
  if (/^areaServed(\.|$)/.test(field)) return 'kontakt/';
  return undefined;
}

/** Collects which entries reference which: `woods.eiche` → `['services.boeden', …]`. */
function referrers(entries: readonly ReviewEntry[]): Map<string, ReviewEntry[]> {
  const map = new Map<string, ReviewEntry[]>();
  for (const e of entries) {
    for (const key of ['woods', 'faqs', 'projects'] as const) {
      const refs = e.data[key];
      if (!Array.isArray(refs)) continue;
      for (const r of refs) {
        const id = isRecord(r) ? str(r['id']) : str(r);
        if (!id) continue;
        const k = `${key}.${id}`;
        map.set(k, [...(map.get(k) ?? []), e]);
      }
    }
  }
  return map;
}

/** The route (site-relative, trailing slash) an entry is shown on, when known (plan §3.1). */
export function entryPage(entry: ReviewEntry, refs?: Map<string, ReviewEntry[]>): string | undefined {
  const d = entry.data;
  switch (entry.collection) {
    case 'services':
      return `leistungen/${str(d['key']) ?? entry.id}/`;
    case 'projects':
      return d['detailPage'] === true ? `referenzen/${entry.id}/` : 'referenzen/';
    case 'jobs':
      return d['active'] === true ? `karriere/${entry.id}/` : 'karriere/';
    case 'team':
      return 'ueber-uns/';
    case 'testimonials':
      return '';
    case 'woods':
    case 'faqs': {
      const service = refs?.get(`${entry.collection}.${entry.id}`)?.find((r) => r.collection === 'services');
      return service ? entryPage(service) : undefined;
    }
    default:
      return undefined;
  }
}

function assetPage(asset: ReviewAsset, entries: readonly ReviewEntry[]): string | undefined {
  if (asset.project) {
    const project = entries.find((e) => e.collection === 'projects' && e.id === asset.project);
    return project ? entryPage(project) : 'referenzen/';
  }
  if (asset.role === 'team' || asset.role === 'portrait') return 'ueber-uns/';
  if (asset.category) return `leistungen/${asset.category}/`;
  return undefined;
}

/** `src/pages/intern/stil/[...demo].astro` → `intern/stil/`; undefined outside src/pages. */
export function sourcePage(path: string): string | undefined {
  const m = /^src\/pages\/(.+)\.astro$/.exec(path);
  if (!m?.[1] || /\[(?!\.\.\.)[^\]]+\]/.test(m[1])) return undefined;
  const segments = m[1].split('/').filter((s) => s !== 'index' && !/^\[\.\.\.[^\]]+\]$/.test(s));
  if (segments.some((s) => s === '404')) return undefined;
  return segments.length ? `${segments.join('/')}/` : '';
}

/**
 * Route matchers for the page files below src/pages, so the Prüfliste links only to routes that
 * exist. A root catch-all (`[...legacy].astro`, legacy redirects) and the 404 page are ignored.
 */
export function pageRouteMatchers(paths: readonly string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const path of paths) {
    const m = /^src\/pages\/(.+)\.astro$/.exec(path);
    if (!m?.[1]) continue;
    const segments = m[1].split('/');
    if (segments.at(-1) === 'index') segments.pop();
    if (segments.length === 0 || segments[0] === '404') {
      if (segments.length === 0) out.push(/^$/);
      continue;
    }
    if (segments.length === 1 && /^\[\.\.\.[^\]]+\]$/.test(segments[0] ?? '')) continue;
    const source = segments
      .map((s) =>
        /^\[\.\.\.[^\]]+\]$/.test(s)
          ? '(?:.+/)?'
          : /^\[[^\]]+\]$/.test(s)
            ? '[^/]+/'
            : `${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`,
      )
      .join('');
    out.push(new RegExp(`^${source}$`));
  }
  return out;
}

/* ----------------------------------------------------------------- collector */

const UNPUBLISHED_RIGHTS: Record<string, string> = {
  'own-legacy': 'Altfoto 2010–2012: bestätigen, dass es ein Projekt der Schreinerei Schmidt ist (UWG).',
  'own-unverified': 'Herkunft ungeklärt: Rechte beim Inhaber bestätigen.',
};

/** Every open review item across the content, the asset manifest and the source files. */
export function collectReviewItems({ entries, assets = [], sources = [] }: ReviewInput): ReviewItem[] {
  const items: ReviewItem[] = [];
  const refs = referrers(entries);

  for (const entry of entries) {
    const { collection, id, data } = entry;
    const prefix = `${collection}.${id}`;
    const entryReview = reviewOf(data);
    const page = entryPage(entry, refs);

    // 1. The entry itself.
    if (entryReview.status !== 'confirmed') {
      items.push({
        area: 'Inhalte',
        collection,
        id,
        path: prefix,
        status: entryReview.status,
        note: entryReview.note,
        source: entryReview.source,
        kind: 'entry',
        page,
      });
    }

    // 2. Every fact() below it.
    walkFacts(data, prefix, (fact, path) => {
      if (fact.status === 'confirmed') return;
      const field = path.slice(prefix.length + 1);
      let area: Area = 'Inhalte';
      let guard: GuardCategory | undefined;
      let factPage = page;
      if (collection === 'settings') {
        ({ area, guard } = classifySettingsPath(field));
        factPage = settingsPage(field);
      } else if (collection === 'jobs' && field === 'baseSalary') {
        area = 'Gehalt';
        // Inactive jobs are not published, so their salary can't block a release.
        guard = data['active'] === true ? 'salary' : undefined;
      }
      items.push({
        area,
        collection,
        id,
        path,
        status: fact.status,
        note: str(fact.note),
        source: str(fact.source),
        kind: 'fact',
        page: factPage,
        guard,
      });
    });

    // 2b. Either USt-IdNr. or Wirtschafts-IdNr. must end up confirmed with a value (Impressum, § 5 DDG).
    if (collection === 'settings' && isRecord(data['legal'])) {
      const ids = (['vatId', 'economicId'] as const).map((k) => data['legal'] && (data['legal'] as Data)[k]);
      const covered = ids.some((f) => isFact(f) && f.status === 'confirmed' && f.value !== null && f.value !== '');
      const placeholderFlagged = ids.some((f) => isFact(f) && f.status === 'placeholder');
      if (!covered && !placeholderFlagged) {
        items.push({
          area: 'Rechtliches',
          collection,
          id,
          path: `${prefix}.legal.vatId / ${prefix}.legal.economicId`,
          status: 'placeholder',
          note: 'USt-IdNr. (§ 27a UStG) oder Wirtschafts-IdNr. muss bestätigt und eingetragen sein.',
          kind: 'fact',
          page: 'impressum/',
          guard: 'legal',
        });
      }
    }

    // 3. Settings fields without their own fact() inherit the entry status (legal and contact data).
    if (collection === 'settings' && entryReview.status !== 'confirmed') {
      const plain: [string, unknown][] = [
        ['phone', data['phone']],
        ['email', data['email']],
        ['address', data['address']],
        ...(isRecord(data['legal'])
          ? Object.entries(data['legal']).filter(([, v]) => !isFact(v) && v !== undefined)
          : []
        ).map(([k, v]): [string, unknown] => [`legal.${k}`, v]),
      ];
      for (const [field, value] of plain) {
        if (value === undefined) continue;
        const { area, guard } = classifySettingsPath(field);
        items.push({
          area,
          collection,
          id,
          path: `${prefix}.${field}`,
          status: entryReview.status,
          note: `Status des Eintrags ${prefix} (kein eigenes Prüffeld).`,
          source: entryReview.source,
          kind: 'entry',
          page: settingsPage(field),
          guard,
        });
      }
    }

    // 4. Consent to publish.
    if (collection === 'testimonials' && data['permission'] !== 'erteilt') {
      items.push({
        area: 'Einwilligungen',
        collection,
        id,
        path: `${prefix}.permission`,
        status: 'needs-review',
        note: `Erlaubnis zum Zitieren: ${str(data['permission']) ?? 'fehlt'}.`,
        source: entryReview.source,
        kind: 'consent',
        page,
      });
    }
    if (collection === 'team' && data['publicationConsent'] !== 'erteilt') {
      items.push({
        area: 'Einwilligungen',
        collection,
        id,
        path: `${prefix}.publicationConsent`,
        status: 'needs-review',
        note: `Einwilligung zur Veröffentlichung: ${str(data['publicationConsent']) ?? 'fehlt'}.`,
        source: entryReview.source,
        kind: 'consent',
        page,
      });
    }

    // 5. Green claims in published strings and the body.
    const scan = (text: string, path: string): void => {
      for (const hit of findGreenClaims(text)) {
        items.push(greenItem(collection, id, path, hit, page));
      }
    };
    walkStrings(data, prefix, scan);
    if (entry.body) scan(entry.body, `${prefix}.body`);
  }

  // 6. The asset manifest.
  for (const asset of assets) {
    const problems: string[] = [];
    if (asset.rights in UNPUBLISHED_RIGHTS)
      problems.push(`Rechte „${asset.rights}“: ${UNPUBLISHED_RIGHTS[asset.rights]}`);
    if (asset.privacyCheck !== 'done') problems.push(`Datenschutzprüfung: ${asset.privacyCheck || 'fehlt'}.`);
    if (problems.length > 0) {
      items.push({
        area: 'Bilder & Rechte',
        collection: 'assets',
        id: asset.id,
        path: asset.output.path,
        status: 'needs-review',
        note: [...problems, str(asset.notes)].filter(Boolean).join(' '),
        source: str(asset.rightsEvidence),
        kind: 'asset',
        page: assetPage(asset, entries),
      });
    }
    for (const hit of findGreenClaims(asset.alt)) {
      items.push(greenItem('assets', asset.id, `assets.${asset.id}.alt`, hit, assetPage(asset, entries)));
    }
  }

  // 7. Source files (header tagline and other hard-coded copy).
  for (const file of sources) {
    const text = stripSourceComments(file.text);
    for (const hit of findGreenClaims(text)) {
      const line = text.slice(0, hit.index).split('\n').length;
      items.push(greenItem('src', file.path, `${file.path}:${line}`, hit, sourcePage(file.path)));
    }
  }

  return items;
}

function greenItem(collection: string, id: string, path: string, hit: GreenClaimHit, page?: string): ReviewItem {
  return {
    area: 'Werbeaussagen (UWG)',
    collection,
    id,
    path,
    status: 'needs-review',
    note: `Allgemeine Umweltaussage „${hit.match}“ (${hit.term}): belegen, konkret formulieren oder streichen. Fundstelle: ${hit.excerpt}`,
    kind: 'green-claim',
    page,
  };
}

/** Items grouped by area in Prüfliste order (empty areas included). */
export function groupByArea(items: readonly ReviewItem[]): { area: Area; items: ReviewItem[] }[] {
  return AREAS.map((area) => ({ area, items: items.filter((i) => i.area === area) }));
}

/* ------------------------------------------------------------ production guard */

export interface GuardOptions {
  /** PUBLIC_DEMO: demo builds are never blocked. */
  demo: boolean;
  /** ALLOW_PLACEHOLDERS=true (env/audit.env): report blocking items as warnings instead. */
  allowPlaceholders: boolean;
}

export interface GuardDecision {
  /** `skip`: demo build; `pass`: nothing blocks; `allowed`: blockers overridden; `fail`: the build must stop. */
  outcome: 'skip' | 'pass' | 'allowed' | 'fail';
  /** Placeholders in legal, contact, hours or salary data. */
  blocking: ReviewItem[];
  /** Unconfirmed (needs-review) items in the same data; never block. */
  warnings: ReviewItem[];
}

const GUARD_LABEL: Record<GuardCategory, string> = {
  legal: 'Rechtliches',
  contact: 'Kontakt',
  hours: 'Zeiten',
  salary: 'Gehalt',
};

/** Decides whether a non-demo build may proceed (plan §1.2: placeholders in guarded data block it). */
export function guardDecision(items: readonly ReviewItem[], { demo, allowPlaceholders }: GuardOptions): GuardDecision {
  const guarded = items.filter((i) => i.guard !== undefined);
  const blocking = guarded.filter((i) => i.status === 'placeholder');
  const warnings = guarded.filter((i) => i.status === 'needs-review');
  if (demo) return { outcome: 'skip', blocking, warnings };
  if (blocking.length === 0) return { outcome: 'pass', blocking, warnings };
  return { outcome: allowPlaceholders ? 'allowed' : 'fail', blocking, warnings };
}

const line = (i: ReviewItem): string =>
  `  - [${i.guard ? GUARD_LABEL[i.guard] : i.area}] ${i.path} (${i.status})${i.note ? `: ${i.note}` : ''}`;

/** Human-readable build output for a decision (English, it's build tooling). */
export function formatGuardReport(decision: GuardDecision): { error?: string; warning?: string } {
  const out: { error?: string; warning?: string } = {};
  const { outcome, blocking, warnings } = decision;
  if (outcome === 'skip') return out;
  if (outcome === 'fail') {
    out.error =
      `Production guard: ${blocking.length} placeholder(s) in legal, contact, hours or salary data. ` +
      `Confirm or supply them in src/content/ (see /intern/pruefliste/ in the demo build), ` +
      `or set ALLOW_PLACEHOLDERS=true for a non-public audit build.\n${blocking.map(line).join('\n')}`;
  }
  const notes: string[] = [];
  if (outcome === 'allowed') {
    notes.push(
      `Production guard skipped (ALLOW_PLACEHOLDERS=true): ${blocking.length} placeholder(s) would block a release.\n${blocking.map(line).join('\n')}`,
    );
  }
  if (warnings.length > 0) {
    notes.push(
      `Production guard: ${warnings.length} item(s) in legal, contact, hours or salary data still need review.\n${warnings.map(line).join('\n')}`,
    );
  }
  if (notes.length > 0) out.warning = notes.join('\n');
  return out;
}
