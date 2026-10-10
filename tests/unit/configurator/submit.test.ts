// Live-mode decisions of submit.ts (docs/configurator.md §5): the honeypot/time-trap and the
// mapping of a form.taxi answer to a German reason key. The subject line and the short id are in
// summary.test.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MIN_FILL_MS as CORE_MIN_FILL_MS } from '../../../src/scripts/configurator/state';
import { MIN_FILL_MS, isBot, reasonOf } from '../../../src/scripts/configurator/submit';

describe('isBot (honeypot + time-trap)', () => {
  it('fakes a success for a filled honeypot or a submit under 5 s', () => {
    expect(MIN_FILL_MS).toBe(5000);
    expect(MIN_FILL_MS).toBe(CORE_MIN_FILL_MS);
    expect(isBot('http://spam', 60_000)).toBe(true);
    expect(isBot(' ', 60_000)).toBe(false);
    expect(isBot('', 4999)).toBe(true);
    expect(isBot('', 5000)).toBe(false);
    expect(isBot('', -1)).toBe(true);
  });

  it('sends for real once a session was restored: the controller dates the clock MIN_FILL_MS back', () => {
    // controller.ts restore(…, stored = true): first = Date.now() - MIN_FILL_MS, so elapsed() is never
    // below the trap, even when the submit is the first interaction after a reload.
    const now = 1_760_000_000_000;
    const first = now - MIN_FILL_MS;
    expect(isBot('', now - first)).toBe(false);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60_000 }), (later) => {
        expect(isBot('', now + later - first)).toBe(false);
      }),
    );
  });
});

describe('reasonOf', () => {
  it('is null only for 2xx with success: true', () => {
    expect(reasonOf(200, { success: true })).toBeNull();
    expect(reasonOf(201, { success: true })).toBeNull();
    expect(reasonOf(200, { success: false })).toBe('rejected');
    expect(reasonOf(200, {})).toBe('rejected');
    expect(reasonOf(302, { success: true })).toBe('rejected');
  });

  it('rejects 4xx and success:false without a retry, retries 5xx as a network problem', () => {
    expect(reasonOf(400, {})).toBe('rejected');
    expect(reasonOf(422, { success: false })).toBe('rejected');
    expect(reasonOf(429, {})).toBe('rejected');
    expect(reasonOf(500, {})).toBe('network');
    expect(reasonOf(503, { success: true })).toBe('network');
  });

  it('only ever yields the reason keys that have a German line in the markup', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), fc.option(fc.boolean(), { nil: undefined }), (status, ok) => {
        const r = reasonOf(status, ok === undefined ? {} : { success: ok });
        expect(r === null || ['network', 'timeout', 'rejected', 'offline'].includes(r)).toBe(true);
      }),
    );
  });
});
