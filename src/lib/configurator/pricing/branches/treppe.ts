// Treppe calculator (docs/angebot.md §4.3 and §4.5). Pure: form values in, Kalkulation out.
// Never imported by the site (pricing stays compiled out).
import type { Values } from '../../fields';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from '../common';
import type { Breite, Calculator, Position } from '../types';

// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
export const RATES = {
  /** treppe neu, € net per Stufe by Bauart. */
  neuPerStufe: { wange: 650, holm: 750, faltwerk: 900, beratung: 750 },
  /** Surcharge on the Stufen of a new Treppe for viertel / halb / wendel (+15 %). */
  formAufschlag: 0.15,
  /** treppe renovieren, € per Stufe. */
  renovierenPerStufe: 180,
  /** treppe belegen, € per Stufe. */
  belegenPerStufe: 260,
  /** Geländer neu, € per lfm. */
  gelaenderPerLfm: 220,
  /** Geländer length estimate: 0.3 lfm per Stufe. */
  gelaenderLfmPerStufe: 0.3,
  /** Stufen assumed when the form has none (documented default, §4.3). */
  stufenDefault: 14,
  /** Montage defaults: neu 3 h per Stufe (§4.3); renovieren/belegen 1.5 h per Stufe and Geländer 1 h per lfm (§4.3 interpretation). */
  montageHoursPerStufeNeu: 3,
  montageHoursPerStufeBestand: 1.5,
  montageHoursPerLfmGelaender: 1,
} as const;

export const regelVersion = hashRates(RATES, SHARED);

const UNKNOWN = new Set(['unbekannt', 'beratung', 'offen']);
const FORM_AUFSCHLAG = new Set(['viertel', 'halb', 'wendel']);
const BAUARTEN = Object.keys(RATES.neuPerStufe);

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

/** German number text: at most 2 decimals, decimal comma. */
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

const str = (v: Values[string]): string => (typeof v === 'string' ? v : '');

export const treppe: Calculator = (v, ctx) => {
  if (v.typ !== 'treppe') return null;

  const annahmen: string[] = [];
  let unsicher = false;

  let leistung = str(v.treppe_leistung);
  if (!['neu', 'renovieren', 'belegen', 'gelaender'].includes(leistung)) {
    leistung = 'neu';
    unsicher = true;
    annahmen.push('Leistung nicht angegeben, wir rechnen mit einer neuen Treppe.');
  }

  let stufen = count(v.treppe_stufen);
  if (stufen === undefined) {
    stufen = RATES.stufenDefault;
    unsicher = true;
    annahmen.push(`Stufenzahl nicht angegeben, wir rechnen mit ${RATES.stufenDefault} Stufen.`);
  }

  const positionen: Position[] = [];
  let montageH = 0;

  if (leistung === 'neu') {
    const bauart = str(v.treppe_bauart);
    const known = BAUARTEN.includes(bauart);
    const key = (known ? bauart : 'beratung') as keyof typeof RATES.neuPerStufe;
    if (!known || bauart === 'beratung') {
      unsicher = true;
      annahmen.push('Bauart noch offen, wir rechnen mit einem mittleren Preis je Stufe.');
    }
    const basis = stufen * RATES.neuPerStufe[key];
    positionen.push({
      text: `Treppe neu, ${known ? bauart : 'Bauart offen'}, ${fmt(stufen)} Stufen`,
      menge: stufen,
      einheit: 'Stufen',
      netto: basis,
    });
    // Form surcharge only for new Treppen.
    if (FORM_AUFSCHLAG.has(str(v.treppe_form))) {
      positionen.push({
        text: `Aufschlag Treppenform (${str(v.treppe_form)}), 15 %`,
        menge: 1,
        einheit: 'Pausch.',
        netto: basis * RATES.formAufschlag,
      });
    }
    montageH += stufen * RATES.montageHoursPerStufeNeu;
  } else if (leistung === 'renovieren' || leistung === 'belegen') {
    const rate = leistung === 'renovieren' ? RATES.renovierenPerStufe : RATES.belegenPerStufe;
    positionen.push({
      text: `Treppe ${leistung}, ${fmt(stufen)} Stufen`,
      menge: stufen,
      einheit: 'Stufen',
      netto: stufen * rate,
    });
    if (UNKNOWN.has(str(v.treppe_bestand))) unsicher = true;
    montageH += stufen * RATES.montageHoursPerStufeBestand;
  }

  // Geländer neu: either the chosen Leistung or the extra option; one position either way.
  if (leistung === 'gelaender' || v.treppe_gelaender === 'neu') {
    const lfm = stufen * RATES.gelaenderLfmPerStufe;
    positionen.push({
      text: `Geländer neu, ${fmt(lfm)} lfm`,
      menge: lfm,
      einheit: 'lfm',
      netto: lfm * RATES.gelaenderPerLfm,
    });
    annahmen.push('Geländerlänge aus der Stufenzahl geschätzt (0,3 m je Stufe).');
    montageH += lfm * RATES.montageHoursPerLfmGelaender;
  }

  // treppe_form and treppe_holz have no `when` gate: an unknown answer widens the range in every branch.
  if (UNKNOWN.has(str(v.treppe_form)) || UNKNOWN.has(str(v.treppe_holz))) unsicher = true;

  // Montage is added on top of the material-inclusive basis; hours drive the trip count.
  positionen.push(montagePosition(montageH), anfahrtPosition(ctx, tripsFor(montageH)));

  const breite: Breite = unsicher ? 0.25 : 0.15;
  return kalkulation(positionen, { breite, quelle: 'regeln', annahmen, regelVersion, ctx });
};
