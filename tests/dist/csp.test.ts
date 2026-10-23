import { expect, it } from 'vitest';
import type { HTMLElement } from 'node-html-parser';
import { assistantOrigin, cspOf, describeDist, isDemo, isRedirectPage, loadPages, sha256, type DistPage } from '../helpers/dist';

const pages = loadPages().filter((p) => !isRedirectPage(p));

/** Inline `<script>` elements that the CSP governs (JSON-LD is a data block, not executable). */
function inlineScripts(page: DistPage): HTMLElement[] {
  return page.root
    .querySelectorAll('script')
    .filter((s) => !s.getAttribute('src') && s.getAttribute('type')?.toLowerCase() !== 'application/ld+json');
}

const inlineStyles = (page: DistPage): HTMLElement[] =>
  page.root.querySelectorAll('style').filter((s) => s.rawText.trim() !== '');

// Raw-HTML patterns for the head order check (a meta CSP only governs content parsed after it).
const CSP_META = /<meta\b[^>]*\shttp-equiv\s*=\s*["']?content-security-policy\b/gi;
const CHARSET_META = /<meta\s+charset\s*=[^>]*>/i;
const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc\s*=)[^>]*>/i;
const STYLE = /<style\b/i;
const PRELOAD = /<link\b[^>]*\srel\s*=\s*["']?preload\b/i;

describeDist('CSP meta and inline hashes', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages.map((p) => [p.rel, p] as const))(
    '%s: CSP meta follows <meta charset> and precedes inline scripts, styles and preloads',
    (_rel, page) => {
      const csp = [...page.html.matchAll(CSP_META)];
      expect(csp, 'exactly one CSP meta tag').toHaveLength(1);
      const at = csp[0]?.index ?? -1;
      const charset = CHARSET_META.exec(page.html);
      expect(charset, '<meta charset>').not.toBeNull();
      expect(at, 'CSP meta after <meta charset>').toBeGreaterThanOrEqual((charset?.index ?? 0) + (charset?.[0].length ?? 0));
      const script = page.html.search(INLINE_SCRIPT);
      expect(script, 'an inline script (BaseLayout theme init)').toBeGreaterThan(-1);
      expect(at, 'CSP meta before the first inline <script>').toBeLessThan(script);
      for (const [what, re] of [
        ['<style>', STYLE],
        ['<link rel="preload">', PRELOAD],
      ] as const) {
        const first = page.html.search(re);
        if (first >= 0) expect(at, `CSP meta before the first ${what}`).toBeLessThan(first);
      }
    },
  );

  it.each(pages.map((p) => [p.rel, p] as const))('%s: every inline script hash is in script-src', (_rel, page) => {
    const csp = cspOf(page.root);
    expect(csp, 'CSP meta tag').not.toBeNull();
    const allowed = csp?.['script-src-elem'] ?? csp?.['script-src'] ?? [];
    for (const script of inlineScripts(page)) {
      const type = script.getAttribute('type') ?? 'text/javascript';
      // Speculation rules may also be allowed through the dedicated keyword.
      if (type === 'speculationrules' && allowed.includes("'inline-speculation-rules'")) continue;
      expect(allowed, `${type} script: ${script.rawText.slice(0, 60)}`).toContain(sha256(script.rawText));
    }
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: every inline style hash is in style-src', (_rel, page) => {
    const styles = inlineStyles(page);
    if (styles.length === 0) return; // Astro may emit only linked stylesheets.
    const csp = cspOf(page.root);
    expect(csp, 'CSP meta tag').not.toBeNull();
    const allowed = csp?.['style-src-elem'] ?? csp?.['style-src'] ?? [];
    for (const style of styles) {
      expect(allowed, `style: ${style.rawText.slice(0, 60)}`).toContain(sha256(style.rawText));
    }
  });

  // D3 (docs/assistant.md §0, src/lib/form-target.mjs): only the origin of the form service in use, once;
  // the assistant when set, else form.taxi; none in demo builds.
  const assistant = assistantOrigin();
  const formTaxi = process.env['PUBLIC_FORM_ENDPOINT'];
  const formOrigin = isDemo() ? null : (assistant ?? (formTaxi ? new URL(formTaxi).origin : null));
  it.each(pages.map((p) => [p.rel, p] as const))(
    `%s: connect-src and form-action allow ${formOrigin ?? 'no form origin'} besides 'self'`,
    (_rel, page) => {
      const csp = cspOf(page.root);
      expect(csp, 'CSP meta tag').not.toBeNull();
      const expected = ["'self'", ...(formOrigin ? [formOrigin] : [])];
      expect(csp?.['connect-src']).toEqual(expected);
      expect(csp?.['form-action']).toEqual(expected);
    },
  );

  it.each(pages.map((p) => [p.rel, p] as const))('%s: CSP forbids third parties and unsafe code', (_rel, page) => {
    const csp = cspOf(page.root);
    expect(csp, 'CSP meta tag').not.toBeNull();
    expect(csp?.['default-src']).toEqual(["'self'"]);
    expect(csp?.['script-src']).not.toContain("'unsafe-inline'");
    expect(csp?.['script-src']).not.toContain("'unsafe-eval'");
    expect(csp?.['style-src']).not.toContain("'unsafe-inline'");
  });
});
