// The recommendation (docs/angebot.md §7.1): one row per rule, plus the precedence. Pure.
import { describe, expect, it } from 'vitest';
import type { Kalkulation } from '../../src/lib/configurator/pricing/types';
import type { Bewertung } from '../src/claude/schemas';
import {
  BUDGET_OBERGRENZE,
  empfehlung,
  istEmpfehlung,
  werkstattStunden,
  type EmpfehlungInput,
  type FlagCode,
} from '../src/empfehlung';
import { formatBreite, formatEuro, formatEuroRange, formatEuroSpanne, formatProzent, formatZahl } from '../src/format';
import type { BewertungRecord } from '../src/steps/bewertung';

const K = (o: Partial<Kalkulation> = {}): Kalkulation => ({
  netto: 3000,
  brutto: 3570,
  min: 3050,
  max: 4100,
  breite: 0.15,
  quelle: 'regeln',
  positionen: [{ text: 'Werkstatt, 12 Teile', menge: 14.4, einheit: 'h', netto: 979.2 }],
  annahmen: [],
  regelVersion: 'test',
  ...o,
});

const B = (o: Partial<Bewertung> = {}): Bewertung => ({
  spam: false,
  machbarkeit: 'machbar',
  gruende: ['Übliche Schreinerarbeit.'],
  risiken: [],
  fehlende_angaben: [],
  rueckfragen: [],
  passt_zum_betrieb: true,
  mengen: null,
  ...o,
});

const REC = (b: Bewertung | null = B(), o: Partial<BewertungRecord> = {}): BewertungRecord => ({
  v: 1,
  quelle: b ? 'ki' : 'ohne_ki',
  grund: b ? null : 'ki_deaktiviert',
  bewertung: b,
  rueckfragen: b ? 'ki' : null,
  mengen: 'nicht_noetig',
  model: b ? 'fake' : null,
  at: '2026-10-22T09:00:00.000Z',
  ...o,
});

const base = (o: Partial<EmpfehlungInput> = {}): EmpfehlungInput => ({
  bewertung: REC(),
  kalkulation: K(),
  values: { typ: 'moebel', zeitraum: '1-3', budget: '2000-5000', plz: '68161' },
  tier: 'kern',
  ereignisse: [],
  ...o,
});

type Row = [name: string, input: EmpfehlungInput, stufe: 'absagen' | 'pruefen' | 'freigeben', codes: FlagCode[]];

