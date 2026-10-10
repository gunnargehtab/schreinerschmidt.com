// Thin astro:content wrapper around src/lib/review.ts: loads every collection, the asset manifest
// and the .astro sources, and runs the production guard. Build-time only (Prüfliste route).
import { getCollection, type CollectionKey } from 'astro:content';
import { assets } from './asset-manifest';
import { selectModeBlocks, stripComments } from './legal-tokens';
import {
  collectReviewItems,
  formatGuardReport,
  guardDecision,
  pageRouteMatchers,
  type GuardDecision,
  type ReviewEntry,
  type ReviewItem,
  type SourceFile,
} from './review';

const COLLECTIONS = [
  'settings',
  'services',
  'projects',
  'testimonials',
  'team',
  'jobs',
  'woods',
  'faqs',
] as const satisfies readonly CollectionKey[];

// Raw source text of every component and page, to catch hard-coded copy such as the header tagline.
const rawSources = import.meta.glob<string>('/src/**/*.astro', { query: '?raw', import: 'default', eager: true });

export const sourceFiles: readonly SourceFile[] = Object.entries(rawSources)
  .map(([path, text]) => ({ path: path.replace(/^\/+/, ''), text }))
  .sort((a, b) => (a.path < b.path ? -1 : 1));

const routes = pageRouteMatchers(sourceFiles.map((f) => f.path));

/** True when a site-relative route (`leistungen/boeden/`) has a page file that can render it. */
export const isKnownPage = (page: string | undefined): page is string =>
  page !== undefined && routes.some((re) => re.test(page));

let cached: Promise<ReviewItem[]> | undefined;

/** Every open review item (cached per build). */
export function loadReviewItems(): Promise<ReviewItem[]> {
  cached ??= (async () => {
    const entries: ReviewEntry[] = [];
    for (const name of COLLECTIONS) {
      for (const e of await getCollection(name)) {
        entries.push({
          collection: name,
          id: e.id,
          data: e.data as Record<string, unknown>,
          body: 'body' in e && typeof e.body === 'string' ? e.body : undefined,
        });
      }
    }
    // Page copy and legal templates are only scanned for `[[Platzhalter: …]]` markers. A legal body is
    // reduced to its production text: demo-only blocks never go live, so their markers can't block.
    const copy: ReviewEntry[] = [
      ...(await getCollection('pages')).map((e) => ({
        collection: 'pages',
        id: e.id,
        data: e.data as Record<string, unknown>,
      })),
      ...(await getCollection('legal')).map((e) => ({
        collection: 'legal',
        id: e.id,
        data: e.data as Record<string, unknown>,
        body: stripComments(selectModeBlocks(e.body ?? '', false)),
      })),
    ];
    return collectReviewItems({ entries, copy, assets, sources: sourceFiles });
  })();
  return cached;
}

/**
 * Production guard (plan §1.2): in non-demo builds, throws when legal, contact, hours or salary
 * data still holds placeholders, or published copy a `[[Platzhalter: …]]` marker.
 * `ALLOW_PLACEHOLDERS=true` (env/audit.env) downgrades that to a warning so the Lighthouse audit
 * build keeps working.
 */
export async function runProductionGuard(demo: boolean): Promise<GuardDecision> {
  const allowPlaceholders = process.env['ALLOW_PLACEHOLDERS'] === 'true';
  const decision = guardDecision(await loadReviewItems(), { demo, allowPlaceholders });
  const { error, warning } = formatGuardReport(decision);
  if (warning) console.warn(`\n${warning}\n`);
  if (error) throw new Error(error);
  return decision;
}
