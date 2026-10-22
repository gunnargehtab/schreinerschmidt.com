// Pilot rates for the Möbel branch (docs/angebot.md §4.1 and §4.2). Backend only: the site keeps
// DEFAULT_RULES (all null) and never imports this module.
//
// Pilot-Annahmen, vom Inhaber zu bestätigen.
// PLACEHOLDER: every figure is a pilot assumption (docs/owner-checklist.md "Angebot pilot").
import { SHARED } from './common';
import type { PricingRules } from './rules';

export const PILOT_RULES: PricingRules = {
  enabled: true,
  /** € net per m² of board, by species and thickness 19 / 25 / 40 mm (§4.2). */
  boardPerM2: {
    eiche: { 19: 95, 25: 120, 40: 180 },
    nussbaum: { 19: 150, 25: 190, 40: 280 },
    esche: { 19: 85, 25: 105, 40: 160 },
    kernbuche: { 19: 80, 25: 100, 40: 150 },
    kirsche: { 19: 120, 25: 150, 40: 230 },
  },
  /** € net per m² of visible surface, both faces of every board (§4.2). */
  finishPerM2: { 'natur-geoelt': 18, 'weiss-geoelt': 22, 'lack-matt': 35 },
  doorEach: 45,
  drawerEach: 85,
  hingeEach: 12,
  hourly: SHARED.werkstattStunde,
  /** Workshop hours per part (§4.2). */
  hoursPerPart: 1.2,
  montagePerHour: SHARED.montageStunde,
  anfahrt: { ...SHARED.anfahrt },
  vatPercent: SHARED.vatPercent,
};
