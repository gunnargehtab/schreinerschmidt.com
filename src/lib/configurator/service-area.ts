// Service-area hint for the PLZ field (docs/configurator.md §1 "Service areas"). It never blocks
// the form; the wizard shows the message in `output#einzugsgebiet`.
//
// OWNER TO CONFIRM (docs/owner-checklist.md "Service area and PLZ tiers"): the tiers below are the
// planning assumption (core: Mannheim 68159–68309 and Ludwigshafen 67059–67071; region: 67/68/69xxx).

export type ServiceTier = 'kern' | 'region' | 'aussen';

export interface ServiceArea {
  tier: ServiceTier;
  /** German sentence for the live hint. */
  message: string;
}

const CORE: [number, number][] = [
  [68159, 68309], // Mannheim
  [67059, 67071], // Ludwigshafen
];

export const SERVICE_MESSAGE: Record<ServiceTier, string> = {
  kern: 'Die Adresse liegt in unserem Einzugsgebiet.',
  region: 'Rhein-Neckar – Anfahrt nach Absprache.',
  aussen: 'Außerhalb unseres üblichen Gebiets – fragen Sie gern trotzdem.',
};

/** Classifies a five-digit PLZ; anything that is not five digits counts as unknown → `null`. */
export function serviceArea(plz: string): ServiceArea | null {
  const s = plz.trim();
  if (!/^\d{5}$/.test(s)) return null;
  const n = Number(s);
  const tier: ServiceTier = CORE.some(([lo, hi]) => n >= lo && n <= hi)
    ? 'kern'
    : /^6[789]/.test(s)
      ? 'region'
      : 'aussen';
  return { tier, message: SERVICE_MESSAGE[tier] };
}
