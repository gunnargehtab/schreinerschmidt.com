// Shared navigation data for the header, the mobile sheet and the footer.
import { getCollection, getEntry } from 'astro:content';
import { EN_DASH, NNBSP } from '../../lib/format';
import { url } from '../../lib/url';

// needs-review: green claim (UWG), see docs/owner-checklist.md. Single constant, rendered as plain
// live text until the owner substantiates it (CLAUDE.md "No generic green claims").
export const TAGLINE = 'Umweltbewusstes Holzhandwerk';

export interface NavLink {
  label: string;
  /** Site-relative path, passed through `url()` when rendered. */
  href: string;
}

/** Top-level links after "Leistungen" (which opens the services disclosure). */
export const MAIN_LINKS: readonly NavLink[] = [
  { label: 'Referenzen', href: 'referenzen/' },
  { label: 'Über uns', href: 'ueber-uns/' },
  { label: 'Karriere', href: 'karriere/' },
  { label: 'Kontakt', href: 'kontakt/' },
];

export const SERVICES_HREF = 'leistungen/';
export const CONFIGURATOR_HREF = 'konfigurator/';
export const LEGAL_LINKS: readonly NavLink[] = [
  { label: 'Impressum', href: 'impressum/' },
  { label: 'Datenschutz', href: 'datenschutz/' },
];

/** The 7 services in their collection order. */
export async function getServiceLinks(): Promise<NavLink[]> {
  const services = await getCollection('services');
  return services
    .sort((a, b) => a.data.order - b.data.order)
    .map(({ data }) => ({ label: data.title, href: `${SERVICES_HREF}${data.key}/` }));
}

export async function getSite() {
  const entry = await getEntry('settings', 'site');
  if (!entry) throw new Error('settings entry "site" is missing');
  return entry.data;
}

/** `aria-current="page"` value for a link: only the exact page, never a parent section. */
export const current = (pathname: string, href: string): 'page' | undefined =>
  pathname === url(href) ? 'page' : undefined;

/** True when the page lives below `href` (used to mark the "Leistungen" trigger). */
export const inSection = (pathname: string, href: string): boolean => pathname.startsWith(url(href));

const WEEK = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** "07:00" -> "7", "07:30" -> "7:30". */
const clock = (t: string): string => t.replace(/^0/, '').replace(/:00$/, '');

/** `{ days: 'Mo–Fr', time: '7–17 Uhr' }` rows from the settings hours (U+202F before "Uhr"). */
export function formatHours(hours: { days: string[]; opens: string; closes: string }[]) {
  return hours.map(({ days, opens, closes }) => {
    const idx = days.map((d) => WEEK.indexOf(d)).sort((a, b) => a - b);
    const first = idx[0] ?? 0;
    const last = idx[idx.length - 1] ?? first;
    const consecutive = idx.length > 2 && last - first === idx.length - 1;
    return {
      days: consecutive ? `${WEEK[first]}${EN_DASH}${WEEK[last]}` : idx.map((i) => WEEK[i]).join(', '),
      time: `${clock(opens)}${EN_DASH}${clock(closes)}${NNBSP}Uhr`,
    };
  });
}

/** Keeps a phone number on one line: spaces become U+00A0. */
export const nbsp = (text: string): string => text.replaceAll(' ', ' ');
