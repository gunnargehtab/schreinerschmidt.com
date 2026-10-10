// Copy of the Referenzen overview (src/content/pages/referenzen.yaml).
import { z } from 'astro/zod';
import { pageSeo, reviewable } from './index';

export const referenzenSchema = z.object({
  seo: pageSeo,
  hero: reviewable({ h1: z.string(), lead: z.string() }),
  detail: z.object({ gallery: z.string(), beforeAfter: z.string() }),
  ctaBand: z.object({ h2: z.string(), text: z.string() }),
});

export type ReferenzenCopy = z.infer<typeof referenzenSchema>;
