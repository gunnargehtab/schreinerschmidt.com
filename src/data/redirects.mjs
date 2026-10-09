// Legacy URLs from the old Webflow site (docs/plan.md §3.1).
// Destinations are site-relative; astro.config.mjs prefixes the base, because Astro's
// static redirects ignore `base`. A dist test requires every target page to exist.

/** @type {ReadonlyArray<readonly [from: string, to: string]>} */
export const legacyRedirects = [
  ['/leistungen/boden', '/leistungen/boeden/'],
  // Enable when the target page exists:
  // ['/leistungen/leistung', '/leistungen/'],
  // ['/leistungen/mobel', '/leistungen/moebel/'],
  // ['/leistungen/turen', '/leistungen/tueren/'],
  // ['/team-karriere', '/ueber-uns/'],
  // ['/bewerben', '/karriere/#bewerbung'],
  // ['/home-no-cart', '/'],
  // ['/search', '/'],
];
