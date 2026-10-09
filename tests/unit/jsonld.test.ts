import { describe, expect, it } from 'vitest';
import {
  breadcrumbJsonLd,
  businessId,
  businessJsonLd,
  confirmed,
  isFact,
  jobPostingJsonLd,
  jsonLdDocument,
  serializeJsonLd,
  serviceJsonLd,
  websiteJsonLd,
  type BusinessInput,
  type JobInput,
} from '../../src/lib/jsonld';

// Test fixtures only; not business facts.
const HOME = 'https://example.test/schreinerschmidt.com/';
const ADDRESS = { street: 'Musterstraße 1', postalCode: '12345', city: 'Musterstadt', country: 'DE' };

const business = (over: Partial<BusinessInput> = {}): BusinessInput => ({
  name: 'Schreinerei Schmidt',
  legalName: { value: 'Muster GmbH', status: 'needs-review' },
  owner: { value: { name: 'Max Muster', title: 'Schreinermeister' }, status: 'confirmed' },
  address: ADDRESS,
  geo: { value: { lat: 1, lng: 2 }, status: 'placeholder' },
  phone: { e164: '+49123456789' },
  email: 'info@example.test',
  hours: { value: [{ days: ['Mo', 'Di'], opens: '08:00', closes: '16:00' }], status: 'needs-review' },
  areaServed: { value: ['Musterstadt'], status: 'confirmed' },
  profileUrl: { value: 'https://example.test/profil', status: 'needs-review' },
  ...over,
});

describe('confirmed()', () => {
  it('passes plain values and confirmed facts, drops the rest', () => {
    expect(confirmed('x')).toBe('x');
    expect(confirmed({ value: 'x', status: 'confirmed' })).toBe('x');
    expect(confirmed({ value: 'x', status: 'needs-review' })).toBeUndefined();
    expect(confirmed({ value: 'x', status: 'placeholder', note: 'n' })).toBeUndefined();
    expect(confirmed(undefined)).toBeUndefined();
    expect(isFact(ADDRESS)).toBe(false);
  });
});

describe('businessJsonLd', () => {
  it('has a stable @id and emits only confirmed facts', () => {
    const node = businessJsonLd(business(), HOME);
    expect(node['@type']).toBe('HomeAndConstructionBusiness');
    expect(node['@id']).toBe(`${HOME}#business`);
    expect(node['@id']).toBe(businessId(HOME));
    expect(node['founder']).toEqual({ '@type': 'Person', name: 'Max Muster', jobTitle: 'Schreinermeister' });
    expect(node['areaServed']).toEqual(['Musterstadt']);
    expect(node['telephone']).toBe('+49123456789');
    expect(node['address']).toMatchObject({ '@type': 'PostalAddress', postalCode: '12345' });
    for (const key of ['legalName', 'geo', 'openingHoursSpecification', 'sameAs']) {
      expect(node, key).not.toHaveProperty(key);
    }
    expect(JSON.stringify(node)).not.toMatch(/Muster GmbH|example\.test\/profil|08:00/);
  });

  it('emits confirmed hours, geo and the profile as sameAs', () => {
    const node = businessJsonLd(
      business({
        hours: { value: [{ days: ['Mo', 'Freitag'], opens: '08:00', closes: '16:00' }], status: 'confirmed' },
        geo: { value: { lat: 1, lng: 2 }, status: 'confirmed' },
        profileUrl: { value: 'https://example.test/profil', status: 'confirmed' },
      }),
      HOME,
    );
    expect(node['openingHoursSpecification']).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['https://schema.org/Monday', 'https://schema.org/Friday'],
        opens: '08:00',
        closes: '16:00',
      },
    ]);
    expect(node['geo']).toEqual({ '@type': 'GeoCoordinates', latitude: 1, longitude: 2 });
    expect(node['sameAs']).toEqual(['https://example.test/profil']);
  });

  it('never emits review or rating markup', () => {
    const json = JSON.stringify(businessJsonLd(business(), HOME));
    expect(json).not.toMatch(/Review|Rating/);
  });

  it('rejects relative home URLs', () => {
    expect(() => businessJsonLd(business(), '/schreinerschmidt.com/')).toThrow(/absolute/);
  });
});

describe('websiteJsonLd / serviceJsonLd / breadcrumbJsonLd', () => {
  it('links WebSite and Service to the business @id', () => {
    const site = websiteJsonLd({ name: 'Schreinerei Schmidt', home: HOME });
    expect(site).toMatchObject({ '@type': 'WebSite', url: HOME, publisher: { '@id': `${HOME}#business` } });
    const service = serviceJsonLd(
      {
        name: 'Böden',
        serviceType: 'Bodenverlegung',
        url: `${HOME}leistungen/boeden/`,
        areaServed: { value: 'x', status: 'placeholder' },
      },
      HOME,
    );
    expect(service).toMatchObject({ '@type': 'Service', provider: { '@id': `${HOME}#business` } });
    expect(service).not.toHaveProperty('areaServed');
  });

  it('numbers breadcrumb positions from 1', () => {
    const list = breadcrumbJsonLd([
      { name: 'Start', url: HOME },
      { name: 'Leistungen', url: `${HOME}leistungen/` },
    ]);
    expect(list['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Start', item: HOME },
      { '@type': 'ListItem', position: 2, name: 'Leistungen', item: `${HOME}leistungen/` },
    ]);
    expect(() => breadcrumbJsonLd([{ name: 'x', url: '/x/' }])).toThrow(/absolute/);
  });
});

