// Structured outputs of the two Claude calls (docs/angebot.md §6.2). The zod schemas are sent as
// the JSON schema of `output_config.format` and parse the answer again on our side, so a count or a
// length over the limit makes the answer invalid (`parsed_output` null), whatever the model did.
//
// `Mengen` mirrors MaterialZeile/Mengen of src/lib/configurator/pricing/mengen.ts, including the
// `oberflaeche` and `beschlag` keys (§4.4). It carries quantities only: there is no amount field,
// not even for `pauschal` (Claude names no amounts, §1). Which keys a line needs (holz + staerke on
// `platte`, oberflaeche on `oberflaeche`, beschlag on `beschlag`, a begruendung on `pauschal`) and
// the hard upper bounds are enforced by preiseMengen(), which throws MengenFehler; a schema refine
// would make the whole Bewertung invalid for one bad line.
import { z } from 'zod';
import type {
  MaterialZeile as PricingZeile,
  Mengen as PricingMengen,
} from '../../../src/lib/configurator/pricing/mengen';

/** Text limits (characters). The guards (guards.ts) check the same numbers. */
export const TEXT_LIMITS = {
  einleitung: 600,
  naechster_schritt: 400,
  /** Every list item (gruende, risiken, …, leistung, nicht_enthalten). */
  item: 200,
  begruendung: 200,
  einheit: 20,
} as const;

/** List limits (items), §6.2. */
export const LIST_LIMITS = {
  gruende: 5,
  risiken: 5,
  fehlende_angaben: 8,
  rueckfragen: 5,
  leistung: 10,
  nicht_enthalten: 6,
} as const;

const item = z.string().max(TEXT_LIMITS.item);

export const MaterialZeile = z.object({
  art: z.enum(['platte', 'oberflaeche', 'beschlag', 'pauschal']),
  holz: z
    .enum(['eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche'])
    .optional()
    .describe('Required for art=platte: the species.'),
  staerke: z.literal([19, 25, 40]).optional().describe('Required for art=platte: board thickness in mm.'),
  oberflaeche: z
    .enum(['natur-geoelt', 'weiss-geoelt', 'lack-matt'])
    .optional()
    .describe('Required for art=oberflaeche: the finish.'),
  beschlag: z
    .enum(['tuer', 'schubkasten', 'scharnier'])
    .optional()
    .describe('Required for art=beschlag: door, drawer or hinge fitting.'),
  menge: z.number().describe('Quantity: m² for platte and oberflaeche, pieces for beschlag, 1 for pauschal.'),
  einheit: z.string().max(TEXT_LIMITS.einheit).describe('„m²“, „Stk.“ or „Pausch.“'),
  begruendung: z
    .string()
    .max(TEXT_LIMITS.begruendung)
    .describe('Why this line, German, one short line. Required for pauschal. No amounts.'),
});
export type MaterialZeile = z.infer<typeof MaterialZeile>;

export const Mengen = z.object({
  werkstatt_h: z.number().describe('Workshop hours for the whole project.'),
  montage_h: z.number().describe('On-site installation hours.'),
  material: z.array(MaterialZeile).describe('Material lines from the closed catalogue, at most 30.'),
});
export type Mengen = z.infer<typeof Mengen>;

export const Bewertung = z.object({
  spam: z.boolean(),
  machbarkeit: z.enum(['machbar', 'eingeschraenkt', 'nicht_machbar', 'unklar']),
  gruende: z.array(item).max(LIST_LIMITS.gruende).describe('Why, German, one line each.'),
  risiken: z.array(item).max(LIST_LIMITS.risiken),
  fehlende_angaben: z.array(item).max(LIST_LIMITS.fehlende_angaben),
  rueckfragen: z.array(item).max(LIST_LIMITS.rueckfragen).describe('Questions for the customer, Sie-form.'),
  passt_zum_betrieb: z.boolean(),
  mengen: Mengen.nullable(),
});
export type Bewertung = z.infer<typeof Bewertung>;

export const Angebotstext = z.object({
  einleitung: z.string().max(TEXT_LIMITS.einleitung).describe('At most 3 sentences.'),
  leistung: z.array(item).max(LIST_LIMITS.leistung),
  nicht_enthalten: z.array(item).max(LIST_LIMITS.nicht_enthalten),
  naechster_schritt: z.string().max(TEXT_LIMITS.naechster_schritt).describe('The Aufmaß appointment, no date.'),
});
export type Angebotstext = z.infer<typeof Angebotstext>;

/**
 * Claude's Mengen → the pricing input. zod infers optional keys as `T | undefined`; MaterialZeile of
 * mengen.ts (exactOptionalPropertyTypes) wants them absent, so undefined keys are dropped.
 */
export function toPricingMengen(m: Mengen): PricingMengen {
  return {
    werkstatt_h: m.werkstatt_h,
    montage_h: m.montage_h,
    material: m.material.map((z): PricingZeile => {
      const out: PricingZeile = { art: z.art, menge: z.menge, einheit: z.einheit, begruendung: z.begruendung };
      if (z.holz !== undefined) out.holz = z.holz;
      if (z.staerke !== undefined) out.staerke = z.staerke;
      if (z.oberflaeche !== undefined) out.oberflaeche = z.oberflaeche;
      if (z.beschlag !== undefined) out.beschlag = z.beschlag;
      return out;
    }),
  };
}
