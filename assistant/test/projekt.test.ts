// Customer-level project texts (projekt.ts; 7d review): the compact „Ihr Projekt“ of PDF and mail,
// the template's Leistungen from the form values (never internal positions) and the budget shown
// as amounts.
import { describe, expect, it } from 'vitest';
import { pruefeText } from '../src/claude/guards';
import { budgetText, projektLeistungen, projektZusammenfassung } from '../src/projekt';
import { FAELLE } from '../eval/fixtures/faelle';
import { BODEN, REGAL, SONSTIGES } from './fixtures';

const NN = String.fromCharCode(0x202f);
const nn = (s: string) => s.replace(/ (?=cm|m²|lfm|mm|€|%)/g, NN);
/** Internal calculation words, hours and part counts never reach the customer. */
const INTERN = /Plattenmaterial|Werkstatt|Anfahrt|Beschläge \(|Teile|Pausch|\d\s?h\b|€|Stk\./;
const ALLE = [...FAELLE.map((f) => f.values), REGAL, BODEN, SONSTIGES];

describe('„Ihr Projekt“', () => {
  it('Möbel: one compact line with dimensions, material, finish and construction', () => {
    expect(projektZusammenfassung(REGAL)).toEqual([
      nn('Regal, 120 × 200 × 35 cm (B × H × T), Eiche, natur geölt, 19 mm, auf Sockel, mit Rückwand'),
    ]);
    expect(
      projektZusammenfassung({
        typ: 'moebel',
        moebel_art: 'esstisch',
        tisch_laenge: '200',
        tisch_breite: '90',
        tisch_hoehe: '75',
        tisch_platte: '40',
        tisch_kante: 'baumkante',
        tisch_gestell: 'kufen-stahl',
        moebel_holz: 'nussbaum',
        moebel_oberflaeche: 'lack-matt',
      }),
    ).toEqual([
      nn('Esstisch, 200 × 90 × 75 cm (L × B × H), Nussbaum, matt lackiert, Platte 40 mm, Baumkante, Kufen aus Stahl'),
    ]);
  });

  it('other branches: 2–4 lines with units, no field labels', () => {
    expect(projektZusammenfassung(BODEN)).toEqual([
      'Neuer Boden: Stabparkett, Eiche',
      nn('Fläche rund 24,5 m² in 2 Räumen'),
      'Untergrund: Estrich, Fußbodenheizung: nein',
      'Sockelleisten erneuern',
    ]);
    expect(projektZusammenfassung(SONSTIGES)).toEqual(['Vorhaben nach Ihrer Beschreibung']);
  });

  it.each(ALLE.map((v, i) => [i, v] as const))('fixture %i: guard-clean, compact, no raw field dump', (_i, v) => {
    const z = projektZusammenfassung(v);
    expect(z.length).toBeGreaterThanOrEqual(1);
    expect(z.length).toBeLessThanOrEqual(4);
    for (const line of z) {
      expect(pruefeText(line), line).toEqual([]);
      expect(line).not.toMatch(/ in cm:|Welches|Was ist geplant|\?|Breite in|Anzahl /);
      expect(line).not.toMatch(/\d (?:cm|m²|lfm|mm)\b/); // U+202F before units
      expect(line).not.toMatch(INTERN);
    }
    // No free text of the customer.
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' && x.length > 30 && /beschreibung|wuensche|zustand|nachricht|masse/.test(k)) {
        expect(z.join(' ')).not.toContain(x.slice(0, 20));
      }
    }
  });
});

describe('template Leistungen', () => {
  it('per branch, from the values', () => {
    expect(projektLeistungen(REGAL)).toEqual([
      'Regal aus Eiche, natur geölt, nach Ihren Maßen gefertigt',
      'Lieferung und Montage vor Ort',
    ]);
    expect(projektLeistungen(BODEN)).toEqual([nn('Stabparkett Eiche, rund 24,5 m², verlegt'), 'Neue Sockelleisten']);
    expect(
      projektLeistungen({
        typ: 'treppe',
        treppe_leistung: 'neu',
        treppe_bauart: 'wange',
        treppe_stufen: '14',
        treppe_form: 'gerade',
      }),
    ).toEqual(['Neue Treppe, Wangenbauweise, 14 Stufen', 'Montage vor Ort']);
    expect(projektLeistungen(SONSTIGES)).toEqual([]);
    expect(projektLeistungen({ typ: 'moebel' })).toEqual([
      'Möbel nach Ihrer Beschreibung, nach Ihren Maßen gefertigt',
      'Lieferung und Montage vor Ort',
    ]);
  });

  it.each(ALLE.map((v, i) => [i, v] as const))('fixture %i: guard-clean and never internal', (_i, v) => {
    const l = projektLeistungen(v);
    expect(l.length).toBeLessThanOrEqual(10);
    for (const line of l) {
      expect(pruefeText(line), line).toEqual([]);
      expect(line).not.toMatch(INTERN);
      expect(line.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('budget display', () => {
  it('uses formatEuro (U+202F) instead of the form labels', () => {
    expect(budgetText('bis-2000')).toBe(nn('Bis 2 000 €').replace('2 000', `2${NN}000`));
    expect(budgetText('2000-5000')).toBe(`2${NN}000${NN}€ bis 5${NN}000${NN}€`);
    expect(budgetText('10000-25000')).toBe(`10${NN}000${NN}€ bis 25${NN}000${NN}€`);
    expect(budgetText('ueber-25000')).toBe(`Über 25${NN}000${NN}€`);
    expect(budgetText('keine-angabe')).toBe('Keine Angabe');
  });
});
