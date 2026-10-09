// Base-path aware URL helpers (docs/architecture.md §4). The base contains a dot
// (/schreinerschmidt.com/), so every internal link must go through these.
export function createLinker(base: string) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
  const url = (path = ''): string => {
    if (EXTERNAL.test(path)) throw new Error(`url(): internal paths only, got "${path}"`);
    const [, p = '', q = '', h = ''] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(path) ?? [];
    let clean = p.replace(/^\/+/, '');
    if (clean && !clean.endsWith('/')) clean += '/';
    return `${root}${clean}${q}${h}`;
  };
  const asset = (path: string): string => `${root}${path.replace(/^\/+/, '')}`;
  const absolute = (pathname: string, site: URL | string): string => new URL(pathname, site).href;
  return { url, asset, absolute, root };
}

export const { url, asset, absolute } = createLinker(import.meta.env.BASE_URL);
