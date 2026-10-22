// Möbel calculator (docs/angebot.md §4.2 and §4.5). Pure: form values in, Kalkulation or null out.
// Regal, Sideboard, Einbauschrank and Esstisch run through the furniture generators and are priced
// with the estimate() formula (buildPositions); the Bett has no generator and is priced from a size
// table. „andere“ (free text) goes to Claude quantities (§4.4) and returns null.
// Never imported by the site (pricing stays compiled out).
import { paramsFromValues } from '../../../scripts/configurator/preview/params';
import { fieldDefault, fieldRange, fieldValues, type Values } from '../fields';
import { generate } from '../furniture';
import { SPECIES } from '../furniture/species';
import type { Species } from '../furniture/types';
import { anfahrtPosition, hashRates, kalkulation, montagePosition, SHARED, tripsFor } from './common';
import { buildPositions } from './index';
import { PILOT_RULES } from './pilot-rules';
import type { Breite, Calculator, Position } from './types';

// PLACEHOLDER: pilot assumptions, to be confirmed by the owner (docs/owner-checklist.md "Angebot pilot").
export const BETT = {
  /** € net per bed in eiche, material and Werkstatt included, by bett_liegeflaeche. */
  grundpreis: {
    '90x200': 1350,
    '140x200': 1750,
    '160x200': 1900,
    '180x200': 2050,
    '200x200': 2250,
    '180x220': 2200,
    '200x220': 2400,
    sondermass: 2100,
  },
  /** Species factor on the base price. */
  holzFaktor: { eiche: 1, esche: 0.95, kernbuche: 0.9, kirsche: 1.2, nussbaum: 1.35 } satisfies Record<Species, number>,
  /** bett_hoehe = komfort, share of the species-adjusted base price. */
  komfortZuschlag: 0.08,
  /** moebel_oberflaeche = lack-matt, share of the species-adjusted base price. */
  lackZuschlag: 0.1,
  montageStunden: 2,
} as const;

/** Montage hours by moebel_art (§4.2: 4 h as coded, Einbauschrank 8 h, Bett 2 h). */
const MONTAGE: Record<string, number> = { einbauschrank: 8, bett: BETT.montageStunden };
const MONTAGE_DEFAULT = 4;

export const regelVersion = hashRates(PILOT_RULES, SHARED, BETT);

/** German labels of the dimension fields, for the assumption lines. */
const DIM_LABEL: Record<string, string> = {
  moebel_breite: 'Breite',
  moebel_hoehe: 'Höhe',
  moebel_tiefe: 'Tiefe',
  tisch_laenge: 'Länge',
  tisch_breite: 'Breite',
  tisch_hoehe: 'Höhe',
};
const DIMS: Record<string, readonly string[]> = {
  esstisch: ['tisch_laenge', 'tisch_breite', 'tisch_hoehe'],
  regal: ['moebel_breite', 'moebel_hoehe', 'moebel_tiefe'],
  sideboard: ['moebel_breite', 'moebel_hoehe', 'moebel_tiefe'],
  einbauschrank: ['moebel_breite', 'moebel_hoehe', 'moebel_tiefe'],
};

/** Enum fields that feed paramsFromValues() or the Bett table, by moebel_art. */
const KORPUS_ENUMS = ['moebel_staerke', 'moebel_front', 'moebel_unterbau', 'moebel_griffe'] as const;
const ENUMS: Record<string, readonly string[]> = {
  regal: [...KORPUS_ENUMS, 'moebel_rueckwand'],
  sideboard: KORPUS_ENUMS,
  einbauschrank: KORPUS_ENUMS,
  esstisch: ['tisch_platte', 'tisch_kante', 'tisch_gestell'],
  bett: ['bett_hoehe'],
};

const str = (v: Values[string]): string => (typeof v === 'string' ? v : '');

/** A form number is usable when it parses to a finite value; paramsFromValues() clamps the rest. */
const hasNumber = (v: Values[string]): boolean => str(v).trim() !== '' && Number.isFinite(Number(str(v)));

/** „160 × 200 cm“ from a bett_liegeflaeche value. */
const sizeLabel = (size: string): string => `${size.replace('x', ' × ')} cm`;

