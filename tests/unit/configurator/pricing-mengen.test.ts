// Claude quantities (docs/angebot.md §4.4) and the dispatcher. Expected numbers are hand-computed;
// the arithmetic is in the comments. All rates are PLACEHOLDER pilot assumptions.
import { describe, expect, it } from 'vitest';
import { isRuleBased, kalkulieren } from '../../../src/lib/configurator/pricing/kalkulieren';
import {
  MENGEN_LIMITS,
  MengenFehler,
  preiseMengen,
  type MaterialZeile,
  type Mengen,
} from '../../../src/lib/configurator/pricing/mengen';
import type { Ctx } from '../../../src/lib/configurator/pricing/types';

const region: Ctx = { tier: 'region' };

const base = (over: Partial<Mengen> = {}): Mengen => ({ werkstatt_h: 0, montage_h: 0, material: [], ...over });

describe('preiseMengen', () => {
  it('prices a mixed case', () => {
    const k = preiseMengen(
      {
        werkstatt_h: 20,
        montage_h: 9,
        material: [
          { art: 'platte', holz: 'eiche', staerke: 25, menge: 4, einheit: 'm²', begruendung: 'Korpus' },
          { art: 'oberflaeche', oberflaeche: 'lack-matt', menge: 8, einheit: 'm²', begruendung: 'Front' },
          { art: 'beschlag', beschlag: 'scharnier', menge: 10, einheit: 'Stk.', begruendung: 'Türen' },
          { art: 'pauschal', menge: 1, einheit: 'Pausch.', begruendung: 'Sonderglas' },
        ],
      },
      region,
    );
    // Platte 120 × 4 = 480; Oberfläche 35 × 8 = 280; Scharniere 12 × 10 = 120 (§4.2); Pauschale 0 (no rate);
    // Werkstatt 68 × 20 = 1360; Montage 62 × 9 = 558; Anfahrt ceil(9 / 8) = 2 × 65 = 130
    // netto 2928; brutto 2928 × 1.19 = 3484.32; min 0.7 × = 2439.02 → 2450; max 1.3 × = 4529.62 → 4550
    expect(k.netto).toBeCloseTo(2928, 6);
    expect(k.brutto).toBeCloseTo(3484.32, 6);
    expect(k.min).toBe(2450);
    expect(k.max).toBe(4550);
    expect(k.breite).toBe(0.3);
    expect(k.quelle).toBe('ki-mengen');
    expect(k.positionen).toHaveLength(7);
    expect(k.positionen.some((p) => p.text === 'Montage')).toBe(true);
    expect(k.positionen.some((p) => p.text.startsWith('Anfahrt'))).toBe(true);
    expect(k.annahmen).toContain('Mengen geschätzt, vor dem Aufmaß zu prüfen.');
    expect(k.positionen.find((p) => p.text.startsWith('Scharniere'))?.netto).toBe(120);
    expect(k.positionen.find((p) => p.text.startsWith('Material pauschal'))?.netto).toBe(0);
    expect(k.annahmen.some((a) => a.includes('Pauschales Material ist im Preis nicht enthalten'))).toBe(true);
  });

  it('prices each Beschlag kind with its §4.2 rate', () => {
    const k = preiseMengen(
      base({
        material: [
          { art: 'beschlag', beschlag: 'tuer', menge: 2, einheit: 'Stk.', begruendung: 'x' },
          { art: 'beschlag', beschlag: 'schubkasten', menge: 3, einheit: 'Stk.', begruendung: 'x' },
          { art: 'beschlag', beschlag: 'scharnier', menge: 4, einheit: 'Stk.', begruendung: 'x' },
        ],
      }),
      { tier: 'kern' },
    );
    // 2 × 45 + 3 × 85 + 4 × 12 = 90 + 255 + 48 = 393; Anfahrt 35 → 428
    expect(k.positionen.slice(0, 3).map((p) => p.netto)).toEqual([90, 255, 48]);
    expect(k.netto).toBeCloseTo(428, 6);
  });

  it('never takes an amount from the model for a Pauschale', () => {
    const z = { art: 'pauschal', menge: 3, einheit: 'Pausch.', begruendung: 'Sonderglas', netto_pauschal: 4999 };
    const k = preiseMengen(base({ material: [z as Mengen['material'][number]] }), { tier: 'kern' });
    // Pauschale 0 + Anfahrt 35 = 35: the 4999 € is ignored
    expect(k.netto).toBe(35);
    expect(k.positionen[0]).toMatchObject({ menge: 3, netto: 0 });
  });

  it('prices an empty case as Anfahrt only', () => {
    const k = preiseMengen(base(), { tier: 'kern' });
    // one trip × 35 = 35 net; brutto 41.65 → 29.155 → 50 ... 0.7 × 41.65 = 29.155 → 50; 1.3 × = 54.145 → 50
    expect(k.netto).toBe(35);
    expect(k.min).toBe(50);
    expect(k.max).toBe(50);
  });

  it('adds the unknown-PLZ assumption', () => {
    expect(preiseMengen(base(), { tier: null }).annahmen.some((a) => a.includes('PLZ unbekannt'))).toBe(true);
  });

  it('clamps values above the limits and says so', () => {
    const k = preiseMengen(
      base({
        werkstatt_h: 9999,
        montage_h: 9999,
        material: [
          { art: 'platte', holz: 'esche', staerke: 19, menge: 1000, einheit: 'm²', begruendung: 'x' },
          { art: 'beschlag', beschlag: 'tuer', menge: 9999, einheit: 'Stk.', begruendung: 'x' },
          { art: 'oberflaeche', oberflaeche: 'lack-matt', menge: 1e9, einheit: 'm²', begruendung: 'x' },
        ],
      }),
      region,
    );
    const by = (t: string) => k.positionen.find((p) => p.text.startsWith(t));
    expect(by('Werkstatt')?.menge).toBe(MENGEN_LIMITS.werkstatt_h);
    expect(by('Montage')?.menge).toBe(MENGEN_LIMITS.montage_h);
    expect(by('Plattenmaterial')?.menge).toBe(200);
    expect(by('Plattenmaterial')?.netto).toBe(200 * 85);
    expect(by('Türbeschläge')?.menge).toBe(500);
    expect(by('Oberfläche')?.menge).toBe(MENGEN_LIMITS.oberflaecheM2);
    // 400 m² × 35 € lack matt
    expect(by('Oberfläche')?.netto).toBe(14000);
    expect(k.annahmen.length).toBeGreaterThanOrEqual(6);
    expect(Number.isFinite(k.brutto)).toBe(true);
  });

  it('applies the material bounds to the case total per kind, not per line', () => {
    const platte = (menge: number): MaterialZeile => ({
      art: 'platte',
      holz: 'eiche',
      staerke: 40,
      menge,
      einheit: 'm²',
      begruendung: 'x',
    });
    const k = preiseMengen(base({ material: Array.from({ length: 30 }, () => platte(200)) }), region);
    const boards = k.positionen.filter((p) => p.text.startsWith('Plattenmaterial'));
    // 30 lines × 200 m² ask for 6 000 m²; the case total is cut to 200 m² (first line), the rest get 0.
    // 200 × 180 (eiche 40 mm) = 36 000; Montage 0; Anfahrt 1 × 65 = 65; netto 36 065
    expect(boards.reduce((s, p) => s + p.menge, 0)).toBe(MENGEN_LIMITS.platteM2);
    expect(boards[0]?.menge).toBe(200);
    expect(k.netto).toBeCloseTo(36065, 6);
    expect(k.annahmen).toEqual([
      'Mengen geschätzt, vor dem Aufmaß zu prüfen.',
      'Plattenfläche insgesamt auf das Maximum von 200 begrenzt.',
    ]);
  });

  it('cuts the line that crosses a bound and notes each kind once', () => {
    const k = preiseMengen(
      base({
        material: [
          { art: 'platte', holz: 'esche', staerke: 19, menge: 150, einheit: 'm²', begruendung: 'x' },
          { art: 'platte', holz: 'esche', staerke: 19, menge: 100, einheit: 'm²', begruendung: 'x' },
          { art: 'oberflaeche', oberflaeche: 'lack-matt', menge: 300, einheit: 'm²', begruendung: 'x' },
          { art: 'oberflaeche', oberflaeche: 'lack-matt', menge: 300, einheit: 'm²', begruendung: 'x' },
          { art: 'beschlag', beschlag: 'scharnier', menge: 200, einheit: 'Stk.', begruendung: 'x' },
          { art: 'beschlag', beschlag: 'scharnier', menge: 300, einheit: 'Stk.', begruendung: 'x' },
          { art: 'beschlag', beschlag: 'scharnier', menge: 1, einheit: 'Stk.', begruendung: 'x' },
        ],
      }),
      region,
    );
    // Platte 150 + 50 (of 100) = 200 m² × 85 = 17 000; Oberfläche 300 + 100 (of 300) = 400 m² × 35 = 14 000
    // Scharniere 200 + 300 = 500 exactly, the third line gets 0 (and is the one noted): 500 × 12 = 6 000
    // Anfahrt 1 × 65; netto 37 065
    expect(k.positionen.map((p) => p.menge).slice(0, 7)).toEqual([150, 50, 300, 100, 200, 300, 0]);
    expect(k.netto).toBeCloseTo(37065, 6);
    expect(k.annahmen).toEqual([
      'Mengen geschätzt, vor dem Aufmaß zu prüfen.',
      'Plattenfläche insgesamt auf das Maximum von 200 begrenzt.',
      'Oberfläche insgesamt auf das Maximum von 400 begrenzt.',
      'Beschläge insgesamt auf das Maximum von 500 begrenzt.',
    ]);
  });

  it('a total exactly at the bound is not clamped', () => {
    const k = preiseMengen(
      base({
        material: [
          { art: 'platte', holz: 'esche', staerke: 19, menge: 120, einheit: 'm²', begruendung: 'x' },
          { art: 'platte', holz: 'esche', staerke: 19, menge: 80, einheit: 'm²', begruendung: 'x' },
        ],
      }),
      region,
    );
    // 200 m² × 85 = 17 000 + Anfahrt 65 = 17 065
    expect(k.netto).toBeCloseTo(17065, 6);
    expect(k.annahmen).toEqual(['Mengen geschätzt, vor dem Aufmaß zu prüfen.']);
  });

  it('rejects negative, NaN and malformed input with MengenFehler', () => {
    const bad: Mengen[] = [
      base({ werkstatt_h: -1 }),
      base({ montage_h: Number.NaN }),
      base({ werkstatt_h: Infinity }),
      base({ material: [{ art: 'beschlag', beschlag: 'tuer', menge: -2, einheit: 'Stk.', begruendung: 'x' }] }),
      base({ material: [{ art: 'beschlag', menge: 2, einheit: 'Stk.', begruendung: 'x' }] }),
      base({
        material: [{ art: 'beschlag', beschlag: 'constructor' as 'tuer', menge: 2, einheit: 'Stk.', begruendung: 'x' }],
      }),
      base({ material: [{ art: 'platte', menge: 1, einheit: 'm²', begruendung: 'x' }] }),
      base({ material: [{ art: 'oberflaeche', menge: 1, einheit: 'm²', begruendung: 'x' }] }),
      base({
        material: Array.from({ length: MENGEN_LIMITS.materialZeilen + 1 }, () => ({
          art: 'beschlag' as const,
          beschlag: 'scharnier' as const,
          menge: 1,
          einheit: 'Stk.',
          begruendung: 'x',
        })),
      }),
      null as unknown as Mengen,
      undefined as unknown as Mengen,
      base({ material: [null as unknown as MaterialZeile] }),
      base({ material: ['platte' as unknown as MaterialZeile] }),
    ];
    for (const m of bad) expect(() => preiseMengen(m, region)).toThrow(MengenFehler);
  });

  it('rejects a Pauschale without justification', () => {
    for (const begruendung of ['', '   ']) {
      expect(() =>
        preiseMengen(base({ material: [{ art: 'pauschal', menge: 1, einheit: 'Pausch.', begruendung }] }), region),
      ).toThrow(MengenFehler);
    }
  });

  it('accepts exactly 30 lines', () => {
    const material = Array.from({ length: 30 }, () => ({
      art: 'beschlag' as const,
      beschlag: 'scharnier' as const,
      menge: 1,
      einheit: 'Stk.',
      begruendung: 'x',
    }));
    expect(() => preiseMengen(base({ material }), region)).not.toThrow();
  });
});

