// Shared types of the Angebot price calculation (docs/angebot.md §4.5). Pure data; used by the
// backend (`assistant/`) only. The site never imports pricing code (PUBLIC_PRICING stays off).
import type { Values } from '../fields';
import type { ServiceTier } from '../service-area';

/** Range half-width (§4.1): complete data ± 15 %, unknown inputs ± 25 %, Claude-quantified ± 30 %. */
export type Breite = 0.15 | 0.25 | 0.3;

export interface Position {
  /** German line for the owner, e.g. „Stabparkett, 24 m²“. */
  text: string;
  menge: number;
  /** „m²“, „Stk.“, „h“, „lfm“, „Pausch.“ */
  einheit: string;
  /** Net €, unrounded. */
  netto: number;
}

export interface Kalkulation {
  /** Net and gross midpoint, unrounded. */
  netto: number;
  brutto: number;
  /** Gross range, rounded with roundRange() (§4.1). */
  min: number;
  max: number;
  breite: Breite;
  quelle: 'regeln' | 'ki-mengen';
  /** Owner only, never sent to the customer. Includes Anfahrt and Montage lines. */
  positionen: Position[];
  /** German assumptions, shown to the owner and in the customer's Angebot. */
  annahmen: string[];
  /** Hash of the rate tables used (stored with the case). */
  regelVersion: string;
}

export interface Ctx {
  /** Service tier from the PLZ; unknown PLZ → treated as 'aussen' with an assumption line. */
  tier: ServiceTier | null;
}

/**
 * A branch calculator: validated, effective form values → a Kalkulation, or null when the branch
 * cannot be priced by rules (the case goes to Claude quantities, §4.4).
 */
export type Calculator = (v: Values, ctx: Ctx) => Kalkulation | null;
