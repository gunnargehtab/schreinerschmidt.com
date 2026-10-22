// Boden and Treppe calculators (docs/angebot.md §4.3). Expected numbers are hand-computed; the
// arithmetic is in the comments. All rates are PLACEHOLDER pilot assumptions.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Values } from '../../../src/lib/configurator/fields';
import { boden, regelVersion as bodenVersion } from '../../../src/lib/configurator/pricing/branches/boden';
import { treppe, regelVersion as treppeVersion } from '../../../src/lib/configurator/pricing/branches/treppe';
import { SHARED } from '../../../src/lib/configurator/pricing/common';
import type { Ctx, Kalkulation } from '../../../src/lib/configurator/pricing/types';

const kern: Ctx = { tier: 'kern' };
const region: Ctx = { tier: 'region' };

const run = (calc: typeof boden, v: Values, ctx: Ctx = kern): Kalkulation => {
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

describe('boden', () => {
  it('neu: stabparkett 24 m², Estrich, Kerngebiet', () => {
    const k = run(boden, {
      typ: 'boden',
      boden_leistung: 'neu',
      boden_art: 'stabparkett',
      boden_flaeche: '24',
      boden_untergrund: 'estrich',
    });
    // material 95 × 24 = 2280; Montage 24 / 4 = 6 h × 62 = 372; Anfahrt ceil(6 / 8) = 1 × 35 = 35
    // net 2687; gross × 1.19 = 3197.53; ± 15 %: 2717.9 → 2700, 3677.2 → 3700
    expect(k.netto).toBeCloseTo(2687, 6);
    expect(k.brutto).toBeCloseTo(3197.53, 6);
    expect([k.min, k.max, k.breite, k.quelle]).toEqual([2700, 3700, 0.15, 'regeln']);
    expect(k.annahmen).toEqual([]);
    expect(k.positionen.map((p) => p.einheit)).toEqual(['m²', 'h', 'Fahrt']);
    expect(k.positionen[0]?.text).toContain('24 m²');
  });

  it('neu: dielen 40 m², Teppich, Sockelleisten, 2 Räume, Region', () => {
    const k = run(
      boden,
      {
        typ: 'boden',
        boden_leistung: 'neu',
        boden_art: 'dielen',
        boden_flaeche: '40',
        boden_raeume: '2',
        boden_untergrund: 'teppich',
        boden_sockelleisten: 'on',
      },
      region,
    );
    // material 110 × 40 = 4400; Untergrund 12 × 40 = 480; Sockel lfm 4 × √20 × 2 = 35.777 × 14 = 500.88
    // Montage 10 h × 62 = 620; Anfahrt ceil(10 / 8) = 2 × 65 = 130
    // net 6130.88; gross 7295.75; ± 15 % (≥ 5 000 €: step 100): 6201.4 → 6200, 8390.1 → 8400
    const lfm = 4 * Math.sqrt(20) * 2;
    expect(k.netto).toBeCloseTo(4400 + 480 + lfm * 14 + 620 + 130, 6);
    expect(k.netto).toBeCloseTo(6130.88, 2);
    expect([k.min, k.max, k.breite]).toEqual([6200, 8400, 0.15]);
  });

  it('aufarbeiten: 30 m², zustand stark', () => {
    const k = run(boden, { typ: 'boden', boden_leistung: 'aufarbeiten', boden_flaeche: '30', boden_zustand: 'stark' });
    // (38 + 8) × 30 = 1380; Montage 7.5 h × 62 = 465; Anfahrt 1 × 35; net 1880; gross 2237.2
    // 1901.6 → 1900, 2572.8 → 2550
    expect(k.netto).toBeCloseTo(1880, 6);
    expect([k.min, k.max, k.breite]).toEqual([1900, 2550, 0.15]);
  });

  it('aufarbeiten: zustand schaeden keeps the price but widens to ± 25 %', () => {
    const k = run(boden, {
      typ: 'boden',
      boden_leistung: 'aufarbeiten',
      boden_flaeche: '30',
      boden_zustand: 'schaeden',
    });
    // 38 × 30 = 1140 + 465 + 35 = 1640; gross 1951.6; × 0.75 = 1463.7 → 1450, × 1.25 = 2439.5 → 2450
    expect(k.netto).toBeCloseTo(1640, 6);
    expect([k.min, k.max, k.breite]).toEqual([1450, 2450, 0.25]);
  });

  it('the Untergrund surcharge applies to neu only', () => {
    const base = { typ: 'boden', boden_flaeche: '10', boden_untergrund: 'teppich' };
    const neu = run(boden, { ...base, boden_leistung: 'neu', boden_art: 'kork' });
    const alt = run(boden, { ...base, boden_leistung: 'aufarbeiten' });
    // neu: (60 + 12) × 10 = 720 + Montage 2.5 h = 155 + 35 = 910; aufarbeiten: 380 + 155 + 35 = 570
    expect(neu.netto).toBeCloseTo(910, 6);
    expect(alt.netto).toBeCloseTo(570, 6);
  });

  it('Sockelleisten only when set; Räume missing → 1 with an assumption', () => {
    const base = { typ: 'boden', boden_leistung: 'aufarbeiten', boden_flaeche: '16' };
    const without = run(boden, base);
    const withLeiste = run(boden, { ...base, boden_sockelleisten: 'on' });
    // 38 × 16 = 608; Montage 4 h = 248; Anfahrt 35 → 891; Sockel: 4 × √16 × 1 = 16 lfm × 14 = 224 → 1115
    expect(without.netto).toBeCloseTo(891, 6);
    expect(withLeiste.netto).toBeCloseTo(1115, 6);
    expect(withLeiste.breite).toBe(0.25);
    expect(has(withLeiste, '1 Raum')).toBe(true);
    expect(without.breite).toBe(0.15);
    expect(run(boden, { ...base, boden_sockelleisten: '0' }).netto).toBeCloseTo(891, 6);
    expect(run(boden, { ...base, boden_sockelleisten: 'on', boden_raeume: '4' }).breite).toBe(0.15);
  });

  it('a fractional room count counts as missing', () => {
    const k = run(boden, {
      typ: 'boden',
      boden_leistung: 'aufarbeiten',
      boden_flaeche: '16',
      boden_sockelleisten: 'on',
      boden_raeume: '1,5',
    });
    // As above with 1 Raum: 891 + 16 lfm × 14 = 224 → 1115
    expect(k.netto).toBeCloseTo(1115, 6);
    expect(k.breite).toBe(0.25);
    expect(has(k, '1 Raum')).toBe(true);
  });

  it('reparatur and other types → null', () => {
    expect(boden({ typ: 'boden', boden_leistung: 'reparatur', boden_flaeche: '10' }, kern)).toBeNull();
    expect(boden({ typ: 'treppe', boden_leistung: 'neu' }, kern)).toBeNull();
    expect(boden({}, kern)).toBeNull();
  });

  it('missing everything: area 1 m², offen, ± 25 %, with assumptions', () => {
    const k = run(boden, { typ: 'boden', boden_leistung: 'neu' });
    // 80 × 1 = 80; Montage 0.25 h × 62 = 15.5; Anfahrt 35 → 130.5; gross 155.295
    // × 0.75 = 116.5 → 100, × 1.25 = 194.1 → 200
    expect(k.netto).toBeCloseTo(130.5, 6);
    expect([k.min, k.max, k.breite]).toEqual([100, 200, 0.25]);
    expect(has(k, 'Fläche nicht angegeben')).toBe(true);
    expect(has(k, 'Bodenart')).toBe(true);
  });

  it('missing Leistung is priced as neu with an assumption', () => {
    const k = run(boden, { typ: 'boden', boden_flaeche: '10', boden_art: 'kork' });
    expect(k.netto).toBeCloseTo(600 + 155 + 35, 6);
    expect(k.breite).toBe(0.25);
    expect(has(k, 'Leistung nicht angegeben')).toBe(true);
  });

  it('unknown enums widen to ± 25 % and price as offen', () => {
    // offen 80 × 10 = 800; Montage 2.5 h = 155; Anfahrt 35 → 990
    const art = run(boden, { typ: 'boden', boden_leistung: 'neu', boden_flaeche: '10', boden_art: 'offen' });
    expect(art.netto).toBeCloseTo(990, 6);
    expect(art.breite).toBe(0.25);
    const garbage = run(boden, { typ: 'boden', boden_leistung: 'neu', boden_flaeche: '10', boden_art: 'zzz' });
    expect(garbage.netto).toBeCloseTo(990, 6);
    // Untergrund unbekannt: + 12 × 10 = 120 and ± 25 %
    const untergrund = run(boden, {
      typ: 'boden',
      boden_leistung: 'neu',
      boden_flaeche: '10',
      boden_art: 'kork',
      boden_untergrund: 'unbekannt',
    });
    expect(untergrund.netto).toBeCloseTo(600 + 120 + 155 + 35, 6);
    expect(untergrund.breite).toBe(0.25);
  });

  it('parses comma decimals and survives garbage numbers', () => {
    const comma = run(boden, { typ: 'boden', boden_leistung: 'aufarbeiten', boden_flaeche: '12,5' });
    // 38 × 12.5 = 475; Montage 3.125 h × 62 = 193.75; Anfahrt 35 → 703.75
    expect(comma.netto).toBeCloseTo(703.75, 6);
    for (const bad of ['', 'abc', '-3', '0', 'NaN', 'Infinity', '1e999', '  ']) {
      const k = run(boden, {
        typ: 'boden',
        boden_leistung: 'aufarbeiten',
        boden_flaeche: bad,
        boden_sockelleisten: 'on',
        boden_raeume: bad,
      });
      sane(k);
      expect(has(k, 'Fläche nicht angegeben')).toBe(true);
    }
    sane(run(boden, { typ: 'boden', boden_leistung: 'neu', boden_flaeche: ['1', '2'] as unknown as string }));
  });

  it('huge finite areas are treated as missing, never Infinity', () => {
    for (const bad of ['1e307', '99999999', '1000000']) {
      const k = run(boden, { typ: 'boden', boden_leistung: 'neu', boden_art: 'dielen', boden_flaeche: bad });
      sane(k);
      // 1 m² × 110 + Montage 0.25 h × 62 = 15.5 + Anfahrt 35 → 160.5
      expect(k.netto).toBeCloseTo(160.5, 6);
      expect(has(k, 'Fläche nicht angegeben')).toBe(true);
    }
  });

  it('an unknown Untergrund widens aufarbeiten too (field without a `when` gate)', () => {
    const base = { typ: 'boden', boden_leistung: 'aufarbeiten', boden_flaeche: '55', boden_zustand: 'leicht' };
    const a = run(boden, base);
    const b = run(boden, { ...base, boden_untergrund: 'unbekannt' });
    // 55 × 38 = 2090; Montage 13.75 h × 62 = 852.5; Anfahrt ceil(13.75 / 8) = 2 × 35 = 70 → 3012.5
    // (no Untergrund surcharge: it applies to neu only)
    expect(b.netto).toBeCloseTo(3012.5, 6);
    expect(b.netto).toBeCloseTo(a.netto, 6);
    expect([a.breite, b.breite]).toEqual([0.15, 0.25]);
  });

  it('unknown PLZ adds the Anfahrt assumption and prices aussen', () => {
    const k = run(boden, { typ: 'boden', boden_leistung: 'aufarbeiten', boden_flaeche: '30' }, { tier: null });
    // 1140 + 465 + 120 = 1725
    expect(k.netto).toBeCloseTo(1725, 6);
    expect(has(k, 'PLZ unbekannt')).toBe(true);
  });

  it('regelVersion is a stable hash', () => {
    expect(bodenVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(bodenVersion).not.toBe(treppeVersion);
    expect(run(boden, { typ: 'boden', boden_leistung: 'aufarbeiten' }).regelVersion).toBe(bodenVersion);
  });

  it('is monotone in the area and never NaN (property)', () => {
    const leistung = fc.constantFrom('neu', 'aufarbeiten');
    fc.assert(
      fc.property(
        leistung,
        fc.integer({ min: 1, max: 2000 }),
        fc.integer({ min: 0, max: 500 }),
        fc.boolean(),
        (l, a, extra, leiste) => {
          const mk = (m2: number): Kalkulation =>
            run(boden, {
              typ: 'boden',
              boden_leistung: l,
              boden_art: 'dielen',
              boden_flaeche: String(m2),
              boden_raeume: '3',
              ...(leiste ? { boden_sockelleisten: 'on' } : {}),
            });
          const lo = mk(a);
          const hi = mk(a + extra);
          sane(lo);
          sane(hi);
          expect(hi.netto).toBeGreaterThanOrEqual(lo.netto);
          expect(hi.min).toBeGreaterThanOrEqual(lo.min);
          expect(hi.max).toBeGreaterThanOrEqual(lo.max);
        },
      ),
    );
  });

  it('never produces NaN for arbitrary strings (property)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), fc.string(), (a, b, c, d) => {
        sane(
          run(boden, {
            typ: 'boden',
            boden_leistung: a,
            boden_flaeche: b,
            boden_raeume: c,
            boden_sockelleisten: d,
            boden_art: a,
          }),
        );
      }),
    );
  });

  it('uses the shared Mindest rates only through common (SHARED stays 8 h per Montage day)', () => {
    // 80 m² aufarbeiten: Montage 20 h → ceil(20 / 8) = 3 trips
    const k = run(boden, { typ: 'boden', boden_leistung: 'aufarbeiten', boden_flaeche: '80' });
    const trips = k.positionen.find((p) => p.einheit === 'Fahrt');
    expect(SHARED.montageTag).toBe(8);
    expect(trips?.menge).toBe(3);
    expect(trips?.netto).toBe(105);
  });
});

