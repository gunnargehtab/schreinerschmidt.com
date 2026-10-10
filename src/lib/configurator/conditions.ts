// Visibility conditions of the quote wizard (docs/configurator.md §1, §2 point 3). The single source
// for the `:has()` hide rules of the no-JS form, for the `data-when` markup and for the JS that
// disables inactive fieldsets. Isomorphic and dependency-free apart from fields.ts.
//
// Markup contract: every element that belongs to one branch carries `data-branch="<typ>"`; every
// element that depends on a condition carries `data-when="<id>"`. A condition holds while one of its
// values is checked in the named radio or checkbox group.
import { FIELDS, type ProjectType, type Values } from './fields';

/** id of the wizard `<form>`; the generated rules are scoped to it. */
export const FORM_ID = 'anfrage';

export const PROJECT_TYPES: readonly ProjectType[] = [
  'moebel',
  'boden',
  'treppe',
  'fenster',
  'tuer',
  'terrasse',
  'altbau',
  'sonstiges',
];

export interface Condition {
  id: string;
  field: string;
  values: readonly string[];
}

const KORPUS = ['regal', 'sideboard', 'einbauschrank'] as const;

export const CONDITIONS: readonly Condition[] = [
  // Möbel: which fields a furniture type shows (§1 Möbel step 2, §4.2)
  { id: 'moebel-korpus', field: 'moebel_art', values: KORPUS },
  { id: 'moebel-fronten', field: 'moebel_art', values: ['sideboard', 'einbauschrank'] },
  { id: 'moebel-regal', field: 'moebel_art', values: ['regal'] },
  { id: 'moebel-sideboard', field: 'moebel_art', values: ['sideboard'] },
  { id: 'moebel-regal-sideboard', field: 'moebel_art', values: ['regal', 'sideboard'] },
  { id: 'moebel-einbauschrank', field: 'moebel_art', values: ['einbauschrank'] },
  { id: 'moebel-tisch', field: 'moebel_art', values: ['esstisch'] },
  { id: 'moebel-bett', field: 'moebel_art', values: ['bett'] },
  { id: 'moebel-andere', field: 'moebel_art', values: ['andere'] },
  // Boden
  { id: 'boden-neu', field: 'boden_leistung', values: ['neu'] },
  { id: 'boden-bestand', field: 'boden_leistung', values: ['aufarbeiten', 'reparatur'] },
  { id: 'boden-dielen', field: 'boden_art', values: ['dielen'] },
  // Treppe
  { id: 'treppe-neu', field: 'treppe_leistung', values: ['neu'] },
  { id: 'treppe-bestand', field: 'treppe_leistung', values: ['renovieren', 'belegen', 'gelaender'] },
  // Fenster (checkbox group)
  { id: 'fenster-rolllaeden', field: 'fenster_leistung', values: ['rolllaeden'] },
  { id: 'fenster-fensterbaenke', field: 'fenster_leistung', values: ['fensterbaenke'] },
  // Tür
  { id: 'tuer-haustuer', field: 'tuer_art', values: ['haustuer'] },
  { id: 'tuer-restaurierung', field: 'tuer_art', values: ['restaurierung'] },
  // Terrasse & Zaun
  { id: 'terrasse-terrasse', field: 'terrasse_was', values: ['terrasse', 'beides'] },
  { id: 'terrasse-zaun', field: 'terrasse_was', values: ['zaun', 'beides'] },
];

/**
 * Conditions on single options (radio labels) rather than whole fields: an option only exists for
 * some furniture types (§4.2). The markup puts `data-when` on the option's label.
 */
export const OPTION_WHEN: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  moebel_staerke: { '40': 'moebel-regal' },
  moebel_front: { schubkaesten: 'moebel-sideboard', gemischt: 'moebel-sideboard' },
  moebel_unterbau: { fuesse: 'moebel-regal-sideboard', haengend: 'moebel-sideboard', ohne: 'moebel-regal' },
};

const byId: Record<string, Condition> = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));

/** True while one of the condition's values is selected. */
export function holds(c: Condition, v: Values): boolean {
  const x = v[c.field];
  const list = Array.isArray(x) ? x : x === undefined ? [] : [x];
  return list.some((s) => c.values.includes(s));
}

/**
 * True when the field is part of the active configuration: its branch is the chosen project type
 * and its condition chain holds (a condition's own field must be visible too, e.g. boden_zugang
 * depends on boden_art, which depends on boden_leistung).
 */
export function visible(name: string, v: Values): boolean {
  const f = FIELDS[name];
  if (!f) return false;
  if (f.branch && f.branch !== v['typ']) return false;
  const c = f.when ? byId[f.when] : undefined;
  return !c || (holds(c, v) && visible(c.field, v));
}

/** Ids of the conditions that currently hold; the controller disables the others. */
export const activeConditions = (v: Values): string[] => CONDITIONS.filter((c) => holds(c, v)).map((c) => c.id);

/**
 * The `:has()` stylesheet of §2 point 3: hides every `[data-branch]` of an unselected project type
 * and every `[data-when]` whose condition does not hold. Delivered as a build-time stylesheet
 * (src/pages/konfigurator/bedingungen.css.ts), never inline.
 */
export function conditionsCss(formId: string = FORM_ID): string {
  const sel = (field: string, value: string) => `[name="${field}"][value="${value}"]:checked`;
  return [
    ...PROJECT_TYPES.map((t) => `#${formId}:not(:has(${sel('typ', t)})) [data-branch="${t}"]{display:none}`),
    ...CONDITIONS.map(
      (c) =>
        `#${formId}:not(:has(${c.values.map((v) => sel(c.field, v)).join(',')})) [data-when="${c.id}"]{display:none}`,
    ),
  ].join('\n');
}
