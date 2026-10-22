// Möbel calculator (docs/angebot.md §4.2): generator-priced furniture, the Bett table, widening rules.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Values } from '../../../src/lib/configurator/fields';
import { hashRates, SHARED } from '../../../src/lib/configurator/pricing/common';
import { BETT, moebel, regelVersion } from '../../../src/lib/configurator/pricing/moebel';
import { PILOT_RULES } from '../../../src/lib/configurator/pricing/pilot-rules';
import type { Ctx, Kalkulation } from '../../../src/lib/configurator/pricing/types';

const KERN: Ctx = { tier: 'kern' };

const REGAL: Values = {
  typ: 'moebel',
  moebel_art: 'regal',
  moebel_breite: '80',
  moebel_hoehe: '100',
  moebel_tiefe: '30',
  moebel_staerke: '19',
  moebel_unterbau: 'ohne',
  moebel_rueckwand: 'ohne',
  moebel_faecher: '1',
  moebel_holz: 'eiche',
  moebel_oberflaeche: 'natur-geoelt',
};

const SIDEBOARD: Values = {
  typ: 'moebel',
  moebel_art: 'sideboard',
  moebel_breite: '180',
  moebel_hoehe: '80',
  moebel_tiefe: '45',
  moebel_staerke: '19',
  moebel_front: 'gemischt',
  moebel_unterbau: 'sockel',
  moebel_griffe: 'grifflos',
  moebel_holz: 'eiche',
  moebel_oberflaeche: 'natur-geoelt',
};

const BETT_V: Values = {
  typ: 'moebel',
  moebel_art: 'bett',
  bett_liegeflaeche: '160x200',
  bett_hoehe: 'normal',
  moebel_holz: 'eiche',
  moebel_oberflaeche: 'natur-geoelt',
};

const pos = (k: Kalkulation, start: string) => k.positionen.find((p) => p.text.startsWith(start));
const sum = (k: Kalkulation) => k.positionen.reduce((s, p) => s + p.netto, 0);