describe('treppe', () => {
  it('neu: wange, gerade, 16 Stufen', () => {
    const k = run(treppe, {
      typ: 'treppe',
      treppe_leistung: 'neu',
      treppe_bauart: 'wange',
      treppe_form: 'gerade',
      treppe_stufen: '16',
    });
    // 650 × 16 = 10400; Montage 3 × 16 = 48 h × 62 = 2976; Anfahrt ceil(48 / 8) = 6 × 35 = 210
    // net 13586; gross 16167.34; 13742.2 → 13700, 18592.4 → 18600
    expect(k.netto).toBeCloseTo(13586, 6);
    expect([k.min, k.max, k.breite]).toEqual([13700, 18600, 0.15]);
    expect(k.annahmen).toEqual([]);
  });

  it('neu: holm, viertel (+ 15 %), Geländer neu, 12 Stufen, Region', () => {
    const k = run(
      treppe,
      {
        typ: 'treppe',
        treppe_leistung: 'neu',
        treppe_bauart: 'holm',
        treppe_form: 'viertel',
        treppe_stufen: '12',
        treppe_gelaender: 'neu',
      },
      region,
    );
    // 750 × 12 = 9000; Form 15 % = 1350; Geländer 12 × 0.3 = 3.6 lfm × 220 = 792
    // Montage 36 + 3.6 = 39.6 h × 62 = 2455.2; Anfahrt ceil(4.95) = 5 × 65 = 325
    // net 13922.2; gross 16567.42; 14082.3 → 14100, 19052.5 → 19100
    expect(k.netto).toBeCloseTo(13922.2, 6);
    expect([k.min, k.max, k.breite]).toEqual([14100, 19100, 0.15]);
    expect(k.positionen.filter((p) => p.einheit === 'lfm')).toHaveLength(1);
  });

  it('the Form surcharge applies to neu only', () => {
    const k = run(treppe, { typ: 'treppe', treppe_leistung: 'renovieren', treppe_form: 'wendel', treppe_stufen: '10' });
    // renovieren 180 × 10 = 1800; Montage 15 h = 930; Anfahrt 2 × 35 = 70 → 2800; no Form surcharge
    expect(k.netto).toBeCloseTo(2800, 6);
  });

  it('renovieren: 10 Stufen', () => {
    const k = run(treppe, { typ: 'treppe', treppe_leistung: 'renovieren', treppe_stufen: '10' });
    // net 2800; gross 3332; 2832.2 → 2850, 3831.8 → 3850
    expect([k.min, k.max, k.breite]).toEqual([2850, 3850, 0.15]);
  });

  it('belegen: 10 Stufen', () => {
    const k = run(treppe, { typ: 'treppe', treppe_leistung: 'belegen', treppe_stufen: '10' });
    // 260 × 10 = 2600; Montage 15 h = 930; Anfahrt 70 → 3600; gross 4284; 3641.4 → 3650, 4926.6 → 4950
    expect(k.netto).toBeCloseTo(3600, 6);
    expect([k.min, k.max, k.breite]).toEqual([3650, 4950, 0.15]);
  });

  it('Geländer only: 20 Stufen → 6 lfm', () => {
    const k = run(treppe, { typ: 'treppe', treppe_leistung: 'gelaender', treppe_stufen: '20' });
    // 6 × 220 = 1320; Montage 6 × 1 h = 6 h × 62 = 372; Anfahrt 1 × 35 → 1727
    // gross 2055.13; 1746.9 → 1750, 2363.4 → 2350
    expect(k.netto).toBeCloseTo(1727, 6);
    expect([k.min, k.max, k.breite]).toEqual([1750, 2350, 0.15]);
    expect(k.positionen).toHaveLength(3);
  });

  it('Geländer on a belegen Treppe adds the lfm position once', () => {
    const k = run(treppe, { typ: 'treppe', treppe_leistung: 'belegen', treppe_stufen: '10', treppe_gelaender: 'neu' });
    // 2600 + 3 lfm × 220 = 660; Montage 15 + 3 = 18 h = 1116; Anfahrt 3 × 35 = 105 → 4481
    expect(k.netto).toBeCloseTo(4481, 6);
    expect(
      treppe({ typ: 'treppe', treppe_leistung: 'belegen', treppe_stufen: '10', treppe_gelaender: 'vorhanden' }, kern)
        ?.netto,
    ).toBeCloseTo(3600, 6);
  });

  // 14 Stufen is the documented default of docs/angebot.md §4.3 (a storey of about 2.6 m), not „1“.
  it('Stufen missing → 14 with an assumption and ± 25 %', () => {
    const k = run(treppe, { typ: 'treppe', treppe_leistung: 'neu', treppe_bauart: 'wange' });
    // 650 × 14 = 9100; Montage 42 h = 2604; Anfahrt 6 × 35 = 210 → 11914; gross 14177.66
    // × 0.75 = 10633.2 → 10600, × 1.25 = 17722.1 → 17700
    expect(k.netto).toBeCloseTo(11914, 6);
    expect([k.min, k.max, k.breite]).toEqual([10600, 17700, 0.25]);
    expect(has(k, '14 Stufen')).toBe(true);
  });

  it('a fractional Stufen count counts as missing (14 Stufen)', () => {
    for (const stufen of ['12,5', '0.001']) {
      const k = run(treppe, { typ: 'treppe', treppe_leistung: 'neu', treppe_bauart: 'wange', treppe_stufen: stufen });
      // as „Stufen missing“: 650 × 14 = 9100 + Montage 2604 + Anfahrt 210 = 11914
      expect(k.netto).toBeCloseTo(11914, 6);
      expect(k.breite).toBe(0.25);
      expect(has(k, '14 Stufen')).toBe(true);
    }
  });

  it('unknown enums: beratung / unbekannt → beratung rate and ± 25 %', () => {
    const beratung = run(treppe, {
      typ: 'treppe',
      treppe_leistung: 'neu',
      treppe_bauart: 'beratung',
      treppe_stufen: '10',
    });
    // 750 × 10 = 7500; Montage 30 h = 1860; Anfahrt 4 × 35 = 140 → 9500
    expect(beratung.netto).toBeCloseTo(9500, 6);
    expect(beratung.breite).toBe(0.25);
    expect(
      run(treppe, { typ: 'treppe', treppe_leistung: 'neu', treppe_bauart: 'x', treppe_stufen: '10' }).netto,
    ).toBeCloseTo(9500, 6);
    const form = run(treppe, {
      typ: 'treppe',
      treppe_leistung: 'neu',
      treppe_bauart: 'wange',
      treppe_form: 'unbekannt',
      treppe_stufen: '10',
    });
    expect(form.breite).toBe(0.25);
    const bestand = run(treppe, {
      typ: 'treppe',
      treppe_leistung: 'renovieren',
      treppe_bestand: 'unbekannt',
      treppe_stufen: '10',
    });
    expect(bestand.breite).toBe(0.25);
    // treppe_form and treppe_holz have no `when` gate: unknown answers widen renovieren and Geländer too.
    const renoviert = run(treppe, {
      typ: 'treppe',
      treppe_leistung: 'renovieren',
      treppe_form: 'unbekannt',
      treppe_stufen: '10',
    });
    // 10 × 180 = 1800; Montage 15 h × 62 = 930; Anfahrt 2 × 35 = 70 → 2800
    expect(renoviert.netto).toBeCloseTo(2800, 6);
    expect(renoviert.breite).toBe(0.25);
    const gelaender = run(treppe, {
      typ: 'treppe',
      treppe_leistung: 'gelaender',
      treppe_holz: 'beratung',
      treppe_stufen: '10',
    });
    expect(gelaender.breite).toBe(0.25);
  });

  it('missing Leistung is priced as neu with an assumption', () => {
    const k = run(treppe, { typ: 'treppe', treppe_stufen: '10', treppe_bauart: 'wange' });
    expect(k.netto).toBeCloseTo(6500 + 1860 + 140, 6);
    expect(has(k, 'Leistung nicht angegeben')).toBe(true);
  });

  it('other types → null', () => {
    expect(treppe({ typ: 'boden', treppe_leistung: 'neu' }, kern)).toBeNull();
    expect(treppe({}, kern)).toBeNull();
  });

  it('survives garbage numbers', () => {
    for (const bad of ['', 'abc', '-3', '0', 'NaN', 'Infinity', '1e999', '1e307', '1000000']) {
      const k = run(treppe, { typ: 'treppe', treppe_leistung: 'gelaender', treppe_stufen: bad });
      sane(k);
      expect(has(k, 'Stufenzahl nicht angegeben')).toBe(true);
    }
    // A comma decimal parses; Stufen are a count (§4.3), so 12,5 counts as missing (14) and 12,0 is 12.
    expect(
      treppe({ typ: 'treppe', treppe_stufen: '12,5', treppe_leistung: 'belegen' }, kern)?.positionen[0]?.menge,
    ).toBe(14);
    expect(
      treppe({ typ: 'treppe', treppe_stufen: '12,0', treppe_leistung: 'belegen' }, kern)?.positionen[0]?.menge,
    ).toBe(12);
  });

  it('is monotone in the Stufen and never NaN (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('neu', 'renovieren', 'belegen', 'gelaender'),
        fc.constantFrom('gerade', 'viertel', 'wendel'),
        fc.integer({ min: 2, max: 30 }),
        fc.integer({ min: 0, max: 20 }),
        (l, form, s, extra) => {
          const mk = (n: number): Kalkulation =>
            run(treppe, {
              typ: 'treppe',
              treppe_leistung: l,
              treppe_bauart: 'holm',
              treppe_form: form,
              treppe_stufen: String(n),
            });
          const lo = mk(s);
          const hi = mk(s + extra);
          sane(lo);
          sane(hi);
          expect(hi.netto).toBeGreaterThanOrEqual(lo.netto);
          expect(hi.min).toBeGreaterThanOrEqual(lo.min);
          expect(hi.max).toBeGreaterThanOrEqual(lo.max);
        },
      ),
    );
  });

  it('never produces NaN for arbitrary strings (property)', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (a, b, c) => {
        sane(
          run(treppe, { typ: 'treppe', treppe_leistung: a, treppe_stufen: b, treppe_bauart: c, treppe_gelaender: c }),
        );
      }),
    );
  });
});
