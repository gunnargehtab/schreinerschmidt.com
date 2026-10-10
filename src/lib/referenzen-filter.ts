// Pure helpers for the Referenzen filter chips (docs/design-system.md §6 "Referenzen filter").
// Projects carry ServiceKey categories; the filter has one chip fewer: `fenster` and `tueren`
// share the chip `fenster-tueren`.

export const FILTER_CHIPS = [
  { value: 'moebel', label: 'Möbel' },
  { value: 'boeden', label: 'Böden' },
  { value: 'treppen', label: 'Treppen' },
  { value: 'fenster-tueren', label: 'Fenster und Türen' },
  { value: 'altbau', label: 'Altbau' },
  { value: 'terrassen', label: 'Terrassen' },
] as const;

export type FilterChip = (typeof FILTER_CHIPS)[number]['value'];

const CHIP_OF: Record<string, FilterChip> = { fenster: 'fenster-tueren', tueren: 'fenster-tueren' };

/** The chip a ServiceKey belongs to (identity except fenster/tueren). */
export const chipOf = (category: string): string => CHIP_OF[category] ?? category;

/** Chip values of a project, de-duplicated, in order. Goes into `data-cat` (space separated). */
export function dataCat(categories: readonly string[]): string {
  return [...new Set(categories.map(chipOf))].join(' ');
}

/** Number of projects per chip value, plus `alle`. Chips without projects are absent. */
export function chipCounts(items: readonly { categories: readonly string[] }[]): Record<string, number> {
  const counts: Record<string, number> = { alle: items.length };
  for (const item of items) {
    for (const chip of new Set(item.categories.map(chipOf))) counts[chip] = (counts[chip] ?? 0) + 1;
  }
  return counts;
}

/** "1 Projekt" / "{n} Projekte". */
export const projectCountLabel = (n: number): string => `${n} ${n === 1 ? 'Projekt' : 'Projekte'}`;
