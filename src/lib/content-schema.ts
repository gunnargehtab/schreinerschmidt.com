// Shared zod pieces for the content collections. Free of astro:content so that
// JSON-LD, the Prüfliste and unit tests can import it.
import { z } from 'astro/zod';

export const Status = z.enum(['confirmed', 'needs-review', 'placeholder']);
export type Status = z.infer<typeof Status>;

/** Review flag on every entry. Defaults to `needs-review`. */
export const review = z
  .object({
    status: Status,
    note: z.string().optional(),
    source: z.string().optional(),
  })
  .default({ status: 'needs-review' });

/** Wraps an individual fact with its own review status. */
export const fact = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    status: Status,
    note: z.string().optional(),
    source: z.string().optional(),
  });

export const ServiceKey = z.enum(['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen']);
export type ServiceKey = z.infer<typeof ServiceKey>;

export const Seo = z.object({
  // 38 + " | Schreinerei Schmidt" (22) = the 60-character title limit (architecture §7).
  title: z.string().max(38),
  description: z.string().min(110).max(158),
});

/** Alt text for meaningful images. */
export const alt = z.string().min(12);

/** FAQ questions must read as questions. */
export const question = z.string().min(5).endsWith('?');

export const Hours = z.object({
  days: z.array(z.enum(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'])).min(1),
  opens: z.string().regex(/^\d{2}:\d{2}$/),
  closes: z.string().regex(/^\d{2}:\d{2}$/),
});

export const TestimonialSource = z.enum(['google', 'alte-website', 'direkt']);
export const WoodOrigin = z.enum(['heimisch', 'europaeisch', 'uebersee']);
export const Finish = z.enum(['natur-geoelt', 'weiss-geoelt', 'lack-matt']);
export const Consent = z.enum(['erteilt', 'ausstehend']);
