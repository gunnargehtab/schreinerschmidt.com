// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import {
  cspHash,
  themeInitScript,
  vtTypesScript,
  speculationRulesScript,
  filterPreselectScript,
} from './src/lib/inline-scripts.mjs';
import { basePathLinks } from './src/lib/markdown/base-path-links.mjs';
import { placeholderMarks } from './src/lib/markdown/placeholder-marks.mjs';

/** @param {string} [s] */
const trim = (s = '') => s.replace(/^\/+|\/+$/g, '');
const SITE = process.env['SITE'] || 'http://localhost:4321';
const BASE = trim(process.env['BASE_PATH']) ? `/${trim(process.env['BASE_PATH'])}/` : '/';
const DEMO = process.env['PUBLIC_DEMO'] !== 'false';
const FORM = process.env['PUBLIC_FORM_ENDPOINT'] || '';
if (!DEMO && !FORM) throw new Error('Production build needs PUBLIC_FORM_ENDPOINT');
const formSrc = FORM ? ` ${new URL(FORM).origin}` : '';

const JSDELIVR = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/;
const SUBSET = /-((?:latin|cyrillic|greek|vietnamese)(?:-ext)?)-wght-(?:normal|italic)\.woff2$/;

/**
 * fontProviders.npm({ remote: false }) for @fontsource-variable packages, with three fixes:
 * 1. unifont rewrites the parsed font URLs to jsdelivr; map them back to node_modules so the
 *    build stays offline and pinned by the lockfile (Astro reads absolute paths from disk).
 * 2. Faces carry no subset; derive it from the file name so `subsets` filters and
 *    `<Font preload={[{ subset: 'latin' }]}>` work.
 * 3. Drop the package's hard-coded `font-display: swap` so the family's `display` applies.
 * @returns {ReturnType<typeof fontProviders.npm>}
 */
function fontsourceLocal() {
  const npm = fontProviders.npm({ remote: false });
  let root = process.cwd();
  return {
    ...npm,
    async init(context) {
      root = fileURLToPath(context.root);
      await npm.init?.(context);
    },
    async resolveFont(options) {
      const result = await npm.resolveFont(options);
      if (!result) return result;
      const fonts = result.fonts.flatMap((font) => {
        const src = font.src.map((source) => {
          if (!('url' in source)) return source;
          const m = JSDELIVR.exec(source.url);
          if (!m) return source;
          const file = join(root, 'node_modules', m[1] ?? '', m[2] ?? '');
          if (!existsSync(file)) throw new Error(`Font file missing in node_modules: ${file}`);
          return { ...source, url: file };
        });
        const first = src.find((s) => 'url' in s);
        const subset = first && 'url' in first ? SUBSET.exec(first.url)?.[1] : undefined;
        if (subset && !options.subsets.includes(subset)) return [];
        const { display: _display, ...rest } = font;
        return [{ ...rest, src, meta: { ...font.meta, ...(subset ? { subset } : {}) } }];
      });
      return { fonts };
    },
  };
}

/** A whole `<meta …>` tag; quoted attribute values may contain `>`. */
const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const IS_CSP_META = /\shttp-equiv\s*=\s*(["']?)content-security-policy\1(?=[\s/>])/i;
/** Tested on the tag with quoted values blanked, so `content="…; charset=…"` does not count. */
const IS_CHARSET_META = /\scharset\s*=/i;
const isCharsetMeta = (/** @type {string} */ tag) => IS_CHARSET_META.test(tag.replace(/"[^"]*"|'[^']*'/g, '""'));

/**
 * Astro injects the CSP `<meta>` at the end of `<head>`, after our inline scripts, the font styles
 * and preloads. A meta policy only governs content parsed after it, so move it directly behind
 * `<meta charset>`. Pages without a CSP meta stay untouched.
 * @returns {import('astro').AstroIntegration}
 */
function cspMetaFirst() {
  return {
    name: 'csp-meta-first',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = (await readdir(root, { recursive: true })).filter((f) => f.endsWith('.html'));
        let moved = 0;
        for (const file of files) {
          const path = join(root, file);
          const html = await readFile(path, 'utf8');
          const csp = [...html.matchAll(META_TAG)].filter((m) => IS_CSP_META.test(m[0]));
          const [meta] = csp;
          if (!meta) continue;
          if (csp.length > 1) throw new Error(`csp-meta-first: ${file} has ${csp.length} CSP <meta> tags`);
          const [tag] = meta;
          const rest = html.slice(0, meta.index) + html.slice(meta.index + tag.length);
          const charset = [...rest.matchAll(META_TAG)].find((m) => isCharsetMeta(m[0]));
          if (!charset) throw new Error(`csp-meta-first: ${file} has a CSP <meta> but no <meta charset>`);
          const end = charset.index + charset[0].length;
          await writeFile(path, rest.slice(0, end) + tag + rest.slice(end));
          moved++;
        }
        logger.info(`moved the CSP <meta> behind <meta charset> in ${moved} page(s)`);
      },
    },
  };
}

export default defineConfig({
  site: SITE,
  base: BASE,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
  cacheDir: './.cache/astro',
  prefetch: false,
  scopedStyleStrategy: 'where',
  image: {
    layout: 'constrained',
    responsiveStyles: true,
    breakpoints: [400, 640, 960, 1280, 1600, 1920],
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        avif: { quality: 55, effort: 4 },
        webp: { quality: 76, effort: 4 },
        jpeg: { quality: 80, mozjpeg: true },
      },
    },
  },
  fonts: [
    {
      provider: fontsourceLocal(),
      name: 'Red Hat Display Variable',
      cssVariable: '--font-sans',
      weights: ['300 900'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
      display: 'swap',
      options: { package: '@fontsource-variable/red-hat-display', file: 'wght.css' },
    },
    {
      provider: fontsourceLocal(),
      name: 'Fraunces Variable',
      cssVariable: '--font-accent',
      weights: ['100 900'],
      styles: ['italic'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['Georgia', 'serif'],
      display: 'optional',
      options: { package: '@fontsource-variable/fraunces', file: 'wght-italic.css' },
    },
  ],
  markdown: {
    // Shiki emits inline styles that the CSP blocks; the site has no code blocks.
    syntaxHighlight: false,
    processor: satteri({
      features: { smartPunctuation: { quotes: false, dashes: false, ellipses: true } },
      hastPlugins: [basePathLinks(BASE), placeholderMarks()],
    }),
  },
  env: {
    schema: {
      PUBLIC_DEMO: envField.boolean({ context: 'client', access: 'public', default: true }),
      PUBLIC_FORM_ENDPOINT: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
        url: true,
        startsWith: 'https://',
      }),
      PUBLIC_3D: envField.boolean({ context: 'client', access: 'public', default: true }),
      PUBLIC_PRICING: envField.boolean({ context: 'client', access: 'public', default: false }),
    },
  },
  security: {
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src 'self'${formSrc}`,
        `form-action 'self'${formSrc}`,
        "base-uri 'self'",
        "object-src 'none'",
        "frame-src 'none'",
      ],
      // Astro rejects script-src*/style-src* in `directives`; `style-src-attr` is expressed as an
      // attribute-scoped resource instead. Element hashes stay on `style-src`.
      styleDirective: { resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }] },
      scriptDirective: {
        hashes: [
          cspHash(themeInitScript),
          cspHash(vtTypesScript(BASE)),
          cspHash(speculationRulesScript(BASE)),
          cspHash(filterPreselectScript),
        ],
      },
    },
  },
  integrations: [cspMetaFirst(), ...(DEMO ? [] : [sitemap({ filter: (p) => !p.endsWith('/danke/') })])],
});