const ROWS: Row[] = [
  ['clean case', base(), 'freigeben', []],
  // Absagen empfohlen
  ['spam', base({ bewertung: REC(B({ spam: true })) }), 'absagen', ['spam']],
  ['nicht_machbar', base({ bewertung: REC(B({ machbarkeit: 'nicht_machbar' })) }), 'absagen', ['nicht_machbar']],
  ['passt nicht zum Betrieb', base({ bewertung: REC(B({ passt_zum_betrieb: false })) }), 'absagen', ['passt_nicht']],
  [
    'net below Mindestauftrag (500 €)',
    base({ kalkulation: K({ netto: 499.99 }) }),
    'absagen',
    ['unter_mindestauftrag'],
  ],
  ['net exactly the Mindestauftrag', base({ kalkulation: K({ netto: 500 }) }), 'freigeben', []],
  ['aussen and net < 2 000 €', base({ tier: 'aussen', kalkulation: K({ netto: 1999 }) }), 'absagen', ['aussen_klein']],
  ['aussen and net = 2 000 €', base({ tier: 'aussen', kalkulation: K({ netto: 2000 }) }), 'freigeben', []],
  ['unknown PLZ counts as aussen', base({ tier: null, kalkulation: K({ netto: 1500 }) }), 'absagen', ['aussen_klein']],
  ['region and net < 2 000 €', base({ tier: 'region', kalkulation: K({ netto: 1500 }) }), 'freigeben', []],
  // Prüfen
  ['machbarkeit unklar', base({ bewertung: REC(B({ machbarkeit: 'unklar' })) }), 'pruefen', ['machbarkeit_unklar']],
  [
    'machbarkeit eingeschränkt',
    base({ bewertung: REC(B({ machbarkeit: 'eingeschraenkt' })) }),
    'pruefen',
    ['machbarkeit_eingeschraenkt'],
  ],
  ['quelle ki-mengen', base({ kalkulation: K({ quelle: 'ki-mengen', breite: 0.3 }) }), 'pruefen', ['ki_mengen']],
  ['width ± 25 %', base({ kalkulation: K({ breite: 0.25 }) }), 'pruefen', ['breite']],
  ['width ± 15 %', base({ kalkulation: K({ breite: 0.15 }) }), 'freigeben', []],
  [
    'budget max < 80 % of the range min',
    base({ values: { budget: 'bis-2000' }, kalkulation: K({ min: 2501 }) }),
    'pruefen',
    ['budget'],
  ],
  [
    'budget max = 80 % of the range min',
    base({ values: { budget: 'bis-2000' }, kalkulation: K({ min: 2500 }) }),
    'freigeben',
    [],
  ],
  [
    'budget über 25 000 never triggers',
    base({ values: { budget: 'ueber-25000' }, kalkulation: K({ min: 90000 }) }),
    'freigeben',
    [],
  ],
  [
    'budget keine Angabe never triggers',
    base({ values: { budget: 'keine-angabe' }, kalkulation: K({ min: 90000 }) }),
    'freigeben',
    [],
  ],
  [
    'budget outside the list is ignored',
    base({ values: { budget: 'constructor' }, kalkulation: K({ min: 90000 }) }),
    'freigeben',
    [],
  ],
  [
    'asap with > 40 Werkstatt hours',
    base({
      values: { zeitraum: 'asap' },
      kalkulation: K({ positionen: [{ text: 'Werkstatt, 40 Teile', menge: 48, einheit: 'h', netto: 3264 }] }),
    }),
    'pruefen',
    ['eilig'],
  ],
  [
    'asap with exactly 40 Werkstatt hours',
    base({
      values: { zeitraum: 'asap' },
      kalkulation: K({ positionen: [{ text: 'Werkstatt', menge: 40, einheit: 'h', netto: 2720 }] }),
    }),
    'freigeben',
    [],
  ],
  [
    'asap: Montage hours do not count',
    base({
      values: { zeitraum: 'asap' },
      kalkulation: K({ positionen: [{ text: 'Montage', menge: 80, einheit: 'h', netto: 4960 }] }),
    }),
    'freigeben',
    [],
  ],
  [
    'asap without price: Claude’s werkstatt_h',
    base({
      values: { zeitraum: 'asap' },
      kalkulation: null,
      bewertung: REC(B({ mengen: { werkstatt_h: 60, montage_h: 4, material: [] } }), { mengen: 'ungueltig' }),
      ereignisse: ['mengen_ungueltig'],
    }),
    'pruefen',
    ['kein_preis', 'eilig'],
  ],
  [
    '1–3 months with many hours',
    base({
      values: { zeitraum: '1-3' },
      kalkulation: K({ positionen: [{ text: 'Werkstatt', menge: 90, einheit: 'h', netto: 0 }] }),
    }),
    'freigeben',
    [],
  ],
  ['fenster_denkmal = ja', base({ values: { fenster_denkmal: 'ja' } }), 'pruefen', ['denkmal']],
  ['altbau_denkmal = ja', base({ values: { altbau_denkmal: 'ja' } }), 'pruefen', ['denkmal']],
  ['denkmal unbekannt', base({ values: { altbau_denkmal: 'unbekannt' } }), 'freigeben', []],
  ['build_mismatch event', base({ ereignisse: ['preis_regeln', 'build_mismatch'] }), 'pruefen', ['build_mismatch']],
  ['enquiry mail never arrived', base({ ereignisse: ['anfrage_mail_failed'] }), 'pruefen', ['anfrage_mail_failed']],
  [
    'Mengen missing: no price',
    base({ kalkulation: null, bewertung: REC(B(), { mengen: 'fehlen' }), ereignisse: ['mengen_fehlen'] }),
    'pruefen',
    ['kein_preis'],
  ],
  [
    'Mengen invalid: no price',
    base({ kalkulation: null, bewertung: REC(B(), { mengen: 'ungueltig' }), ereignisse: ['mengen_ungueltig'] }),
    'pruefen',
    ['kein_preis'],
  ],
  // Without Claude: at most Prüfen, but the deterministic Absage rules stay
  ['ohne KI', base({ bewertung: REC(null) }), 'pruefen', ['ohne_ki']],
  ['ohne KI (budget)', base({ bewertung: REC(null, { grund: 'ki_budget' }) }), 'pruefen', ['ohne_ki']],
  [
    'ohne KI below Mindestauftrag',
    base({ bewertung: REC(null), kalkulation: K({ netto: 300 }) }),
    'absagen',
    ['unter_mindestauftrag', 'ohne_ki'],
  ],
  [
    'failed before bewertung',
    base({ bewertung: null, kalkulation: K(), fehlgeschlagen: true }),
    'pruefen',
    ['fehlgeschlagen'],
  ],
  [
    'failed without price',
    base({ bewertung: null, kalkulation: null, fehlgeschlagen: true }),
    'pruefen',
    ['fehlgeschlagen'],
  ],
  // Precedence: Absage beats Prüfen, every flag is listed in rule order
  [
    'spam + unklar + denkmal',
    base({ bewertung: REC(B({ spam: true, machbarkeit: 'unklar' })), values: { fenster_denkmal: 'ja' } }),
    'absagen',
    ['spam', 'machbarkeit_unklar', 'denkmal'],
  ],
  [
    'several Prüfen flags',
    base({
      kalkulation: K({ breite: 0.25 }),
      ereignisse: ['build_mismatch', 'anfrage_mail_failed'],
      bewertung: REC(B({ machbarkeit: 'eingeschraenkt' })),
    }),
    'pruefen',
    ['machbarkeit_eingeschraenkt', 'breite', 'build_mismatch', 'anfrage_mail_failed'],
  ],
];

