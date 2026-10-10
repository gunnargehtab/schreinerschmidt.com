// Field registry of the quote wizard (docs/configurator.md §1, §3 "State", §4.2). One entry per
// named control; the markup, the serializer, the validator and the dist test ("every named control
// is in fields.ts, and vice versa") all read from here. No label text lives in this module: the
// browser reads labels from the DOM, labels.ts holds them for the build.
//
// Isomorphic and dependency-free: it is bundled into the client core, so keep it data-only.

export type ProjectType = 'moebel' | 'boden' | 'treppe' | 'fenster' | 'tuer' | 'terrasse' | 'altbau' | 'sonstiges';
export type StepId = 'projekt' | 'details' | 'ausfuehrung' | 'rahmen' | 'kontakt' | 'pruefen';
export type Unit = 'cm' | 'mm' | 'm²' | 'lfm';
export type Kind = 'enum' | 'int' | 'dec' | 'text' | 'bool' | 'date' | 'file';

/** Furniture types that the carcass and table generators cover (§4.1). */
export type MoebelArt = 'regal' | 'sideboard' | 'einbauschrank' | 'esstisch' | 'bett' | 'andere';

export interface FieldDef {
  kind: Kind;
  /** Goes into the shareable URL (enums and numbers of steps 1–3 only). */
  share: boolean;
  /** Personal data: never in the URL. */
  pii: boolean;
  step: StepId;
  branch?: ProjectType;
  unit?: Unit;
  /** Allowed values of an enum (radio, select or checkbox group). */
  values?: readonly string[];
  /** Checkbox group: the value is a list. */
  multi?: boolean;
  min?: number;
  max?: number;
  /** Default that JS fills into an empty field when the branch activates; omitted from the URL. */
  def?: string;
  /** `html`: the `required` attribute (always-visible fields). `js`: `data-required`, promoted by JS. */
  required?: 'html' | 'js';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** Condition id from conditions.ts (`data-when`); the field only counts while it holds. */
  when?: string;
}

/** Form values as the DOM provides them: checkbox groups as arrays, checked booleans as '1'. */
export type Values = Record<string, string | string[] | undefined>;

export const STEPS: readonly StepId[] = ['projekt', 'details', 'ausfuehrung', 'rahmen', 'kontakt', 'pruefen'];

export const PLZ_PATTERN = '[0-9]{5}';
export const TEL_PATTERN = '[0-9 +()/-]{6,30}';
/** Up to 4 integer digits and 2 decimals, comma or point (§1 Boden). */
export const DECIMAL_PATTERN = '\\d{1,4}([.,]\\d{1,2})?';

type Partial_ = Partial<FieldDef>;
const en = (values: readonly string[], o: Partial_ = {}): FieldDef => ({
  kind: 'enum',
  share: true,
  pii: false,
  step: 'details',
  values,
  ...o,
});
const int = (min: number, max: number, o: Partial_ = {}): FieldDef => ({
  kind: 'int',
  share: true,
  pii: false,
  step: 'details',
  min,
  max,
  ...o,
});
const dec = (min: number, max: number, o: Partial_ = {}): FieldDef => ({
  kind: 'dec',
  share: true,
  pii: false,
  step: 'details',
  min,
  max,
  pattern: DECIMAL_PATTERN,
  ...o,
});
const txt = (maxLength: number, o: Partial_ = {}): FieldDef => ({
  kind: 'text',
  share: false,
  pii: false,
  step: 'details',
  maxLength,
  ...o,
});
const bool = (o: Partial_ = {}): FieldDef => ({ kind: 'bool', share: true, pii: false, step: 'details', ...o });

/** Stamps step and branch onto a group of definitions. */
const group = (
  step: StepId,
  branch: ProjectType | undefined,
  defs: Record<string, FieldDef>,
): Record<string, FieldDef> =>
  Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, branch ? { ...d, step, branch } : { ...d, step }]));

const JA_NEIN_UNBEKANNT = ['ja', 'nein', 'unbekannt'] as const;
const HOLZ = ['eiche', 'kernbuche', 'esche', 'kiefer', 'douglasie', 'offen'] as const;

/**
 * Per-type ranges and defaults of §4.2 (UI in cm): `[min, max, default]`. The HTML attributes
 * carry the union (moebel_breite 40–400); JS narrows per moebel_art.
 */
