// URL, session and draft serialisation (docs/configurator.md §3 "Serialisation and history", §7).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { visible } from '../../../src/lib/configurator/conditions';
import { FIELDS, STEPS, fieldDefault, type StepId, type Values } from '../../../src/lib/configurator/fields';
import {
  DRAFT_KEY,
  DRAFT_MAX_AGE_MS,
  SESSION_KEY,
  URL_VERSION,
  fromDraft,
  fromQuery,
  fromSnapshot,
  toDraft,
  toQuery,
  toSnapshot,
} from '../../../src/scripts/configurator/serialize';

const entries = Object.entries(FIELDS);
const PII = entries.filter(([, f]) => f.pii).map(([n]) => n);
const UNSHARED = entries.filter(([, f]) => !f.share || f.pii).map(([n]) => n);

/** Any value a DOM control could hold for the field, including junk. */
const valueFor = (name: string): fc.Arbitrary<string | string[]> => {
  const f = FIELDS[name]!;
  const junk = fc.string({ maxLength: 20 });
  switch (f.kind) {
    case 'enum':
      return f.multi
        ? fc.oneof(fc.subarray([...f.values!]), fc.array(junk, { maxLength: 3 }))
        : fc.oneof(fc.constantFrom(...f.values!), junk);
    case 'int':
      return fc.oneof(fc.integer({ min: f.min! - 50, max: f.max! + 50 }).map(String), junk);
    case 'dec':
      return fc.oneof(
        fc.integer({ min: 0, max: 300000 }).map((n) => `${Math.trunc(n / 100)},${n % 100}`),
        junk,
      );
    case 'bool':
      return fc.constantFrom('1', '', 'on');
    default:
      return fc.string({ maxLength: f.maxLength ?? 40 });
  }
};

/** A full value map: every field set (or not), the project type usually valid. */
const values: fc.Arbitrary<Values> = fc
  .record(Object.fromEntries(entries.map(([name]) => [name, fc.option(valueFor(name), { nil: undefined })])))
  .chain((v) => fc.constantFrom(...FIELDS['typ']!.values!, 'junk', undefined).map((typ) => ({ ...v, typ })));

const keysOf = (q: string) => [...new URLSearchParams(q).keys()];

describe('toQuery', () => {
  it('is empty without a valid project type', () => {
    expect(toQuery({})).toBe('');
    expect(toQuery({ typ: 'nope', moebel_art: 'regal' })).toBe('');
  });

  it('writes v=1, schritt and readable keys; defaults are omitted', () => {
    const v: Values = {
      typ: 'moebel',
      moebel_art: 'regal',
      moebel_breite: '120',
      moebel_hoehe: '180',
      moebel_staerke: '19',
      moebel_holz: 'eiche',
      moebel_oberflaeche: 'weiss-geoelt',
      moebel_unterbau: 'sockel',
    };
    expect(toQuery(v, 'ausfuehrung')).toBe(
      'v=1&schritt=ausfuehrung&typ=moebel&moebel_art=regal&moebel_hoehe=180&moebel_oberflaeche=weiss-geoelt',
    );
    expect(URL_VERSION).toBe('1');
    // The regal default (120) is omitted; for a sideboard the same width is kept.
    expect(toQuery({ ...v, moebel_art: 'sideboard' })).toContain('moebel_breite=120');
  });

  it('skips an unknown step and hidden fields of the chosen branch', () => {
    expect(toQuery({ typ: 'boden', boden_leistung: 'reparatur', boden_art: 'dielen' }, 'nope' as StepId)).toBe(
      'v=1&typ=boden&boden_leistung=reparatur',
    );
    expect(toQuery({ typ: 'boden', moebel_art: 'regal' })).toBe('v=1&typ=boden');
  });

  it('clamps numbers, drops junk and joins checkbox groups', () => {
    expect(toQuery({ typ: 'moebel', moebel_art: 'regal', moebel_breite: '9999', moebel_tiefe: 'abc' })).toBe(
      'v=1&typ=moebel&moebel_art=regal&moebel_breite=300',
    );
    expect(toQuery({ typ: 'fenster', fenster_leistung: ['neu', 'rolllaeden', 'neu', 'x'] })).toBe(
      'v=1&typ=fenster&fenster_leistung=neu%2Crolllaeden',
    );
    expect(toQuery({ typ: 'boden', boden_leistung: 'neu', boden_flaeche: '12,5', boden_sockelleisten: 'on' })).toBe(
      'v=1&typ=boden&boden_leistung=neu&boden_flaeche=12.5&boden_sockelleisten=1',
    );
  });

  it('never contains a PII key or any Rahmen/Kontakt key', () => {
    fc.assert(
      fc.property(values, (v) => {
        const filled = { ...v, name: 'Max', email: 'a@b.de', plz: '68161', telefon: '0621', nachricht: 'x' };
        const keys = keysOf(toQuery(filled, 'kontakt'));
        for (const k of keys) {
          expect(PII).not.toContain(k);
          expect(UNSHARED).not.toContain(k);
          expect(['v', 'schritt', ...Object.keys(FIELDS)]).toContain(k);
        }
      }),
    );
  });

  it('stays below 600 characters for any input', () => {
    fc.assert(
      fc.property(values, fc.constantFrom(...STEPS), (v, step) => {
        expect(toQuery(v, step).length).toBeLessThan(600);
      }),
    );
  });

  it('stays below 600 characters at the longest hand-built configuration', () => {
    const longest: Values = { typ: 'moebel', moebel_art: 'einbauschrank' };
    for (const [name, f] of entries) {
      if (!f.share || f.pii) continue;
      if (f.kind === 'enum') longest[name] = f.multi ? [...f.values!] : f.values!.at(-1)!;
      if (f.kind === 'int') longest[name] = String(f.max);
      if (f.kind === 'dec') longest[name] = '1999,99';
      if (f.kind === 'bool') longest[name] = '1';
    }
    for (const typ of FIELDS['typ']!.values!) {
      const q = toQuery({ ...longest, typ }, 'ausfuehrung');
      expect(q.length, typ).toBeLessThan(600);
    }
  });
});

