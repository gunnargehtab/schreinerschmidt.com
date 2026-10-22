// Dispatcher of the Angebot calculation (docs/angebot.md §4): rule-based branches go to their
// calculator, everything else (or a calculator that returns null) needs Claude quantities (§4.4).
import type { Values } from '../fields';
import { boden } from './branches/boden';
import { fenster } from './branches/fenster';
import { terrasse } from './branches/terrasse';
import { treppe } from './branches/treppe';
import { tuer } from './branches/tuer';
import { moebel } from './moebel';
import type { Calculator, Ctx, Kalkulation } from './types';

const CALCULATORS: Record<string, Calculator> = { moebel, boden, treppe, fenster, tuer, terrasse };

/** Project types that have a rule-based calculator (altbau, sonstiges and unknown types do not). */
export const isRuleBased = (typ: string | undefined): boolean =>
  typ !== undefined && Object.prototype.hasOwnProperty.call(CALCULATORS, typ);

export type KalkulierenResult = { kind: 'regeln'; kalkulation: Kalkulation } | { kind: 'mengen-noetig' };

export function kalkulieren(v: Values, ctx: Ctx): KalkulierenResult {
  const typ = typeof v.typ === 'string' ? v.typ : undefined;
  const calc = typ !== undefined && isRuleBased(typ) ? CALCULATORS[typ] : undefined;
  const k = calc ? calc(v, ctx) : null;
  return k ? { kind: 'regeln', kalkulation: k } : { kind: 'mengen-noetig' };
}