describe('kalkulieren', () => {
  const rule = ['moebel', 'boden', 'treppe', 'fenster', 'tuer', 'terrasse'];

  it('routes every project type', () => {
    for (const typ of rule) {
      expect(isRuleBased(typ)).toBe(true);
      const r = kalkulieren({ typ }, region);
      expect(['regeln', 'mengen-noetig']).toContain(r.kind);
      if (r.kind === 'regeln') expect(r.kalkulation.quelle).toBe('regeln');
    }
    for (const typ of ['altbau', 'sonstiges', 'quatsch', '', 'constructor', 'toString']) {
      expect(isRuleBased(typ)).toBe(false);
      expect(kalkulieren({ typ }, region)).toEqual({ kind: 'mengen-noetig' });
    }
    expect(isRuleBased(undefined)).toBe(false);
    expect(kalkulieren({}, region)).toEqual({ kind: 'mengen-noetig' });
    expect(kalkulieren({ typ: ['moebel'] }, region)).toEqual({ kind: 'mengen-noetig' });
  });

  it('prices a complete boden case by rules', () => {
    const r = kalkulieren(
      {
        typ: 'boden',
        boden_leistung: 'neu',
        boden_art: 'stabparkett',
        boden_flaeche: '24',
        boden_untergrund: 'estrich',
      },
      { tier: 'kern' },
    );
    expect(r.kind).toBe('regeln');
  });
});