describe('jobPostingJsonLd', () => {
  const job = (over: Partial<JobInput> = {}): JobInput => ({
    title: 'Schreiner (m/w/d)',
    identifier: 'job-1',
    active: true,
    datePosted: new Date('2026-10-01T00:00:00Z'),
    validThrough: '2026-12-31',
    employmentType: ['FULL_TIME', 'Teilzeit'],
    responsibilities: ['Aufgabe'],
    qualifications: [],
    directApply: true,
    description: '<p>Beschreibung</p>',
    ...over,
  });
  const ctx = {
    url: `${HOME}karriere/schreiner/`,
    home: HOME,
    business: { name: 'Schreinerei Schmidt', address: ADDRESS },
  };

  it('has the required shape', () => {
    const node = jobPostingJsonLd(job(), ctx);
    expect(node).toMatchObject({
      '@type': 'JobPosting',
      title: 'Schreiner (m/w/d)',
      description: '<p>Beschreibung</p>',
      identifier: { '@type': 'PropertyValue', name: 'Schreinerei Schmidt', value: 'job-1' },
      datePosted: '2026-10-01',
      validThrough: '2026-12-31',
      employmentType: ['FULL_TIME', 'PART_TIME'],
      directApply: true,
      hiringOrganization: {
        '@type': 'HomeAndConstructionBusiness',
        '@id': `${HOME}#business`,
        name: 'Schreinerei Schmidt',
      },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Musterstadt' } },
      responsibilities: ['Aufgabe'],
    });
    expect(node).not.toHaveProperty('qualifications');
  });

  it('emits baseSalary only when confirmed', () => {
    const salary = { min: 18, max: 22, unit: 'Stunde' };
    expect(jobPostingJsonLd(job({ baseSalary: { value: salary, status: 'needs-review' } }), ctx)).not.toHaveProperty(
      'baseSalary',
    );
    expect(jobPostingJsonLd(job({ baseSalary: { value: salary, status: 'placeholder' } }), ctx)).not.toHaveProperty(
      'baseSalary',
    );
    expect(jobPostingJsonLd(job({ baseSalary: { value: salary, status: 'confirmed' } }), ctx)?.['baseSalary']).toEqual({
      '@type': 'MonetaryAmount',
      currency: 'EUR',
      value: { '@type': 'QuantitativeValue', minValue: 18, maxValue: 22, unitText: 'HOUR' },
    });
  });

  it('returns null for inactive jobs', () => {
    expect(jobPostingJsonLd(job({ active: false }), ctx)).toBeNull();
  });

  it('is only allowed on /karriere/<slug>/', () => {
    for (const url of [`${HOME}karriere/`, `${HOME}karriere/danke/`, `${HOME}kontakt/`]) {
      expect(() => jobPostingJsonLd(job(), { ...ctx, url })).toThrow(/karriere/);
    }
  });

  it('rejects unknown employment types and an unconfirmed address', () => {
    expect(() => jobPostingJsonLd(job({ employmentType: ['irgendwas'] }), ctx)).toThrow(/employmentType/);
    expect(() =>
      jobPostingJsonLd(job(), { ...ctx, business: { name: 'x', address: { value: ADDRESS, status: 'placeholder' } } }),
    ).toThrow(/address/);
  });
});

describe('serialisation', () => {
  it('escapes < so data cannot close the script', () => {
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script><!--' });
    expect(json).not.toContain('<');
    expect(json).toContain('\\u003c/script>');
    expect(JSON.parse(json)).toEqual({ name: '</script><script>alert(1)</script><!--' });
  });

  it('escapes U+2028/U+2029', () => {
    const json = serializeJsonLd({ a: '\u2028\u2029' });
    expect(json).toBe('{"a":"\\u2028\\u2029"}');
  });

  it('wraps one node or a @graph with the schema.org context', () => {
    const site = websiteJsonLd({ name: 'S', home: HOME });
    expect(jsonLdDocument(site)).toEqual({ '@context': 'https://schema.org', ...site });
    expect(jsonLdDocument([site, null])).toEqual({ '@context': 'https://schema.org', ...site });
    const crumbs = breadcrumbJsonLd([{ name: 'Start', url: HOME }]);
    expect(jsonLdDocument([site, crumbs, undefined])).toEqual({
      '@context': 'https://schema.org',
      '@graph': [site, crumbs],
    });
  });
});
