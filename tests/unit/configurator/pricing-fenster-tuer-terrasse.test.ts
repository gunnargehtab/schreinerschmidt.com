// Fenster, Tür and Terrasse calculators (docs/angebot.md §4.3). Expected numbers are hand-computed;
// the arithmetic is in the comments. All rates are PLACEHOLDER pilot assumptions.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Values } from '../../../src/lib/configurator/fields';
import { fenster, regelVersion as fensterVersion } from '../../../src/lib/configurator/pricing/branches/fenster';
import { terrasse, regelVersion as terrasseVersion } from '../../../src/lib/configurator/pricing/branches/terrasse';
import { tuer, regelVersion as tuerVersion } from '../../../src/lib/configurator/pricing/branches/tuer';
import { SHARED } from '../../../src/lib/configurator/pricing/common';
import type { Calculator, Ctx, Kalkulation } from '../../../src/lib/configurator/pricing/types';

const kern: Ctx = { tier: 'kern' };
const region: Ctx = { tier: 'region' };

const run = (calc: Calculator, v: Values, ctx: Ctx = kern): Kalkulation => {
  const k = calc(v, ctx);
  expect(k).not.toBeNull();
  return k as Kalkulation;
};

const sane = (k: Kalkulation): void => {
  for (const n of [k.netto, k.brutto, k.min, k.max]) expect(Number.isFinite(n)).toBe(true);
  expect(k.min).toBeLessThanOrEqual(k.max);
  for (const p of k.positionen) {
    expect(Number.isFinite(p.menge)).toBe(true);
    expect(Number.isFinite(p.netto)).toBe(true);
  }
};

const has = (k: Kalkulation, text: string): boolean => k.annahmen.some((a) => a.includes(text));

