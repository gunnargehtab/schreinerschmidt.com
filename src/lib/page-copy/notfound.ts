// Schema for src/content/pages/404.yaml. Hrefs are site-relative and go through url().
import { z } from 'astro/zod';

export const notFoundSchema = z.object({
  eyebrow: z.string(),
  h1: z.string(),
  text: z.string(),
  home: z.string(),
  sectionLinks: z.array(z.object({ label: z.string(), href: z.string() })).length(4),
  figcaption: z.string(),
});

export type NotFoundCopy = z.infer<typeof notFoundSchema>;
