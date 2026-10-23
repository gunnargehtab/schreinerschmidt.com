// Legal pages (docs/architecture.md §9): the Markdown in src/content/legal/*.md is a template. This
// module turns the raw body into the Markdown that is rendered, as a plain string step BEFORE the
// Markdown processor runs (no remark/rehype plugin, so astro.config.mjs stays untouched):
//   1. keep only the `<!-- demo -->` or the `<!-- production -->` blocks of the current build mode; in
//      production also the `<!-- assistant -->` or the `<!-- formtaxi -->` blocks of the form service
//      in use (D3, src/lib/form-target.mjs),
//   2. drop every other HTML comment (inline `needs-review:` notes, author notes),
//   3. resolve `{{tokens}}` from the settings entry (unconfirmed facts get a review-mark span),
//   4. turn `[[Platzhalter: …]]` markers into a „wird ergänzt“ review-mark span (first, so facts that resolve to a marker are wrapped once),
//   5. drop paragraphs whose fact is confirmed "not applicable" (null), and headings left empty.
// Pure and free of astro:content, so it is unit-tested (tests/unit/legal-tokens.test.ts).

export type FactStatus = 'confirmed' | 'needs-review' | 'placeholder';

interface Fact<T> {
  value: T;
  status: FactStatus;
  note?: string | undefined;
}

/** The part of the settings entry "site" that the legal templates use. */
export interface LegalSite {
  legalName: Fact<string>;
  owner: { name: string };
  address: { street: string; postalCode: string; city: string };
  phone: { display: string; e164: string };
  email: string;
  legal: {
    legalForm: Fact<string>;
    vatId: Fact<string | null>;
    economicId: Fact<string | null>;
    liabilityInsurance: Fact<string | null>;
    craftsRegisterNo: Fact<string>;
    professionalTitle: string;
    chamber: { name: string; address: string; url: string };
  };
}

/** The service production forms post to (src/lib/form-target.mjs); form.taxi when not given. */
export type LegalFormService = 'assistant' | 'formtaxi';

export interface LegalOptions {
  site: LegalSite;
  /** Build mode (PUBLIC_DEMO): selects the demo or the production blocks. */
  demo: boolean;
  /** Production only: selects the `assistant` or the `formtaxi` blocks. Default `formtaxi`. */
  forms?: LegalFormService | null | undefined;
}

const NBSP = ' ';

export const escapeHtml = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** A span that the review view (`?pruefen`) highlights; plain text otherwise (see legal.css in the page). */
export const reviewSpan = (html: string, status: 'needs-review' | 'placeholder', note?: string): string =>
  `<span class="review-mark" data-review="${status}"${note ? ` title="${escapeHtml(note)}"` : ''}>${html}</span>`;

/**
 * Step 1: keeps the blocks of the current mode. Markers must stand on a line of their own, which
 * keeps them apart from the same text inside prose or author comments. Blocks never nest. A demo
 * build keeps `demo` blocks only; a production build keeps `production` blocks plus those of its
 * form service (`assistant` or `formtaxi`).
 */
export function selectModeBlocks(markdown: string, demo: boolean, forms?: LegalFormService | null): string {
  const wanted = new Set(demo ? ['demo'] : ['production', forms ?? 'formtaxi']);
  let open: string | null = null;
  const out: string[] = [];
  for (const line of markdown.split('\n')) {
    const m = /^\s*<!--\s*(\/?)(demo|production|assistant|formtaxi)\s*-->\s*$/.exec(line);
    if (m) {
      const [, closing, mode] = m;
      if (!closing) {
        if (open) throw new Error(`Legal template: <!-- ${mode} --> inside an open <!-- ${open} --> block`);
        open = mode ?? null;
      } else {
        if (open !== mode) throw new Error(`Legal template: <!-- /${mode} --> without a matching opener`);
        open = null;
      }
      continue;
    }
    if (open && !wanted.has(open)) continue;
    out.push(line);
  }
  if (open) throw new Error(`Legal template: <!-- ${open} --> block is never closed`);
  return out.join('\n');
}

/** Step 2: removes HTML comments and the whitespace they leave behind. */
export function stripComments(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/(\S)[ \t]{2,}(?=\S)/g, '$1 ');
}

/** `null` marks a fact that is confirmed as "not applicable": its paragraph is dropped. */
type Resolved = string | null;

function factHtml<T extends string | null>(fact: Fact<T>, label: string): Resolved {
  if (fact.status === 'confirmed') return fact.value === null ? null : escapeHtml(fact.value);
  const raw = fact.value?.trim();
  // Never show marker syntax publicly; the ?pruefen view adds the [Platzhalter] tag to the span.
  const text = raw && !/^platzhalter$/i.test(raw) ? raw : `${label} wird ergänzt`;
  return reviewSpan(escapeHtml(text), fact.status, fact.note);
}

