// JSON-LD builders (docs/architecture.md §5 and §7). Build-time only.
// Rules: only facts with `status: 'confirmed'` are emitted; no Review or AggregateRating markup;
// JobPosting only on `/karriere/<slug>/`. All URLs passed in must be absolute.
import { isoDate } from './format';

export type FactStatus = 'confirmed' | 'needs-review' | 'placeholder';

/** Mirrors `fact()` in src/content.config.ts (architecture §5). */
export interface Fact<T> {
  value: T;
  status: FactStatus;
  note?: string | undefined;
  source?: string | undefined;
}

/** A plain schema value (trusted as is) or a `fact()` (emitted only when confirmed). */
export type MaybeFact<T> = T | Fact<T>;

export function isFact(value: unknown): value is Fact<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'status' in value &&
    ['confirmed', 'needs-review', 'placeholder'].includes((value as { status: unknown }).status as string)
  );
}

/** The value of a confirmed fact (or a plain value); `undefined` for anything unconfirmed. */
export function confirmed<T>(value: MaybeFact<T> | undefined): T | undefined {
  if (value === undefined) return undefined;
  if (isFact(value)) return value.status === 'confirmed' ? (value as Fact<T>).value : undefined;
  return value;
}

export type JsonLdNode = { '@type': string } & Record<string, unknown>;

const CONTEXT = 'https://schema.org';

/** Drops `undefined`, `null`, empty strings, empty arrays and objects left empty. */
function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(prune).filter((v) => !isEmpty(v)) as T;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v);
      if (!isEmpty(p)) out[k] = p;
    }
    return out as T;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && !(v instanceof Date)) return Object.keys(v).length === 0;
  return false;
}

function assertAbsolute(url: string, what: string): string {
  if (!/^https?:\/\//.test(url)) throw new Error(`JSON-LD ${what}: expected an absolute URL, got "${url}"`);
  return url;
}

/** Stable ids, derived from the absolute home URL (incl. base and trailing slash). */
export const businessId = (home: string): string => `${assertAbsolute(home, 'home')}#business`;
export const websiteId = (home: string): string => `${assertAbsolute(home, 'home')}#website`;

/* ------------------------------------------------------------------ business */

export interface PostalAddressInput {
  street: string;
  postalCode: string;
  city: string;
  region?: string | undefined;
  country: string;
}

export interface OpeningHoursInput {
  /** German ("Mo", "Montag") or English ("Monday") day names. */
  days: string[];
  /** "07:30" */
  opens: string;
  closes: string;
}

/** The parts of the `settings` entry ("site") the business node needs (architecture §5). */
export interface BusinessInput {
  name: string;
  legalName?: MaybeFact<string> | undefined;
  owner?: MaybeFact<{ name: string; title?: string | undefined }> | undefined;
  address: MaybeFact<PostalAddressInput>;
  geo?: MaybeFact<{ lat: number; lng: number }> | undefined;
  phone: MaybeFact<{ e164: string }>;
  email: MaybeFact<string>;
  hours?: MaybeFact<OpeningHoursInput[]> | undefined;
  areaServed?: MaybeFact<string | string[]> | undefined;
  /** The Google business profile URL (emitted as `sameAs`, never as rating markup). */
  profileUrl?: MaybeFact<string> | undefined;
  /** Further confirmed profiles. */
  sameAs?: string[] | undefined;
  /** Absolute URLs. */
  logo?: string | undefined;
  image?: string | undefined;
  description?: string | undefined;
}

const DAYS: Record<string, string> = {
  mo: 'Monday',
  montag: 'Monday',
  monday: 'Monday',
  di: 'Tuesday',
  dienstag: 'Tuesday',
  tuesday: 'Tuesday',
  mi: 'Wednesday',
  mittwoch: 'Wednesday',
  wednesday: 'Wednesday',
  do: 'Thursday',
  donnerstag: 'Thursday',
  thursday: 'Thursday',
  fr: 'Friday',
  freitag: 'Friday',
  friday: 'Friday',
  sa: 'Saturday',
  samstag: 'Saturday',
  saturday: 'Saturday',
  so: 'Sunday',
  sonntag: 'Sunday',
  sunday: 'Sunday',
};

function dayOfWeek(day: string): string {
  const name = DAYS[day.trim().replace(/\.$/, '').toLowerCase()];
  if (!name) throw new Error(`JSON-LD openingHours: unknown day "${day}"`);
  return `${CONTEXT}/${name}`;
}

function postalAddress(a: PostalAddressInput): JsonLdNode {
  return {
    '@type': 'PostalAddress',
    streetAddress: a.street,
    postalCode: a.postalCode,
    addressLocality: a.city,
    addressRegion: a.region,
    addressCountry: a.country,
  };
}

/** `HomeAndConstructionBusiness` with a stable `@id` (`<home>#business`). */
export function businessJsonLd(input: BusinessInput, home: string): JsonLdNode {
  const address = confirmed(input.address);
  const geo = confirmed(input.geo);
  const owner = confirmed(input.owner);
  const hours = confirmed(input.hours);
  const area = confirmed(input.areaServed);
  const profile = confirmed(input.profileUrl);
  return prune({
    '@type': 'HomeAndConstructionBusiness',
    '@id': businessId(home),
    name: input.name,
    legalName: confirmed(input.legalName),
    url: home,
    description: input.description,
    telephone: confirmed(input.phone)?.e164,
    email: confirmed(input.email),
    address: address && postalAddress(address),
    geo: geo && { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng },
    founder: owner && { '@type': 'Person', name: owner.name, jobTitle: owner.title },
    areaServed: area,
    openingHoursSpecification: hours?.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days.map(dayOfWeek),
      opens: h.opens,
      closes: h.closes,
    })),
    logo: input.logo && assertAbsolute(input.logo, 'logo'),
    image: input.image && assertAbsolute(input.image, 'image'),
    sameAs: [...(profile ? [profile] : []), ...(input.sameAs ?? [])].map((u) => assertAbsolute(u, 'sameAs')),
  });
}

