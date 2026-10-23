// Schema for src/content/pages/konfigurator-danke.yaml (/konfigurator/danke/).
import { z } from 'astro/zod';
import { reviewable } from './index';

/** One step of the live list, with its own review mark (docs/angebot.md §9). */
const liveStep = reviewable({ when: z.string().optional(), title: z.string() });

export const konfiguratorDankeSchema = z.object({
  danke: z.object({ title: z.string().max(38), text: z.string() }),
  next: reviewable({ h2: z.string(), steps: z.array(z.string()).min(1) }),
  /** „Was passiert jetzt?“ when the build posts to the assistant (Preisrahmen); `next` otherwise. */
  nextLive: z.object({ h2: z.string(), steps: z.array(liveStep).min(1) }),
});

export type KonfiguratorDankeCopy = z.infer<typeof konfiguratorDankeSchema>;
