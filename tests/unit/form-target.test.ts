// Where the production forms post (decision D3, docs/assistant.md §0; src/lib/form-target.mjs):
// the assistant when set, form.taxi as the fallback, nothing in demo builds; one CSP origin at most.
import { describe, expect, it } from 'vitest';
import { ASSISTANT_PATH, assistantOrigin, cspFormSource, formTarget } from '../../src/lib/form-target.mjs';

const ASSISTANT = 'https://anfrage.schreinerei.example';
const FORM = 'https://form.taxi/s/abc123';

describe('assistantOrigin', () => {
  it('accepts an https origin, with or without a trailing slash', () => {
    expect(assistantOrigin(ASSISTANT)).toBe(ASSISTANT);
    expect(assistantOrigin(`${ASSISTANT}/`)).toBe(ASSISTANT);
    expect(assistantOrigin('https://anfrage.example.de:8443')).toBe('https://anfrage.example.de:8443');
  });

  it.each([
    ['a path', `${ASSISTANT}/anfrage`],
    ['a query', `${ASSISTANT}/?x=1`],
    ['an empty query', `${ASSISTANT}/?`],
    ['a fragment', `${ASSISTANT}/#a`],
    ['credentials', 'https://user:pw@anfrage.example.de'],
  ])('rejects %s', (_what, value) => {
    expect(() => assistantOrigin(value)).toThrow(/origin without a path/);
  });

  it('rejects http and junk', () => {
    expect(() => assistantOrigin('http://anfrage.example.de')).toThrow(/https/);
    expect(() => assistantOrigin('anfrage.example.de')).toThrow(/not a URL/);
  });
});

describe('formTarget', () => {
  it('posts nowhere in demo builds, whatever the env holds', () => {
    for (const env of [{}, { assistant: ASSISTANT }, { form: FORM }, { assistant: ASSISTANT, form: FORM }]) {
      const t = formTarget({ demo: true, ...env });
      expect(t.service).toBeNull();
      expect(cspFormSource(t)).toBe('');
    }
  });

  it('uses the assistant for every form when it is set (D3: replace)', () => {
    for (const form of [undefined, FORM]) {
      const t = formTarget({ demo: false, assistant: ASSISTANT, form });
      expect(t).toEqual({ service: 'assistant', action: `${ASSISTANT}${ASSISTANT_PATH}`, origin: ASSISTANT });
      expect(cspFormSource(t)).toBe(` ${ASSISTANT}`);
    }
    expect(formTarget({ demo: false, assistant: `${ASSISTANT}/` }).action).toBe(`${ASSISTANT}/anfrage`);
  });

  it('falls back to form.taxi while the assistant is unset', () => {
    for (const assistant of [undefined, '']) {
      const t = formTarget({ demo: false, assistant, form: FORM });
      expect(t).toEqual({ service: 'formtaxi', action: FORM, origin: 'https://form.taxi' });
      expect(cspFormSource(t)).toBe(' https://form.taxi');
    }
  });

  it('posts nowhere without either (astro.config.mjs refuses that production build)', () => {
    expect(formTarget({ demo: false }).service).toBeNull();
    expect(cspFormSource(formTarget({ demo: false, assistant: '', form: '' }))).toBe('');
  });

  it('refuses an assistant endpoint with a path in production', () => {
    expect(() => formTarget({ demo: false, assistant: `${ASSISTANT}/anfrage` })).toThrow(/origin without a path/);
  });
});
