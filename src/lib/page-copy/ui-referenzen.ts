// The parts of src/content/pages/ui.yaml used by the Referenzen pages.
import { z } from 'astro/zod';

export const uiReferenzenSchema = z.object({
  links: z.object({
    moreProjects: z.string(),
    allProjects: z.string(),
    prevProject: z.string(),
    nextProject: z.string(),
  }),
  filter: z.object({
    label: z.string(),
    statusOne: z.string(),
    statusMany: z.string(),
  }),
});

export type UiReferenzen = z.infer<typeof uiReferenzenSchema>;

/** "1 Projekt" / "{n} Projekte" from the ui.yaml texts. */
export const projectCount = (ui: UiReferenzen, n: number): string =>
  n === 1 ? ui.filter.statusOne : ui.filter.statusMany.replace('{n}', String(n));
