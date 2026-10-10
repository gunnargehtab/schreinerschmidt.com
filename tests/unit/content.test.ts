import { describe, expect, it } from 'vitest';
import {
  adjacentProjects,
  filterFaqs,
  filterJobs,
  filterProjects,
  relatedProjects,
  sortByOrder,
  sortProjects,
  visibleTestimonials,
  type ProjectLike,
} from '../../src/lib/content-select';
import { rgbToHex } from '../../src/lib/dominant-color';

const project = (
  id: string,
  year: number | undefined,
  extra: Partial<ProjectLike['data']> = {},
): ProjectLike & { id: string } => ({
  id,
  data: { title: id, year, categories: ['moebel'], featured: false, detailPage: true, ...extra },
});

describe('sortByOrder', () => {
  it('sorts ascending by order without touching the input', () => {
    const input = [{ data: { order: 3 } }, { data: { order: 1 } }, { data: { order: 2 } }];
    expect(sortByOrder(input).map((i) => i.data.order)).toEqual([1, 2, 3]);
    expect(input.map((i) => i.data.order)).toEqual([3, 1, 2]);
  });
});

describe('projects', () => {
  const list = [
    project('a-2022', 2022),
    project('b-2024', 2024, { featured: true, categories: ['boeden'] }),
    project('c-undated', undefined, { featured: true }),
    project('d-2024', 2024, { categories: ['moebel', 'treppen'], detailPage: false }),
  ];

  it('sorts newest first, undated last, ties by title', () => {
    expect(sortProjects(list).map((p) => p.id)).toEqual(['b-2024', 'd-2024', 'a-2022', 'c-undated']);
  });

  it('filters by featured and category', () => {
    expect(filterProjects(list, { featured: true }).map((p) => p.id)).toEqual(['b-2024', 'c-undated']);
    expect(filterProjects(list, { category: 'treppen' }).map((p) => p.id)).toEqual(['d-2024']);
    expect(filterProjects(list, { featured: true, category: 'boeden' }).map((p) => p.id)).toEqual(['b-2024']);
    expect(filterProjects(list)).toHaveLength(4);
  });

  it('finds the previous and next project among those with a detail page', () => {
    // Detail pages in order: b-2024, a-2022, c-undated.
    expect(adjacentProjects(list, 'a-2022')).toMatchObject({ prev: { id: 'b-2024' }, next: { id: 'c-undated' } });
    expect(adjacentProjects(list, 'b-2024').prev).toBeNull();
    expect(adjacentProjects(list, 'c-undated').next).toBeNull();
    expect(adjacentProjects(list, 'unknown')).toEqual({ prev: null, next: null });
    expect(adjacentProjects(list, 'd-2024')).toEqual({ prev: null, next: null });
  });

  it('picks related projects: never the current one, same category first', () => {
    const related = relatedProjects(list, 'b-2024', 3);
    expect(related.map((p) => p.id)).not.toContain('b-2024');
    expect(related).toHaveLength(3);
    const moebel = relatedProjects(list, 'a-2022', 2).map((p) => p.id);
    expect(moebel).toEqual(['d-2024', 'c-undated']);
  });
});

describe('visibleTestimonials', () => {
  const items = [{ data: { permission: 'erteilt' as const } }, { data: { permission: 'ausstehend' as const } }];

  it('shows everything in the demo', () => {
    expect(visibleTestimonials(items, true)).toHaveLength(2);
  });

  it('shows only permitted quotes in production', () => {
    const shown = visibleTestimonials(items, false);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.data.permission).toBe('erteilt');
  });
});

describe('filterJobs', () => {
  const jobs = [
    { data: { active: true, datePosted: new Date('2026-01-01') } },
    { data: { active: false, datePosted: new Date('2026-03-01') } },
    { data: { active: true, datePosted: new Date('2026-02-01') } },
  ];

  it('returns newest first and filters on active', () => {
    expect(filterJobs(jobs).map((j) => j.data.datePosted.getMonth())).toEqual([2, 1, 0]);
    expect(filterJobs(jobs, { active: true })).toHaveLength(2);
    expect(filterJobs(jobs, { active: false })).toHaveLength(1);
  });
});

describe('filterFaqs', () => {
  const faqs = [
    { data: { order: 2, topics: ['boeden'] } },
    { data: { order: 1, topics: ['ablauf', 'beratung'] } },
    { data: { order: 3, topics: ['boeden', 'altbau'] } },
  ];

  it('sorts by order and filters by topic', () => {
    expect(filterFaqs(faqs).map((f) => f.data.order)).toEqual([1, 2, 3]);
    expect(filterFaqs(faqs, 'boeden').map((f) => f.data.order)).toEqual([2, 3]);
    expect(filterFaqs(faqs, 'fenster')).toEqual([]);
  });
});

describe('rgbToHex', () => {
  it('formats and clamps', () => {
    expect(rgbToHex({ r: 255, g: 251, b: 245 })).toBe('#fffbf5');
    expect(rgbToHex({ r: -4, g: 0.4, b: 300 })).toBe('#0000ff');
  });
});