export const ART_RANGES: Readonly<Record<string, Readonly<Record<string, readonly [number, number, number]>>>> = {
  regal: { moebel_breite: [40, 300, 120], moebel_hoehe: [40, 260, 200], moebel_tiefe: [20, 45, 35] },
  sideboard: { moebel_breite: [80, 280, 180], moebel_hoehe: [50, 100, 80], moebel_tiefe: [35, 55, 45] },
  einbauschrank: { moebel_breite: [60, 400, 240], moebel_hoehe: [180, 320, 250], moebel_tiefe: [35, 65, 60] },
  esstisch: { tisch_laenge: [120, 320, 200], tisch_breite: [70, 110, 90], tisch_hoehe: [72, 78, 75] },
};

/** Enum options that exist per moebel_art (§4.2); the first entry is the default. */
export const ART_OPTIONS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  regal: { moebel_staerke: ['19', '25', '40'], moebel_front: ['offen'], moebel_unterbau: ['sockel', 'fuesse', 'ohne'] },
  sideboard: {
    moebel_staerke: ['19', '25'],
    moebel_front: ['tueren', 'schubkaesten', 'gemischt'],
    moebel_unterbau: ['sockel', 'fuesse', 'haengend'],
  },
  einbauschrank: { moebel_staerke: ['19', '25'], moebel_front: ['tueren'], moebel_unterbau: ['sockel'] },
};

