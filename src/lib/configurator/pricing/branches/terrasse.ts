// Terrasse and Zaun calculator (docs/angebot.md §4.3 and §4.5); `beides` sums both parts.
// Pure: form values in, Kalkulation or null out. Never imported by the site.
import type { Values } from '../../fields';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from '../common';
import type { Breite, Calculator, Position } from '../types';

// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
export const RATES = {
  /** Terrasse, € net per m² incl. material, by terrasse_holz. */
  terrassePerM2: { laerche: 120, douglasie: 110, robinie: 170, beratung: 130 },
  /** terrasse_hoehe = erhoeht, € per m². */
  erhoehtPerM2: 40,
  /** terrasse_untergrund = erdreich, € per m². */
  erdreichPerM2: 25,
  /** Zaun, € per lfm: up to 120 cm / above. */
  zaunPerLfm: 140,
  zaunHochPerLfm: 190,
  /** Zaun height limit for the lower rate, cm. */
  zaunHoheGrenzeCm: 120,
  /** Tor, € each. */
  tor: 650,
  /** zaun_hang = ja: surcharge on the Zaun lfm position (not on Tore). */
  hangAufschlag: 0.15,
  /** Montage defaults: 1 h per m² Terrasse (§4.3); Zaun 0.5 h per lfm (docs/angebot.md §4.3, interpretation). */
  montageHoursPerM2: 1,
  montageHoursPerLfmZaun: 0.5,
} as const;

export const regelVersion = hashRates(RATES, SHARED);

const UNKNOWN = new Set(['unbekannt', 'beratung', 'offen']);
const HOELZER = Object.keys(RATES.terrassePerM2);

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

export const terrasse: Calculator = (v, ctx) => {
  if (v.typ !== 'terrasse') return null;

  const annahmen: string[] = [];
  let unsicher = false;

  let was = str(v.terrasse_was);
  if (was !== 'terrasse' && was !== 'zaun' && was !== 'beides') {
    was = 'terrasse';
    unsicher = true;
    annahmen.push('Leistung nicht angegeben, wir rechnen mit einer Terrasse.');
  }

  const positionen: Position[] = [];
  let montageH = 0;

  if (was === 'terrasse' || was === 'beides') {
    let flaeche = num(v.terrasse_flaeche);
    if (flaeche === undefined) {
      flaeche = 1;
      unsicher = true;
      annahmen.push('Fläche der Terrasse nicht angegeben, wir rechnen mit 1 m².');
    }
    const holz = str(v.terrasse_holz);
    const known = HOELZER.includes(holz);
    const key = (known ? holz : 'beratung') as keyof typeof RATES.terrassePerM2;
    if (!known || holz === 'beratung') {
      unsicher = true;
      annahmen.push('Holzart noch offen, wir rechnen mit einem mittleren Preis je m².');
    }
    positionen.push({
      text: `Terrasse, ${known && holz !== 'beratung' ? holz : 'Holzart offen'}, ${fmt(flaeche)} m²`,
      menge: flaeche,
      einheit: 'm²',
      netto: flaeche * RATES.terrassePerM2[key],
    });
    if (v.terrasse_hoehe === 'erhoeht') {
      positionen.push({
        text: `Zuschlag erhöhte Terrasse, ${fmt(flaeche)} m²`,
        menge: flaeche,
        einheit: 'm²',
        netto: flaeche * RATES.erhoehtPerM2,
      });
    }
    const untergrund = str(v.terrasse_untergrund);
    if (untergrund === 'erdreich') {
      positionen.push({
        text: `Zuschlag Untergrund Erdreich, ${fmt(flaeche)} m²`,
        menge: flaeche,
        einheit: 'm²',
        netto: flaeche * RATES.erdreichPerM2,
      });
    } else if (UNKNOWN.has(untergrund)) {
      unsicher = true;
    }
    montageH += flaeche * RATES.montageHoursPerM2;
  }

  if (was === 'zaun' || was === 'beides') {
    let laenge = num(v.zaun_laenge);
    if (laenge === undefined) {
      laenge = 1;
      unsicher = true;
      annahmen.push('Länge des Zauns nicht angegeben, wir rechnen mit 1 lfm.');
    }
    const hoehe = num(v.zaun_hoehe);
    if (hoehe === undefined) {
      unsicher = true;
      annahmen.push(`Höhe des Zauns nicht angegeben, wir rechnen mit bis ${RATES.zaunHoheGrenzeCm} cm.`);
    }
    const hoch = hoehe !== undefined && hoehe > RATES.zaunHoheGrenzeCm;
    const basis = laenge * (hoch ? RATES.zaunHochPerLfm : RATES.zaunPerLfm);
    positionen.push({
      text: `Zaun, ${hoch ? 'über' : 'bis'} ${RATES.zaunHoheGrenzeCm} cm, ${fmt(laenge)} lfm`,
      menge: laenge,
      einheit: 'lfm',
      netto: basis,
    });
    // Tore are optional: empty or 0 means none; anything else that is not a whole number is noted.
    const tore = count(v.zaun_tore);
    const toreRaw = str(v.zaun_tore).trim();
    if (tore === undefined && toreRaw !== '' && Number(toreRaw.replace(',', '.')) !== 0) {
      unsicher = true;
      annahmen.push('Zahl der Tore nicht erkannt, wir rechnen ohne Tor.');
    }
    if (tore !== undefined) {
      positionen.push({
        text: `Tor, ${fmt(tore)} Stk.`,
        menge: tore,
        einheit: 'Stk.',
        netto: tore * RATES.tor,
      });
    }
    if (v.zaun_hang === 'ja') {
      positionen.push({
        text: 'Zuschlag Hanglage, 15 %',
        menge: 1,
        einheit: 'Pausch.',
        netto: basis * RATES.hangAufschlag,
      });
    }
    montageH += laenge * RATES.montageHoursPerLfmZaun;
  }

  // Montage is added on top of the material-inclusive basis; hours drive the trip count.
  positionen.push(montagePosition(montageH), anfahrtPosition(ctx, tripsFor(montageH)));

  const breite: Breite = unsicher ? 0.25 : 0.15;
  return kalkulation(positionen, { breite, quelle: 'regeln', annahmen, regelVersion, ctx });
};
