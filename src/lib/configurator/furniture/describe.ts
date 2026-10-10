// German one-sentence description of a Build (docs/configurator.md §4.11). Used as the canvas
// aria-label (the viewer prefixes „3D-Vorschau: “), the SVG <desc>, the alt text and the summary.
import { NNBSP, cmUnit } from './dims';
import { FINISH_LABEL, SPECIES } from './species';
import type { Build, CarcassParams, FurnitureParams, TableParams } from './types';

export const KIND_LABEL: Record<FurnitureParams['kind'], string> = {
  regal: 'Regal',
  sideboard: 'Sideboard',
  einbauschrank: 'Einbauschrank',
  esstisch: 'Esstisch',
};

const BASE_LABEL = {
  vierfuss: 'Vierfußgestell',
  'kufen-holz': 'Kufengestell aus Holz',
  'kufen-stahl': 'Kufengestell aus Stahl',
};

/** „3 Türen“, „1 Tür“ (a normal space: U+202F is only for number + unit). */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function carcass(p: CarcassParams, b: Build): string[] {
  const d = b.derived;
  const out = [
    `${KIND_LABEL[p.kind]} aus ${SPECIES[p.species].name}, ${FINISH_LABEL[p.finish]}, ${cmUnit(p.width)} breit, ${cmUnit(p.height)} hoch, ${cmUnit(p.depth)} tief` +
      (p.kind === 'einbauschrank' ? ' (Nischenmaß)' : ''),
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
  if (d.doors)
    fronts.push(
      count(
        d.doors,
        p.kind === 'einbauschrank' ? 'Drehtür' : 'Tür',
        p.kind === 'einbauschrank' ? 'Drehtüren' : 'Türen',
      ),
    );
  if (fronts.length) out.push(fronts.join(' und '));
  if (p.back === 'eingenutet' && p.kind !== 'einbauschrank') out.push('mit Rückwand');
  if (p.base.type === 'sockel') out.push(`Sockel ${cmUnit(p.base.height)}`);
  else if (p.base.type === 'fuesse') out.push(`auf Füßen (${cmUnit(p.base.height)})`);
  else if (p.base.type === 'haengend') out.push('hängend');
  if (d.aufsatz) out.push('mit Aufsatz');
  if (p.niche?.dachschraege) out.push('Dachschräge laut Angabe');
  return out;
}

function table(p: TableParams, b: Build): string[] {
  const seats = b.derived.seats ?? [0, 0];
  const liveEdge = b.parts.some((x) => x.role === 'platte' && x.outline);
  return [
    `Esstisch aus ${SPECIES[p.species].name}, ${FINISH_LABEL[p.finish]}, ${cmUnit(p.length)} lang, ${cmUnit(p.width)} breit, ${cmUnit(p.height)} hoch`,
    `Platte ${p.top}${NNBSP}mm${liveEdge ? ' mit Baumkante' : ''}`,
    BASE_LABEL[p.base],
    seats[0] === seats[1]
      ? `Platz für ${count(seats[0], 'Person', 'Personen')}`
      : `Platz für ${seats[0]} bis ${count(seats[1], 'Person', 'Personen')}`,
  ];
}

export function describe(b: Build): string {
  const p = b.params;
  return (p.kind === 'esstisch' ? table(p, b) : carcass(p, b)).join('; ') + '.';
}
