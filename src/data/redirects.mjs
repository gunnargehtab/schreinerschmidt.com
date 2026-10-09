// Legacy URLs from the old Webflow site (docs/plan.md §3.1).
// src/pages/[...legacy].astro renders one German meta-refresh page per entry (noindex, no
// canonical). Destinations are site-relative and may carry `#hash`; the page prefixes the base.
// A dist test requires every target page to exist.

/** @type {ReadonlyArray<readonly [from: string, to: string]>} */
export const legacyRedirects = [
  ['/leistungen/boden', '/leistungen/boeden/'],
  ['/leistungen/leistung', '/leistungen/'],
  ['/leistungen/mobel', '/leistungen/moebel/'],
  ['/leistungen/turen', '/leistungen/tueren/'],
  ['/team-karriere', '/ueber-uns/'],
  ['/bewerben', '/karriere/#bewerbung'],
  ['/home-no-cart', '/'],
  ['/search', '/'],
];
