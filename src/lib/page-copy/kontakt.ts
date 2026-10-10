// Schema for src/content/pages/kontakt.yaml (Kontakt and /kontakt/danke/). NAP comes from settings.yaml.
import { z } from 'astro/zod';
import { pageSeo, reviewable } from './index';

const option = z.object({ value: z.string(), label: z.string() });

export const kontaktSchema = z.object({
  seo: pageSeo.extend({ title: z.string().max(38) }),
  hero: z.object({ h1: z.string(), lead: z.string() }),
  actions: z.object({ call: z.string(), mail: z.string(), route: z.string() }),
  form: z.object({
    h2: z.string(),
    lead: z.string(),
    privacyNote: z.string(),
    privacyLinkLabel: z.string(),
    demoNotice: z.string(),
    fields: z.object({
      name: z.string(),
      email: z.string(),
      phone: z.string(),
      plz: z.string(),
      ort: z.string(),
      message: z.string(),
      topic: z.string(),
    }),
    topicOptions: z.array(option).min(1),
    submit: z.string(),
    success: z.string(),
    errors: z.record(z.string(), z.string()),
  }),
  address: z.object({ h2: z.string() }),
  /** The hours come from settings.yaml; `remark` is the hours-free sentence below them. */
  hours: reviewable({ h2: z.string(), remark: z.string() }),
  map: z.object({ alt: z.string(), attribution: z.string(), linkLabel: z.string() }),
  danke: z.object({ title: z.string().max(38), text: z.string() }),
});

export type KontaktCopy = z.infer<typeof kontaktSchema>;