function resolvers(site: LegalSite): Record<string, () => Resolved> {
  const { legal, address, phone } = site;
  const host = (url: string) => new URL(url).host.replace(/^www\./, '');
  return {
    legalName: () => factHtml(site.legalName, 'Firmenname'),
    legalForm: () => factHtml(legal.legalForm, 'Rechtsform'),
    owner: () => escapeHtml(site.owner.name),
    street: () => escapeHtml(address.street),
    postalCode: () => escapeHtml(address.postalCode),
    city: () => escapeHtml(address.city),
    phone: () => `[${phone.display.replaceAll(' ', NBSP)}](tel:${phone.e164})`,
    email: () => `[${site.email}](mailto:${site.email})`,
    vatId: () => factHtml(legal.vatId, 'USt-IdNr.'),
    economicId: () => factHtml(legal.economicId, 'Wirtschafts-IdNr.'),
    craftsRegisterNo: () => factHtml(legal.craftsRegisterNo, 'Handwerksrollen-Nr.'),
    liabilityInsurance: () => factHtml(legal.liabilityInsurance, 'Berufshaftpflicht'),
    professionalTitle: () => escapeHtml(legal.professionalTitle),
    chamber: () =>
      `${escapeHtml(legal.chamber.name)}, ${escapeHtml(legal.chamber.address)} ` +
      `([${host(legal.chamber.url)}](${legal.chamber.url}))`,
  };
}

/** Steps 3 to 5 on comment-free Markdown. */
export function resolveTokens(markdown: string, site: LegalSite): string {
  const table = resolvers(site);
  const blocks = markdown.split(/\n[ \t]*\n/).flatMap((block) => {
    if (!block.trim()) return [];
    let dropped = false;
    // Markers in the template itself first, so the placeholder text inside resolved facts stays single-wrapped.
    // Template markers become a neutral „wird ergänzt“; the owner instruction moves into the title,
    // which the ?pruefen view and the Prüfliste surface. Marker syntax is never shown publicly.
    const marked = block.replace(/\[\[([^\]]+)\]\]/g, (_all, inner: string) =>
      reviewSpan('wird ergänzt', 'placeholder', inner.replace(/^Platzhalter:\s*/, '')),
    );
    const resolved = marked.replace(/\{\{\s*(\w+)\s*\}\}/g, (_all, name: string) => {
      const resolve = table[name];
      if (!resolve) throw new Error(`Legal template: unknown token {{${name}}}`);
      const value = resolve();
      if (value === null) dropped = true;
      return value ?? '';
    });
    return dropped ? [] : [resolved];
  });
  // A heading whose section lost all its paragraphs would stand alone: drop it too.
  const kept = blocks.filter((block, i) => {
    if (!/^#{1,6} /.test(block)) return true;
    const next = blocks[i + 1];
    return next !== undefined && !/^#{1,6} /.test(next);
  });
  return kept.join('\n\n') + '\n';
}

/** The whole pipeline: raw template body in, Markdown for the renderer out. */
export function resolveLegalMarkdown(body: string, { site, demo, forms }: LegalOptions): string {
  return resolveTokens(stripComments(selectModeBlocks(body, demo, forms)), site);
}

export interface RenderedLegal {
  html: string;
  /** The `##` headings with their ids, for the table of contents. */
  headings: { slug: string; text: string }[];
}

/**
 * Renders a legal template to HTML at build time with the project's own Sätteri processor
 * (`createSatteriMarkdownProcessor` from @astrojs/markdown-satteri), configured like
 * `markdown.processor` in astro.config.mjs. `render()` of a content entry can't be used: it renders
 * the unresolved body, and this step must run on the string first.
 */
export async function renderLegal(body: string, options: LegalOptions & { base?: string }): Promise<RenderedLegal> {
  const [{ createSatteriMarkdownProcessor }, { basePathLinks }] = await Promise.all([
    import('@astrojs/markdown-satteri'),
    import('./markdown/base-path-links.mjs'),
  ]);
  const processor = await createSatteriMarkdownProcessor({
    syntaxHighlight: false,
    features: { smartPunctuation: { quotes: false, dashes: false, ellipses: true } },
    hastPlugins: [basePathLinks(options.base ?? '/')],
  });
  const { code, metadata } = await processor.render(resolveLegalMarkdown(body, options));
  return {
    html: code,
    headings: metadata.headings.filter((h) => h.depth === 2).map(({ slug, text }) => ({ slug, text })),
  };
}
