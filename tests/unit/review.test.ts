import { describe, expect, it } from 'vitest';
import { assets } from '../../src/lib/asset-manifest';
import {
  AREAS,
  classifySettingsPath,
  collectReviewItems,
  findGreenClaims,
  formatGuardReport,
  groupByArea,
  guardDecision,
  pageRouteMatchers,
  sourcePage,
  stripSourceComments,
  type ReviewAsset,
  type ReviewEntry,
  type ReviewItem,
} from '../../src/lib/review';

// Test fixtures only; not business facts.
const fact = <T>(value: T, status: 'confirmed' | 'needs-review' | 'placeholder', note?: string) => ({
  value,
  status,
  ...(note ? { note } : {}),
});

const settings = (over: Record<string, unknown> = {}): ReviewEntry => ({
  collection: 'settings',
  id: 'site',
  data: {
    name: 'Musterfirma',
    legalName: fact('Muster e. K.', 'placeholder', 'Firmenname klären.'),
    owner: { name: 'Max Muster', title: 'Meister', masterSince: 2000 },
    address: { street: 'Musterweg 1', postalCode: '12345', city: 'Musterstadt', region: 'X', country: 'DE' },
    phone: { display: '0123', e164: '+49123' },
    email: 'info@example.test',
    hours: fact([{ days: ['Mo'], opens: '08:00', closes: '16:00' }], 'needs-review'),
    areaServed: fact(['Musterstadt'], 'placeholder'),
    employees: fact('1–10', 'confirmed'),
    stats: { projects: fact(10, 'needs-review') },
    rating: {
      value: 5,
      count: 1,
      snapshotDate: '2026-01-01',
      profileUrl: fact('https://example.test/', 'placeholder'),
    },
    legal: {
      craftsRegisterNo: fact('X', 'placeholder'),
      vatId: fact('DE000', 'confirmed'),
      professionalTitle: 'Meister',
      chamber: { name: 'Kammer', address: 'Weg 1', url: 'https://example.test/' },
    },
    review: { status: 'needs-review', note: 'Entwurf.', source: 'Altseite' },
    ...over,
  },
});

const job = (id: string, active: boolean, status: 'confirmed' | 'needs-review' | 'placeholder'): ReviewEntry => ({
  collection: 'jobs',
  id,
  data: {
    title: 'Job',
    active,
    baseSalary: fact({ min: 1, max: 2, unit: 'YEAR' }, status),
    review: { status: 'confirmed' },
  },
  body: 'Komm ins Team.',
});

const asset = (over: Partial<ReviewAsset> = {}): ReviewAsset => ({
  id: 'a1',
  rights: 'own',
  privacyCheck: 'done',
  alt: 'Ein Schrank aus Eiche in einem hellen Raum',
  category: 'moebel',
  project: null,
  role: 'type',
  output: { path: 'src/assets/services/moebel/01-a.jpg' },
  ...over,
});

const byPath = (items: ReviewItem[], path: string): ReviewItem | undefined => items.find((i) => i.path === path);

describe('findGreenClaims', () => {
  it.each([
    ['Wir arbeiten nachhaltig.', 'nachhaltig', 'nachhaltig'],
    ['Nachhaltigkeit ist uns wichtig', 'nachhaltig', 'Nachhaltigkeit'],
    ['Super Schreiner mit Umweltbewusstsein!!!!', 'umweltbewusst', 'Umweltbewusstsein'],
    ['Ihr Experte für umweltbewusstes Holzhandwerk', 'umweltbewusst', 'umweltbewusstes'],
    ['sein ökologischer Ansatz', 'ökologisch', 'ökologischer'],
    ['ÖKOLOGISCH', 'ökologisch', 'ÖKOLOGISCH'],
    ['umweltfreundliche Lacke', 'umweltfreundlich', 'umweltfreundliche'],
    ['natürliche Öle', 'natürlich', 'natürliche'],
    ['eine klimaneutrale Werkstatt', 'klimaneutral', 'klimaneutrale'],
    ['CO₂-neutral gefertigt', 'CO₂-neutral', 'CO₂-neutral'],
    ['CO2 neutral', 'CO₂-neutral', 'CO2 neutral'],
    ['biologisch abbaubar', 'biologisch', 'biologisch'],
    ['Bio-Öl', 'bio', 'Bio-Öl'],
    ['schadstofffreie Kleber', 'schadstofffrei', 'schadstofffreie'],
    ['grüne Werkstatt', 'grün', 'grüne'],
    ['Öko-Lack', 'öko', 'Öko-Lack'],
  ])('flags %j as %s', (text, term, match) => {
    const hits = findGreenClaims(text);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ term, match });
  });

  it.each([
    'Neue Haustür im Gründerzeithaus',
    'gründlich geschliffen',
    'Dachfenster und Blick ins Grüne',
    'Wir sitzen im Grünen',
    'Ökonomisch sinnvoll',
    'Biografie des Meisters',
    'Massivholzdielen aus Eiche, natur geölt',
    'Kork wird aus der Rinde der Korkeiche gewonnen, Linoleum vor allem aus Leinöl.',
  ])('does not flag %j', (text) => {
    expect(findGreenClaims(text)).toEqual([]);
  });

  it('finds every hit with its offset and an excerpt without tags', () => {
    const text = '<h3>Ihr Experte für <em>umweltbewusstes</em> Holzhandwerk</h3>, nachhaltig.';
    const hits = findGreenClaims(text);
    expect(hits.map((h) => h.term)).toEqual(['umweltbewusst', 'nachhaltig']);
    expect(text.slice(hits[0]!.index)).toMatch(/^umweltbewusstes/);
    expect(hits[0]!.excerpt).not.toContain('<');
  });
});