export const FIELDS: Readonly<Record<string, FieldDef>> = {
  typ: en(['moebel', 'boden', 'treppe', 'fenster', 'tuer', 'terrasse', 'altbau', 'sonstiges'], {
    step: 'projekt',
    required: 'html',
  }),

  ...group('details', 'moebel', {
    moebel_art: en(['regal', 'sideboard', 'einbauschrank', 'esstisch', 'bett', 'andere'], { required: 'js' }),
    moebel_breite: int(40, 400, { unit: 'cm', when: 'moebel-korpus' }),
    moebel_hoehe: int(40, 320, { unit: 'cm', when: 'moebel-korpus' }),
    moebel_tiefe: int(20, 65, { unit: 'cm', when: 'moebel-korpus' }),
    moebel_staerke: en(['19', '25', '40'], { unit: 'mm', def: '19', when: 'moebel-korpus' }),
    moebel_front: en(['offen', 'tueren', 'schubkaesten', 'gemischt'], { when: 'moebel-fronten' }),
    moebel_unterbau: en(['sockel', 'fuesse', 'haengend', 'ohne'], { def: 'sockel', when: 'moebel-korpus' }),
    moebel_rueckwand: en(['mit', 'ohne'], { def: 'mit', when: 'moebel-regal' }),
    moebel_faecher: int(0, 12, { when: 'moebel-korpus' }),
    moebel_griffe: en(['grifflos', 'holz', 'metall'], { def: 'grifflos', when: 'moebel-fronten' }),
    moebel_dachschraege: bool({ when: 'moebel-einbauschrank' }),
    tisch_laenge: int(120, 320, { unit: 'cm', when: 'moebel-tisch' }),
    tisch_breite: int(70, 110, { unit: 'cm', when: 'moebel-tisch' }),
    tisch_hoehe: int(72, 78, { unit: 'cm', when: 'moebel-tisch' }),
    tisch_platte: en(['25', '40', '60'], { unit: 'mm', def: '40', when: 'moebel-tisch' }),
    tisch_kante: en(['gerade', 'baumkante'], { def: 'gerade', when: 'moebel-tisch' }),
    tisch_gestell: en(['vierfuss', 'kufen-holz', 'kufen-stahl'], { def: 'vierfuss', when: 'moebel-tisch' }),
    tisch_brett: int(0, 999999, { when: 'moebel-tisch' }),
    bett_liegeflaeche: en(['90x200', '140x200', '160x200', '180x200', '200x200', '180x220', '200x220', 'sondermass'], {
      required: 'js',
      when: 'moebel-bett',
    }),
    bett_hoehe: en(['normal', 'komfort'], { def: 'normal', when: 'moebel-bett' }),
    moebel_beschreibung: txt(2000, { required: 'js', minLength: 10, when: 'moebel-andere' }),
  }),
  ...group('ausfuehrung', 'moebel', {
    moebel_holz: en(['eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche', 'beratung'], { def: 'eiche' }),
    moebel_oberflaeche: en(['natur-geoelt', 'weiss-geoelt', 'lack-matt'], { def: 'natur-geoelt' }),
    moebel_wuensche: txt(1000),
  }),

  ...group('details', 'boden', {
    boden_leistung: en(['neu', 'aufarbeiten', 'reparatur'], { required: 'js' }),
    boden_art: en(['stabparkett', 'hochkant', 'mosaik', 'fertigparkett', 'dielen', 'kork', 'linoleum', 'offen'], {
      when: 'boden-neu',
    }),
    boden_holz: en(HOLZ),
    boden_flaeche: dec(1, 2000, { unit: 'm²', required: 'js' }),
    boden_raeume: int(1, 30),
  }),
  ...group('ausfuehrung', 'boden', {
    boden_untergrund: en(['estrich', 'holz', 'fliesen', 'teppich', 'pvc-laminat', 'unbekannt']),
    boden_fbh: en(JA_NEIN_UNBEKANNT),
    boden_zugang: en(JA_NEIN_UNBEKANNT, { when: 'boden-dielen' }),
    boden_zustand: en(['leicht', 'stark', 'schaeden'], { when: 'boden-bestand' }),
    boden_oberflaeche_alt: en(['geoelt', 'lackiert', 'unbekannt'], { when: 'boden-bestand' }),
    boden_sockelleisten: bool(),
  }),

  ...group('details', 'treppe', {
    treppe_leistung: en(['neu', 'renovieren', 'belegen', 'gelaender'], { required: 'js' }),
    treppe_form: en(['gerade', 'viertel', 'halb', 'podest', 'wendel', 'unbekannt']),
    treppe_geschosshoehe: int(200, 450, { unit: 'cm', when: 'treppe-neu' }),
    treppe_stufen: int(2, 30),
    treppe_holz: en(['eiche', 'kernbuche', 'esche', 'nussbaum', 'beratung']),
  }),
  ...group('ausfuehrung', 'treppe', {
    treppe_bauart: en(['wange', 'holm', 'faltwerk', 'beratung'], { when: 'treppe-neu' }),
    treppe_bestand: en(['holz', 'beton', 'stahl', 'unbekannt'], { when: 'treppe-bestand' }),
    treppe_gelaender: en(['neu', 'vorhanden', 'keins']),
    treppe_zustand: txt(2000, { when: 'treppe-bestand' }),
  }),

  ...group('details', 'fenster', {
    fenster_leistung: en(['neu', 'restaurieren', 'rolllaeden', 'fensterbaenke'], { multi: true, required: 'js' }),
    fenster_anzahl: int(1, 100),
    fenster_breite: int(30, 400, { unit: 'cm' }),
    fenster_hoehe: int(30, 400, { unit: 'cm' }),
  }),
  ...group('ausfuehrung', 'fenster', {
    fenster_verglasung: en(['2fach', '3fach', 'unbekannt']),
    fenster_denkmal: en(JA_NEIN_UNBEKANNT),
    rolllaeden_anzahl: int(1, 100, { when: 'fenster-rolllaeden' }),
    rolllaeden_antrieb: en(['gurt', 'elektrisch', 'beratung'], { when: 'fenster-rolllaeden' }),
    fensterbaenke_ort: en(['innen', 'aussen', 'beides'], { when: 'fenster-fensterbaenke' }),
    fenster_zustand: txt(2000),
  }),

  ...group('details', 'tuer', {
    tuer_art: en(['haustuer', 'innentuer', 'restaurierung'], { required: 'js' }),
    tuer_anzahl: int(1, 50),
    tuer_breite: int(60, 200, { unit: 'cm' }),
    tuer_hoehe: int(180, 300, { unit: 'cm' }),
    tuer_anschlag: en(['din-links', 'din-rechts', 'unbekannt']),
  }),
  ...group('ausfuehrung', 'tuer', {
    tuer_sicherheit: bool({ when: 'tuer-haustuer' }),
    tuer_glas: en(['ohne', 'lichtausschnitt', 'seitenteil']),
    tuer_stil: en(['modern', 'klassisch', 'nach-vorlage']),
    tuer_zustand: txt(2000, { when: 'tuer-restaurierung' }),
  }),

  ...group('details', 'terrasse', {
    terrasse_was: en(['terrasse', 'zaun', 'beides'], { required: 'js' }),
    terrasse_flaeche: dec(1, 2000, { unit: 'm²', when: 'terrasse-terrasse' }),
    terrasse_holz: en(['laerche', 'douglasie', 'robinie', 'beratung'], { when: 'terrasse-terrasse' }),
    zaun_laenge: dec(1, 2000, { unit: 'lfm', when: 'terrasse-zaun' }),
    zaun_hoehe: int(60, 220, { unit: 'cm', when: 'terrasse-zaun' }),
    zaun_tore: int(0, 10, { when: 'terrasse-zaun' }),
  }),
  ...group('ausfuehrung', 'terrasse', {
    terrasse_untergrund: en(['beton-pflaster', 'erdreich', 'balkon', 'unbekannt'], { when: 'terrasse-terrasse' }),
    terrasse_hoehe: en(['bodennah', 'erhoeht'], { when: 'terrasse-terrasse' }),
    zaun_hang: en(['ja', 'nein'], { when: 'terrasse-zaun' }),
  }),

  ...group('details', 'altbau', {
    altbau_bereiche: en(['treppe', 'vertaefelung', 'dielen', 'tueren', 'fenster', 'einbauschraenke'], {
      multi: true,
      required: 'js',
    }),
    altbau_baujahr: int(1500, 2026),
    altbau_denkmal: en(JA_NEIN_UNBEKANNT),
  }),
  ...group('ausfuehrung', 'altbau', {
    altbau_beschreibung: txt(2000, { required: 'js', minLength: 10 }),
  }),

  ...group('details', 'sonstiges', {
    sonstiges_beschreibung: txt(2000, { required: 'js', minLength: 10 }),
  }),
  ...group('ausfuehrung', 'sonstiges', {
    sonstiges_masse: txt(500),
  }),

  /** One photo input per branch (unique ids, same name); see the photo policy in §1. */
  'fotos[]': { kind: 'file', share: false, pii: false, step: 'ausfuehrung' },

  ...group('rahmen', undefined, {
    zeitraum: en(['asap', '1-3', '3-6', 'offen'], { share: false }),
    termin: { kind: 'date', share: false, pii: false, step: 'rahmen' },
    budget: en(['bis-2000', '2000-5000', '5000-10000', '10000-25000', 'ueber-25000', 'keine-angabe'], { share: false }),
    plz: txt(5, { pii: true, required: 'html', pattern: PLZ_PATTERN }),
    ort: txt(100, { pii: true }),
  }),
  ...group('kontakt', undefined, {
    name: txt(100, { pii: true, required: 'html' }),
    email: txt(254, { pii: true, required: 'html' }),
    telefon: txt(30, { pii: true, pattern: TEL_PATTERN }),
    kontaktweg: en(['email', 'telefon', 'egal'], { share: false, pii: true }),
    erreichbarkeit: txt(120, { pii: true }),
    nachricht: txt(2000, { pii: true }),
  }),
};

export const FIELD_NAMES: readonly string[] = Object.keys(FIELDS);

/** The furniture type a value map selects, if any. */
const art = (v: Values): string => (typeof v['moebel_art'] === 'string' ? v['moebel_art'] : '');

/** `[min, max]` for a numeric field, narrowed per moebel_art (§4.2); falls back to the HTML range. */
export function fieldRange(name: string, v: Values): [number, number] | null {
  const r = ART_RANGES[art(v)]?.[name];
  if (r) return [r[0], r[1]];
  const f = FIELDS[name];
  return f && f.min !== undefined && f.max !== undefined ? [f.min, f.max] : null;
}

/** The value JS fills into an empty field when its branch activates; '' when there is none. */
export function fieldDefault(name: string, v: Values): string {
  const a = art(v);
  const r = ART_RANGES[a]?.[name];
  if (r) return String(r[2]);
  const o = ART_OPTIONS[a]?.[name];
  if (o) return o[0] ?? '';
  return FIELDS[name]?.def ?? '';
}

/** Enum values that exist for the current moebel_art; the full list for every other field. */
export const fieldValues = (name: string, v: Values): readonly string[] =>
  ART_OPTIONS[art(v)]?.[name] ?? FIELDS[name]?.values ?? [];
