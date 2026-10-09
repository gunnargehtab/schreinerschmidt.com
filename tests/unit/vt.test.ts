import { describe, expect, it } from 'vitest';
import { createVtRegistry, vt, vtKey, vtName, vtRegistry, vtStyle } from '../../src/lib/vt';

describe('vtName', () => {
  it('returns the fixed names', () => {
    expect(vtName('site-header')).toBe('site-header');
    expect(vtName('page-title')).toBe('page-title');
  });

  it('prefixes keyed names', () => {
    expect(vtName('proj', 'eichentreppe')).toBe('proj-eichentreppe');
    expect(vtName('hero-media', 'boeden')).toBe('hero-media-boeden');
  });

  it('transliterates umlauts and strips non-ASCII', () => {
    expect(vtKey('Böden')).toBe('boeden');
    expect(vtKey('Fischgrät-Parkett')).toBe('fischgraet-parkett');
    expect(vtKey('Straße & Türen')).toBe('strasse-tueren');
    expect(vtKey('Café')).toBe('cafe');
    expect(vtName('proj', 'Möbel nach Maß')).toMatch(/^[a-z0-9-]+$/);
  });

  it('rejects bad keys and kinds', () => {
    expect(() => vtKey('---')).toThrow(/ASCII/);
    expect(() => vtName('proj', '')).toThrow();
    // @ts-expect-error fixed names take no key
    expect(() => vtName('site-header', 'x')).toThrow(/no key/);
    // @ts-expect-error keyed names need a key
    expect(() => vtName('proj')).toThrow(/needs a key/);
    // @ts-expect-error unknown kind
    expect(() => vtName('none', 'x')).toThrow(/unknown kind/);
  });
});

describe('createVtRegistry', () => {
  it('throws on a duplicate name', () => {
    const r = createVtRegistry();
    expect(r.name('proj', 'shoji-kleiderschrank')).toBe('proj-shoji-kleiderschrank');
    expect(() => r.name('proj', 'shoji-kleiderschrank')).toThrow(
      /duplicate view-transition name "proj-shoji-kleiderschrank"/,
    );
    r.name('page-title');
    expect(() => r.name('page-title')).toThrow(/duplicate/);
  });

  it('treats keys that normalise to the same name as duplicates', () => {
    const r = createVtRegistry();
    r.name('hero-media', 'Böden');
    expect(() => r.name('hero-media', 'boeden')).toThrow(/duplicate/);
  });

  it('style() returns the --vt custom property and registers the name', () => {
    const r = createVtRegistry();
    expect(r.style('hero-media', 'treppen')).toBe('--vt: hero-media-treppen');
    expect(r.names()).toEqual(['hero-media-treppen']);
    expect(() => r.name('hero-media', 'treppen')).toThrow(/duplicate/);
  });
});

describe('vt(locals)', () => {
  it('scopes the registry to one page render', () => {
    const pageA = {};
    const pageB = {};
    expect(vt(pageA, 'proj', 'glasvitrine')).toBe('proj-glasvitrine');
    expect(() => vt(pageA, 'proj', 'glasvitrine')).toThrow(/duplicate/);
    expect(() => vtStyle(pageA, 'proj', 'glasvitrine')).toThrow(/duplicate/);
    expect(vt(pageB, 'proj', 'glasvitrine')).toBe('proj-glasvitrine');
    expect(vtStyle(pageB, 'hero-media', 'moebel')).toBe('--vt: hero-media-moebel');
    expect(vtRegistry(pageB).names()).toEqual(['proj-glasvitrine', 'hero-media-moebel']);
  });
});
