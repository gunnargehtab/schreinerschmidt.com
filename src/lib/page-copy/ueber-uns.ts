// Schema for src/content/pages/ueber-uns.yaml (the /ueber-uns/ page).
import { z } from 'astro/zod';
import { Status } from '../content-schema';
import { getPageCopy, pageSeo, reviewable } from './index';

const ueberUnsSchema = z.object({
  seo: pageSeo,
  hero: reviewable({ h1: z.string(), lead: z.string() }),
  values: z.array(z.object({ title: z.string(), text: z.string(), sketch: z.string() })).length(4),
  valuesReview: Status.optional(),
  valuesNote: z.string().optional(),
  team: reviewable({ h2: z.string(), text: z.string() }),
  milestones: z.array(reviewable({ year: z.number().int(), title: z.string(), text: z.string().optional() })).min(1),
  careersTeaser: reviewable({ h2: z.string(), text: z.string(), cta: z.string() }),
  ctaBand: reviewable({
    h2: z.string(),
    text: z.string(),
    ctaConfigurator: z.string(),
    ctaPhone: z.string(),
  }),
});

export type UeberUnsCopy = z.infer<typeof ueberUnsSchema>;

export const getUeberUnsCopy = (): Promise<UeberUnsCopy> => getPageCopy('ueber-uns', ueberUnsSchema);
