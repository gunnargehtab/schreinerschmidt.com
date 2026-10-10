// Pure selection logic behind src/lib/content.ts (sorting, adjacency, mode filter). No astro:content
// here, so it can run in unit tests. Loaders live in content.ts.

export interface HasOrder {
  data: { order: number };
}

/** Ascending by `data.order`; a stable copy. */
export function sortByOrder<T extends HasOrder>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.data.order - b.data.order);
}

export interface ProjectLike {
  id: string;
  data: {
    title: string;
    year?: number | undefined;
    categories: readonly string[];
    featured: boolean;
    detailPage: boolean;
  };
}

/** Newest year first, undated last, then by title (German collation) for a stable order. */
export function sortProjects<T extends ProjectLike>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) => {
    const ya = a.data.year ?? Number.NEGATIVE_INFINITY;
    const yb = b.data.year ?? Number.NEGATIVE_INFINITY;
    if (ya !== yb) return ya > yb ? -1 : 1;
    return a.data.title.localeCompare(b.data.title, 'de');
  });
}

export interface ProjectFilter {
  featured?: boolean | undefined;
  category?: string | undefined;
}

export function filterProjects<T extends ProjectLike>(projects: readonly T[], filter: ProjectFilter = {}): T[] {
  return sortProjects(projects).filter(
    (p) =>
      (filter.featured === undefined || p.data.featured === filter.featured) &&
      (filter.category === undefined || p.data.categories.includes(filter.category)),
  );
}

/**
 * Previous and next project for the detail-page navigation. Only projects with a detail page take
 * part; the ends do not wrap (the first has no `prev`, the last no `next`). Unknown slug: both null.
 */
export function adjacentProjects<T extends ProjectLike>(
  projects: readonly T[],
  slug: string,
): { prev: T | null; next: T | null } {
  const list = sortProjects(projects).filter((p) => p.data.detailPage);
  const i = list.findIndex((p) => p.id === slug);
  if (i < 0) return { prev: null, next: null };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

/** Up to `n` more projects for "Weitere Projekte": never the current one, same category first. */
export function relatedProjects<T extends ProjectLike>(projects: readonly T[], slug: string, n = 3): T[] {
  const current = projects.find((p) => p.id === slug);
  const others = sortProjects(projects).filter((p) => p.id !== slug);
  const shared = (p: T) => current?.data.categories.some((c) => p.data.categories.includes(c)) ?? false;
  return [...others.filter(shared), ...others.filter((p) => !shared(p))].slice(0, n);
}

export interface TestimonialLike {
  data: { permission: 'erteilt' | 'ausstehend' };
}

/** Demo: everything. Production: only quotes with permission (`erteilt`), plan §3.2. */
export function visibleTestimonials<T extends TestimonialLike>(items: readonly T[], demo: boolean): T[] {
  return demo ? [...items] : items.filter((t) => t.data.permission === 'erteilt');
}

export interface JobLike {
  data: { active: boolean; datePosted: Date };
}

/** Newest first; `active` filters on the flag when given. */
export function filterJobs<T extends JobLike>(jobs: readonly T[], { active }: { active?: boolean } = {}): T[] {
  return jobs
    .filter((j) => active === undefined || j.data.active === active)
    .sort((a, b) => b.data.datePosted.getTime() - a.data.datePosted.getTime());
}

export interface FaqLike {
  data: { order: number; topics: readonly string[] };
}

/** Sorted by `order`; with a topic only the questions tagged with it. */
export function filterFaqs<T extends FaqLike>(faqs: readonly T[], topic?: string): T[] {
  return sortByOrder(faqs).filter((f) => topic === undefined || f.data.topics.includes(topic));
}
