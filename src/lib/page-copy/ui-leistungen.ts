// The keys of src/content/pages/ui.yaml that the Leistungen pages use (own schema file, so other
// pages can declare theirs without sharing one).
import { z } from 'astro/zod';
import { getPageCopy } from './index';

const uiLeistungenSchema = z.looseObject({
  ctaBand: z.looseObject({
    h2: z.string(),
    text: z.string(),
    ctaConfigurator: z.string(),
  }),
  links: z.looseObject({
    moreProjects: z.string(),
  }),
});

export type UiLeistungen = z.infer<typeof uiLeistungenSchema>;

export const getUiLeistungen = (): Promise<UiLeistungen> => getPageCopy('ui', uiLeistungenSchema);