describe('stripSourceComments', () => {
  it('blanks comments but keeps line numbers and URLs', () => {
    const src = [
      '// nachhaltig',
      '/* ökologisch */ const a = "https://example.test";',
      '<!-- natürlich -->',
      '{/* umweltfreundlich */}',
      '<p>grüne Ideen</p>',
    ].join('\n');
    const out = stripSourceComments(src);
    expect(out.split('\n')).toHaveLength(5);
    expect(out).toContain('https://example.test');
    expect(findGreenClaims(out).map((h) => h.term)).toEqual(['grün']);
  });
});

describe('collectReviewItems', () => {
  const entries: ReviewEntry[] = [
    settings(),
    job('aktiv', true, 'placeholder'),
    job('alt', false, 'placeholder'),
    {
      collection: 'services',
      id: 'moebel',
      data: {
        key: 'moebel',
        title: 'Möbel',
        teaser: 'Möbel nach Maß aus nachhaltiger Forstwirtschaft.',
        hero: {
          src: { src: '/x.jpg', width: 1, height: 1, format: 'jpg' },
          alt: 'Ein Schrank aus Eiche, natürlich geölt',
        },
        faqs: [{ collection: 'faqs', id: 'ablauf' }],
        review: { status: 'needs-review', note: 'Aussage „nachhaltig“ entfernt.', source: 'Altseite' },
      },
      body: 'Wir bauen Möbel.\n\nGanz ökologisch.',
    },
    {
      collection: 'faqs',
      id: 'ablauf',
      data: { question: 'Wie läuft es ab?', answer: 'Gut.', review: { status: 'confirmed' } },
    },
    {
      collection: 'testimonials',
      id: 'kunde',
      data: {
        author: 'A.',
        quote: 'Toll.',
        source: 'direkt',
        permission: 'ausstehend',
        review: { status: 'confirmed' },
      },
    },
    {
      collection: 'testimonials',
      id: 'frei',
      data: { author: 'B.', quote: 'Gut.', source: 'direkt', permission: 'erteilt', review: { status: 'confirmed' } },
    },
    {
      collection: 'team',
      id: 'max',
      data: { name: 'Max', role: 'Meister', publicationConsent: 'ausstehend', review: { status: 'confirmed' } },
    },
    {
      collection: 'projects',
      id: 'p1',
      data: { title: 'Projekt', detailPage: true, review: { status: 'confirmed' } },
    },
  ];
  const items = collectReviewItems({
    entries,
    assets: [
      asset({ id: 'ok' }),
      asset({ id: 'legacy', rights: 'own-legacy', project: 'p1', role: 'cover' }),
      asset({ id: 'unverified', rights: 'own-unverified', category: null, role: 'portrait' }),
      asset({ id: 'pending', privacyCheck: 'pending', alt: 'Umweltfreundlich lackierter Schrank im Flur' }),
    ],
    sources: [
      {
        path: 'src/components/layout/Header.astro',
        text: '---\n// nachhaltig im Kommentar\n---\n<p>Umweltbewusstes Holzhandwerk</p>',
      },
      { path: 'src/pages/ueber-uns/index.astro', text: '<p>Wir sind nachhaltig.</p>' },
    ],
  });

  it('lists unconfirmed entries, not confirmed ones', () => {
    expect(byPath(items, 'settings.site')).toMatchObject({ kind: 'entry', status: 'needs-review', area: 'Inhalte' });
    expect(byPath(items, 'services.moebel')).toMatchObject({ kind: 'entry', note: 'Aussage „nachhaltig“ entfernt.' });
    expect(byPath(items, 'faqs.ablauf')).toBeUndefined();
    expect(byPath(items, 'projects.p1')).toBeUndefined();
  });

  it('walks every fact() generically and records its path', () => {
    expect(byPath(items, 'settings.site.legal.craftsRegisterNo')).toMatchObject({
      kind: 'fact',
      status: 'placeholder',
      area: 'Rechtliches',
      guard: 'legal',
      page: 'impressum/',
    });
    expect(byPath(items, 'settings.site.legalName')).toMatchObject({ guard: 'legal', note: 'Firmenname klären.' });
    expect(byPath(items, 'settings.site.hours')).toMatchObject({ area: 'Zeiten', guard: 'hours' });
    expect(byPath(items, 'settings.site.stats.projects')).toMatchObject({ area: 'Inhalte', guard: undefined });
    expect(byPath(items, 'settings.site.rating.profileUrl')).toMatchObject({ status: 'placeholder', guard: undefined });
    expect(byPath(items, 'settings.site.employees')).toBeUndefined();
    expect(byPath(items, 'settings.site.legal.vatId')).toBeUndefined();
  });

  it('gives plain contact and legal settings the entry status', () => {
    for (const f of ['phone', 'email', 'address']) {
      expect(byPath(items, `settings.site.${f}`)).toMatchObject({
        area: 'Kontakt',
        guard: 'contact',
        status: 'needs-review',
      });
    }
    expect(byPath(items, 'settings.site.legal.professionalTitle')).toMatchObject({
      area: 'Rechtliches',
      guard: 'legal',
    });
    expect(byPath(items, 'settings.site.legal.chamber')).toMatchObject({ guard: 'legal' });
    const confirmed = collectReviewItems({ entries: [settings({ review: { status: 'confirmed' } })] });
    expect(byPath(confirmed, 'settings.site.phone')).toBeUndefined();
    expect(byPath(confirmed, 'settings.site')).toBeUndefined();
  });

  it('guards the salary of active jobs only', () => {
    expect(byPath(items, 'jobs.aktiv.baseSalary')).toMatchObject({
      area: 'Gehalt',
      guard: 'salary',
      page: 'karriere/aktiv/',
    });
    expect(byPath(items, 'jobs.alt.baseSalary')).toMatchObject({ area: 'Gehalt', guard: undefined, page: 'karriere/' });
  });

  it('lists missing consents', () => {
    expect(byPath(items, 'testimonials.kunde.permission')).toMatchObject({ area: 'Einwilligungen', kind: 'consent' });
    expect(byPath(items, 'testimonials.frei.permission')).toBeUndefined();
    expect(byPath(items, 'team.max.publicationConsent')).toMatchObject({ area: 'Einwilligungen', page: 'ueber-uns/' });
  });

  it('lists assets with unverified rights or a pending privacy check', () => {
    const assetItems = items.filter((i) => i.kind === 'asset');
    expect(assetItems.map((i) => i.id).sort()).toEqual(['legacy', 'pending', 'unverified']);
    expect(assetItems.find((i) => i.id === 'legacy')).toMatchObject({
      page: 'referenzen/p1/',
      area: 'Bilder & Rechte',
    });
    expect(assetItems.find((i) => i.id === 'unverified')?.page).toBe('ueber-uns/');
    expect(assetItems.find((i) => i.id === 'pending')?.note).toContain('pending');
  });

  it('scans published strings, bodies, alt texts and sources for green claims, not review notes or comments', () => {
    const green = items.filter((i) => i.kind === 'green-claim');
    expect(green.map((i) => i.path).sort()).toEqual(
      [
        'assets.pending.alt',
        'services.moebel.body',
        'services.moebel.hero.alt',
        'services.moebel.teaser',
        'src/components/layout/Header.astro:4',
        'src/pages/ueber-uns/index.astro:1',
      ].sort(),
    );
    expect(green.every((i) => i.area === 'Werbeaussagen (UWG)' && i.status === 'needs-review')).toBe(true);
    expect(byPath(items, 'services.moebel.teaser')?.page).toBe('leistungen/moebel/');
    expect(byPath(items, 'src/pages/ueber-uns/index.astro:1')?.page).toBe('ueber-uns/');
    expect(byPath(items, 'src/components/layout/Header.astro:4')?.page).toBeUndefined();
  });

  it('links facts of referenced entries to the referring service page', () => {
    const withFaq = collectReviewItems({
      entries: [entries[3]!, { ...entries[4]!, data: { ...entries[4]!.data, review: { status: 'needs-review' } } }],
    });
    expect(byPath(withFaq, 'faqs.ablauf')?.page).toBe('leistungen/moebel/');
  });

  it('runs on the real asset manifest', () => {
    const real = collectReviewItems({ entries: [], assets });
    expect(real.every((i) => i.kind === 'asset' || i.kind === 'green-claim')).toBe(true);
    for (const a of assets) {
      const listed = real.some((i) => i.kind === 'asset' && i.id === a.id);
      expect(listed, a.id).toBe(a.privacyCheck !== 'done' || a.rights !== 'own');
    }
  });

  it('groups by area in page order', () => {
    const groups = groupByArea(items);
    expect(groups.map((g) => g.area)).toEqual([...AREAS]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(items.length);
  });
});

describe('classifySettingsPath', () => {
  it.each([
    ['legalName', 'Rechtliches', 'legal'],
    ['legal.liabilityInsurance', 'Rechtliches', 'legal'],
    ['phone', 'Kontakt', 'contact'],
    ['address.street', 'Kontakt', 'contact'],
    ['geo', 'Kontakt', undefined],
    ['hours', 'Zeiten', 'hours'],
    ['areaServed', 'Inhalte', undefined],
    ['legalese', 'Inhalte', undefined],
  ])('%s → %s / %s', (field, area, guard) => {
    expect(classifySettingsPath(field)).toEqual(guard ? { area, guard } : { area });
  });
});

describe('routes', () => {
  it('maps page files to site-relative routes', () => {
    expect(sourcePage('src/pages/index.astro')).toBe('');
    expect(sourcePage('src/pages/kontakt/index.astro')).toBe('kontakt/');
    expect(sourcePage('src/pages/intern/stil/[...demo].astro')).toBe('intern/stil/');
    expect(sourcePage('src/pages/referenzen/[slug].astro')).toBeUndefined();
    expect(sourcePage('src/pages/404.astro')).toBeUndefined();
    expect(sourcePage('src/components/layout/Header.astro')).toBeUndefined();
  });

  it('builds matchers that ignore the legacy catch-all and the 404 page', () => {
    const res = pageRouteMatchers([
      'src/pages/index.astro',
      'src/pages/[...legacy].astro',
      'src/pages/404.astro',
      'src/pages/leistungen/boeden/index.astro',
      'src/pages/referenzen/[slug].astro',
      'src/pages/intern/stil/[...demo].astro',
      'src/components/x.astro',
    ]);
    const known = (p: string): boolean => res.some((re) => re.test(p));
    expect(known('')).toBe(true);
    expect(known('leistungen/boeden/')).toBe(true);
    expect(known('leistungen/moebel/')).toBe(false);
    expect(known('referenzen/p1/')).toBe(true);
    expect(known('referenzen/')).toBe(false);
    expect(known('intern/stil/')).toBe(true);
    expect(known('kontakt/')).toBe(false);
    expect(known('404/')).toBe(false);
  });
});

describe('production guard', () => {
  const item = (over: Partial<ReviewItem>): ReviewItem => ({
    area: 'Rechtliches',
    collection: 'settings',
    id: 'site',
    path: 'settings.site.x',
    status: 'placeholder',
    kind: 'fact',
    ...over,
  });
  const placeholder = item({ guard: 'legal', path: 'settings.site.legalName' });
  const review = item({ guard: 'hours', status: 'needs-review', path: 'settings.site.hours' });
  const unguarded = item({ guard: undefined, path: 'settings.site.areaServed' });

  it('never blocks demo builds', () => {
    expect(guardDecision([placeholder], { demo: true, allowPlaceholders: false }).outcome).toBe('skip');
    expect(formatGuardReport(guardDecision([placeholder], { demo: true, allowPlaceholders: false }))).toEqual({});
  });

  it('fails on placeholders in guarded data', () => {
    const d = guardDecision([placeholder, review, unguarded], { demo: false, allowPlaceholders: false });
    expect(d.outcome).toBe('fail');
    expect(d.blocking).toEqual([placeholder]);
    expect(d.warnings).toEqual([review]);
    const { error, warning } = formatGuardReport(d);
    expect(error).toContain('settings.site.legalName');
    expect(error).toContain('ALLOW_PLACEHOLDERS');
    expect(error).not.toContain('areaServed');
    expect(warning).toContain('settings.site.hours');
  });

  it('passes when only needs-review or unguarded items remain', () => {
    const d = guardDecision([review, unguarded], { demo: false, allowPlaceholders: false });
    expect(d.outcome).toBe('pass');
    expect(formatGuardReport(d).error).toBeUndefined();
    expect(formatGuardReport(d).warning).toContain('need review');
  });

  it('passes with no items at all', () => {
    expect(formatGuardReport(guardDecision([], { demo: false, allowPlaceholders: false }))).toEqual({});
  });

  it('downgrades blockers to a warning with ALLOW_PLACEHOLDERS', () => {
    const d = guardDecision([placeholder], { demo: false, allowPlaceholders: true });
    expect(d.outcome).toBe('allowed');
    const { error, warning } = formatGuardReport(d);
    expect(error).toBeUndefined();
    expect(warning).toContain('ALLOW_PLACEHOLDERS=true');
    expect(warning).toContain('settings.site.legalName');
  });

  it('blocks on the seeded-style settings: legal placeholders, not needs-review contact data', () => {
    const d = guardDecision(collectReviewItems({ entries: [settings(), job('j', true, 'needs-review')] }), {
      demo: false,
      allowPlaceholders: false,
    });
    expect(d.outcome).toBe('fail');
    expect(d.blocking.map((i) => i.path).sort()).toEqual([
      'settings.site.legal.craftsRegisterNo',
      'settings.site.legalName',
    ]);
    expect(d.warnings.map((i) => i.path)).toContain('jobs.j.baseSalary');
    expect(d.warnings.map((i) => i.path)).toContain('settings.site.phone');
  });

  it('blocks on placeholder contact data via the entry status and on active salaries', () => {
    const entry = settings({ review: { status: 'placeholder' } });
    const d = guardDecision(collectReviewItems({ entries: [entry, job('j', true, 'placeholder')] }), {
      demo: false,
      allowPlaceholders: false,
    });
    const paths = d.blocking.map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining(['settings.site.phone', 'settings.site.address', 'jobs.j.baseSalary']),
    );
  });

  describe('legal identity facts', () => {
    const legalWith = (legal: Record<string, unknown>): ReviewEntry =>
      settings({
        legal: {
          craftsRegisterNo: fact('X', 'confirmed'),
          professionalTitle: 'Meister',
          chamber: { name: 'Kammer', address: 'Weg 1', url: 'https://example.test/' },
          ...legal,
        },
        legalName: fact('Muster e. K.', 'confirmed'),
        review: { status: 'confirmed' },
      });
    const decide = (entry: ReviewEntry) =>
      guardDecision(collectReviewItems({ entries: [entry] }), { demo: false, allowPlaceholders: false });

    it('lists and blocks on placeholder legal form, ids and insurance', () => {
      const entry = legalWith({
        legalForm: fact('Platzhalter', 'placeholder'),
        vatId: fact(null, 'placeholder'),
        economicId: fact(null, 'placeholder'),
        liabilityInsurance: fact(null, 'placeholder'),
      });
      const items = collectReviewItems({ entries: [entry] });
      for (const f of ['legalForm', 'vatId', 'economicId', 'liabilityInsurance']) {
        expect(byPath(items, `settings.site.legal.${f}`)).toMatchObject({ area: 'Rechtliches', guard: 'legal' });
      }
      const d = decide(entry);
      expect(d.outcome).toBe('fail');
      expect(d.blocking.map((i) => i.path)).toContain('settings.site.legal.vatId');
    });

    it('passes with a confirmed vatId, a confirmed-null economicId and confirmed-null insurance', () => {
      const d = decide(
        legalWith({
          legalForm: fact('e. K.', 'confirmed'),
          vatId: fact('DE000', 'confirmed'),
          economicId: fact(null, 'confirmed'),
          liabilityInsurance: fact(null, 'confirmed'),
        }),
      );
      expect(d.outcome).toBe('pass');
    });

    it('blocks when both ids are confirmed null', () => {
      const d = decide(
        legalWith({
          legalForm: fact('e. K.', 'confirmed'),
          vatId: fact(null, 'confirmed'),
          economicId: fact(null, 'confirmed'),
          liabilityInsurance: fact(null, 'confirmed'),
        }),
      );
      expect(d.outcome).toBe('fail');
      expect(d.blocking[0]?.path).toContain('legal.vatId');
    });
  });
});
