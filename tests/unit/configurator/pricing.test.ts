// Pricing stub (docs/configurator.md §6): disabled → null; every rate null → null.
import { describe, expect, it } from 'vitest';
import { generate } from '../../../src/lib/configurator/furniture';
import { DEFAULT_RULES, estimate, rulesComplete, type PricingRules } from '../../../src/lib/configurator/pricing';
import type { CarcassParams } from '../../../src/lib/configurator/furniture/types';

const REGAL: CarcassParams = {
  kind: 'regal',
  width: 1200,
  height: 2000,
  depth: 350,
  board: 19,
  front: 'offen',
  base: { type: 'sockel', height: 80 },
  back: 'eingenutet',
  shelvesPerBay: 'auto',
  handle: 'grifflos',
  species: 'eiche',
  finish: 'natur-geoelt',
};

const build = generate(REGAL);

const nulls = (o: unknown): number =>
  o === null ? 1 : typeof o === 'object' ? Object.values(o as object).reduce<number>((s, v) => s + nulls(v), 0) : 0;

describe('pricing', () => {
  it('ships disabled with every rate null', () => {
    expect(DEFAULT_RULES.enabled).toBe(false);
    expect(nulls(DEFAULT_RULES)).toBeGreaterThan(20);
    expect(rulesComplete(DEFAULT_RULES)).toBe(false);
  });

  it('estimate() returns null when disabled or incomplete', () => {
    expect(estimate({ tier: 'kern' }, build)).toBeNull();
    expect(estimate({}, build, { ...DEFAULT_RULES, enabled: true })).toBeNull();
    const almost = complete();
    almost.anfahrt.region = null;
    expect(estimate({ tier: 'region' }, build, almost)).toBeNull();
  });

  it('with complete rules it returns a rounded gross range with the legal notes', () => {
    const r = estimate({ tier: 'kern' }, build, complete())!;
    expect(r).not.toBeNull();
    expect(r.min).toBeLessThan(r.max);
    expect(r.min % 50).toBe(0);
    expect(r.max % 50).toBe(0);
    expect(r.vatNote).toBe('inkl. 19 % MwSt.');
    expect(r.disclaimer).toBe('unverbindliche Orientierung, kein Angebot');
    const big = estimate({}, generate({ ...REGAL, width: 3000, height: 2600, board: 40 }), complete())!;
    expect(big.max).toBeGreaterThan(5000);
    expect(big.max % 100).toBe(0);
  });
});

function complete(): PricingRules {
  const fill = (o: unknown): unknown =>
    o === null
      ? 100
      : typeof o === 'object'
        ? Object.fromEntries(Object.entries(o as object).map(([k, v]) => [k, fill(v)]))
        : o;
  return { ...(fill(DEFAULT_RULES) as PricingRules), enabled: true };
}