export const moebel: Calculator = (v, ctx) => {
  if (v.typ !== 'moebel') return null;
  const art = str(v.moebel_art);
  // Free text is priced from Claude quantities (§4.4); without a furniture type there is no rule.
  if (art === 'andere' || art === '') return null;
  // Any other unknown art (incl. prototype keys like „constructor“ from a tampered POST) has no rule.
  if (art !== 'bett' && !Object.hasOwn(DIMS, art)) return null;

  const annahmen: string[] = [];
  let unsicher = false;

  // Species: „Beratung gewünscht“ is priced as the registry default, Eiche (§4.2).
  const holz = str(v.moebel_holz);
  if (holz === 'beratung') {
    unsicher = true;
    annahmen.push('Holzart noch offen, wir rechnen mit Eiche.');
  } else if (holz !== '' && !fieldValues('moebel_holz', v).includes(holz)) {
    // A value outside the list (tampered POST) is priced as the default Eiche, like „beratung“;
    // paramsFromValues() and the Bett table both fall back to it.
    unsicher = true;
    annahmen.push('Holzart nicht erkannt, wir rechnen mit Eiche.');
  }
  // Same for the finish: an unknown value is priced as the default, natur geölt (no Lack surcharge).
  const oberflaeche = str(v.moebel_oberflaeche);
  if (oberflaeche !== '' && !fieldValues('moebel_oberflaeche', v).includes(oberflaeche)) {
    unsicher = true;
    annahmen.push('Oberfläche nicht erkannt, wir rechnen mit natur geölt.');
  }

  // Any other option outside its list (tampered POST) falls back to the field default in
  // paramsFromValues(); price it, but widen and say so.
  for (const name of ENUMS[art] ?? []) {
    const x = str(v[name]);
    if (x === '' || fieldValues(name, v).includes(x)) continue;
    unsicher = true;
    annahmen.push(`Angabe „${x}“ nicht erkannt, wir rechnen mit der Standardausführung.`);
  }

  // Object.hasOwn: a prototype key must never be read as Montage hours.
  const montageH = (Object.hasOwn(MONTAGE, art) ? MONTAGE[art] : undefined) ?? MONTAGE_DEFAULT;
  const positionen: Position[] = [];

  if (art === 'bett') {
    const size = str(v.bett_liegeflaeche);
    // Object.hasOwn, not `in`: prototype keys like „constructor“ must not count as a size.
    const known = Object.hasOwn(BETT.grundpreis, size) && size !== 'sondermass';
    const key = (known ? size : 'sondermass') as keyof typeof BETT.grundpreis;
    if (!known) {
      unsicher = true;
      annahmen.push(
        size === 'sondermass'
          ? 'Sondermaß der Liegefläche, wir rechnen mit einem mittleren Pauschalpreis.'
          : 'Liegefläche nicht angegeben, wir rechnen mit einem Sondermaß zum mittleren Pauschalpreis.',
      );
    }
    // „beratung“ and unknown values (flagged above) are priced as Eiche.
    const species: Species = Object.hasOwn(BETT.holzFaktor, holz) ? (holz as Species) : 'eiche';
    const basis = BETT.grundpreis[key] * BETT.holzFaktor[species];
    positionen.push({
      text: `Bett ${known ? sizeLabel(size) : 'Sondermaß'}, ${SPECIES[species].name} (Material und Werkstatt)`,
      menge: 1,
      einheit: 'Stk.',
      netto: basis,
    });
    if (v.bett_hoehe === 'komfort') {
      positionen.push({
        text: `Zuschlag Komforthöhe (${BETT.komfortZuschlag * 100} %)`,
        menge: 1,
        einheit: 'Pausch.',
        netto: basis * BETT.komfortZuschlag,
      });
    }
    if (v.moebel_oberflaeche === 'lack-matt') {
      positionen.push({
        text: `Zuschlag Lack matt (${BETT.lackZuschlag * 100} %)`,
        menge: 1,
        einheit: 'Pausch.',
        netto: basis * BETT.lackZuschlag,
      });
    }
  } else {
    // Missing or garbage dimensions fall back to the registry default inside paramsFromValues();
    // the customer sees which value we assumed.
    // Values outside the per-type range are clamped there too (§4.2 ART_RANGES); same treatment.
    for (const name of DIMS[art] ?? []) {
      if (!hasNumber(v[name])) {
        unsicher = true;
        annahmen.push(`${DIM_LABEL[name]} nicht angegeben, wir rechnen mit ${fieldDefault(name, v)} cm.`);
        continue;
      }
      const range = fieldRange(name, v);
      const x = Math.round(Number(str(v[name])));
      if (!range || (x >= range[0] && x <= range[1])) continue;
      const clamped = Math.min(range[1], Math.max(range[0], x));
      unsicher = true;
      annahmen.push(`${DIM_LABEL[name]} außerhalb des möglichen Bereichs, wir rechnen mit ${clamped} cm.`);
    }
    const params = paramsFromValues(v);
    if (!params) return null;
    const build = generate(params);
    positionen.push(...buildPositions(build, PILOT_RULES));
    // Steel parts have no rate and are left out of buildPositions(); the customer is told so.
    if (build.parts.some((part) => part.surface === 'metall')) {
      unsicher = true;
      annahmen.push('Das Stahlgestell ist im Preis nicht enthalten und wird nach Rücksprache ergänzt.');
    }
  }

  // Möbel: one trip (§4.1); tripsFor() agrees for every Montage value above.
  positionen.push(montagePosition(montageH), anfahrtPosition(ctx, tripsFor(montageH)));

  const breite: Breite = unsicher ? 0.25 : 0.15;
  return kalkulation(positionen, { breite, quelle: 'regeln', annahmen, regelVersion, ctx });
};
