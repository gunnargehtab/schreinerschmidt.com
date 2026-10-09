// View-transition name registry (docs/design-system.md §6, "Cross-document view transitions").
// Every view-transition name on the site comes from here. A registry is scoped to one page render
// and throws when a name is registered twice, because duplicate names abort the transition.
//
// Usage in components:  <img class="vt-media" style={vtStyle(Astro.locals, 'proj', slug)} … />
// `Astro.locals` is a fresh object per page render, so it scopes the registry to that page.

/** Fixed names. `site-header` and `page-title` are applied by class in the motion layer. */
export const VT_FIXED = {
  'site-header': 'site-header',
  'page-title': 'page-title',
} as const;

/** Prefixes of keyed names: `hero-media-<service|slug>` and `proj-<slug>`. */
export const VT_KEYED = ['hero-media', 'proj'] as const;

export type VtFixedKind = keyof typeof VT_FIXED;
export type VtKeyedKind = (typeof VT_KEYED)[number];
export type VtKind = VtFixedKind | VtKeyedKind;

/** CSS keywords that can never be used as a view-transition name. */
const RESERVED = new Set(['none', 'auto', 'match-element', 'initial', 'inherit', 'unset', 'revert', 'revert-layer']);

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue', ẞ: 'ss' };

/** Turns a key into an ASCII ident fragment: umlauts transliterated, anything else to `-`. */
export function vtKey(key: string): string {
  const ascii = key
    .replace(/[äöüßÄÖÜẞ]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!ascii) throw new Error(`vt(): key "${key}" has no usable ASCII characters`);
  return ascii;
}

const isFixed = (kind: VtKind): kind is VtFixedKind => Object.hasOwn(VT_FIXED, kind);

/** Builds a name without registering it (for CSS generation and tests). */
export function vtName(kind: VtFixedKind): string;
export function vtName(kind: VtKeyedKind, key: string): string;
export function vtName(kind: VtKind, key?: string): string {
  return buildName(kind, key);
}

function buildName(kind: VtKind, key?: string): string {
  if (isFixed(kind)) {
    if (key !== undefined) throw new Error(`vt(): "${kind}" is a fixed name and takes no key`);
    return VT_FIXED[kind];
  }
  if (!(VT_KEYED as readonly string[]).includes(kind)) throw new Error(`vt(): unknown kind "${String(kind)}"`);
  if (key === undefined) throw new Error(`vt(): "${kind}" needs a key`);
  const name = `${kind}-${vtKey(key)}`;
  if (RESERVED.has(name)) throw new Error(`vt(): "${name}" is a reserved keyword`);
  return name;
}

export interface VtRegistry {
  /** Registers and returns a name; throws if this page already uses it. */
  name(kind: VtFixedKind): string;
  name(kind: VtKeyedKind, key: string): string;
  /** Registers a name and returns the `style` value `--vt: <name>` for `.vt-media` elements. */
  style(kind: VtFixedKind): string;
  style(kind: VtKeyedKind, key: string): string;
  /** Names registered so far, in order. */
  names(): readonly string[];
}

/** A registry for one page render. */
export function createVtRegistry(): VtRegistry {
  const used = new Set<string>();
  const register = (kind: VtKind, key?: string): string => {
    const name = buildName(kind, key);
    if (used.has(name)) throw new Error(`vt(): duplicate view-transition name "${name}" on this page`);
    used.add(name);
    return name;
  };
  return {
    name: register,
    style: (kind: VtKind, key?: string) => `--vt: ${register(kind, key)}`,
    names: () => [...used],
  } as VtRegistry;
}

const registries = new WeakMap<object, VtRegistry>();

/** The registry of the page currently rendering, keyed by its `Astro.locals` object. */
export function vtRegistry(locals: object): VtRegistry {
  let registry = registries.get(locals);
  if (!registry) {
    registry = createVtRegistry();
    registries.set(locals, registry);
  }
  return registry;
}

/** `vt(Astro.locals, 'proj', slug)`: registers the name on the current page and returns it. */
export function vt(locals: object, kind: VtFixedKind): string;
export function vt(locals: object, kind: VtKeyedKind, key: string): string;
export function vt(locals: object, kind: VtKind, key?: string): string {
  return (vtRegistry(locals).name as (k: VtKind, s?: string) => string)(kind, key);
}

/** `style={vtStyle(Astro.locals, 'hero-media', key)}`: registers the name and returns `--vt: <name>`. */
export function vtStyle(locals: object, kind: VtFixedKind): string;
export function vtStyle(locals: object, kind: VtKeyedKind, key: string): string;
export function vtStyle(locals: object, kind: VtKind, key?: string): string {
  return (vtRegistry(locals).style as (k: VtKind, s?: string) => string)(kind, key);
}
