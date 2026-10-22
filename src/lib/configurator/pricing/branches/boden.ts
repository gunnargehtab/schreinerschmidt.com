// Boden calculator (docs/angebot.md §4.3 and §4.5). Pure: form values in, Kalkulation or null out.
// Never imported by the site (pricing stays compiled out).
import type { Values } from '../../fields';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from '../common';
import type { Breite, Calculator, Position } from '../types';

// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
export const RATES = {
  /** boden neu, € net per m², material included. */
  neuPerM2: {
    stabparkett: 95,
    hochkant: 85,
    mosaik: 75,
    fertigparkett: 65,
    dielen: 110,
    kork: 60,
    linoleum: 55,
    offen: 80,
  },
  /** boden neu: Untergrund teppich / pvc-laminat / unbekannt, € per m² Vorbereitung. */
  untergrundPerM2: 12,
  /** boden aufarbeiten: schleifen + ölen/lackieren, € per m². */
  aufarbeitenPerM2: 38,
  /** boden aufarbeiten with zustand = stark, € per m². */
  aufarbeitenStarkPerM2: 8,
  /** Sockelleisten, € per lfm. */
  sockelleistePerLfm: 14,
  /** Montage default: 1 h per 4 m² (§4.3), for trips and the Montage position. */
  montageHoursPerM2: 1 / 4,
} as const;

export const regelVersion = hashRates(RATES, SHARED);

const UNKNOWN = new Set(['unbekannt', 'beratung', 'offen']);
const UNTERGRUND_VORBEREITUNG = new Set(['teppich', 'pvc-laminat', 'unbekannt']);
const NEU_ARTEN = Object.keys(RATES.neuPerM2);

/** Positive finite number from a form string (comma or point), else undefined. */
function num(v: Values[string]): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1e6 ? n : undefined;
}

/** Positive whole number for a count field (Stk., Stufen, Räume), else undefined (counts as missing). */
function count(v: Values[string]): number | undefined {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** Checkbox values: anything but empty / 0 / false / off / nein counts as set. */
const isSet = (v: Values[string]): boolean =>
  typeof v === 'string' && v.trim() !== '' && !['0', 'false', 'off', 'nein'].includes(v.trim().toLowerCase());

/** German number text: at most 2 decimals, decimal comma. */
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

const str = (v: Values[string]): string => (typeof v === 'string' ? v : '');

export const boden: Calculator = (v, ctx) => {
  if (v.typ !== 'boden') return null;
  // Reparatur is priced from Claude quantities (§4.4).
  if (v.boden_leistung === 'reparatur') return null;

  const annahmen: string[] = [];
  let unsicher = false;

  let leistung = str(v.boden_leistung);
  if (leistung !== 'neu' && leistung !== 'aufarbeiten') {
    leistung = 'neu';
    unsicher = true;
    annahmen.push('Leistung nicht angegeben, wir rechnen mit einem neuen Boden.');
  }

  let flaeche = num(v.boden_flaeche);
  if (flaeche === undefined) {
    flaeche = 1;
    unsicher = true;
    annahmen.push('Fläche nicht angegeben, wir rechnen mit 1 m².');
  }

  const positionen: Position[] = [];

  if (leistung === 'neu') {
    const art = str(v.boden_art);
    const known = NEU_ARTEN.includes(art);
    const key = (known ? art : 'offen') as keyof typeof RATES.neuPerM2;
    if (!known) annahmen.push('Bodenart nicht festgelegt, wir rechnen mit einem mittleren Preis je m².');
    positionen.push({
      text: `Boden neu, ${known ? art : 'Bodenart offen'}, ${fmt(flaeche)} m²`,
      menge: flaeche,
      einheit: 'm²',
      netto: flaeche * RATES.neuPerM2[key],
    });
    // Untergrund surcharge: only for new floors; an unknown Untergrund is priced as the worse case.
    if (UNTERGRUND_VORBEREITUNG.has(str(v.boden_untergrund))) {
      positionen.push({
        text: `Vorbereitung Untergrund, ${fmt(flaeche)} m²`,
        menge: flaeche,
        einheit: 'm²',
        netto: flaeche * RATES.untergrundPerM2,
      });
    }
    if (!known || UNKNOWN.has(art)) unsicher = true;
    if (art === 'dielen' && UNKNOWN.has(str(v.boden_zugang))) unsicher = true;
  } else {
    const zustand = str(v.boden_zustand);
    positionen.push({
      text: `Boden aufarbeiten, ${fmt(flaeche)} m²`,
      menge: flaeche,
      einheit: 'm²',
      netto: flaeche * RATES.aufarbeitenPerM2,
    });
    if (zustand === 'stark') {
      positionen.push({
        text: `Zuschlag starker Verschleiß, ${fmt(flaeche)} m²`,
        menge: flaeche,
        einheit: 'm²',
        netto: flaeche * RATES.aufarbeitenStarkPerM2,
      });
    }
    // Schäden can hide more work than visible: wider range, no surcharge.
    if (zustand === 'schaeden') unsicher = true;
    if (UNKNOWN.has(str(v.boden_oberflaeche_alt))) unsicher = true;
  }
  // Fields without a `when` gate are asked in every sub-branch, so any unknown answer widens the range.
  if (UNKNOWN.has(str(v.boden_untergrund)) || UNKNOWN.has(str(v.boden_holz)) || UNKNOWN.has(str(v.boden_fbh)))
    unsicher = true;

  if (isSet(v.boden_sockelleisten)) {
    let raeume = count(v.boden_raeume);
    if (raeume === undefined) {
      raeume = 1;
      unsicher = true;
      annahmen.push('Zahl der Räume nicht angegeben, wir rechnen mit 1 Raum.');
    }
    // lfm ≈ 4 × √(Fläche ÷ Räume) × Räume: perimeter of square rooms of equal size.
    const lfm = 4 * Math.sqrt(flaeche / raeume) * raeume;
    positionen.push({
      text: `Sockelleisten, ${fmt(lfm)} lfm`,
      menge: lfm,
      einheit: 'lfm',
      netto: lfm * RATES.sockelleistePerLfm,
    });
  }

  // Montage is added on top of the material-inclusive €/m² basis; hours drive the trip count.
  const montageH = flaeche * RATES.montageHoursPerM2;
  positionen.push(montagePosition(montageH), anfahrtPosition(ctx, tripsFor(montageH)));

  const breite: Breite = unsicher ? 0.25 : 0.15;
  return kalkulation(positionen, { breite, quelle: 'regeln', annahmen, regelVersion, ctx });
};