describe('recommendation (§7.1)', () => {
  it.each(ROWS)('%s', (_name, input, stufe, codes) => {
    const r = empfehlung(input);
    expect(r.empfehlung).toBe(stufe);
    expect(r.flags.map((f) => f.code)).toEqual(codes);
    for (const f of r.flags) {
      expect(f.text.length).toBeGreaterThan(5);
      expect(f.stufe).toBe(
        ['spam', 'nicht_machbar', 'passt_nicht', 'unter_mindestauftrag', 'aussen_klein'].includes(f.code)
          ? 'absagen'
          : 'pruefen',
      );
    }
    expect(istEmpfehlung(r)).toBe(true);
  });

  it('never recommends Freigeben without a Claude assessment', () => {
    for (const k of [K(), K({ breite: 0.15, netto: 50_000 }), null]) {
      expect(empfehlung(base({ bewertung: REC(null), kalkulation: k })).empfehlung).not.toBe('freigeben');
      expect(empfehlung(base({ bewertung: null, kalkulation: k })).empfehlung).not.toBe('freigeben');
    }
  });

  it('maps every budget option of fields.ts to an upper bound or none', async () => {
    const { FIELDS } = await import('../../src/lib/configurator/fields');
    expect(Object.keys(BUDGET_OBERGRENZE).sort()).toEqual([...(FIELDS['budget']?.values ?? [])].sort());
  });

  it('counts Werkstatt hours from positions in h whose text starts with „Werkstatt“', () => {
    const k = K({
      positionen: [
        { text: 'Werkstatt, 8 Teile', menge: 9.6, einheit: 'h', netto: 0 },
        { text: 'Werkstatt', menge: 2, einheit: 'h', netto: 0 },
        { text: 'Montage', menge: 4, einheit: 'h', netto: 0 },
        { text: 'Werkstattmaterial', menge: 3, einheit: 'Stk.', netto: 0 },
      ],
    });
    expect(werkstattStunden(k, null)).toBeCloseTo(11.6);
    expect(werkstattStunden(null, REC(B({ mengen: { werkstatt_h: 7, montage_h: 1, material: [] } })))).toBe(7);
    expect(werkstattStunden(null, null)).toBe(0);
  });

  it('writes the flag texts with U+202F between number and unit', () => {
    const r = empfehlung(base({ kalkulation: K({ netto: 420, breite: 0.25 }) }));
    const t = r.flags.map((f) => f.text).join('\n');
    expect(t).toContain('420\u202f€');
    expect(t).toContain('±\u202f25\u202f%');
    expect(t).not.toMatch(/\d €|\d %/);
  });
});

describe('formatting (format.ts)', () => {
  it('groups thousands and separates units with U+202F', () => {
    expect(formatZahl(2450)).toBe('2\u202f450');
    expect(formatZahl(950)).toBe('950');
    expect(formatZahl(1234567)).toBe('1\u202f234\u202f567');
    expect(formatEuro(3300)).toBe('3\u202f300\u202f€');
    expect(formatEuro(1234.5, { cents: true })).toBe('1\u202f234,50\u202f€');
    expect(formatEuroRange(2450, 3300)).toBe('2\u202f450\u202f€ bis 3\u202f300\u202f€');
    expect(formatEuroRange(500, 500)).toBe('500\u202f€');
    expect(formatEuroSpanne(2450, 3300)).toBe('2\u202f450–3\u202f300\u202f€');
    expect(formatProzent(19)).toBe('19\u202f%');
    expect(formatBreite(0.3)).toBe('±\u202f30\u202f%');
  });
});
