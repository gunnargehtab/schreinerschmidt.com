// Form messages and the pure spam / file-size decisions of src/scripts/forms/enhance.ts
// (docs/architecture.md §8, §11). The DOM behaviour is covered by tests/e2e/forms.spec.ts.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MIN_FILL_MS, fileTooBig, isSpam, tooFast } from '../../src/scripts/forms/enhance';
import {
  FILE_TOO_LARGE,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  MESSAGES,
  defaultMessage,
} from '../../src/scripts/forms/messages.de';

const NNBSP = ' ';

describe('messages.de', () => {
  const texts = [...Object.values(MESSAGES).map((m) => (typeof m === 'function' ? m(10) : m)), FILE_TOO_LARGE];

  it.each(texts)('"%s" is a German sentence without straight quotes or " - "', (text) => {
    expect(text).toMatch(/^[A-ZÄÖÜ]/);
    expect(text).toMatch(/\.$/);
    expect(text).not.toMatch(/["']/);
    expect(text).not.toContain(' - ');
    expect(text).not.toMatch(/\s{2,}/);
  });

  it('formats the file limit with U+202F between number and unit', () => {
    expect(MAX_FILE_MB).toBe(10);
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(FILE_TOO_LARGE).toContain(`10${NNBSP}MB`);
  });

  it('keeps "z. B." on one line', () => {
    expect(MESSAGES.email).toContain('z. B.');
  });

  it('names the minimum length', () => {
    expect(MESSAGES.tooShort(10)).toBe('Bitte geben Sie mindestens 10 Zeichen ein.');
  });

  it.each([
    [{ type: 'text' }, MESSAGES.required],
    [{ type: 'tel' }, MESSAGES.required],
    [{ type: 'textarea' }, MESSAGES.required],
    [{ type: 'email' }, MESSAGES.email],
    [{ type: 'email', minLength: 5 }, MESSAGES.email],
    [{ type: 'text', autocomplete: 'postal-code', pattern: '[0-9]{5}' }, MESSAGES.plz],
    [{ type: 'text', pattern: '[A-Z]+' }, MESSAGES.pattern],
    [{ type: 'textarea', minLength: 20 }, MESSAGES.tooShort(20)],
    [{ type: 'textarea', minLength: 0 }, MESSAGES.required],
    [{ type: 'radio' }, MESSAGES.choose],
    [{ type: 'select' }, MESSAGES.choose],
    [{ type: 'select-one' }, MESSAGES.choose],
    [{ type: 'checkbox' }, MESSAGES.confirm],
    [{ type: 'file' }, MESSAGES.file],
  ])('defaultMessage(%j)', (context, expected) => {
    expect(defaultMessage(context)).toBe(expected);
  });
});

describe('time-trap', () => {
  it('waits 3 s', () => {
    expect(MIN_FILL_MS).toBe(3000);
  });

  it('treats a submit without any interaction as too fast', () => {
    expect(tooFast(undefined, 1_000_000)).toBe(true);
  });

  it('is too fast below 3 s and fine from 3 s on', () => {
    expect(tooFast(1000, 1000)).toBe(true);
    expect(tooFast(1000, 3999)).toBe(true);
    expect(tooFast(1000, 4000)).toBe(false);
    expect(tooFast(1000, 60_000)).toBe(false);
  });

  it('agrees with the threshold for any timing', () => {
    fc.assert(
      fc.property(fc.nat(1e9), fc.nat(1e6), (first, elapsed) => {
        expect(tooFast(first, first + elapsed)).toBe(elapsed < MIN_FILL_MS);
      }),
    );
  });
});

describe('spam verdict', () => {
  it('passes a human: empty honeypot, slow enough', () => {
    expect(isSpam('', 0, 5000)).toBe(false);
  });

  it('flags a filled honeypot, however slow', () => {
    expect(isSpam('https://spam.example', 0, 60_000)).toBe(true);
    expect(isSpam('x', 0, 5000)).toBe(true);
  });

  it('ignores whitespace-only honeypot values (autofill noise)', () => {
    expect(isSpam('   ', 0, 5000)).toBe(false);
  });

  it('flags the time-trap with an empty honeypot', () => {
    expect(isSpam('', 0, 2999)).toBe(true);
    expect(isSpam('', undefined, 5000)).toBe(true);
  });
});

describe('file-size check', () => {
  const file = (size: number) => ({ size });

  it('accepts no selection', () => {
    expect(fileTooBig(null)).toBe(false);
    expect(fileTooBig(undefined)).toBe(false);
    expect(fileTooBig([])).toBe(false);
  });

  it('accepts files up to exactly 10 MB', () => {
    expect(fileTooBig([file(1)])).toBe(false);
    expect(fileTooBig([file(MAX_FILE_BYTES)])).toBe(false);
  });

  it('rejects a file above 10 MB, also among several', () => {
    expect(fileTooBig([file(MAX_FILE_BYTES + 1)])).toBe(true);
    expect(fileTooBig([file(100), file(MAX_FILE_BYTES + 1), file(5)])).toBe(true);
  });

  it('takes a custom limit', () => {
    expect(fileTooBig([file(11)], 10)).toBe(true);
    expect(fileTooBig([file(10)], 10)).toBe(false);
  });

  it('works on array-likes such as a FileList', () => {
    const list = { length: 2, 0: file(1), 1: file(MAX_FILE_BYTES * 2) };
    expect(fileTooBig(list)).toBe(true);
  });
});