describe('fenster', () => {
  it('neu: 3 Fenster 120 × 140 cm, 2-fach, Kerngebiet', () => {
    const k = run(fenster, {
      typ: 'fenster',
      fenster_leistung: ['neu'],
      fenster_anzahl: '3',
      fenster_breite: '120',
      fenster_hoehe: '140',
      fenster_verglasung: '2fach',
      fenster_denkmal: 'nein',
    });
    // area 1.2 × 1.4 × 3 = 5.04 m² × 650 = 3276; Montage 3 × 3 = 9 h × 62 = 558
    // Anfahrt ceil(9 / 8) = 2 × 35 = 70; net 3904; gross 4645.76
    // ± 15 %: 3948.9 → 3950, 5342.7 → 5300
    expect(k.netto).toBeCloseTo(3904, 6);
    expect(k.brutto).toBeCloseTo(4645.76, 6);
    expect([k.min, k.max, k.breite, k.quelle]).toEqual([3950, 5300, 0.15, 'regeln']);
    expect(k.annahmen).toEqual([]);
    expect(k.positionen.map((p) => p.einheit)).toEqual(['m²', 'h', 'Fahrt']);
    expect(k.regelVersion).toBe(fensterVersion);
  });

  it('neu: 3-fach, Denkmal, 2 Fenster 100 × 100 cm, Region', () => {
    const k = run(
      fenster,
      {
        typ: 'fenster',
        fenster_leistung: ['neu'],
        fenster_anzahl: '2',
        fenster_breite: '100',
        fenster_hoehe: '100',
        fenster_verglasung: '3fach',
        fenster_denkmal: 'ja',
      },
      region,
    );
    // area 2 m² × 750 = 1500; Denkmal 25 % = 375; Montage 6 h × 62 = 372; Anfahrt 1 × 65
    // net 2312; gross 2751.28; ± 15 %: 2338.6 → 2350, 3164.0 → 3150
    expect(k.netto).toBeCloseTo(2312, 6);
    expect([k.min, k.max, k.breite]).toEqual([2350, 3150, 0.15]);
  });

  it('multi-select: restaurieren + Rollläden (elektrisch) + Fensterbänke (beides)', () => {
    const k = run(fenster, {
      typ: 'fenster',
      fenster_leistung: ['restaurieren', 'rolllaeden', 'fensterbaenke'],
      fenster_anzahl: '4',
      rolllaeden_anzahl: '3',
      rolllaeden_antrieb: 'elektrisch',
      fensterbaenke_ort: 'beides',
    });
    // restaurieren 4 × 450 = 1800; Rollläden 3 × 380 = 1140 + elektrisch 3 × 220 = 660
    // Fensterbänke 4 × 2 × 120 = 960; Montage 4 × 3 + 3 × 1.5 + 8 × 0.5 = 20.5 h × 62 = 1271
    // Anfahrt ceil(20.5 / 8) = 3 × 35 = 105; net 5936; gross 7063.84
    // ± 15 % (step 100): 6004.3 → 6000, 8123.4 → 8100
    expect(k.netto).toBeCloseTo(5936, 6);
    expect([k.min, k.max, k.breite]).toEqual([6000, 8100, 0.15]);
  });

  it('Rollläden only: no window hours, no window assumption', () => {
    const k = run(fenster, {
      typ: 'fenster',
      fenster_leistung: ['rolllaeden'],
      rolllaeden_anzahl: '2',
      rolllaeden_antrieb: 'gurt',
    });
    // 2 × 380 = 760; Montage 2 × 1.5 = 3 h × 62 = 186; Anfahrt 35; net 981
    expect(k.netto).toBeCloseTo(981, 6);
    expect(k.annahmen).toEqual([]);
    expect(k.breite).toBe(0.15);
  });

  it('Fensterbank innen counts one side per window', () => {
    const k = run(fenster, {
      typ: 'fenster',
      fenster_leistung: ['fensterbaenke'],
      fenster_anzahl: '5',
      fensterbaenke_ort: 'innen',
    });
    // 5 × 120 = 600; Montage 5 × 0.5 = 2.5 h × 62 = 155; Anfahrt 35; net 790
    expect(k.netto).toBeCloseTo(790, 6);
  });

  it('missing everything: neu, 1 Fenster, 1.2 m², 2-fach, ± 25 %', () => {
    const k = run(fenster, { typ: 'fenster' });
    // 1.2 × 650 = 780; Montage 3 h × 62 = 186; Anfahrt 35; net 1001; gross 1191.19
    // ± 25 %: 893.4 → 900, 1489.0 → 1500
    expect(k.netto).toBeCloseTo(1001, 6);
    expect([k.min, k.max, k.breite]).toEqual([900, 1500, 0.25]);
    expect(has(k, 'Leistung nicht angegeben')).toBe(true);
    expect(has(k, 'Zahl der Fenster')).toBe(true);
    expect(has(k, '1,2 m²')).toBe(true);
    expect(k.annahmen.some((a) => a.includes('Fenstermaße'))).toBe(true);
    expect(has(k, '2-fach')).toBe(true);
  });

  it('verglasung unbekannt is priced as 2-fach with ± 25 %', () => {
    const base = {
      typ: 'fenster',
      fenster_leistung: ['neu'],
      fenster_anzahl: '1',
      fenster_breite: '100',
      fenster_hoehe: '100',
    };
    const a = run(fenster, { ...base, fenster_verglasung: '2fach' });
    const b = run(fenster, { ...base, fenster_verglasung: 'unbekannt' });
    expect(b.netto).toBeCloseTo(a.netto, 6);
    expect([a.breite, b.breite]).toEqual([0.15, 0.25]);
  });

  it('unknown Denkmal or Verglasung widens restaurieren too (fields without a `when` gate)', () => {
    const base = { typ: 'fenster', fenster_leistung: ['restaurieren'], fenster_anzahl: '2' };
    const a = run(fenster, base);
    // 2 × 450 = 900; Montage 6 h × 62 = 372; Anfahrt 35 → 1307
    expect(a.netto).toBeCloseTo(1307, 6);
    expect(a.breite).toBe(0.15);
    for (const extra of [{ fenster_denkmal: 'unbekannt' }, { fenster_verglasung: 'unbekannt' }]) {
      const k = run(fenster, { ...base, ...extra });
      expect(k.netto).toBeCloseTo(1307, 6);
      expect(k.breite).toBe(0.25);
    }
  });

  it('fractional window and Rollladen counts count as missing', () => {
    const f = run(fenster, { typ: 'fenster', fenster_leistung: ['restaurieren'], fenster_anzahl: '1,5' });
    // 1 window assumed: 450 + Montage 3 h × 62 = 186 + Anfahrt 35 = 671
    expect(f.netto).toBeCloseTo(671, 6);
    expect(f.breite).toBe(0.25);
    expect(has(f, 'Zahl der Fenster')).toBe(true);
    const r = run(fenster, {
      typ: 'fenster',
      fenster_leistung: ['rolllaeden'],
      rolllaeden_anzahl: '2.5',
      rolllaeden_antrieb: 'gurt',
    });
    // 1 Rollladen assumed: 380 + Montage 1.5 h × 62 = 93 + Anfahrt 35 = 508
    expect(r.netto).toBeCloseTo(508, 6);
    expect(r.breite).toBe(0.25);
    expect(has(r, 'Zahl der Rollläden')).toBe(true);
  });

  it('garbage numbers never produce NaN', () => {
    const k = run(fenster, {
      typ: 'fenster',
      fenster_leistung: ['neu', 'rolllaeden', 'unsinn'],
      fenster_anzahl: 'abc',
      fenster_breite: '-5',
      fenster_hoehe: 'NaN',
      rolllaeden_anzahl: '',
    });
    sane(k);
    expect(k.breite).toBe(0.25);
  });

  it('typ mismatch → null', () => {
    expect(fenster({ typ: 'tuer' }, kern)).toBeNull();
    expect(fenster({}, kern)).toBeNull();
  });

  it('unknown PLZ adds the Anfahrt assumption and prices as aussen', () => {
    const k = run(fenster, { typ: 'fenster', fenster_leistung: ['restaurieren'], fenster_anzahl: '1' }, { tier: null });
    // 450 + Montage 3 h × 62 = 186 + Anfahrt aussen 120 = 756
    expect(k.netto).toBeCloseTo(756, 6);
    expect(has(k, 'PLZ unbekannt')).toBe(true);
  });

  it('is monotone in the window count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), fc.constantFrom('2fach', '3fach'), (n, glas) => {
        const mk = (anzahl: number) =>
          run(fenster, {
            typ: 'fenster',
            fenster_leistung: ['neu', 'rolllaeden'],
            fenster_anzahl: String(anzahl),
            fenster_breite: '110',
            fenster_hoehe: '130',
            fenster_verglasung: glas,
            rolllaeden_anzahl: String(anzahl),
          });
        expect(mk(n + 1).netto).toBeGreaterThan(mk(n).netto);
      }),
    );
  });
});

