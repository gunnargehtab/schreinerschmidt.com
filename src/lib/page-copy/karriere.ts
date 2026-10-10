// Schema for src/content/pages/karriere.yaml (Karriere overview and /karriere/danke/).
import { z } from 'astro/zod';
import { pageSeo, reviewable } from './index';

const option = z.object({ value: z.string(), label: z.string() });

export const karriereSchema = z.object({
  seo: pageSeo.extend({ title: z.string().max(38) }),
  hero: reviewable({ h1: z.string(), lead: z.string() }),
  benefits: z.array(reviewable({ title: z.string(), text: z.string() })).min(1),
  jobs: reviewable({ h2: z.string(), lead: z.string() }),
  application: reviewable({
    h2: z.string(),
    lead: z.string(),
    callCta: z.string(),
    privacyNote: z.string(),
    privacyLinkLabel: z.string(),
    demoNotice: z.string(),
    fields: z.object({
      name: z.string(),
      email: z.string(),
      phone: z.string(),
      position: z.string(),
      message: z.string(),
      cv: z.string(),
      cvHint: z.string(),
    }),
    positions: z.array(option).min(1),
    submit: z.string(),
    success: z.string(),
  }),
  faq: z.array(reviewable({ question: z.string().endsWith('?'), answer: z.string() })).min(1),
  danke: z.object({ title: z.string().max(38), text: z.string() }),
});

export type KarriereCopy = z.infer<typeof karriereSchema>;
