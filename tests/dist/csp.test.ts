import { expect, it } from 'vitest';
import type { HTMLElement } from 'node-html-parser';
import { cspOf, describeDist, isRedirectPage, loadPages, sha256, type DistPage } from '../helpers/dist';

const pages = loadPages().filter((p) => !isRedirectPage(p));

/** Inline `<script>` elements that the CSP governs (JSON-LD is a data block, not executable). */
function inlineScripts(page: DistPage): HTMLElement[] {
  return page.root
    .querySelectorAll('script')
    .filter((s) => !s.getAttribute('src') && s.getAttribute('type')?.toLowerCase() !== 'application/ld+json');
}

const inlineStyles = (page: DistPage): HTMLElement[] =>
  page.root.querySelectorAll('style').filter((s) => s.rawText.trim() !== '');

describeDist('CSP meta and inline hashes', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

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

  it.each(pages.map((p) => [p.rel, p] as const))('%s: CSP forbids third parties and unsafe code', (_rel, page) => {
    const csp = cspOf(page.root);
    expect(csp, 'CSP meta tag').not.toBeNull();
    expect(csp?.['default-src']).toEqual(["'self'"]);
    expect(csp?.['script-src']).not.toContain("'unsafe-inline'");
    expect(csp?.['script-src']).not.toContain("'unsafe-eval'");
    expect(csp?.['style-src']).not.toContain("'unsafe-inline'");
  });
});
