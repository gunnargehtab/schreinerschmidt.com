// Schema for src/content/pages/konfigurator-danke.yaml (/konfigurator/danke/).
import { z } from 'astro/zod';
import { reviewable } from './index';

export const konfiguratorDankeSchema = z.object({
  danke: z.object({ title: z.string().max(38), text: z.string() }),
  next: reviewable({ h2: z.string(), steps: z.array(z.string()).min(1) }),
});

export type KonfiguratorDankeCopy = z.infer<typeof konfiguratorDankeSchema>;
