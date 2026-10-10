// Form values → generator params for the Möbel live preview (docs/configurator.md §4.2). Pure, so
// tests/unit/configurator/preview.test.ts can cover it without a DOM. UI values are cm, the
// generators take mm. A field falls back to its registry default (fields.ts) when it is empty or when
// its value does not exist for the chosen moebel_art, so a stale radio from another furniture type
// never leaks into the drawing; numbers are clamped to the per-type ranges (ART_RANGES).
import { fieldDefault, fieldRange, fieldValues, type Values } from '../../../lib/configurator/fields';
import { deriveShelves, splitAufsatz } from '../../../lib/configurator/furniture/constraints';
import type { CarcassParams, FurnitureParams, Species } from '../../../lib/configurator/furniture/types';

/**
 * Base heights in mm (§4.2: Sockel 6–12 cm, Füße 10–25 cm, Einbauschrank Sockel 8–12 cm). The form has
 * no height field yet, so the preview draws the middle of each range; „hängend“ floats 40 cm.
 */
export const BASE_HEIGHT: Record<CarcassParams['base']['type'], number> = {
  sockel: 80,
  fuesse: 150,
  haengend: 400,
  ohne: 0,
};
/** Einbauschrank Sockel (§4.2). */
const EINBAU_SOCKEL = 100;
/** Einbauschrank filler strips (§4.2 defaults). */
const NICHE = { fillerSide: 30, fillerTop: 40 };

/** The species to draw for a non-species choice („beratung“): the registry default. */
const FALLBACK_SPECIES: Species = 'eiche';

const raw = (v: Values, name: string): string => {
  const x = v[name];
  return typeof x === 'string' && x !== '' ? x : fieldDefault(name, v);
};

/** Enum value, or the field's default when the value does not exist for this moebel_art. */
export function pick(v: Values, name: string): string {
  const x = raw(v, name);
  return fieldValues(name, v).includes(x) ? x : fieldDefault(name, v);
}

/** Integer in the field's unit, clamped to its per-art range; NaN when the field is empty and has no default. */
export function num(v: Values, name: string): number {
  let n = Math.round(Number(raw(v, name) || NaN));
  if (Number.isNaN(n)) n = Math.round(Number(fieldDefault(name, v) || NaN));
  const r = fieldRange(name, v);
  return r && !Number.isNaN(n) ? Math.min(r[1], Math.max(r[0], n)) : n;
}

/** Params for the generators, or null for bett/andere, for other project types and when nothing is chosen. */
export function paramsFromValues(v: Values): FurnitureParams | null {
  const art = v['typ'] && v['typ'] !== 'moebel' ? '' : pick(v, 'moebel_art');
  const holz = pick(v, 'moebel_holz');
  const common = {
    species: (holz === 'beratung' ? FALLBACK_SPECIES : holz) as Species,
    finish: pick(v, 'moebel_oberflaeche') as CarcassParams['finish'],
  };
  if (art === 'esstisch') {
    return {
      kind: art,
      length: num(v, 'tisch_laenge') * 10,
      width: num(v, 'tisch_breite') * 10,
      height: num(v, 'tisch_hoehe') * 10,
      top: Number(pick(v, 'tisch_platte')) as 25 | 40 | 60,
      edge: pick(v, 'tisch_kante') as 'gerade' | 'baumkante',
      seed: num(v, 'tisch_brett') || 0,
      base: pick(v, 'tisch_gestell') as 'vierfuss' | 'kufen-holz' | 'kufen-stahl',
      ...common,
    };
  }
  if (art !== 'regal' && art !== 'sideboard' && art !== 'einbauschrank') return null;
  const einbau = art === 'einbauschrank';
  const base = pick(v, 'moebel_unterbau') as CarcassParams['base']['type'];
  const faecher = num(v, 'moebel_faecher');
  const p: CarcassParams = {
    kind: art,
    width: num(v, 'moebel_breite') * 10,
    height: num(v, 'moebel_hoehe') * 10,
    depth: num(v, 'moebel_tiefe') * 10,
    board: Number(pick(v, 'moebel_staerke')) as CarcassParams['board'],
    front: pick(v, 'moebel_front') as CarcassParams['front'],
    base: { type: base, height: einbau && base === 'sockel' ? EINBAU_SOCKEL : BASE_HEIGHT[base] },
    // Rückwand is a Regal field (§1); a Sideboard always gets one, the Einbauschrank by rule.
    back: art === 'regal' && pick(v, 'moebel_rueckwand') === 'ohne' ? 'ohne' : 'eingenutet',
    shelvesPerBay: Number.isNaN(faecher) ? 'auto' : faecher,
    handle: pick(v, 'moebel_griffe') as CarcassParams['handle'],
    ...common,
  };
  if (einbau) p.niche = { ...NICHE, dachschraege: !!v['moebel_dachschraege'] };
  return p;
}

/**
 * `[min, max]` for moebel_faecher (shelves per bay) from the inner height of the main cabinet
 * (§4.2 "Shelves": compartments 20–40 cm), or null when the type has no shelves. Cheap: no generator run.
 */
export function faecherRange(v: Values): [number, number] | null {
  const p = paramsFromValues(v);
  if (!p || p.kind === 'esstisch') return null;
  const t = p.board;
  const einbau = p.kind === 'einbauschrank';
  let inner = p.height - (einbau ? NICHE.fillerTop : 0) - (p.base.type === 'haengend' ? 0 : p.base.height);
  if (einbau) inner = splitAufsatz(inner).main;
  inner -= 2 * t;
  if (inner < 2 * t + 200) return [0, 0];
  const k = deriveShelves(inner);
  return [k.min - 1, k.max - 1];
}