describe('moebel calculator', () => {
  it('prices a regal by hand (eiche, 19 mm, natur geölt, Kerngebiet)', () => {
    // Generator output for 80 × 100 × 30 cm, 2 bays, 1 shelf setting → 2 Fachböden per bay, no base, no back:
    //   2 Seiten        1000 × 300 = 0.3000 m² each → 0.6000
    //   Ober-/Unterboden 762 × 300 = 0.2286 m² each → 0.4572
    //   4 Fachböden    371.5 × 300 = 0.11145 m² each → 0.4458
    //   1 Mittelwand     962 × 300 = 0.2886 m²
    //   area = 1.7916 m², 9 parts
    // Plattenmaterial 1.7916 × 95 €        = 170.202 €
    // Oberfläche     2 × 1.7916 × 18 €     =  64.4976 €
    // Werkstatt      9 × 1.2 h = 10.8 h × 68 € = 734.40 €
    // Beschläge      none (offen)
    // Montage        4 h × 62 €            = 248 €
    // Anfahrt        Kerngebiet, 1 Fahrt   =  35 €
    // netto = 1 252.0996 €, brutto × 1.19 = 1 489.998524 €
    // min = round50(1 489.998524 × 0.85 = 1 266.50) = 1 250; max = round50(× 1.15 = 1 713.50) = 1 700
    const k = moebel(REGAL, KERN)!;
    expect(k).not.toBeNull();
    expect(pos(k, 'Plattenmaterial Eiche')!.menge).toBeCloseTo(1.7916, 6);
    expect(pos(k, 'Plattenmaterial Eiche')!.netto).toBeCloseTo(170.202, 6);
    expect(pos(k, 'Oberfläche natur geölt')!.netto).toBeCloseTo(64.4976, 6);
    expect(pos(k, 'Werkstatt')!.menge).toBeCloseTo(10.8, 9);
    expect(pos(k, 'Werkstatt')!.netto).toBeCloseTo(734.4, 6);
    expect(pos(k, 'Beschläge')).toBeUndefined();
    expect(pos(k, 'Montage')).toMatchObject({ menge: 4, einheit: 'h', netto: 248 });
    expect(pos(k, 'Anfahrt (Kerngebiet)')).toMatchObject({ menge: 1, netto: 35 });
    expect(k.netto).toBeCloseTo(1252.0996, 6);
    expect(k.brutto).toBeCloseTo(1489.998524, 6);
    expect(k.min).toBe(1250);
    expect(k.max).toBe(1700);
    expect(k.breite).toBe(0.15);
    expect(k.quelle).toBe('regeln');
    expect(k.annahmen).toEqual([]);
    expect(k.netto).toBeCloseTo(sum(k), 9);
  });

  it('prices sideboard doors, drawers and hinges as a Beschläge line', () => {
    const k = moebel(SIDEBOARD, KERN)!;
    // gemischt, 3 bays → 3 Türen, 3 Schubkästen, 6 Scharniere: 3 × 45 + 3 × 85 + 6 × 12 = 462 €
    const b = pos(k, 'Beschläge')!;
    expect(b.text).toBe('Beschläge (3 Türen, 3 Schubkästen, 6 Scharniere)');
    expect(b).toMatchObject({ menge: 12, einheit: 'Stk.', netto: 462 });
    expect(pos(k, 'Montage')!.menge).toBe(4);
    expect(k.breite).toBe(0.15);
  });

  it('gives the Einbauschrank 8 h Montage and still one trip', () => {
    const k = moebel(
      { typ: 'moebel', moebel_art: 'einbauschrank', moebel_breite: '240', moebel_hoehe: '250', moebel_tiefe: '60' },
      KERN,
    )!;
    expect(pos(k, 'Montage')).toMatchObject({ menge: 8, netto: 8 * SHARED.montageStunde });
    expect(pos(k, 'Anfahrt')!.menge).toBe(1);
    expect(pos(k, 'Beschläge')!.menge).toBeGreaterThan(0);
  });

  it('prices an Esstisch through the table generator', () => {
    const k = moebel(
      {
        typ: 'moebel',
        moebel_art: 'esstisch',
        tisch_laenge: '200',
        tisch_breite: '90',
        tisch_hoehe: '75',
        tisch_platte: '40',
        moebel_holz: 'nussbaum',
        moebel_oberflaeche: 'lack-matt',
      },
      { tier: 'region' },
    )!;
    expect(pos(k, 'Plattenmaterial Nussbaum')!.netto).toBeGreaterThan(0);
    expect(pos(k, 'Oberfläche matt lackiert')!.netto).toBeGreaterThan(0);
    expect(pos(k, 'Anfahrt (Region)')!.netto).toBe(65);
    expect(k.breite).toBe(0.15);
    expect(k.netto).toBeGreaterThan(SHARED.mindestauftrag);
  });

  it('leaves a steel Kufen frame out of board, finish and Werkstatt, with an assumption', () => {
    const k = moebel(
      {
        typ: 'moebel',
        moebel_art: 'esstisch',
        tisch_laenge: '200',
        tisch_breite: '90',
        tisch_hoehe: '75',
        tisch_platte: '40',
        tisch_gestell: 'kufen-stahl',
        moebel_holz: 'nussbaum',
        moebel_oberflaeche: 'lack-matt',
      },
      KERN,
    )!;
    // Only the 2000 × 900 × 40 top is wood: 1.8 m² × 280 € (Nussbaum 40 mm) = 504
    // Oberfläche 2 × 1.8 × 35 = 126; Werkstatt 1 × 1.2 h × 68 = 81.6; Montage 4 h × 62 = 248; Anfahrt 35
    // net 994.6; gross 1183.574; ± 25 %: 887.68 → 900, 1479.47 → 1500
    expect(pos(k, 'Plattenmaterial Nussbaum, 1,8 m²')!.netto).toBeCloseTo(504, 9);
    expect(pos(k, 'Oberfläche matt lackiert, 3,6 m²')!.netto).toBeCloseTo(126, 9);
    expect(pos(k, 'Werkstatt, 1 Teil')!.netto).toBeCloseTo(81.6, 9);
    expect(k.netto).toBeCloseTo(994.6, 9);
    expect([k.min, k.max, k.breite]).toEqual([900, 1500, 0.25]);
    expect(k.annahmen).toEqual(['Das Stahlgestell ist im Preis nicht enthalten und wird nach Rücksprache ergänzt.']);
  });

  it('prices every Bett size from the table (eiche, normal, geölt)', () => {
    for (const [size, price] of Object.entries(BETT.grundpreis)) {
      const k = moebel({ ...BETT_V, bett_liegeflaeche: size }, KERN)!;
      // price + Montage 2 h × 62 + Anfahrt 35
      expect(k.netto).toBeCloseTo(price + 124 + 35, 9);
      expect(pos(k, 'Montage')).toMatchObject({ menge: 2, netto: 124 });
      expect(pos(k, 'Anfahrt')!.menge).toBe(1);
      if (size === 'sondermass') {
        expect(k.breite).toBe(0.25);
        expect(k.annahmen).toHaveLength(1);
      } else {
        expect(k.breite).toBe(0.15);
        expect(k.annahmen).toEqual([]);
      }
    }
    // 160 × 200: 1 900 + 124 + 35 = 2 059 → × 1.19 = 2 450.21 → min round50(2 082.68) = 2 100, max round50(2 817.74) = 2 800
    const k = moebel(BETT_V, KERN)!;
    expect(pos(k, 'Bett 160 × 200 cm, Eiche')).toBeDefined();
    expect(k.brutto).toBeCloseTo(2450.21, 6);
    expect(k.min).toBe(2100);
    expect(k.max).toBe(2800);
  });

  it('applies species factor, Komfort and Lack surcharges to the Bett', () => {
    const k = moebel(
      {
        ...BETT_V,
        bett_liegeflaeche: '180x200',
        bett_hoehe: 'komfort',
        moebel_holz: 'nussbaum',
        moebel_oberflaeche: 'lack-matt',
      },
      KERN,
    )!;
    // 2 050 × 1.35 = 2 767.5; + 8 % = 221.4; + 10 % = 276.75; + 124 + 35 = 3 424.65
    expect(pos(k, 'Bett 180 × 200 cm, Nussbaum')!.netto).toBeCloseTo(2767.5, 9);
    expect(pos(k, 'Zuschlag Komforthöhe (8 %)')!.netto).toBeCloseTo(221.4, 9);
    expect(pos(k, 'Zuschlag Lack matt (10 %)')!.netto).toBeCloseTo(276.75, 9);
    expect(k.netto).toBeCloseTo(3424.65, 9);
    for (const [holz, f] of Object.entries(BETT.holzFaktor)) {
      const b = moebel({ ...BETT_V, moebel_holz: holz }, KERN)!;
      expect(pos(b, 'Bett')!.netto).toBeCloseTo(1900 * f, 9);
    }
  });

  it('prototype keys and unknown values in the Bett lookups never yield NaN', () => {
    for (const bad of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const size = moebel({ ...BETT_V, bett_liegeflaeche: bad }, KERN)!;
      // priced as Sondermaß: 2 100 + 124 + 35 = 2 259
      expect(size.netto).toBeCloseTo(2259, 9);
      expect(pos(size, 'Bett Sondermaß, Eiche')).toBeDefined();
      expect(size.breite).toBe(0.25);
      const holz = moebel({ ...BETT_V, moebel_holz: bad }, KERN)!;
      // priced as Eiche: 1 900 + 124 + 35 = 2 059
      expect(holz.netto).toBeCloseTo(2059, 9);
      expect(pos(holz, 'Bett 160')!.text).toMatch(/, Eiche \(/);
      expect(holz.breite).toBe(0.25);
      expect(holz.annahmen).toEqual(['Holzart nicht erkannt, wir rechnen mit Eiche.']);
    }
  });

  it('returns null for unknown furniture types, prototype keys included', () => {
    for (const art of ['foo', 'schreibtisch', 'constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(moebel({ typ: 'moebel', moebel_art: art }, KERN)).toBeNull();
      expect(moebel({ ...REGAL, moebel_art: art }, KERN)).toBeNull();
    }
  });

  it('an unknown species or finish on a generator piece is priced as the default with an assumption', () => {
    const a = moebel(REGAL, KERN)!;
    const k = moebel({ ...REGAL, moebel_holz: 'teak', moebel_oberflaeche: 'glanz' }, KERN)!;
    // REGAL already is eiche / natur geölt, the defaults: same amount, wider range.
    expect(k.netto).toBeCloseTo(a.netto, 9);
    expect(k.breite).toBe(0.25);
    expect(k.annahmen).toEqual([
      'Holzart nicht erkannt, wir rechnen mit Eiche.',
      'Oberfläche nicht erkannt, wir rechnen mit natur geölt.',
    ]);
    for (const bad of ['constructor', '__proto__']) {
      const p = moebel({ ...SIDEBOARD, moebel_holz: bad, moebel_oberflaeche: bad }, KERN)!;
      expect(p.netto).toBeCloseTo(moebel(SIDEBOARD, KERN)!.netto, 9);
      expect(p.breite).toBe(0.25);
      expect(p.annahmen).toHaveLength(2);
    }
  });

  it('an unknown finish on the Bett gets no Lack surcharge, with an assumption', () => {
    const k = moebel({ ...BETT_V, moebel_oberflaeche: 'glanz' }, KERN)!;
    // 1 900 + Montage 2 h × 62 = 124 + Anfahrt 35 = 2 059, as natur geölt
    expect(k.netto).toBeCloseTo(2059, 9);
    expect(k.breite).toBe(0.25);
    expect(k.annahmen).toEqual(['Oberfläche nicht erkannt, wir rechnen mit natur geölt.']);
  });

  it('never produces NaN for arbitrary Bett strings (property)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), fc.string(), (size, holz, hoehe, ober) => {
        const k = moebel(
          { ...BETT_V, bett_liegeflaeche: size, moebel_holz: holz, bett_hoehe: hoehe, moebel_oberflaeche: ober },
          KERN,
        )!;
        for (const x of [k.netto, k.brutto, k.min, k.max, ...k.positionen.map((p) => p.netto)]) {
          expect(Number.isFinite(x)).toBe(true);
        }
        expect(k.min).toBeLessThanOrEqual(k.max);
      }),
    );
  });

  it('a missing Liegefläche is priced as Sondermaß with an assumption', () => {
    const k = moebel({ ...BETT_V, bett_liegeflaeche: undefined }, KERN)!;
    expect(pos(k, 'Bett Sondermaß')!.netto).toBe(2100);
    expect(k.breite).toBe(0.25);
    expect(k.annahmen[0]).toMatch(/Liegefläche nicht angegeben/);
  });

  it('„beratung“ prices as Eiche and widens the range', () => {
    const a = moebel(REGAL, KERN)!;
    const b = moebel({ ...REGAL, moebel_holz: 'beratung' }, KERN)!;
    expect(b.netto).toBeCloseTo(a.netto, 9);
    expect(b.breite).toBe(0.25);
    expect(b.annahmen).toEqual(['Holzart noch offen, wir rechnen mit Eiche.']);
    expect(b.max - b.min).toBeGreaterThan(a.max - a.min);
    const bett = moebel({ ...BETT_V, moebel_holz: 'beratung' }, KERN)!;
    expect(pos(bett, 'Bett')!.netto).toBe(1900);
    expect(bett.breite).toBe(0.25);
  });

  it('returns null for „andere“, for a missing furniture type and for other project types', () => {
    expect(moebel({ typ: 'moebel', moebel_art: 'andere', moebel_beschreibung: 'Ein Schreibtisch' }, KERN)).toBeNull();
    expect(moebel({ typ: 'moebel' }, KERN)).toBeNull();
    expect(moebel({ ...REGAL, typ: 'boden' }, KERN)).toBeNull();
    expect(moebel({ ...REGAL, typ: undefined }, KERN)).toBeNull();
  });

  it('an unknown PLZ is priced as außerhalb with an assumption', () => {
    const k = moebel(REGAL, { tier: null })!;
    expect(pos(k, 'Anfahrt (außerhalb)')!.netto).toBe(SHARED.anfahrt.aussen);
    expect(k.annahmen).toEqual(['Anfahrt wie außerhalb des Einzugsgebiets berechnet (PLZ unbekannt).']);
    expect(k.breite).toBe(0.15);
  });

  it('missing or garbage dimensions fall back to the default with an assumption, never NaN', () => {
    const k = moebel({ ...REGAL, moebel_breite: undefined, moebel_hoehe: 'abc' }, KERN)!;
    expect(k.annahmen).toEqual([
      'Breite nicht angegeben, wir rechnen mit 120 cm.',
      'Höhe nicht angegeben, wir rechnen mit 200 cm.',
    ]);
    expect(k.breite).toBe(0.25);
    for (const x of [k.netto, k.brutto, k.min, k.max, ...k.positionen.map((p) => p.netto)]) {
      expect(Number.isFinite(x)).toBe(true);
    }
    const bare = moebel({ typ: 'moebel', moebel_art: 'esstisch' }, KERN)!;
    expect(bare.annahmen).toHaveLength(3);
    expect(Number.isFinite(bare.netto)).toBe(true);
  });

  it('an unexpected tier value is priced as außerhalb with an assumption, never NaN', () => {
    const k = moebel(REGAL, { tier: 'mond' as unknown as Ctx['tier'] })!;
    const aussen = moebel(REGAL, { tier: 'aussen' })!;
    expect(k.netto).toBe(aussen.netto);
    expect(k.annahmen.some((a) => a.includes('PLZ unbekannt'))).toBe(true);
    expect(moebel(REGAL, {} as Ctx)!.netto).toBe(aussen.netto);
  });

  it('a dimension outside the per-type range is clamped, widened and listed', () => {
    const k = moebel({ ...REGAL, moebel_breite: '9999' }, KERN)!;
    expect(k.breite).toBe(0.25);
    expect(k.annahmen.some((a) => a.startsWith('Breite außerhalb des möglichen Bereichs'))).toBe(true);
    expect(Number.isFinite(k.netto)).toBe(true);
    expect(moebel(REGAL, KERN)!.breite).toBe(0.15);
  });

  it('an option value outside its list is priced as the default, widened and listed', () => {
    const k = moebel({ ...REGAL, moebel_staerke: '99' }, KERN)!;
    expect(k.breite).toBe(0.25);
    expect(k.annahmen).toContain('Angabe „99“ nicht erkannt, wir rechnen mit der Standardausführung.');
  });

  it('keeps min ≤ max and rounds to 50 € below 5 000 €, else to 100 €', () => {
    const small = moebel(REGAL, KERN)!;
    expect(small.min).toBeLessThanOrEqual(small.max);
    expect(small.max).toBeLessThan(5000);
    expect(small.min % 50).toBe(0);
    expect(small.max % 50).toBe(0);
    const big = moebel(
      {
        typ: 'moebel',
        moebel_art: 'einbauschrank',
        moebel_breite: '400',
        moebel_hoehe: '320',
        moebel_tiefe: '65',
        moebel_staerke: '25',
        moebel_holz: 'nussbaum',
        moebel_oberflaeche: 'lack-matt',
      },
      KERN,
    )!;
    expect(big.min).toBeLessThanOrEqual(big.max);
    expect(big.min).toBeGreaterThan(5000);
    expect(big.min % 100).toBe(0);
    expect(big.max % 100).toBe(0);
  });

  it('stamps regelVersion with the hash of the rate tables', () => {
    expect(regelVersion).toBe(hashRates(PILOT_RULES, SHARED, BETT));
    expect(regelVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(moebel(REGAL, KERN)!.regelVersion).toBe(regelVersion);
  });

  it('property: a wider regal never costs less', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 300 }),
        fc.integer({ min: 40, max: 300 }),
        fc.integer({ min: 40, max: 260 }),
        fc.constantFrom('19', '25', '40'),
        (w1, w2, h, staerke) => {
          const [lo, hi] = w1 <= w2 ? [w1, w2] : [w2, w1];
          const at = (w: number) =>
            moebel({ ...REGAL, moebel_breite: String(w), moebel_hoehe: String(h), moebel_staerke: staerke }, KERN)!;
          const a = at(lo);
          const b = at(hi);
          return b.netto >= a.netto - 1e-9 && b.max >= a.max && b.min >= a.min;
        },
      ),
      { numRuns: 200 },
    );
  });
});