describe('tuer', () => {
  it('Haustür ×2, Sicherheit, Seitenteil, Kerngebiet', () => {
    const k = run(tuer, {
      typ: 'tuer',
      tuer_art: 'haustuer',
      tuer_anzahl: '2',
      tuer_sicherheit: 'on',
      tuer_glas: 'seitenteil',
      tuer_anschlag: 'din-links',
    });
    // 2 × 3800 = 7600; Sicherheit 2 × 600 = 1200; Seitenteil 2 × 900 = 1800
    // Montage 2 × 4 = 8 h × 62 = 496; Anfahrt ceil(8 / 8) = 1 × 35; net 11131; gross 13245.89
    // ± 15 % (step 100): 11259.0 → 11300, 15232.8 → 15200
    expect(k.netto).toBeCloseTo(11131, 6);
    expect(k.brutto).toBeCloseTo(13245.89, 6);
    expect([k.min, k.max, k.breite]).toEqual([11300, 15200, 0.15]);
  });

  it('Innentür ×3 with Lichtausschnitt', () => {
    const k = run(tuer, { typ: 'tuer', tuer_art: 'innentuer', tuer_anzahl: '3', tuer_glas: 'lichtausschnitt' });
    // 3 × 950 = 2850; Lichtausschnitt 3 × 250 = 750; Montage 12 h × 62 = 744
    // Anfahrt ceil(12 / 8) = 2 × 35 = 70; net 4414; gross 5252.66; ± 15 %: 4464.8 → 4450, 6040.6 → 6000
    expect(k.netto).toBeCloseTo(4414, 6);
    expect([k.min, k.max, k.breite]).toEqual([4450, 6000, 0.15]);
  });

  it('Restaurierung ×1', () => {
    const k = run(tuer, { typ: 'tuer', tuer_art: 'restaurierung', tuer_anzahl: '1' }, region);
    // 650 + Montage 4 h × 62 = 248 + Anfahrt 65 = 963
    expect(k.netto).toBeCloseTo(963, 6);
  });

  it('Seitenteil applies to an Innentür; Sicherheit is ignored', () => {
    const base = { typ: 'tuer', tuer_art: 'innentuer', tuer_anzahl: '2' };
    const a = run(tuer, { ...base, tuer_sicherheit: 'on' });
    const k = run(tuer, { ...base, tuer_glas: 'seitenteil', tuer_sicherheit: 'on' });
    // §4.3 „Seitenteil + 900“ has no door-type restriction; Sicherheit is gated to the Haustür.
    // 2 × 950 = 1900; Seitenteil 2 × 900 = 1800; Montage 8 h × 62 = 496; Anfahrt 1 × 35
    // net 4231; gross 5034.89; ± 15 %: 4279.66 → 4300, 5790.12 → 5800
    expect(a.netto).toBeCloseTo(2431, 6);
    expect(k.netto).toBeCloseTo(4231, 6);
    expect([k.min, k.max, k.breite]).toEqual([4300, 5800, 0.15]);
    expect(k.positionen.some((p) => p.text.startsWith('Seitenteil'))).toBe(true);
    expect(k.positionen.some((p) => p.text.startsWith('Sicherheit'))).toBe(false);
  });

  it('missing fields: Innentür ×1, ± 25 %', () => {
    const k = run(tuer, { typ: 'tuer' });
    // 950 + Montage 4 h × 62 = 248 + Anfahrt 35 = 1233; gross 1467.27
    // ± 25 %: 1100.5 → 1100, 1834.1 → 1850
    expect(k.netto).toBeCloseTo(1233, 6);
    expect([k.min, k.max, k.breite]).toEqual([1100, 1850, 0.25]);
    expect(has(k, 'Türart')).toBe(true);
    expect(has(k, 'Zahl der Türen')).toBe(true);
  });

  it('a fractional door count counts as missing', () => {
    const k = run(tuer, {
      typ: 'tuer',
      tuer_art: 'haustuer',
      tuer_anzahl: '2,5',
      tuer_sicherheit: '1',
      tuer_glas: 'seitenteil',
    });
    // 1 door assumed: 3800 + Sicherheit 600 + Seitenteil 900 = 5300; Montage 4 h × 62 = 248; Anfahrt 35 → 5583
    expect(k.netto).toBeCloseTo(5583, 6);
    expect(k.breite).toBe(0.25);
    expect(has(k, 'Zahl der Türen')).toBe(true);
    expect(k.positionen[0]?.text).toBe('Haustür, 1\u202fStk.');
  });

  it('unbekannt Anschlag widens the range only', () => {
    const k = run(tuer, { typ: 'tuer', tuer_art: 'innentuer', tuer_anzahl: '1', tuer_anschlag: 'unbekannt' });
    expect(k.netto).toBeCloseTo(1233, 6);
    expect(k.breite).toBe(0.25);
  });

  it('typ mismatch → null', () => {
    expect(tuer({ typ: 'fenster' }, kern)).toBeNull();
  });

  it('is monotone in the door count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 49 }),
        fc.constantFrom('haustuer', 'innentuer', 'restaurierung'),
        (n, art) => {
          const mk = (anzahl: number) => run(tuer, { typ: 'tuer', tuer_art: art, tuer_anzahl: String(anzahl) });
          expect(mk(n + 1).netto).toBeGreaterThan(mk(n).netto);
        },
      ),
    );
  });
});

