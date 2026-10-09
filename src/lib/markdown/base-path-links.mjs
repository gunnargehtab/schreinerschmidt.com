// Sätteri hast plugin: prefixes root-relative Markdown links ("/kontakt/") with the site base.
// Nodes are frozen, so mutations go through ctx.setProperty.

/**
 * @param {string} base The site base path, e.g. "/schreinerschmidt.com/".
 * @returns {import('satteri').HastPluginDefinition}
 */
export function basePathLinks(base) {
  const root = base.endsWith('/') ? base : `${base}/`;
  return {
    name: 'base-path-links',
    element: {
      filter: ['a'],
      visit(node, ctx) {
        const href = node.properties?.['href'];
        if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return;
        if (root === '/' || href.startsWith(root) || `${href}/` === root) return;
        ctx.setProperty(node, 'href', `${root}${href.slice(1)}`);
      },
    },
  };
}
