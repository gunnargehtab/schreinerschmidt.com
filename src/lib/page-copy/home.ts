// Schema for src/content/pages/home.yaml (the Home page). The `process` block is read separately by
// getProcessCopy() in ./leistungen, because the Leistungen pages reuse it; it is only passed through here.
import { z } from 'astro/zod';
import { getPageCopy, pageSeo, reviewable } from './index';

const cta = { cta: z.string() };

const homeSchema = z.object({
  seo: pageSeo,
  hero: reviewable({
    eyebrow: z.string(),
    h1Before: z.string(),
    h1Em: z.string(),
    h1After: z.string(),
    lead: z.string(),
    ctaPrimary: z.string(),
    ctaSecondary: z.string(),
    /** The old site's slogan, kept until the owner decides (docs/owner-checklist.md). Not rendered. */
    legacyH1: z
      .object({ h1Before: z.string(), h1Em: z.string(), h1After: z.string(), note: z.string().optional() })
      .optional(),
  }),
  stats: reviewable({
    h2: z.string(),
    items: z.array(z.object({ key: z.string(), label: z.string(), note: z.string().optional() })),
  }),
  services: reviewable({ h2: z.string(), lead: z.string() }),
  sketchPhoto: reviewable({ h2: z.string(), text: z.string() }),
  process: z.looseObject({}),
  projects: reviewable({ h2: z.string(), lead: z.string(), ...cta }),
  herkunft: reviewable({
    h2: z.string(),
    lead: z.string(),
    claims: z.array(reviewable({ text: z.string() })).min(1),
  }),
  testimonials: reviewable({ h2: z.string() }),
  configurator: reviewable({ h2: z.string(), text: z.string(), ...cta }),
  careers: reviewable({ h2: z.string(), text: z.string(), ...cta }),
  ctaBand: reviewable({
    h2: z.string(),
    text: z.string(),
    ctaConfigurator: z.string(),
  }),
});

export type HomeCopy = z.infer<typeof homeSchema>;

export const getHomeCopy = (): Promise<HomeCopy> => getPageCopy('home', homeSchema);