describe('terrasse', () => {
  it('Terrasse: Lärche 20 m², erhöht, Erdreich', () => {
    const k = run(terrasse, {
      typ: 'terrasse',
      terrasse_was: 'terrasse',
      terrasse_flaeche: '20',
      terrasse_holz: 'laerche',
      terrasse_hoehe: 'erhoeht',
      terrasse_untergrund: 'erdreich',
    });
    // 120 × 20 = 2400; erhöht 40 × 20 = 800; Erdreich 25 × 20 = 500; Montage 20 h × 62 = 1240
    // Anfahrt ceil(20 / 8) = 3 × 35 = 105; net 5045; gross 6003.55
    // ± 15 %: 5103.0 → 5100, 6904.1 → 6900
    expect(k.netto).toBeCloseTo(5045, 6);
    expect(k.brutto).toBeCloseTo(6003.55, 6);
    expect([k.min, k.max, k.breite]).toEqual([5100, 6900, 0.15]);
    expect(k.regelVersion).toBe(terrasseVersion);
  });

  it('Zaun: 30 lfm, 150 cm, 2 Tore, Hang, Region', () => {
    const k = run(
      terrasse,
      { typ: 'terrasse', terrasse_was: 'zaun', zaun_laenge: '30', zaun_hoehe: '150', zaun_tore: '2', zaun_hang: 'ja' },
      region,
    );
    // 190 × 30 = 5700; Hang 15 % × 5700 = 855; Tore 2 × 650 = 1300; Montage 15 h × 62 = 930
    // Anfahrt ceil(15 / 8) = 2 × 65 = 130; net 8915; gross 10608.85
    // ± 15 %: 9017.5 → 9000, 12200.2 → 12200
    expect(k.netto).toBeCloseTo(8915, 6);
    expect([k.min, k.max, k.breite]).toEqual([9000, 12200, 0.15]);
  });

  it('Tore: 0 means none, a fraction means none with an assumption', () => {
    const base = { typ: 'terrasse', terrasse_was: 'zaun', zaun_laenge: '30', zaun_hoehe: '150', zaun_hang: 'ja' };
    // As the case above without the 2 Tore: 8915 − 1300 = 7615
    const zero = run(terrasse, { ...base, zaun_tore: '0' }, region);
    expect(zero.netto).toBeCloseTo(7615, 6);
    expect([zero.breite, zero.annahmen]).toEqual([0.15, []]);
    const frac = run(terrasse, { ...base, zaun_tore: '1,5' }, region);
    expect(frac.netto).toBeCloseTo(7615, 6);
    expect(frac.breite).toBe(0.25);
    expect(frac.annahmen).toEqual(['Zahl der Tore nicht erkannt, wir rechnen ohne Tor.']);
  });

  it('Zaun at 120 cm uses the lower rate', () => {
    const k = run(terrasse, {
      typ: 'terrasse',
      terrasse_was: 'zaun',
      zaun_laenge: '10',
      zaun_hoehe: '120',
      zaun_hang: 'nein',
    });
    // 140 × 10 = 1400; Montage 5 h × 62 = 310; Anfahrt 35; net 1745
    expect(k.netto).toBeCloseTo(1745, 6);
  });

  it('beides sums both parts', () => {
    const k = run(terrasse, {
      typ: 'terrasse',
      terrasse_was: 'beides',
      terrasse_flaeche: '10',
      terrasse_holz: 'douglasie',
      terrasse_hoehe: 'bodennah',
      terrasse_untergrund: 'beton-pflaster',
      zaun_laenge: '10',
      zaun_hoehe: '100',
      zaun_hang: 'nein',
    });
    // Terrasse 110 × 10 = 1100; Zaun 140 × 10 = 1400; Montage 10 + 5 = 15 h × 62 = 930
    // Anfahrt ceil(15 / 8) = 2 × 35 = 70; net 3500; gross 4165; ± 15 %: 3540.3 → 3550, 4789.8 → 4800
    expect(k.netto).toBeCloseTo(3500, 6);
    expect([k.min, k.max, k.breite]).toEqual([3550, 4800, 0.15]);
  });

  it('holz beratung: 130 €/m², ± 25 %', () => {
    const k = run(terrasse, {
      typ: 'terrasse',
      terrasse_was: 'terrasse',
      terrasse_flaeche: '10',
      terrasse_holz: 'beratung',
    });
    // 1300 + Montage 10 h × 62 = 620 + Anfahrt 2 × 35 = 70 = 1990
    expect(k.netto).toBeCloseTo(1990, 6);
    expect(k.breite).toBe(0.25);
  });

  it('missing fields: Terrasse 1 m², Holz offen, ± 25 %', () => {
    const k = run(terrasse, { typ: 'terrasse' });
    // 130 + Montage 1 h × 62 + Anfahrt 35 = 227
    expect(k.netto).toBeCloseTo(227, 6);
    expect(k.breite).toBe(0.25);
    expect(has(k, 'Fläche der Terrasse')).toBe(true);
  });

  it('missing Zaun length and height are assumed', () => {
    const k = run(terrasse, { typ: 'terrasse', terrasse_was: 'zaun' });
    // 140 + Montage 0.5 h × 62 = 31 + Anfahrt 35 = 206
    expect(k.netto).toBeCloseTo(206, 6);
    expect(has(k, 'Länge des Zauns')).toBe(true);
    expect(has(k, 'Höhe des Zauns')).toBe(true);
    expect(has(k, '120 cm')).toBe(true);
    expect(k.breite).toBe(0.25);
  });

  it('typ mismatch → null', () => {
    expect(terrasse({ typ: 'boden' }, kern)).toBeNull();
  });

  it('is monotone in area and length', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1999 }), fc.constantFrom('laerche', 'robinie', 'beratung'), (n, holz) => {
        const mk = (m: number) =>
          run(terrasse, {
            typ: 'terrasse',
            terrasse_was: 'beides',
            terrasse_flaeche: String(m),
            terrasse_holz: holz,
            zaun_laenge: String(m),
            zaun_hoehe: '100',
          });
        expect(mk(n + 1).netto).toBeGreaterThan(mk(n).netto);
      }),
    );
  });
});