describe('fromQuery', () => {
  it('validates enums, clamps numbers and drops unknown keys', () => {
    const { values: v, step } = fromQuery(
      'v=1&schritt=details&typ=moebel&moebel_art=regal&moebel_breite=99999&x=1&moebel_holz=plastik',
    );
    expect(v).toEqual({ typ: 'moebel', moebel_art: 'regal', moebel_breite: '300' });
    expect(step).toBe('details');
    expect(fromQuery(new URLSearchParams('schritt=nope&typ=boden')).step).toBeNull();
  });

  it('drops hidden fields of the chosen branch and other branches', () => {
    const { values: v } = fromQuery(
      'typ=boden&boden_leistung=reparatur&boden_art=dielen&moebel_art=regal&boden_zustand=stark',
    );
    expect(v).toEqual({ typ: 'boden', boden_leistung: 'reparatur', boden_zustand: 'stark' });
  });

  it('reads checkbox groups, decimals and booleans in DOM form', () => {
    const { values: v } = fromQuery('typ=fenster&fenster_leistung=neu,x,rolllaeden&rolllaeden_anzahl=3.7');
    expect(v).toEqual({ typ: 'fenster', fenster_leistung: ['neu', 'rolllaeden'] });
    const b = fromQuery('typ=boden&boden_leistung=neu&boden_flaeche=12.5&boden_sockelleisten=1&boden_raeume=0').values;
    expect(b).toEqual({
      typ: 'boden',
      boden_leistung: 'neu',
      boden_flaeche: '12,5',
      boden_sockelleisten: '1',
      boden_raeume: '1',
    });
    expect(fromQuery('typ=fenster&fenster_leistung=x').values).toEqual({ typ: 'fenster' });
    expect(fromQuery('typ=boden&boden_sockelleisten=0').values).toEqual({ typ: 'boden' });
  });

  it('ignores PII keys even when present', () => {
    expect(fromQuery('typ=boden&name=Max&email=a%40b.de&plz=68161').values).toEqual({ typ: 'boden' });
  });

  it('round-trips: query → values → the same query', () => {
    fc.assert(
      fc.property(values, fc.option(fc.constantFrom(...STEPS), { nil: null }), (v, step) => {
        const q = toQuery(v, step);
        const parsed = fromQuery(q);
        expect(toQuery(parsed.values, parsed.step)).toBe(q);
        if (q) expect(parsed.step).toBe(step);
        for (const [name, x] of Object.entries(parsed.values)) {
          expect(visible(name, parsed.values)).toBe(true);
          expect(x).not.toBe(fieldDefault(name, parsed.values));
        }
      }),
    );
  });

  it('never throws on junk and keeps only known, valid values', () => {
    fc.assert(
      fc.property(fc.webQueryParameters(), (q) => {
        const { values: v } = fromQuery(q);
        for (const [name, x] of Object.entries(v)) {
          const f = FIELDS[name]!;
          expect(f.share && !f.pii).toBe(true);
          if (f.kind === 'enum' && !f.multi) expect(f.values).toContain(x);
          if (f.kind === 'int') {
            expect(Number(x)).toBeGreaterThanOrEqual(f.min!);
            expect(Number(x)).toBeLessThanOrEqual(f.max!);
          }
        }
      }),
    );
  });
});

