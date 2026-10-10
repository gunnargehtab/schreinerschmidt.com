import { markdownToHtml } from 'satteri';
import { describe, expect, it } from 'vitest';
import { placeholderMarks, splitPlaceholders } from '../../src/lib/markdown/placeholder-marks.mjs';

const render = async (md: string) => (await markdownToHtml(md, { hastPlugins: [placeholderMarks()] })).html;

describe('splitPlaceholders', () => {
  it('returns undefined without a marker', () => {
    expect(splitPlaceholders('Nur Text [Klammer]')).toBeUndefined();
  });

  it('splits text around a marker and keeps the note', () => {
    const nodes = splitPlaceholders('Vorher [[Platzhalter: Holzart klären]] nachher.');
    expect(nodes).toHaveLength(3);
    expect(nodes?.[0]).toEqual({ type: 'text', value: 'Vorher ' });
    expect(nodes?.[1]).toMatchObject({ tagName: 'span', children: [{ type: 'text', value: 'Holzart klären' }] });
    expect(nodes?.[2]).toEqual({ type: 'text', value: ' nachher.' });
  });

  it('handles several markers and a marker at the start or end', () => {
    expect(splitPlaceholders('[[Platzhalter: A]][[Platzhalter: B]]')).toHaveLength(2);
  });
});

describe('placeholderMarks (Markdown to HTML)', () => {
  it('renders a marker as a review mark', async () => {
    const html = await render('Text. [[Platzhalter: Maße klären]] Ende.');
    expect(html).toContain('<span class="review-mark" data-review="placeholder">Maße klären</span>');
    expect(html).not.toContain('[[');
  });

  it('works in a stand-alone paragraph and in list items', async () => {
    const html = await render('[[Platzhalter: Eins]]\n\n- Punkt [[Platzhalter: Zwei]]');
    expect(html.match(/data-review="placeholder"/g)).toHaveLength(2);
  });

  it('leaves other text untouched', async () => {
    expect(await render('Kein Marker.')).toBe('<p>Kein Marker.</p>\n');
  });
});
