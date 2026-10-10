// Typed loaders used by pages and sections. Selection logic is pure and lives in content-select.ts.
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { PUBLIC_DEMO } from 'astro:env/client';
import {
  adjacentProjects,
  filterFaqs,
  filterJobs,
  filterProjects,
  relatedProjects,
  sortByOrder,
  visibleTestimonials,
  type ProjectFilter,
} from './content-select';
import type { ServiceKey } from './content-schema';

export type Service = CollectionEntry<'services'>;
export type Project = CollectionEntry<'projects'>;
export type Testimonial = CollectionEntry<'testimonials'>;
export type Job = CollectionEntry<'jobs'>;
export type Faq = CollectionEntry<'faqs'>;

/** The curated site facts (settings entry `site`). */
export async function getSite() {
  const entry = await getEntry('settings', 'site');
  if (!entry) throw new Error('settings entry "site" is missing');
  return entry.data;
}

/** The 7 services in `order`. */
export async function getServices(): Promise<Service[]> {
  return sortByOrder(await getCollection('services'));
}

export async function getService(key: ServiceKey | string): Promise<Service | undefined> {
  return (await getServices()).find((s) => s.data.key === key);
}

/** Sorted projects, optionally by `featured`, `category` and `detailPage` (e.g. `{ detailPage: true }`). */
export async function getProjects(filter: ProjectFilter = {}): Promise<Project[]> {
  return filterProjects(await getCollection('projects'), filter);
}

export async function getProject(slug: string): Promise<Project | undefined> {
  return getEntry('projects', slug);
}

/** Previous and next project among those with a detail page (no wrap-around). */
export async function getAdjacentProjects(slug: string) {
  return adjacentProjects(await getCollection('projects'), slug);
}

/** Up to `n` other projects, same category first; never the current one. */
export async function getRelatedProjects(slug: string, n = 3): Promise<Project[]> {
  return relatedProjects(await getCollection('projects'), slug, n);
}

/** Demo: all testimonials. Production: only those with permission `erteilt`. */
export async function getTestimonials(): Promise<Testimonial[]> {
  return visibleTestimonials(await getCollection('testimonials'), PUBLIC_DEMO);
}

export async function getJobs(options: { active?: boolean } = {}): Promise<Job[]> {
  return filterJobs(await getCollection('jobs'), options);
}

export async function getFaqs(topic?: string): Promise<Faq[]> {
  return filterFaqs(await getCollection('faqs'), topic);
}

/** Resolves content references of a service (`{ id }`), in the order given. */
export async function getFaqsByRefs(refs: readonly { id: string }[]): Promise<Faq[]> {
  const all = await getCollection('faqs');
  return refs.flatMap((r) => all.filter((f) => f.id === r.id));
}

export async function getProjectsByRefs(refs: readonly { id: string }[]): Promise<Project[]> {
  const all = await getCollection('projects');
  return refs.flatMap((r) => all.filter((p) => p.id === r.id));
}
