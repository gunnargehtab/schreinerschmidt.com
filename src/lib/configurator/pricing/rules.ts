// Pricing rules (docs/configurator.md §6). Every rate is null until the owner provides figures
// (docs/owner-checklist.md "Pricing rules"); with any rate missing, estimate() returns null.
import type { Board, Finish, Species } from '../furniture/types';
import type { ServiceTier } from '../service-area';

export type Rate = number | null;

export interface PricingRules {
  /** Hard switch: the module is compiled out unless PUBLIC_PRICING === 'on', and even then this gates it. */
  enabled: boolean;
  /** € per m² of board, by species and thickness. */
  boardPerM2: Record<Species, Record<Board, Rate>>;
  /** € per m² of visible surface, by finish. */
  finishPerM2: Record<Finish, Rate>;
  doorEach: Rate;
  drawerEach: Rate;
  hingeEach: Rate;
  hourly: Rate;
  /** Workshop hours per part. */
  hoursPerPart: Rate;
  montagePerHour: Rate;
  anfahrt: Record<ServiceTier, Rate>;
  vatPercent: number;
}

const perBoard = (): Record<Board, Rate> => ({ 19: null, 25: null, 40: null });

export const DEFAULT_RULES: PricingRules = {
  enabled: false,
  boardPerM2: {
    eiche: perBoard(),
    nussbaum: perBoard(),
    esche: perBoard(),
    kernbuche: perBoard(),
    kirsche: perBoard(),
  },
  finishPerM2: { 'natur-geoelt': null, 'weiss-geoelt': null, 'lack-matt': null },
  doorEach: null,
  drawerEach: null,
  hingeEach: null,
  hourly: null,
  hoursPerPart: null,
  montagePerHour: null,
  anfahrt: { kern: null, region: null, aussen: null },
  vatPercent: 19,
};
