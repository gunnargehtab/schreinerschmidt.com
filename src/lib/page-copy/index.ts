// Typed access to the page copy in src/content/pages/*.yaml.
// The `pages` collection is deliberately loose; each page parses its own file with a schema
// defined next to this module (one file per page, e.g. ./kontakt.ts), so copy errors fail the
// build with a precise message and pages can be built in parallel without sharing a schema file.
import { getEntry } from 'astro:content';
import { z } from 'astro/zod';
import { Status } from '../content-schema';

/** Review marks the copywriter puts next to a block: `review: needs-review` + optional `note`. */
export const reviewMark = {
  review: Status.optional(),
  note: z.string().optional(),
};

/** An object schema that also accepts the copywriter's review marks. */
export const reviewable = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, ...reviewMark });

/** Page SEO block; Home omits the title (it is fixed in seo.ts). */
export const pageSeo = reviewable({
  title: z.string().max(38).optional(),
  description: z.string().min(110).max(158),
});

const MARKER = /\s*\[\[Platzhalter:[^\]]*\]\]/g;

/**
 * Removes `[[Platzhalter: …]]` markers from every string. They are notes for the owner, never public
 * copy: the Prüfliste lists them and the production guard blocks a release while they exist.
 */
export function stripMarkers(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(MARKER, '').trim();
  if (Array.isArray(value)) return value.map(stripMarkers);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripMarkers(v)]));
  }
  return value;
}

export async function getPageCopy<S extends z.ZodType>(id: string, schema: S): Promise<z.infer<S>> {
  const entry = await getEntry('pages', id);
  if (!entry) throw new Error(`Page copy "${id}" is missing (src/content/pages/${id}.yaml)`);
  const parsed = schema.safeParse(stripMarkers(entry.data));
  if (!parsed.success) {
    throw new Error(`Page copy "${id}" does not match its schema:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
