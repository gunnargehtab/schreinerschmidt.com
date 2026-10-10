// Furniture model types (docs/configurator.md §4.3). Pure data: no three.js, no DOM.
// Coordinate system: x = width, y = height, z = depth; +z is the front; units are mm.

export type Species = 'eiche' | 'nussbaum' | 'esche' | 'kernbuche' | 'kirsche';
export type Finish = 'natur-geoelt' | 'weiss-geoelt' | 'lack-matt';
export type Board = 19 | 25 | 40;
export type Mm = number;
export type Axis = 0 | 1 | 2;
export type Vec3 = [Mm, Mm, Mm];

export type CarcassKind = 'regal' | 'sideboard' | 'einbauschrank';
export type FrontKind = 'offen' | 'tueren' | 'schubkaesten' | 'gemischt';
export type BaseKind = 'sockel' | 'fuesse' | 'haengend' | 'ohne';
export type HandleKind = 'grifflos' | 'holz' | 'metall';

export interface CarcassParams {
  kind: CarcassKind;
  width: Mm;
  height: Mm;
  depth: Mm;
  board: Board;
  front: FrontKind;
  base: { type: BaseKind; height: Mm };
  back: 'ohne' | 'eingenutet';
  shelvesPerBay: number | 'auto';
  handle: HandleKind;
  /** Einbauschrank only: the niche is `width` × `height` × `depth`; the carcass sits behind filler strips.
   *  `dachschraege` is only flagged in the summary (spec §4.2), never modelled. */
  niche?: { fillerSide: Mm; fillerTop: Mm; dachschraege?: boolean };
  species: Species;
  finish: Finish;
}

export interface TableParams {
  kind: 'esstisch';
  length: Mm;
  width: Mm;
  height: Mm;
  top: 25 | 40 | 60;
  edge: 'gerade' | 'baumkante';
  seed: number;
  base: 'vierfuss' | 'kufen-holz' | 'kufen-stahl';
  species: Species;
  finish: Finish;
}

export type FurnitureParams = CarcassParams | TableParams;

export type PartRole =
  | 'seite'
  | 'oberboden'
  | 'unterboden'
  | 'fachboden'
  | 'mittelwand'
  | 'rueckwand'
  | 'sockel'
  | 'fuss'
  | 'tuer'
  | 'schubkastenfront'
  | 'griff'
  | 'passleiste'
  | 'blende'
  | 'wand'
  | 'platte'
  | 'bein'
  | 'zarge'
  | 'kufe'
  | 'traverse';

export type ViewName = 'vorne' | 'seite' | 'oben' | '3d';

export interface Part {
  id: string;
  role: PartRole;
  label: string;
  min: Vec3;
  size: Vec3;
  grain: Axis;
  surface: 'holz' | 'metall' | 'wand';
  solid: boolean;
  uvAnchor: 'world' | 'local';
  /** Plan outline in the part's local x/z plane (live-edge table tops). */
  outline?: [Mm, Mm][];
  /** Opening motion (§4.6 Phase C): a door swings about `pivot` (its outer front edge; `dir` 1 =
   *  hinged left, −1 = hinged right), a drawer slides out by `dist`. Handles carry their front's. */
  motion?: { kind: 'hinge'; pivot: Vec3; dir: 1 | -1 } | { kind: 'slide'; dist: Mm };
  /** Explode direction (§4.6 Phase C), scaled by 15 % of the largest outer dimension; parts without
   *  it stay where they are (the anchor of the exploded view). */
  explode?: [number, number, number];
}

export interface DimSpec {
  id: string;
  a: Vec3;
  b: Vec3;
  offsetDir: [number, number, number];
  level: number;
  text: string;
  views: ViewName[];
}

export interface Derived {
  bays: number;
  bayWidths: Mm[];
  shelves: number[];
  maxSpan: Mm;
  doors: number;
  drawers: number;
  hinges: number;
  modules?: number;
  aufsatz?: boolean;
  seats?: [number, number];
  /** Drawer runner length (spec §4.2), only when the build has drawers. */
  runner?: Mm;
  outer: Vec3;
}

export interface Hint {
  code: string;
  level: 'info' | 'warn';
  field?: string;
  text: string;
}

export interface Build {
  params: FurnitureParams;
  parts: Part[];
  dims: DimSpec[];
  derived: Derived;
  hints: Hint[];
  bounds: { min: Vec3; max: Vec3 };
}

export interface CutItem {
  /** Id of the first part in the group. */
  id: string;
  label: string;
  role: PartRole;
  count: number;
  /** Along the grain. */
  length: Mm;
  width: Mm;
  thickness: Mm;
  material: 'holz' | 'metall';
}