/* ------------------------------------------------------------------- website */

export function websiteJsonLd({ name, home }: { name: string; home: string }): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': websiteId(home),
    url: home,
    name,
    inLanguage: 'de-DE',
    publisher: { '@id': businessId(home) },
  };
}

/* ------------------------------------------------------------------- service */

export interface ServiceInput {
  name: string;
  /** `schemaServiceType` from the services collection. */
  serviceType: string;
  description?: string | undefined;
  /** Absolute page URL. */
  url: string;
  areaServed?: MaybeFact<string | string[]> | undefined;
  image?: string | undefined;
}

/** `Service` for a service page; the provider is the business `@id`. */
export function serviceJsonLd(input: ServiceInput, home: string): JsonLdNode {
  const url = assertAbsolute(input.url, 'service url');
  return prune({
    '@type': 'Service',
    '@id': `${url}#service`,
    name: input.name,
    serviceType: input.serviceType,
    description: input.description,
    url,
    image: input.image && assertAbsolute(input.image, 'image'),
    areaServed: confirmed(input.areaServed),
    provider: { '@id': businessId(home) },
  });
}

/* ---------------------------------------------------------------- breadcrumbs */

export interface Crumb {
  name: string;
  /** Absolute URL. */
  url: string;
}

export function breadcrumbJsonLd(crumbs: readonly Crumb[]): JsonLdNode {
  if (crumbs.length === 0) throw new Error('JSON-LD BreadcrumbList: needs at least one item');
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: assertAbsolute(c.url, 'breadcrumb'),
    })),
  };
}

/* ---------------------------------------------------------------- job posting */

const EMPLOYMENT_TYPES = new Set([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR',
  'TEMPORARY',
  'INTERN',
  'VOLUNTEER',
  'PER_DIEM',
  'OTHER',
]);
const EMPLOYMENT_DE: Record<string, string> = {
  vollzeit: 'FULL_TIME',
  teilzeit: 'PART_TIME',
  befristet: 'TEMPORARY',
  praktikum: 'INTERN',
};

function employmentType(value: string): string {
  const upper = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  const type = EMPLOYMENT_TYPES.has(upper) ? upper : EMPLOYMENT_DE[value.trim().toLowerCase()];
  if (!type) throw new Error(`JSON-LD JobPosting: unknown employmentType "${value}"`);
  return type;
}

const SALARY_UNITS: Record<string, string> = {
  hour: 'HOUR',
  stunde: 'HOUR',
  day: 'DAY',
  tag: 'DAY',
  week: 'WEEK',
  woche: 'WEEK',
  month: 'MONTH',
  monat: 'MONTH',
  year: 'YEAR',
  jahr: 'YEAR',
};

function salaryUnit(unit: string): string {
  const u = SALARY_UNITS[unit.trim().toLowerCase()];
  if (!u) throw new Error(`JSON-LD JobPosting: unknown baseSalary unit "${unit}"`);
  return u;
}

