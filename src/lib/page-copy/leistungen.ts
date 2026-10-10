// Schema for src/content/pages/leistungen.yaml (the /leistungen/ overview).
import { z } from 'astro/zod';
import { getPageCopy, pageSeo, reviewable } from './index';

const leistungenSchema = z.object({
  seo: pageSeo,
  hero: reviewable({ h1: z.string(), lead: z.string() }),
  intro: reviewable({ text: z.string() }),
  sustainabilityTeaser: reviewable({ h2: z.string(), text: z.string() }),
  faq: reviewable({ h2: z.string() }),
  ctaBand: reviewable({
    h2: z.string(),
    text: z.string(),
    ctaConfigurator: z.string(),
  }),
});

export type LeistungenCopy = z.infer<typeof leistungenSchema>;

export const getLeistungenCopy = (): Promise<LeistungenCopy> => getPageCopy('leistungen', leistungenSchema);

// The five "Ablauf" steps are written once, on the Home page (home.yaml `process`). Both Leistungen
// pages reuse them; this reads only that block so it doesn't depend on Home's own schema.
const processSchema = z.looseObject({
  process: reviewable({
    h2: z.string(),
    lead: z.string(),
    steps: z.array(z.object({ key: z.string(), title: z.string(), text: z.string() })).length(5),
  }),
});

export async function getProcessCopy() {
  return (await getPageCopy('home', processSchema)).process;
}
