// Pricing stub (docs/configurator.md §6). Never imported unless PUBLIC_PRICING === 'on', never
// shown in the demo. Returns null while any rate is null or the rules are disabled.
import type { Build } from '../furniture/types';
import type { ServiceTier } from '../service-area';
import { DEFAULT_RULES, type PricingRules, type Rate } from './rules';

export interface PriceEstimate {
  /** Rounded to 50 € below 5 000 €, else to 100 €; gross, incl. VAT. */
  min: number;
  max: number;
  /** "inkl. 19 % MwSt." */
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

export function estimate(
  state: EstimateState,
  build: Build,
  rules: PricingRules = DEFAULT_RULES,
): PriceEstimate | null {
  if (!rulesComplete(rules)) return null;
  const r = (x: Rate): number => x as number;
  const p = build.params;
  let net = 0;
  for (const part of build.parts) {
    if (part.role === 'wand' || part.role === 'griff') continue;
    const [a, b, c] = part.size;
    const thickness = Math.min(a, b, c);
    const area = (a * b * c) / thickness / 1e6;
    const board: 19 | 25 | 40 = thickness >= 40 ? 40 : thickness >= 25 ? 25 : 19;
    net += area * r(rules.boardPerM2[p.species][board]) + 2 * area * r(rules.finishPerM2[p.finish]);
    net += r(rules.hoursPerPart) * r(rules.hourly);
  }
  const d = build.derived;
  net += d.doors * r(rules.doorEach) + d.drawers * r(rules.drawerEach) + d.hinges * r(rules.hingeEach);
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