describe('all three', () => {
  it('never produce NaN or infinity for arbitrary strings', () => {
    const junk = fc.oneof(fc.string(), fc.constant(undefined), fc.constantFrom('0', '-1', '1e999', 'NaN', ' ', '1,5'));
    fc.assert(
      fc.property(fc.record({ a: junk, b: junk, c: junk, d: junk, e: junk }), (r) => {
        const v: Values = {
          fenster_anzahl: r.a,
          fenster_breite: r.b,
          fenster_hoehe: r.c,
          rolllaeden_anzahl: r.d,
          tuer_anzahl: r.a,
          terrasse_flaeche: r.b,
          zaun_laenge: r.c,
          zaun_hoehe: r.d,
          zaun_tore: r.e,
          terrasse_was: 'beides',
          fenster_leistung: ['neu', 'rolllaeden', 'fensterbaenke', 'restaurieren'],
        };
        for (const [typ, calc] of [
          ['fenster', fenster],
          ['tuer', tuer],
          ['terrasse', terrasse],
        ] as const)
          sane(run(calc, { ...v, typ }));
      }),
    );
  });

  it('rate versions are distinct 8-digit hex hashes and depend on SHARED', () => {
    const versions = [fensterVersion, tuerVersion, terrasseVersion];
    for (const x of versions) expect(x).toMatch(/^[0-9a-f]{8}$/);
    expect(new Set(versions).size).toBe(3);
    expect(SHARED.montageStunde).toBe(62);
  });
});
