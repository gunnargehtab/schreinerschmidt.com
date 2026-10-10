import { describe, expect, it } from 'vitest';
import { marked, markOf } from '../../src/lib/review-mark';

describe('review marks', () => {
  it('returns the status only for unconfirmed copy', () => {
    expect(markOf('needs-review')).toBe('needs-review');
    expect(markOf('placeholder')).toBe('placeholder');
    expect(markOf('confirmed')).toBeUndefined();
    expect(markOf(undefined)).toBeUndefined();
  });

  it('reads the review key of a copy block', () => {
    expect(marked({ review: 'needs-review' })).toBe('needs-review');
    expect(marked({})).toBeUndefined();
  });
});
