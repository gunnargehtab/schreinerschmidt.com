import { describe, expect, it } from 'vitest';
import { classifyNavigation, classifyNavigationSource, vtTypesScript } from '../../src/lib/inline-scripts.mjs';

const BASE = '/schreinerschmidt.com/';
const ORIGIN = 'https://gunnargehtab.github.io';
const at = (path: string): string => `${ORIGIN}${BASE}${path}`;

describe('classifyNavigation', () => {
  it.each([
    ['', 'leistungen/', 'forward'],
    ['leistungen/', 'leistungen/boeden/', 'forward'],
    ['', 'referenzen/kueche-eiche/', 'forward'],
    ['leistungen/boeden/', 'leistungen/', 'back'],
    ['leistungen/boeden/', '', 'back'],
    ['leistungen/boeden/', 'leistungen/moebel/', 'lateral'],
    ['kontakt/', 'leistungen/', 'lateral'],
    ['', '', 'lateral'],
  ] as const)('%j -> %j is %s', (from, to, expected) => {
    expect(classifyNavigation(at(from), at(to), 'push', BASE)).toBe(expected);
  });

  it('ignores query and hash when measuring depth', () => {
    expect(classifyNavigation(at('kontakt/?a=1#form'), at('leistungen/boeden/#x'), 'push', BASE)).toBe('forward');
    expect(classifyNavigation(at('leistungen/boeden/'), at('?typ=boden'), 'traverse', BASE)).toBe('back');
  });

  it('classifies traverse and replace like push', () => {
    expect(classifyNavigation(at(''), at('kontakt/'), 'traverse', BASE)).toBe('forward');
    expect(classifyNavigation(at('kontakt/'), at(''), 'replace', BASE)).toBe('back');
  });

  it('returns null for reloads', () => {
    expect(classifyNavigation(at('kontakt/'), at('kontakt/'), 'reload', BASE)).toBeNull();
    expect(classifyNavigation(at(''), at('kontakt/'), 'reload', BASE)).toBeNull();
  });

  it('returns null when either URL is missing', () => {
    expect(classifyNavigation(null, at('kontakt/'), 'push', BASE)).toBeNull();
    expect(classifyNavigation(at('kontakt/'), undefined, 'push', BASE)).toBeNull();
    expect(classifyNavigation('', at('kontakt/'), 'push', BASE)).toBeNull();
  });

  it('returns null outside the base', () => {
    expect(classifyNavigation(`${ORIGIN}/`, at('kontakt/'), 'push', BASE)).toBeNull();
    expect(classifyNavigation(at('kontakt/'), `${ORIGIN}/other/page/`, 'push', BASE)).toBeNull();
  });

  describe('dotted base', () => {
    it('does not treat a sibling path that shares the prefix as inside the base', () => {
      expect(classifyNavigation(`${ORIGIN}/schreinerschmidt.community/a/`, at(''), 'push', BASE)).toBeNull();
      expect(classifyNavigation(at(''), `${ORIGIN}/schreinerschmidt.com.bak/a/`, 'push', BASE)).toBeNull();
    });

    it('treats the bare base without a slash as outside (Pages 301s it first)', () => {
      expect(classifyNavigation(`${ORIGIN}/schreinerschmidt.com`, at('kontakt/'), 'push', BASE)).toBeNull();
    });

    it('accepts a base without the trailing slash', () => {
      expect(classifyNavigation(at(''), at('kontakt/'), 'push', '/schreinerschmidt.com')).toBe('forward');
    });

    it('does not count the dot segment of the base as depth', () => {
      expect(classifyNavigation(at('kontakt/'), at('leistungen/'), 'push', BASE)).toBe('lateral');
    });
  });

  it('works with the root base "/" (audit build)', () => {
    expect(classifyNavigation('http://localhost:4173/', 'http://localhost:4173/kontakt/', 'push', '/')).toBe('forward');
    expect(classifyNavigation('/leistungen/boeden/', '/leistungen/', 'push', '/')).toBe('back');
    expect(classifyNavigation('/kontakt/', '/leistungen/', 'push', '/')).toBe('lateral');
  });

  it('accepts plain paths as well as absolute URLs', () => {
    expect(classifyNavigation(`${BASE}kontakt/`, `${BASE}leistungen/boeden/`, 'push', BASE)).toBe('forward');
  });

  it('returns null for unparsable input instead of throwing', () => {
    expect(classifyNavigation('http://[bad', at(''), 'push', BASE)).toBeNull();
  });

  it('is evaluated from the inlined source string, so the tests cover the shipped code', () => {
    expect(classifyNavigation.toString()).toBe(classifyNavigationSource);
    expect(classifyNavigationSource).not.toMatch(/[\r\n]/);
  });
});

// --- The generated script in a stubbed browser -------------------------------------------------

type Listener = (event: unknown) => void;
interface Activation {
  from: { url: string } | null;
  entry: { url: string } | null;
  navigationType: string;
}
interface FakeTransition {
  types: Set<string>;
}

