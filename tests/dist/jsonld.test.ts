import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ROOT, describeDist, isDemo, isRedirectPage, loadPages, type DistPage } from '../helpers/dist';

// JSON-LD in the built pages (docs/architecture.md §7, §11): every block parses, JobPosting only on
// /karriere/<slug>/. jobLocation needs a confirmed address: demo builds assume it (the one demo-only
// override in src/pages/karriere/[slug].astro), production builds emit no JobPosting until the
// settings entry is confirmed.

const pages = loadPages().filter((p) => !isRedirectPage(p));
const JOB_PAGE = /^karriere\/(?!danke\/)[^/]+\/index\.html$/;

/** Status of the settings entry "site" (its top-level `review`), which covers the address. */
function addressStatus(): string {
  const yaml = readFileSync(join(ROOT, 'src/content/settings.yaml'), 'utf8');
  // `site:` → two-space `review:` → four-space `status:` (nested facts are indented deeper).
  const status = /^ {2}review:[ \t]*\r?\n {4}status:[ \t]*['"]?([\w-]+)/m.exec(yaml)?.[1];
  if (!status) throw new Error('settings.yaml: site.review.status not found');
  return status;
}

type Node = { '@type'?: string | string[]; '@graph'?: Node[] };

function jsonLdTypes(page: DistPage): string[] {
  return page.root
    .querySelectorAll('script[type="application/ld+json"]')
    .flatMap((s) => {
      const doc = JSON.parse(s.text) as Node | Node[];
      return (Array.isArray(doc) ? doc : (doc['@graph'] ?? [doc])).flatMap((n) => n['@type'] ?? []);
    });
}

describeDist('JSON-LD', () => {
  const jobPages = pages.filter((p) => JOB_PAGE.test(p.rel));

  it('has job pages to check', () => {
    expect(jobPages.length).toBeGreaterThan(0);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: JSON-LD parses; JobPosting only on job pages', (_rel, page) => {
    const types = jsonLdTypes(page);
    if (!JOB_PAGE.test(page.rel)) expect(types).not.toContain('JobPosting');
  });

  if (isDemo()) {
    it('demo: every job page carries a JobPosting (address assumed confirmed in the demo)', () => {
      for (const page of jobPages) expect(jsonLdTypes(page), page.rel).toContain('JobPosting');
    });
  } else {
    it('production: no JobPosting while the address is unconfirmed, one per job page once confirmed', () => {
      const confirmed = addressStatus() === 'confirmed';
      for (const page of jobPages) {
        const count = jsonLdTypes(page).filter((t) => t === 'JobPosting').length;
        expect(count, page.rel).toBe(confirmed ? 1 : 0);
      }
    });
  }
});
