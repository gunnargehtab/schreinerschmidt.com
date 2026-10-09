import { expect, it } from 'vitest';
import { describeDist, loadPages } from '../helpers/dist';

const pages = loadPages();

/** A `style` attribute may only hold custom properties (`--vt: x; --pos: 3`). */
function nonCustomProperties(style: string): string[] {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl !== '' && !/^--[\w-]+\s*:/.test(decl));
}

describeDist('markup rules', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: style attributes hold custom properties only', (_rel, page) => {
    const offenders = page.root
      .querySelectorAll('[style]')
      .map((el) => ({ tag: el.tagName.toLowerCase(), style: el.getAttribute('style') ?? '' }))
      .filter(({ style }) => nonCustomProperties(style).length > 0)
      .map(({ tag, style }) => `<${tag} style="${style}">`);
    expect(offenders).toEqual([]);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: no inline event handler attributes', (_rel, page) => {
    const offenders = page.root
      .querySelectorAll('*')
      .flatMap((el) => Object.keys(el.attributes).filter((a) => /^on[a-z]+$/i.test(a)).map((a) => `<${el.tagName.toLowerCase()} ${a}>`));
    expect(offenders).toEqual([]);
  });

  // Whitespace canary: a missing space around inline links glues words together.
  it.each(pages.map((p) => [p.rel, p] as const))('%s: whitespace canary around links', (_rel, page) => {
    // Script and style bodies may legitimately contain `a<a` (comparisons) or similar.
    const html = page.html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
    expect(html).not.toMatch(/[A-Za-zÄÖÜäöüß]<a\b/);
    expect(html).not.toMatch(/<\/a>[A-Za-zÄÖÜäöüß]/);
  });

  it.each(pages.map((p) => [p.rel, p] as const))('%s: every img has alt, width and height', (_rel, page) => {
    const offenders: string[] = [];
    for (const img of page.root.querySelectorAll('img')) {
      for (const attr of ['alt', 'width', 'height']) {
        // `alt=""` is valid for decorative images, so test presence rather than truthiness.
        if (!(attr in img.attributes)) offenders.push(`${img.getAttribute('src') ?? '(no src)'} lacks ${attr}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