/** Run `vtTypesScript(base)` with fake globals; returns the registered listeners and the hero stub. */
function runScript(
  base: string,
  options: { pagereveal?: boolean; activation?: Activation | null; hero?: boolean } = {},
) {
  const { pagereveal = true, activation = null, hero = false } = options;
  const listeners = new Map<string, Listener[]>();
  const window: Record<string, unknown> = pagereveal ? { onpagereveal: null } : {};
  const addEventListener = (type: string, fn: Listener): void => {
    listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  };
  const navigation = activation === null ? undefined : { activation };
  const self = { navigation };
  const heroStyle = new Map<string, string>();
  const heroImg = { complete: false, style: { setProperty: (k: string, v: string) => heroStyle.set(k, v) } };
  const document = {
    querySelector: (selector: string) => (hero && selector === 'img.vt-media[data-hero]' ? heroImg : null),
  };
  const run = new Function(
    'window',
    'addEventListener',
    'self',
    'navigation',
    'document',
    'location',
    vtTypesScript(base),
  ) as (...args: unknown[]) => void;
  run(window, addEventListener, self, navigation, document, { href: at('') });
  const fire = (type: string, event: unknown): void => {
    for (const fn of listeners.get(type) ?? []) fn(event);
  };
  return { listeners, fire, heroStyle };
}

const transition = (): FakeTransition => ({ types: new Set() });
const activation = (from: string, to: string, navigationType = 'push'): Activation => ({
  from: { url: at(from) },
  entry: { url: at(to) },
  navigationType,
});

describe('vtTypesScript in a stubbed browser', () => {
  it('embeds the exact classifier source and the base', () => {
    const code = vtTypesScript(BASE);
    expect(code).toContain(`const c=${classifyNavigationSource},`);
    expect(code).toContain(JSON.stringify(BASE));
  });

  it('normalises a base without the trailing slash', () => {
    expect(vtTypesScript('/schreinerschmidt.com')).toBe(vtTypesScript(BASE));
  });

  it('registers pageswap and pagereveal listeners', () => {
    const { listeners } = runScript(BASE);
    expect([...listeners.keys()].sort()).toEqual(['pagereveal', 'pageswap']);
  });

  it('does nothing where pagereveal is unsupported', () => {
    const { listeners } = runScript(BASE, { pagereveal: false });
    expect(listeners.size).toBe(0);
  });

  it('pageswap adds the type from the event activation', () => {
    const { fire } = runScript(BASE);
    const vt = transition();
    fire('pageswap', { viewTransition: vt, activation: activation('', 'leistungen/boeden/') });
    expect([...vt.types]).toEqual(['forward']);
  });

  it('pagereveal adds the type from navigation.activation', () => {
    const { fire } = runScript(BASE, { activation: activation('leistungen/boeden/', 'leistungen/') });
    const vt = transition();
    fire('pagereveal', { viewTransition: vt });
    expect([...vt.types]).toEqual(['back']);
  });

  it('pagereveal adds "lateral" for equal depth', () => {
    const { fire } = runScript(BASE, { activation: activation('kontakt/', 'leistungen/', 'traverse') });
    const vt = transition();
    fire('pagereveal', { viewTransition: vt });
    expect([...vt.types]).toEqual(['lateral']);
  });

  it('adds no type on reload', () => {
    const { fire } = runScript(BASE, { activation: activation('kontakt/', 'kontakt/', 'reload') });
    const reveal = transition();
    fire('pagereveal', { viewTransition: reveal });
    const swap = transition();
    fire('pageswap', { viewTransition: swap, activation: activation('kontakt/', 'kontakt/', 'reload') });
    expect(reveal.types.size + swap.types.size).toBe(0);
  });

  it('adds no type when the navigation leaves the base', () => {
    const { fire } = runScript(BASE);
    const vt = transition();
    fire('pageswap', {
      viewTransition: vt,
      activation: { from: { url: at('') }, entry: { url: `${ORIGIN}/elsewhere/` }, navigationType: 'push' },
    });
    expect(vt.types.size).toBe(0);
  });

  it('tolerates a missing view transition, activation or Navigation API', () => {
    const { fire } = runScript(BASE);
    expect(() => fire('pageswap', { viewTransition: null, activation: activation('', 'kontakt/') })).not.toThrow();
    expect(() => fire('pageswap', { viewTransition: transition(), activation: null })).not.toThrow();
    expect(() => fire('pagereveal', { viewTransition: transition() })).not.toThrow();
    expect(() => fire('pagereveal', { viewTransition: { types: undefined } })).not.toThrow();
  });

  it('drops the transition name of an unfinished hero image in pagereveal', () => {
    const { fire, heroStyle } = runScript(BASE, { hero: true, activation: activation('', 'referenzen/') });
    fire('pagereveal', { viewTransition: transition() });
    expect(heroStyle.get('--vt')).toBe('none');
  });

  it('leaves the hero alone without a view transition', () => {
    const { fire, heroStyle } = runScript(BASE, { hero: true });
    fire('pagereveal', { viewTransition: null });
    expect(heroStyle.size).toBe(0);
  });
});
