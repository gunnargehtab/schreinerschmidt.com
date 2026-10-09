import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AREAS } from '../../src/lib/review';
import { DIST, describeDist, isDemo, loadPages } from '../helpers/dist';

// /intern/pruefliste/ (docs/architecture.md §5): demo builds only, always noindex.
const page = loadPages().find((p) => p.rel === 'intern/pruefliste/index.html');

/** The seeded content populates every area; drop one here once the owner has confirmed all of it. */
const EXPECTED_AREAS = AREAS;

describeDist('Prüfliste', () => {
  if (!isDemo()) {
    it('is not built outside the demo', () => {
      expect(page).toBeUndefined();
      expect(existsSync(join(DIST, 'intern', 'pruefliste'))).toBe(false);
    });
    return;
  }

  it('exists in the demo build', () => {
    expect(page, 'dist/intern/pruefliste/index.html').toBeDefined();
  });

  it('is noindex', () => {
    expect(page?.root.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });

  it('has the h1 „Prüfliste für die Freigabe“', () => {
    expect(page?.root.querySelectorAll('h1').map((h) => h.text.trim())).toEqual(['Prüfliste für die Freigabe']);
  });

  it('lists open items', () => {
    expect(page?.root.querySelectorAll('tbody tr').length ?? 0).toBeGreaterThan(0);
  });

  it.each(EXPECTED_AREAS.map((a) => [a]))('has at least one item under „%s“', (area) => {
    const heading = page?.root.querySelectorAll('h2').find((h) => h.text.trim().startsWith(`${area} (`));
    expect(heading, `h2 ${area}`).toBeDefined();
    const section = heading?.closest('section');
    expect(section?.querySelectorAll('tbody tr').length ?? 0).toBeGreaterThan(0);
  });

  it('flags the legal placeholders that would block a release', () => {
    expect(page?.root.querySelectorAll('.pruef-block').length ?? 0).toBeGreaterThan(0);
  });

  it('carries the site JSON-LD with the business and website nodes', () => {
    const script = page?.root.querySelector('script[type="application/ld+json"]');
    expect(script).toBeDefined();
    const doc = JSON.parse(script?.text ?? '{}') as { '@graph'?: { '@type': string }[] };
    expect(doc['@graph']?.map((n) => n['@type'])).toEqual(['HomeAndConstructionBusiness', 'WebSite']);
  });
});
