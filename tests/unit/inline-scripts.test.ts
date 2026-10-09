import { describe, expect, it } from 'vitest';
import { cspHash, speculationRulesScript, themeInitScript, vtTypesScript } from '../../src/lib/inline-scripts.mjs';

interface Rules {
  prerender: { eagerness: string; where: unknown }[];
  prefetch: { eagerness: string; where: unknown }[];
}

/** Collect every string stored under `key`, at any depth. */
function collect(node: unknown, key: string, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, key, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === 'string') out.push(v);
      else collect(v, key, out);
    }
  }
  return out;
}

describe('cspHash', () => {
  it('returns sha256-base64 of the UTF-8 code', () => {
    expect(cspHash('')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
    expect(cspHash('abc')).toBe('sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
  });

  it('hashes non-ASCII as UTF-8', () => {
    // sha256("ä") over the bytes C3 A4
    expect(cspHash('ä')).toBe('sha256-M+bXP+6CkEyNevt43hFU0ejcKg7bCBIOY99bk4XC2cw=');
  });
});

describe.each(['/schreinerschmidt.com/', '/'])('speculationRulesScript(%j)', (base) => {
  const rules = JSON.parse(speculationRulesScript(base)) as Rules;
  const hrefs = collect(rules, 'href_matches');

  it('is valid JSON with prerender and prefetch rules', () => {
    expect(rules.prerender).toHaveLength(1);
    expect(rules.prefetch).toHaveLength(1);
  });

  it('keeps the configurator out of prerender and prefetches it instead', () => {
    expect(collect(rules.prerender, 'href_matches')).toContain(`${base}konfigurator/*`);
    expect(JSON.stringify(rules.prerender[0]?.where)).toContain(
      JSON.stringify({ not: { href_matches: `${base}konfigurator/*` } }),
    );
    expect(rules.prefetch[0]?.where).toEqual({ href_matches: `${base}konfigurator/*` });
  });

  it('excludes */danke/ pages from prerender', () => {
    expect(JSON.stringify(rules.prerender[0]?.where)).toContain(
      JSON.stringify({ not: { href_matches: `${base}*/danke/` } }),
    );
  });

  it('uses the base in every href pattern', () => {
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const href of hrefs) expect(href.startsWith(base)).toBe(true);
  });

  it('opts out via selector_matches for downloads, new tabs and data-no-prerender', () => {
    const selectors = collect(rules.prerender, 'selector_matches').join(' ');
    expect(selectors).toContain('[data-no-prerender]');
    expect(selectors).toContain('[download]');
    expect(selectors).toContain('[target="_blank"]');
  });
});

describe('themeInitScript', () => {
  it('is a single-line IIFE string', () => {
    expect(typeof themeInitScript).toBe('string');
    expect(themeInitScript).not.toMatch(/[\r\n]/);
    expect(themeInitScript).toMatch(/^\((?:\(\)=>|function\s*\(\)\s*)\{[\s\S]*\}\)\(\)$/);
  });

  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(themeInitScript)).not.toThrow();
  });

  it('reads and sets only the ss-theme preference', () => {
    expect(themeInitScript).toContain("localStorage.getItem('ss-theme')");
    expect(themeInitScript).not.toContain('setItem');
  });
});

describe('vtTypesScript', () => {
  it.each(['/schreinerschmidt.com/', '/'])('is valid JavaScript for base %j', (base) => {
    const code = vtTypesScript(base);
    expect(() => new Function(code)).not.toThrow();
    expect(code).toContain(base);
  });
});
