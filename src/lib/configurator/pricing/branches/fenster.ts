// Fenster calculator (docs/angebot.md §4.3 and §4.5): Fenster neu / restaurieren, Rollläden,
// Fensterbänke. Pure: form values in, Kalkulation or null out. Never imported by the site.
import type { Values } from '../../fields';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from '../common';
import type { Breite, Calculator, Position } from '../types';

// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
export const RATES = {
  /** Fenster neu, € net per m² incl. material, by Verglasung. */
  neuPerM2: { '2fach': 650, '3fach': 750 },
  /** Fenster neu with fenster_denkmal = ja: surcharge on the Fenster position. */
  denkmalAufschlag: 0.25,
  /** Fenster restaurieren, € per window. */
  restaurierenPerFenster: 450,
  /** Rollladen, € each; electric drive adds the surcharge. */
  rollladen: 380,
  rollladenElektrisch: 220,
  /** Fensterbank, € per window and side (`beides` = 2 sides). */
  fensterbank: 120,
  /** Assumed area per window when width or height is missing, m² (documented default, §4.3). */
  flaecheDefault: 1.2,
  /** Montage defaults (§4.3 names fenster; Rollladen and Fensterbank: §4.3 interpretation). */
  montageHoursPerFenster: 3,
  montageHoursPerRollladen: 1.5,
  montageHoursPerFensterbank: 0.5,
} as const;

export const regelVersion = hashRates(RATES, SHARED);

const UNKNOWN = new Set(['unbekannt', 'beratung', 'offen']);
const LEISTUNGEN = ['neu', 'restaurieren', 'rolllaeden', 'fensterbaenke'];

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

export const fenster: Calculator = (v, ctx) => {
  if (v.typ !== 'fenster') return null;

  const annahmen: string[] = [];
  let unsicher = false;

  // fenster_leistung is a multi-select; a single string is tolerated.
  const raw = Array.isArray(v.fenster_leistung) ? v.fenster_leistung : v.fenster_leistung ? [v.fenster_leistung] : [];
  const leistungen = new Set(raw.filter((l) => LEISTUNGEN.includes(l)));
  if (leistungen.size === 0) {
    leistungen.add('neu');
    unsicher = true;
    annahmen.push('Leistung nicht angegeben, wir rechnen mit neuen Fenstern.');
  }

  // Window count, resolved lazily so that a Rollladen-only request is not flagged for it.
  let anzahl: number | undefined;
  const fensterAnzahl = (): number => {
    if (anzahl === undefined) {
      anzahl = count(v.fenster_anzahl);
      if (anzahl === undefined) {
        anzahl = 1;
        unsicher = true;
        annahmen.push('Zahl der Fenster nicht angegeben, wir rechnen mit 1 Fenster.');
      }
    }
    return anzahl;
  };

  const positionen: Position[] = [];
  let montageH = 0;

  const neu = leistungen.has('neu');
  const restaurieren = leistungen.has('restaurieren');

  if (neu) {
    const n = fensterAnzahl();
    const b = num(v.fenster_breite);
    const h = num(v.fenster_hoehe);
    let flaeche: number;
    if (b === undefined || h === undefined) {
      flaeche = RATES.flaecheDefault * n;
      unsicher = true;
      annahmen.push(`Fenstermaße nicht angegeben, wir rechnen mit ${fmt(RATES.flaecheDefault)} m² je Fenster.`);
    } else {
      // cm × cm → m²
      flaeche = ((b * h) / 10000) * n;
    }
    const verglasung = str(v.fenster_verglasung);
    const key = verglasung === '3fach' ? '3fach' : '2fach';
    if (verglasung !== '2fach' && verglasung !== '3fach') {
      unsicher = true;
      annahmen.push('Verglasung nicht festgelegt, wir rechnen mit 2-fach-Verglasung.');
    }
    const basis = flaeche * RATES.neuPerM2[key];
    positionen.push({
      text: `Fenster neu, ${key === '3fach' ? '3-fach' : '2-fach'}, ${fmt(flaeche)} m²`,
      menge: flaeche,
      einheit: 'm²',
      netto: basis,
    });
    if (str(v.fenster_denkmal) === 'ja') {
      positionen.push({
        text: 'Aufschlag Denkmalschutz, 25 %',
        menge: 1,
        einheit: 'Pausch.',
        netto: basis * RATES.denkmalAufschlag,
      });
    }
  }

  if (restaurieren) {
    const n = fensterAnzahl();
    positionen.push({
      text: `Fenster restaurieren, ${fmt(n)} Stk.`,
      menge: n,
      einheit: 'Stk.',
      netto: n * RATES.restaurierenPerFenster,
    });
  }
  // Fenster neu and restaurieren together count the windows once for the Montage hours.
  if (neu || restaurieren) montageH += fensterAnzahl() * RATES.montageHoursPerFenster;

  if (leistungen.has('rolllaeden')) {
    let n = count(v.rolllaeden_anzahl);
    if (n === undefined) {
      n = 1;
      unsicher = true;
      annahmen.push('Zahl der Rollläden nicht angegeben, wir rechnen mit 1 Rollladen.');
    }
    positionen.push({ text: `Rollläden, ${fmt(n)} Stk.`, menge: n, einheit: 'Stk.', netto: n * RATES.rollladen });
    const antrieb = str(v.rolllaeden_antrieb);
    if (antrieb === 'elektrisch') {
      positionen.push({
        text: `Elektrischer Antrieb, ${fmt(n)} Stk.`,
        menge: n,
        einheit: 'Stk.',
        netto: n * RATES.rollladenElektrisch,
      });
    } else if (antrieb !== 'gurt') {
      // Antrieb open: priced as Gurt, wider range.
      unsicher = true;
      annahmen.push('Antrieb der Rollläden noch offen, wir rechnen mit Gurtbedienung.');
    }
    montageH += n * RATES.montageHoursPerRollladen;
  }

  if (leistungen.has('fensterbaenke')) {
    const n = fensterAnzahl();
    const ort = str(v.fensterbaenke_ort);
    let seiten = ort === 'beides' ? 2 : 1;
    if (ort !== 'innen' && ort !== 'aussen' && ort !== 'beides') {
      seiten = 1;
      unsicher = true;
      annahmen.push('Seite der Fensterbänke nicht angegeben, wir rechnen mit einer Seite.');
    }
    const stueck = n * seiten;
    positionen.push({
      text: `Fensterbänke, ${fmt(stueck)} Stk.`,
      menge: stueck,
      einheit: 'Stk.',
      netto: stueck * RATES.fensterbank,
    });
    montageH += stueck * RATES.montageHoursPerFensterbank;
  }

  // Verglasung and Denkmal have no `when` gate: an unknown answer widens the range for every Leistung.
  if (UNKNOWN.has(str(v.fenster_verglasung)) || UNKNOWN.has(str(v.fenster_denkmal))) unsicher = true;

  // Montage is added on top of the material-inclusive basis; hours drive the trip count.
  positionen.push(montagePosition(montageH), anfahrtPosition(ctx, tripsFor(montageH)));

  const breite: Breite = unsicher ? 0.25 : 0.15;
  return kalkulation(positionen, { breite, quelle: 'regeln', annahmen, regelVersion, ctx });
};
