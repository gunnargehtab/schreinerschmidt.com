// Sätteri hast plugin: turns the copywriter's `[[Platzhalter: …]]` markers into review marks.
// The markup matches components/ui/ReviewMark.astro (`span.review-mark[data-review=placeholder]`),
// so the owner review view (`?pruefen`) highlights them and labels them "[Platzhalter]".
// The marker text stays inside the span as the instruction for the owner.

const MARKER = /\[\[Platzhalter:\s*([^\]]*?)\s*\]\]/g;

/**
 * Splits `value` into plain text and placeholder marks.
 * @param {string} value
 * @returns {import('hast').ElementContent[] | undefined} undefined when there is no marker
 */
export function splitPlaceholders(value) {
  /** @type {import('hast').ElementContent[]} */
  const nodes = [];
  let last = 0;
  for (const match of value.matchAll(MARKER)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push({ type: 'text', value: value.slice(last, index) });
    nodes.push({
      type: 'element',
      tagName: 'span',
      properties: { className: ['review-mark'], dataReview: 'placeholder' },
      children: [{ type: 'text', value: match[1] ?? '' }],
    });
    last = index + match[0].length;
  }
  if (nodes.length === 0) return undefined;
  if (last < value.length) nodes.push({ type: 'text', value: value.slice(last) });
  return nodes;
}

/** @returns {import('satteri').HastPluginDefinition} */
export function placeholderMarks() {
  return {
    name: 'placeholder-marks',
    text(node, ctx) {
      const nodes = splitPlaceholders(node.value);
      if (!nodes) return;
      // A paragraph that is nothing but markers gets `data-placeholder-only`, so the page can hide
      // it outside the review view. CSS cannot tell "only a span" from "text plus a span"
      // (`:only-child` ignores text nodes), so the decision is made here, at build time.
      const parent = ctx.parent(node);
      if (
        parent?.type === 'element' &&
        parent.tagName === 'p' &&
        parent.children.length === 1 &&
        nodes.every((n) => n.type === 'element' || (n.type === 'text' && n.value.trim() === ''))
      ) {
        ctx.setProperty(parent, 'dataPlaceholderOnly', '');
      }
      ctx.replaceNode(node, nodes);
    },
  };
}
