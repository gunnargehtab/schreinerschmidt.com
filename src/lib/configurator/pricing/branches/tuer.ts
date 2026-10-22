// Tür calculator (docs/angebot.md §4.3 and §4.5): Haustür, Innentür, Restaurierung.
// Pure: form values in, Kalkulation or null out. Never imported by the site.
import type { Values } from '../../fields';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from '../common';
import type { Breite, Calculator, Position } from '../types';

// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
export const RATES = {
  /** € net per door incl. material, by tuer_art. */
  perTuer: { haustuer: 3800, innentuer: 950, restaurierung: 650 },
  /** Haustür with Sicherheit, € per door. */
  sicherheit: 600,
  /** Lichtausschnitt, € per door. */
  lichtausschnitt: 250,
  /** Seitenteil, € per door (any door type, §4.3). */
  seitenteil: 900,
  /** Montage default: 4 h per door (§4.3). */
  montageHoursPerTuer: 4,
} as const;

export const regelVersion = hashRates(RATES, SHARED);

const UNKNOWN = new Set(['unbekannt', 'beratung', 'offen']);
type Art = keyof typeof RATES.perTuer;
const ARTEN = Object.keys(RATES.perTuer);

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

const ART_LABEL: Record<Art, string> = {
  haustuer: 'Haustür',
  innentuer: 'Innentür',
  restaurierung: 'Tür restaurieren',
};

export const tuer: Calculator = (v, ctx) => {
  if (v.typ !== 'tuer') return null;

  const annahmen: string[] = [];
  let unsicher = false;

  let art = str(v.tuer_art);
  if (!ARTEN.includes(art)) {
    art = 'innentuer';
    unsicher = true;
    annahmen.push('Türart nicht angegeben, wir rechnen mit einer Innentür.');
  }
  const key = art as Art;

  let anzahl = count(v.tuer_anzahl);
  if (anzahl === undefined) {
    anzahl = 1;
    unsicher = true;
    annahmen.push('Zahl der Türen nicht angegeben, wir rechnen mit 1 Tür.');
  }

  const positionen: Position[] = [
    {
      text: `${ART_LABEL[key]}, ${fmt(anzahl)} Stk.`,
      menge: anzahl,
      einheit: 'Stk.',
      netto: anzahl * RATES.perTuer[key],
    },
  ];

  // Sicherheit only exists for a Haustür (field `when: tuer-haustuer`); a stale value is ignored.
  if (key === 'haustuer' && isSet(v.tuer_sicherheit)) {
    positionen.push({
      text: `Sicherheitsausstattung, ${fmt(anzahl)} Stk.`,
      menge: anzahl,
      einheit: 'Stk.',
      netto: anzahl * RATES.sicherheit,
    });
  }
  const glas = str(v.tuer_glas);
  if (glas === 'lichtausschnitt') {
    positionen.push({
      text: `Lichtausschnitt, ${fmt(anzahl)} Stk.`,
      menge: anzahl,
      einheit: 'Stk.',
      netto: anzahl * RATES.lichtausschnitt,
    });
  } else if (glas === 'seitenteil') {
    positionen.push({
      text: `Seitenteil, ${fmt(anzahl)} Stk.`,
      menge: anzahl,
      einheit: 'Stk.',
      netto: anzahl * RATES.seitenteil,
    });
  }

  if (UNKNOWN.has(str(v.tuer_anschlag))) unsicher = true;

  // Montage is added on top of the material-inclusive basis; hours drive the trip count.
  const montageH = anzahl * RATES.montageHoursPerTuer;
  positionen.push(montagePosition(montageH), anfahrtPosition(ctx, tripsFor(montageH)));

  const breite: Breite = unsicher ? 0.25 : 0.15;
  return kalkulation(positionen, { breite, quelle: 'regeln', annahmen, regelVersion, ctx });
};