describe('session snapshot', () => {
  it('uses the spec storage keys', () => {
    expect(SESSION_KEY).toBe('ss-konfigurator-v1');
    expect(DRAFT_KEY).toBe('ss-konfigurator-entwurf-v1');
    expect(DRAFT_MAX_AGE_MS).toBe(30 * 86400000);
  });

  it('keeps every known value except files, drops the honeypot and unknown keys, clamps furthest', () => {
    const v: Values = {
      typ: 'moebel',
      name: 'Max',
      email: 'a@b.de',
      'fotos[]': 'x.jpg',
      firma: 'bot',
      _subject: 's',
      fenster_leistung: ['neu'],
    };
    expect(toSnapshot(v, 'kontakt', 99)).toEqual({
      v: 1,
      step: 'kontakt',
      furthest: 5,
      values: { typ: 'moebel', name: 'Max', email: 'a@b.de', fenster_leistung: ['neu'] },
    });
    expect(toSnapshot({}, 'projekt', -3).furthest).toBe(0);
    expect(toSnapshot({}, 'projekt', Number.NaN).furthest).toBe(0);
  });

  it('fromSnapshot validates the shape', () => {
    const snap = toSnapshot({ typ: 'boden', plz: '68161' }, 'rahmen', 3);
    expect(fromSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
    expect(fromSnapshot(null)).toBeNull();
    expect(fromSnapshot('x')).toBeNull();
    expect(fromSnapshot({ v: 2 })).toBeNull();
    expect(fromSnapshot({ v: 1 })).toEqual({ v: 1, step: 'projekt', furthest: 0, values: {} });
    expect(
      fromSnapshot({ v: 1, step: 'nope', furthest: 'x', values: { typ: 1, name: ['a', 2], ort: ['a'], nope: 'x' } }),
    ).toEqual({
      v: 1,
      step: 'projekt',
      furthest: 0,
      values: { ort: ['a'] },
    });
  });
});

describe('draft', () => {
  const now = Date.UTC(2026, 9, 10, 12);
  const snap = toSnapshot({ typ: 'treppe', treppe_leistung: 'neu' }, 'details', 1);

  it('carries savedAt and restores before the expiry', () => {
    const d = toDraft(snap, now);
    expect(d).toEqual({ ...snap, savedAt: '2026-10-10T12:00:00.000Z' });
    expect(fromDraft(JSON.parse(JSON.stringify(d)), now)).toEqual(d);
    expect(fromDraft(d, now + DRAFT_MAX_AGE_MS)).toEqual(d);
  });

  it('expires after 30 days and rejects bad input', () => {
    const d = toDraft(snap, now);
    expect(fromDraft(d, now + DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(fromDraft(d, now - 1)).toBeNull();
    expect(fromDraft({ ...d, savedAt: 'gestern' }, now)).toBeNull();
    expect(fromDraft({ ...d, savedAt: undefined }, now)).toBeNull();
    expect(fromDraft(snap, now)).toBeNull();
    expect(fromDraft(null, now)).toBeNull();
  });

  it('is restorable for any age up to the limit', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 * DRAFT_MAX_AGE_MS }), (age) => {
        const d = toDraft(snap, now);
        expect(fromDraft(d, now + age) === null).toBe(age > DRAFT_MAX_AGE_MS);
      }),
    );
  });
});
