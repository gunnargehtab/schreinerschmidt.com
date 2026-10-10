// German one-sentence description of a Build (docs/configurator.md §4.11). Used as the canvas
// aria-label (the viewer prefixes „3D-Vorschau: “), the SVG <desc>, the alt text and the summary.
//
// The carcass sentence lives here; every other generator registers its own sentence when its module
// loads (table.ts → `registerDescriber('esstisch', …)`). A Build of a kind can only exist once that
// generator ran, so `describe()` is complete wherever it is called, and the Möbel preview chunk, which
// loads the table generator on request, carries no table text up front.
import { cmUnit } from './dims';
import { FINISH_LABEL, SPECIES } from './species';
import type { Build, CarcassParams, FurnitureParams } from './types';

export const KIND_LABEL: Record<FurnitureParams['kind'], string> = {
  regal: 'Regal',
  sideboard: 'Sideboard',
  einbauschrank: 'Einbauschrank',
  esstisch: 'Esstisch',
};

/** „3 Türen“, „1 Tür“ (a normal space: U+202F is only for number + unit). */
export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Clauses of the sentence, joined with „; “. */
export type Describer = (b: Build) => string[];

const describers: Partial<Record<FurnitureParams['kind'], Describer>> = {};

export function registerDescriber(kind: FurnitureParams['kind'], fn: Describer): void {
  describers[kind] = fn;
}

function carcass(b: Build): string[] {
  const p = b.params as CarcassParams;
  const d = b.derived;
  const einbau = p.kind === 'einbauschrank';
  const out = [
    `${KIND_LABEL[p.kind]} aus ${SPECIES[p.species].name}, ${FINISH_LABEL[p.finish]}, ${cmUnit(p.width)} breit, ${cmUnit(p.height)} hoch, ${cmUnit(p.depth)} tief` +
      (einbau ? ' (Nischenmaß)' : ''),
  ];
  const shelves = d.shelves[0] ?? 0;
  const uniform = d.shelves.every((s) => s === shelves);
  const modules = d.modules && d.modules > 1 ? `${count(d.modules, 'Modul', 'Module')} mit ` : '';
  out.push(
    modules +
      count(d.bays, 'Feld', modules ? 'Feldern' : 'Felder') +
      (shelves > 0 && uniform
        ? ` ${modules ? 'und' : 'mit'} ${d.bays > 1 ? 'je ' : ''}${count(shelves, 'Fachboden', 'Fachböden')}`
        : ''),
  );
  const fronts: string[] = [];
  if (d.drawers) fronts.push(count(d.drawers, 'Schubkasten', 'Schubkästen'));
  if (d.doors) fronts.push(count(d.doors, einbau ? 'Drehtür' : 'Tür', einbau ? 'Drehtüren' : 'Türen'));
  if (fronts.length) out.push(fronts.join(' und '));
  if (p.back === 'eingenutet' && !einbau) out.push('mit Rückwand');
  if (p.base.type === 'sockel') out.push(`Sockel ${cmUnit(p.base.height)}`);
  else if (p.base.type === 'fuesse') out.push(`auf Füßen (${cmUnit(p.base.height)})`);
  else if (p.base.type === 'haengend') out.push('hängend');
  if (d.aufsatz) out.push('mit Aufsatz');
  if (p.niche?.dachschraege) out.push('Dachschräge laut Angabe');
  return out;
}

export function describe(b: Build): string {
  const fn = describers[b.params.kind] ?? carcass;
  return fn(b).join('; ') + '.';
}
