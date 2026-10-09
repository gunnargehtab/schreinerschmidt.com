import { describe, expect, it } from 'vitest';
import { z } from 'astro/zod';
import { alt, fact, question, review, Seo, ServiceKey, Status } from '../../src/lib/content-schema';

describe('review', () => {
  it('defaults to needs-review', () => {
    expect(review.parse(undefined)).toEqual({ status: 'needs-review' });
  });
  it('accepts the three statuses and rejects others', () => {
    for (const s of ['confirmed', 'needs-review', 'placeholder']) {
      expect(Status.safeParse(s).success).toBe(true);
    }
    expect(review.safeParse({ status: 'ok' }).success).toBe(false);
  });
});

describe('fact()', () => {
  const f = fact(z.number());
  it('wraps a value with a status', () => {
    expect(f.parse({ value: 3, status: 'confirmed' })).toEqual({ value: 3, status: 'confirmed' });
  });
  it('requires the status and a valid value', () => {
    expect(f.safeParse({ value: 3 }).success).toBe(false);
    expect(f.safeParse({ value: 'x', status: 'confirmed' }).success).toBe(false);
  });
});

describe('Seo', () => {
  const ok = { title: 'Holzböden in Mannheim', description: 'x'.repeat(120) };
  it('accepts valid values', () => expect(Seo.safeParse(ok).success).toBe(true));
  it('limits the title to 45 characters', () => {
    expect(Seo.safeParse({ ...ok, title: 'x'.repeat(45) }).success).toBe(true);
    expect(Seo.safeParse({ ...ok, title: 'x'.repeat(46) }).success).toBe(false);
  });
  it('limits the description to 110–158 characters', () => {
    expect(Seo.safeParse({ ...ok, description: 'x'.repeat(109) }).success).toBe(false);
    expect(Seo.safeParse({ ...ok, description: 'x'.repeat(110) }).success).toBe(true);
    expect(Seo.safeParse({ ...ok, description: 'x'.repeat(158) }).success).toBe(true);
    expect(Seo.safeParse({ ...ok, description: 'x'.repeat(159) }).success).toBe(false);
  });
});

describe('ServiceKey', () => {
  it('accepts the seven services', () => {
    expect(ServiceKey.options).toHaveLength(7);
    expect(ServiceKey.safeParse('boeden').success).toBe(true);
  });
  it('rejects unknown keys', () => expect(ServiceKey.safeParse('dach').success).toBe(false));
});

describe('question', () => {
  it('must end with a question mark', () => {
    expect(question.safeParse('Wie lange dauert das?').success).toBe(true);
    expect(question.safeParse('Wie lange dauert das').success).toBe(false);
  });
});

describe('alt', () => {
  it('needs at least 12 characters', () => {
    expect(alt.safeParse('x'.repeat(11)).success).toBe(false);
    expect(alt.safeParse('x'.repeat(12)).success).toBe(true);
  });
});
