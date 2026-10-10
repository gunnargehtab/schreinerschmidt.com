// The parts of src/content/pages/ui.yaml used by the Referenzen pages.
import { z } from 'astro/zod';

export const uiReferenzenSchema = z.object({
  links: z.object({
    moreProjects: z.string(),
    allProjects: z.string(),
    prevProject: z.string(),
    nextProject: z.string(),
  }),
  filter: z.object({ label: z.string() }),
});

export type UiReferenzen = z.infer<typeof uiReferenzenSchema>;
