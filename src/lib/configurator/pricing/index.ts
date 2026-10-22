// Pricing stub (docs/configurator.md §6). Never imported unless PUBLIC_PRICING === 'on', never
// shown in the demo. Returns null while any rate is null or the rules are disabled.
import { FINISH_LABEL, SPECIES } from '../furniture/species';
import type { Build } from '../furniture/types';
import type { ServiceTier } from '../service-area';
import { DEFAULT_RULES, type PricingRules, type Rate } from './rules';
import type { Position } from './types';

export interface PriceEstimate {
  /** Rounded to 50 € below 5 000 €, else to 100 €; gross, incl. VAT. */
  min: number;
  max: number;
  /** "inkl. 19 % MwSt." */
  vatNote: string;
  /** "unverbindliche Orientierung, kein Angebot" */
  disclaimer: string;
}

export interface EstimateState {
  tier?: ServiceTier | null;
}

/** All rates present (not null) → the rules are usable. */
export function rulesComplete(rules: PricingRules): boolean {
  const walk = (v: unknown): boolean =>
    v === null ? false : typeof v === 'object' ? Object.values(v as Record<string, unknown>).every(walk) : true;
  return rules.enabled && walk(rules);
}

const round = (v: number): number => {
  const step = v < 5000 ? 50 : 100;
  return Math.round(v / step) * step;
};

/** German number text: at most 2 decimals, decimal comma. */
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * The net workshop positions of a Build (docs/angebot.md §4.2): board area × rate, both faces × finish
 * rate, workshop hours per part, and the fittings from `derived`. Walls, handles and steel parts
 * (a Kufen-Stahl frame) are not priced: no board, finish or workshop rate fits them;
 * a part's area is its volume over its thinnest side, the board rate is the next thickness at or
 * below it (a 8 mm back is priced as 19 mm). Montage and Anfahrt are the caller's. The caller has
 * checked rulesComplete(); the empty fittings line is left out.
 */
export function buildPositions(build: Build, rules: PricingRules): Position[] {
  const r = (x: Rate): number => x as number;
  const p = build.params;
  let area = 0;
  let board = 0;
  let parts = 0;
  for (const part of build.parts) {
    if (part.role === 'wand' || part.role === 'griff' || part.surface === 'metall') continue;
    const [a, b, c] = part.size;
    const thickness = Math.min(a, b, c);
    const m2 = (a * b * c) / thickness / 1e6;
    const t: 19 | 25 | 40 = thickness >= 40 ? 40 : thickness >= 25 ? 25 : 19;
    area += m2;
    board += m2 * r(rules.boardPerM2[p.species][t]);
    parts++;
  }
  const hours = parts * r(rules.hoursPerPart);
  const d = build.derived;
  const fittings = d.doors + d.drawers + d.hinges;
  const positionen: Position[] = [
    { text: `Plattenmaterial ${SPECIES[p.species].name}, ${fmt(area)} m²`, menge: area, einheit: 'm²', netto: board },
    {
      text: `Oberfläche ${FINISH_LABEL[p.finish]}, ${fmt(2 * area)} m²`,
      menge: 2 * area,
      einheit: 'm²',
      netto: 2 * area * r(rules.finishPerM2[p.finish]),
    },
    {
      text: `Werkstatt, ${parts} ${parts === 1 ? 'Teil' : 'Teile'}`,
      menge: hours,
      einheit: 'h',
      netto: hours * r(rules.hourly),
    },
  ];
  if (fittings > 0) {
    positionen.push({
      text: `Beschläge (${d.doors} Türen, ${d.drawers} Schubkästen, ${d.hinges} Scharniere)`,
      menge: fittings,
      einheit: 'Stk.',
      netto: d.doors * r(rules.doorEach) + d.drawers * r(rules.drawerEach) + d.hinges * r(rules.hingeEach),
    });
  }
  return positionen;
}

export function estimate(
  state: EstimateState,
  build: Build,
  rules: PricingRules = DEFAULT_RULES,
): PriceEstimate | null {
  if (!rulesComplete(rules)) return null;
  const r = (x: Rate): number => x as number;
  let net = buildPositions(build, rules).reduce((s, p) => s + p.netto, 0);
  net += r(rules.anfahrt[state.tier ?? 'aussen']) + 4 * r(rules.montagePerHour);
  const gross = net * (1 + rules.vatPercent / 100);
  return {
    min: round(gross * 0.85),
    max: round(gross * 1.15),
    vatNote: `inkl. ${rules.vatPercent} % MwSt.`,
    disclaimer: 'unverbindliche Orientierung, kein Angebot',
  };
}

export { DEFAULT_RULES, type PricingRules } from './rules';