export interface SalaryInput {
  min: number;
  max?: number | undefined;
  /** HOUR/DAY/WEEK/MONTH/YEAR or Stunde/Tag/Woche/Monat/Jahr. */
  unit: string;
}

/** The parts of a `jobs` entry the JobPosting needs (architecture §5). */
export interface JobInput {
  title: string;
  identifier: string;
  active: boolean;
  datePosted: Date | string;
  validThrough?: Date | string | undefined;
  employmentType: string[];
  workHours?: string | undefined;
  baseSalary?: Fact<SalaryInput> | undefined;
  responsibilities?: string[] | undefined;
  qualifications?: string[] | undefined;
  benefits?: string[] | undefined;
  educationRequirements?: string | undefined;
  occupationalCategory?: string | undefined;
  directApply: boolean;
  /** Full job description (HTML or text); Google requires it. */
  description: string;
}

export interface JobContext {
  /** Absolute URL of the job page; must be `/karriere/<slug>/`. */
  url: string;
  /** Absolute home URL. */
  home: string;
  /** Business name and address for `hiringOrganization` and `jobLocation`. */
  business: Pick<BusinessInput, 'name' | 'address' | 'logo'>;
}

const JOB_PAGE = /\/karriere\/(?!danke\/)[^/]+\/$/;

/**
 * `JobPosting` for a single job page. Returns `null` for inactive jobs.
 * `baseSalary` is emitted only when its fact is confirmed.
 */
export function jobPostingJsonLd(job: JobInput, { url, home, business }: JobContext): JsonLdNode | null {
  const pathname = new URL(assertAbsolute(url, 'job url')).pathname;
  if (!JOB_PAGE.test(pathname)) {
    throw new Error(`JSON-LD JobPosting belongs on /karriere/<slug>/ only, not "${pathname}"`);
  }
  if (!job.active) return null;
  if (!job.description.trim()) throw new Error(`JSON-LD JobPosting "${job.title}": description is required`);
  const salary = confirmed(job.baseSalary);
  const address = confirmed(business.address);
  if (!address) throw new Error(`JSON-LD JobPosting "${job.title}": jobLocation needs a confirmed address`);
  return prune({
    '@type': 'JobPosting',
    '@id': `${url}#job`,
    title: job.title,
    description: job.description,
    url,
    identifier: { '@type': 'PropertyValue', name: business.name, value: job.identifier },
    datePosted: isoDate(job.datePosted),
    validThrough: job.validThrough === undefined ? undefined : isoDate(job.validThrough),
    employmentType: job.employmentType.map(employmentType),
    workHours: job.workHours,
    hiringOrganization: {
      '@type': 'HomeAndConstructionBusiness',
      '@id': businessId(home),
      name: business.name,
      url: home,
      logo: business.logo && assertAbsolute(business.logo, 'logo'),
    },
    jobLocation: { '@type': 'Place', address: postalAddress(address) },
    baseSalary: salary && {
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: {
        '@type': 'QuantitativeValue',
        ...(salary.max === undefined || salary.max === salary.min
          ? { value: salary.min }
          : { minValue: salary.min, maxValue: salary.max }),
        unitText: salaryUnit(salary.unit),
      },
    },
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    jobBenefits: job.benefits,
    educationRequirements: job.educationRequirements,
    occupationalCategory: job.occupationalCategory,
    directApply: job.directApply,
  });
}

/* -------------------------------------------------------------- serialisation */

export type JsonLdDocument = { '@context': string } & Record<string, unknown>;

/** Wraps one node or several (as `@graph`) with the schema.org context; skips `null`s. */
export function jsonLdDocument(nodes: JsonLdNode | readonly (JsonLdNode | null | undefined)[]): JsonLdDocument {
  if (!Array.isArray(nodes)) return { '@context': CONTEXT, ...(nodes as JsonLdNode) };
  const graph = nodes.filter((n): n is JsonLdNode => !!n);
  return graph.length === 1 ? { '@context': CONTEXT, ...graph[0] } : { '@context': CONTEXT, '@graph': graph };
}

/**
 * JSON for a `<script type="application/ld+json">` body. `<` becomes `<` so the data can't
 * close the script element or open a comment; U+2028/U+2029 are escaped for old parsers.
 */
export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) throw new Error('serializeJsonLd(): nothing to serialise');
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
