# Architecture and delivery spec

This document is the authoritative technical reference. It complements `docs/plan.md` §1–§11.

## 0. Findings that shape the build
1. **PaX AG photos.** `_MG_2703_RGB_web.jpg`, `_MG_2939_RGB_web.jpg` and `Fenster Detail 13_1.jpg` carry the EXIF copyright "PaX AG", a window maker. **Exclude them.** The Fenster page then has only `balkontur_im_altbau` from the owner.
   - The Phase 1 migration found two more: the Braubachstraße facade and `stadthaus-altbau-neorenaissance-haustür.jpg` (both `Copyright: PaX AG`). Also excluded.
   - The Admonter photos carry Artist/Copyright "Peter Burgstaller", which confirms that exclusion.
2. **KOWA Haustür is the company's own.** It was shot on the same Huawei VOG-L29 as `Team1.jpg`. It was taken on 2021-03-11 and edited on 28.01.2023; Team1 was taken on 2022-09-12.
3. **Two groups of photos.**
   - Company phones, 2018–2023, at 2736–4000 px.
   - An Oct-2022 upload batch: Fujifilm photos from about 2010–2012 at **800×600**. `2019-09-20.jpg` is only 540×420.
   - Use the legacy photos for cards only. Confirm they show Schreinerei Schmidt projects; anything else would be misleading advertising under the UWG.
4. **Astro static redirects ignore `base`** and emit English pages with no `lang`, charset or CSP. Since Phase 1, `config.redirects` is not used. `src/pages/[...legacy].astro` renders German meta-refresh pages from `src/data/redirects.mjs` with base-prefixed targets.
5. **CSP hashing.** Astro only hashes the scripts and styles it processes itself; `is:inline` is never hashed.
   - JSON-LD is not subject to `script-src`.
   - Inline speculation rules **are** subject to it.
6. **Fonts.** `fontProviders.npm({ remote: false })` alone is **not** offline: it reads the `@fontsource-variable/*` CSS from `node_modules`, but unifont then rewrites every `src` to jsdelivr. Its faces also carry no subset, so `subsets` doesn't filter and `<Font preload={[{subset:'latin'}]}>` emits nothing, and the package CSS's `font-display: swap` overrides the family's `display`.
   - `astro.config.mjs` therefore wraps it in **`fontsourceLocal()`**. The wrapper normalizes local `file://` URLs to filesystem paths and maps jsdelivr URLs back to `node_modules` files, derives the subset from the file name, drops unrequested subsets and removes the package's `display`. **Don't simplify it away.**
   - Result: offline builds pinned by the lockfile, latin + latin-ext faces only, one latin preload per family, and Fraunces gets `optional`.
7. **Structured data.**
   - FAQ rich results are gone, so `FAQPage` markup is optional.
   - JobPosting is only allowed on a single-job page, hence `/karriere/[slug]/`.
8. **Use explicit CI steps, not withastro/action@v6.** That action runs `npm install`, has no test step, and uploads the artifact itself.
9. **Machine and repo setup.**
   - No git `user.name`/`user.email` is configured, and `core.autocrlf=true`.
   - The gh token lacks the `workflow` scope; Git Credential Manager is used for pushes.
10. **The UWG has banned unproven general green claims since 27.09.2026.**
11. **GitHub Pages terms** say it is not for "running your online business". Fine for the demo; production hosting is an open question.

## 1. Scaffold

**Dependencies** (exact pins, `npm i -E`):

| Group | Packages |
|---|---|
| runtime | astro 7.3.8; @astrojs/sitemap 3.7.4; @astrojs/markdown-satteri 0.4.3; three 0.186.1; @fontsource-variable/red-hat-display 5.3.0; @fontsource-variable/fraunces 5.3.0; roughjs 4.6.6 (build-time only) |
| dev | typescript **6.0.3**; @astrojs/check 0.9.10; @types/three 0.186.0; @types/node 24.x; sharp 0.35.5; vitest 5.0.3; fast-check 4.10.2; @playwright/test 1.64.0; @axe-core/playwright 4.13.0; html-validate 11.16.2; linkinator 8.1.0; node-html-parser 9.0.4; lighthouse 13.5.0; chrome-launcher 1.2.2; svgo 4.1.0; prettier 3.9.9; prettier-plugin-astro 1.1.1 |

**Support files:**
- `.nvmrc`: `24`.
- `package.json`: `"type": "module"`, `"engines": {"node": ">=24.8 <25"}`.
- `.gitattributes`: `* text=auto eol=lf`, plus binaries (`jpg jpeg png webp avif ico woff2 pdf`).
- `.editorconfig`: utf-8, lf, 2 spaces, final newline; markdown keeps trailing whitespace.
- `.gitignore`: `node_modules dist .astro .cache test-results playwright-report blob-report lighthouse-reports coverage *.log .env .env.* Thumbs.db .DS_Store .claude/worktrees/`, plus `.vscode/*` except `extensions.json` and `settings.json`.
- `tsconfig.json`:
  - extends `astro/tsconfigs/strictest`;
  - includes `.astro/types.d.ts`, `src`, `scripts`, `tests` and `*.config.*`;
  - `verbatimModuleSyntax`, `allowJs` + `checkJs`;
  - `paths: {"~/*": ["./src/*"]}`.
- `env/pages.env`: `SITE=https://gunnargehtab.github.io`, `BASE_PATH=/schreinerschmidt.com`, `PUBLIC_DEMO=true`.
- `env/audit.env`: `SITE=http://localhost:4173`, `BASE_PATH=/`, `PUBLIC_DEMO=false`, `PUBLIC_FORM_ENDPOINT=https://form.taxi/s/audit-placeholder`.
- `env/assistant.env` (phase 7e): the assistant build, `SITE=http://localhost:4174`, `BASE_PATH=/`, `PORT=4174`, `PUBLIC_DEMO=false`, `PUBLIC_ASSISTANT_ENDPOINT=https://anfrage.schreinerei.invalid`, `DIST_DIR=.cache/dist-assistant`, `ALLOW_PLACEHOLDERS=true`. `pages.env` never gets the assistant endpoint: the Pages demo stays network-free.

**npm scripts.** On Windows, npm runs scripts through cmd.exe, so set env via `--env-file`:
```json
"dev": "astro dev",
"dev:base": "node --env-file=env/pages.env node_modules/astro/bin/astro.mjs dev",
"build": "node --env-file-if-exists=env/pages.env node_modules/astro/bin/astro.mjs build",
"build:audit": "node --env-file=env/audit.env node_modules/astro/bin/astro.mjs build",
"serve": "node --env-file-if-exists=env/pages.env scripts/serve-dist.mjs",
"check": "astro check",
"format": "prettier --write .", "format:check": "prettier --check .",
"test:unit": "vitest run --project unit",
"test:dist": "vitest run --project dist && html-validate \"dist/**/*.html\"",
"test:e2e": "playwright test",
"test:links": "node --env-file-if-exists=env/pages.env scripts/check-links.mjs",
"lighthouse": "node scripts/lighthouse.mjs",
"assets:migrate": "node scripts/migrate-assets.mjs",
"verify": "npm run format:check && npm run check && npm run test:unit && npm run build && npm run test:dist && npm run test:e2e && npm run test:links && npm run test:assistant"
```
Phase 7e adds `build:assistant`, `test:dist:assistant`, `test:e2e:assistant` and `test:assistant` (all three) for the assistant build (§8, §11).
`playwright.config.ts` calls `process.loadEnvFile('env/pages.env')` when `BASE_PATH` is not set.

## 2. `astro.config.mjs` (skeleton)
```js
import { defineConfig, envField, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { legacyRedirects } from './src/data/redirects.mjs';
import { cspHash, themeInitScript, vtTypesScript, speculationRulesScript } from './src/lib/inline-scripts.mjs';
import { basePathLinks } from './src/lib/markdown/base-path-links.mjs';

const trim = (s = '') => s.replace(/^\/+|\/+$/g, '');
const SITE = process.env.SITE || 'http://localhost:4321';
const BASE = trim(process.env.BASE_PATH) ? `/${trim(process.env.BASE_PATH)}/` : '/';
const DEMO = process.env.PUBLIC_DEMO !== 'false';
const FORM = process.env.PUBLIC_FORM_ENDPOINT || '';
if (!DEMO && !FORM) throw new Error('Production build needs PUBLIC_FORM_ENDPOINT');
const formSrc = FORM ? ` ${new URL(FORM).origin}` : '';
const withBase = (to) => (/^https?:/.test(to) ? to : BASE + to.replace(/^\//, ''));

export default defineConfig({
  site: SITE, base: BASE, output: 'static', trailingSlash: 'always', build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true, cacheDir: './.cache/astro', prefetch: false, scopedStyleStrategy: 'where',
  redirects: Object.fromEntries(legacyRedirects.map(([from, to]) => [from, withBase(to)])),
  image: { layout: 'constrained', responsiveStyles: true, breakpoints: [400, 640, 960, 1280, 1600, 1920],
    service: { entrypoint: 'astro/assets/services/sharp', config: { avif: { quality: 55, effort: 4 }, webp: { quality: 76, effort: 4 }, jpeg: { quality: 80, mozjpeg: true } } } },
  fonts: [
    { provider: fontProviders.npm({ remote: false }), name: 'Red Hat Display Variable', cssVariable: '--font-sans', weights: ['300 900'], styles: ['normal'],
      subsets: ['latin', 'latin-ext'], fallbacks: ['system-ui', 'sans-serif'], display: 'swap', options: { package: '@fontsource-variable/red-hat-display', file: 'wght.css' } },
    { provider: fontProviders.npm({ remote: false }), name: 'Fraunces Variable', cssVariable: '--font-accent', weights: ['100 900'], styles: ['italic'],
      subsets: ['latin', 'latin-ext'], fallbacks: ['Georgia', 'serif'], display: 'optional', options: { package: '@fontsource-variable/fraunces', file: 'wght-italic.css' } },
  ],
  markdown: { processor: satteri({ features: { smartPunctuation: { quotes: false, dashes: false, ellipses: true } }, hastPlugins: [basePathLinks(BASE)] }) }, // verify option keys
  env: { schema: {
    PUBLIC_DEMO: envField.boolean({ context: 'client', access: 'public', default: true }),
    PUBLIC_FORM_ENDPOINT: envField.string({ context: 'client', access: 'public', optional: true, url: true, startsWith: 'https://' }),
    PUBLIC_3D: envField.boolean({ context: 'client', access: 'public', default: true }),
    PUBLIC_PRICING: envField.boolean({ context: 'client', access: 'public', default: false }),
  } },
  security: { csp: { algorithm: 'SHA-256',
    directives: ["default-src 'self'", "img-src 'self' data: blob:", "font-src 'self'", `connect-src 'self'${formSrc}`, `form-action 'self'${formSrc}`,
      "base-uri 'self'", "object-src 'none'", "frame-src 'none'", "style-src-attr 'unsafe-inline'"],
    scriptDirective: { hashes: [cspHash(themeInitScript), cspHash(vtTypesScript(BASE)), cspHash(speculationRulesScript(BASE))] } } },
  integrations: DEMO ? [] : [sitemap({ filter: (p) => !p.endsWith('/danke/') })],
});
```
- **Phase 1 changes to this skeleton:** no `redirects` / `withBase` (see §0.4). The `cspMetaFirst()` integration is always on.
- **The vt direction classifier** lives in `inline-scripts.mjs` as a source *string*, `classifyNavigationSource`. `vtTypesScript()` inlines that string, and the exported `classifyNavigation` is built from it with `new Function` at build time, for tests only. `Function.prototype.toString` can't be used, because Astro's bundler reprints function bodies, which breaks the CSP hash. The module never reaches the client, whose CSP forbids eval.
- **Do not** enable `experimental.incrementalBuild`. Its cache key ignores env values.
- **Phase 0 findings** (the skeleton above predates them; `astro.config.mjs` is authoritative):
  - **Font family names:** the " Variable" suffix is correct. `provider` is `fontsourceLocal()`, not the bare npm provider (see §0.6).
  - **Satteri option keys:** they match the skeleton.
  - **`style-src-attr`:** Astro rejects `script-src*`/`style-src*` in `directives`. Use `styleDirective: { resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }] }`.
  - **CSP meta position:** Astro emits the CSP `<meta>` at `</head>`, after our inline scripts and font styles, so the policy wouldn't cover them. A post-build step moves it directly after `<meta charset>`, and a dist test guards the order.
  - **Shiki:** `markdown.syntaxHighlight: false`, because its inline styles would violate the CSP.
- **Fallback:** if CSP blocks progress, drop `security.csp` for the demo.

## 3. Single-source inline scripts (`src/lib/inline-scripts.mjs`)
The config imports these for hashing and `BaseLayout` imports them for rendering, so the hashes and the content can't drift.
```js
import { createHash } from 'node:crypto';
export const cspHash = (code) => `sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}`;
export const themeInitScript = "(()=>{const d=document.documentElement,a=()=>{try{const t=localStorage.getItem('ss-theme');t==='light'||t==='dark'?d.dataset.theme=t:delete d.dataset.theme}catch{}};a();d.classList.add('js');document.prerendering&&document.addEventListener('prerenderingchange',a,{once:true})})()";
export const vtTypesScript = (base) => `/* pageswap/pagereveal direction types; base=${base} baked in */ …`;
export const speculationRulesScript = (base) => JSON.stringify({
  prerender: [{ eagerness: 'moderate', where: { and: [ { href_matches: `${base}*` }, { not: { href_matches: `${base}konfigurator/*` } },
    { not: { href_matches: `${base}*/danke/` } }, { not: { selector_matches: '[data-no-prerender],[download],[target="_blank"]' } } ] } }],
  prefetch: [{ eagerness: 'moderate', where: { href_matches: `${base}konfigurator/*` } }] });
```
**In `BaseLayout`**, right after `<meta charset>`:
- `<script is:inline set:html={themeInitScript} />`
- the `vtTypesScript` script, rendered the same way
- `<script is:inline type="speculationrules" set:html={speculationRulesScript(BASE_URL)} />`
- JSON-LD: `<script type="application/ld+json" set:html={JSON.stringify(data).replace(/</g,'\\u003c')} />`

**House rules:**
- No `style=""` attributes, except per-element custom properties (allowed via `style-src-attr`).
- No `<style is:inline>` and no `define:vars`.
- No `<style>` elements or `style` attributes inside sketch SVGs; SVGO converts them to presentation attributes.

## 4. Base path (`src/lib/url.ts`)
```ts
export function createLinker(base: string) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const EXTERNAL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;
  const url = (path = ''): string => {
    if (EXTERNAL.test(path)) throw new Error(`url(): internal paths only, got "${path}"`);
    const [, p = '', q = '', h = ''] = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(path) ?? [];
    let clean = p.replace(/^\/+/, ''); if (clean && !clean.endsWith('/')) clean += '/';
    return `${root}${clean}${q}${h}`;
  };
  const asset = (path: string): string => `${root}${path.replace(/^\/+/, '')}`;
  const absolute = (pathname: string, site: URL | string): string => new URL(pathname, site).href;
  return { url, asset, absolute, root };
}
export const { url, asset, absolute } = createLinker(import.meta.env.BASE_URL);
```
- **`site.webmanifest`:** relative URLs (`"start_url": "./"`).
- **Markdown links:** a Sätteri hast plugin prefixes `/…` hrefs. Use `ctx.setProperty`, because nodes are frozen.
- **Dotted-base gotchas:**
  - `path.extname('/schreinerschmidt.com/')` returns `.com`.
  - Playwright `goto('/x')` drops the base. Always use relative `goto('x/')`.
- **`scripts/serve-dist.mjs`:** a zero-dependency `node:http` server that mirrors GitHub Pages:
  - mounts `dist/` at `BASE_PATH`;
  - 301 to the trailing-slash URL;
  - serves `dir/index.html`;
  - `404.html` with status 404;
  - **405 for anything other than GET/HEAD**;
  - path-traversal guard;
  - MIME types for avif, webp, woff2 and webmanifest.

## 5. Content collections (`src/content.config.ts`, sketch)
```ts
import { defineCollection, reference } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
const Status = z.enum(['confirmed', 'needs-review', 'placeholder']);
const review = z.object({ status: Status, note: z.string().optional(), source: z.string().optional() }).default({ status: 'needs-review' });
const fact = <T extends z.ZodType>(value: T) => z.object({ value, status: Status, note: z.string().optional(), source: z.string().optional() });
const ServiceKey = z.enum(['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen']);
const Seo = z.object({ title: z.string().max(38), description: z.string().min(110).max(158) });
// seo.title ≤ 38: with " | Schreinerei Schmidt" (22 chars) the full title stays ≤ 60 (§7).
// services (md): key, title, order, teaser ≤180, seo, hero{src,alt≥12,sketch?}, types[{name,text,highlight?,image?,alt?}], woods[], faqs[], projects[], schemaServiceType, review
// projects (md): title, summary ≤200, categories[ServiceKey]≥1, woods[], location?, year?, cover{src,alt≥12,caption?}, gallery[], beforeAfter?{before,after}, detailPage, featured, review
// testimonials (yaml): author, quote, source enum(google|alte-website|direkt), date?, project?, review
// team (yaml): name, role, since?, bio?, portrait?, portraitAlt?, publicationConsent enum(erteilt|ausstehend), review
// jobs (md): title, identifier, active, datePosted, validThrough?, employmentType[], workHours?, baseSalary? fact({min,max,unit}),
//            responsibilities[], qualifications[], benefits[], educationRequirements?, occupationalCategory?, directApply, seo, review
// woods (yaml): name, latin?, origin enum(heimisch|europaeisch|uebersee), certification[FSC|PEFC], durabilityClass?, uses[ServiceKey], description,
//            swatch?, configurator?{enabled, textureId, avgColor, eModulusGPa, finishes[natur-geoelt|weiss-geoelt|lack-matt]}, review
// faqs (yaml): question (ends with ?), answer, topics[], order, review
// settings (yaml, one entry "site"): name, legalName fact, owner{name,title,masterSince}, address{street,postalCode,city,region,country:'DE'}, geo? fact,
//            phone{display,e164}, email, hours fact([{days[],opens,closes}]), areaServed fact, employees, stats{projects fact},
//            rating{value,count,snapshotDate,profileUrl? fact}, legal{vatId?,economicId?,craftsRegisterNo,professionalTitle,chamber{name,address,url},liabilityInsurance?}
```
- **JSON-LD** only emits facts with `status: 'confirmed'`.
- **Demo builds** generate `/intern/pruefliste/` (noindex): every `needs-review`/`placeholder` item, plus the green-claim words.
- **Production builds** throw if placeholders remain in legal, contact, hours or salary data.
- **`ReviewMark`** highlights unconfirmed text when the URL has `?pruefen`.
  - Its styles are global (`src/styles/components/review.css`). Scoped styles of an import-free component can sort ahead of `global.css` and flip the layer order; `tests/dist/layers.test.ts` guards this.
  - The `?pruefen` script and legend live in `ReviewView.astro`, rendered once per page by `BaseLayout`. This keeps scripts and comments out of links such as `tel:`.
- **`[[Platzhalter: …]]` markers** are notes for the owner, never public copy:
  - Markdown: the `placeholder-marks` hast plugin renders them as marks that only the `?pruefen` view shows.
  - Page copy: `getPageCopy()` strips them.
  - Legal templates: unconfirmed tokens render as marked placeholders in the demo.
  - The Prüfliste lists every marker, and production builds are blocked while any exist.

## 6. Asset migration (`scripts/migrate-assets.mjs` + the `scripts/asset-sources.mjs` allow-list)
For each publishable source:
1. **Download** from `CDN_BASE + file` into `.cache/asset-originals/<id>.<ext>`.
   - 60 s timeout; require HTTP 200 + an `image/(jpeg|png)` content type + matching magic bytes.
   - Cap at 25 MB; cached unless `--force`.
2. **Record provenance** before stripping: sha256, size, EXIF Make/Model/DateTime/Copyright/Artist, GPS flag.
   - **Abort** if the Copyright or Artist tag names someone other than the owner.
3. **Process with sharp:**
   - `sharp(raw, {limitInputPixels: 50e6}).rotate().resize({width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true}).jpeg({quality: 86, mozjpeg: true})`.
   - Write to `src/assets/projects/<slug>/NN-descriptor.jpg`; the metadata is dropped.
4. **Re-read** the output: assert no EXIF remains. Warn when the long edge is < 1200 px ("card only").
5. **Manifest entry** in `src/assets/asset-manifest.json`: `{id, sourceUrl, sha256, original{w,h,bytes,exif{make,model,date}}, output{path,w,h,bytes}, rights, rightsEvidence, alt, category, project, role, privacyCheck: 'pending', notes}`.

Also **archive the originals** outside git, because the Webflow CDN dies when the plan ends.

**Rights groups:**

| Group | Photos |
|---|---|
| `own` | Shoji ×2 (2018), IMG_20200527, IMG_20210423, Fischgrät (2022), KOWA (2023-01), Team1 (2023-01, needs written consent), IMG_20230203, Schrankwand ×2 (2023-09) |
| `own-legacy` (800 px) | Haustür vorher/nachher, DSCF3091, DSCF3084, glasvitrine, badgestaltung, massivholzbett, kiefer_landhausdielen, Sonnenplatze, zaunanlage ×2, auf_engstem_raum, balkontur_im_altbau, the 3 Handlauf/Treppenhaus photos |
| `own-unverified` | 2019-09-20 (540 px), ss_Rezessionen1, ulf_schmidt |
| Reference only | Logo.png, for redrawing the wordmark |
| **Excluded** | PaX ×3; AdobeStock video; Steel Interior; Admonter; `schreiner_schmidt_terasse*` / `_kuche` / `_boden` / `_Turen`; "Bildschirmfoto" PNGs; video_Schreiner; Unsplash |

**15 reference projects** (drafts; "confirm" means check with the owner):

| # | Slug | Title | Photos | Category | Detail page? |
|---|---|---|---|---|---|
| 1 | holzhaustuer-aufgearbeitet | Holzhaustür: aufgearbeitet statt ersetzt | vorher/nachher | Türen, Altbau | yes (before/after) |
| 2 | haustuer-gruenderzeit | Neue Haustür im Gründerzeithaus | KOWA + ss_Rezessionen1 (confirm) | Türen, Altbau | yes |
| 3 | eingang-holzlamellen | Moderner Eingang mit Holzlamellen | IMG_20210423 | Türen | no |
| 4 | eichentreppe | Massive Eichentreppe | IMG_20230203 | Treppen | no |
| 5 | treppenhaus-handlauf | Eichenstufen und schwarzer Handlauf | 3 legacy | Treppen | yes |
| 6 | einbauschrankwand | Raumhohe Einbauschrankwand | geschlossen/offen | Möbel | yes (toggle) |
| 7 | shoji-kleiderschrank | Kleiderschrank mit Shoji-Schiebetüren | ×2 | Möbel | yes |
| 8 | arbeitszimmer-wohnwand | Schreibtisch & TV-Möbel nach Maß | DSCF3091 + 3084 (confirm) | Möbel | yes |
| 9 | glasvitrine | Glasvitrine mit integrierter Beleuchtung | 1 | Möbel | no |
| 10 | kernbuchenbett | Massivholzbett aus Kernbuche | 1 | Möbel | no |
| 11 | bad-nach-mass | Bad nach Maß: Waschtisch & Türen auf engstem Raum | badgestaltung + auf_engstem_raum (confirm) | Möbel, Türen | yes |
| 12 | dachausbau-dielen | Dachausbau mit Massivholzdielen | 2019-09-20 | Böden | no |
| 13 | altbau-eichendielen | Eichendielen im Altbau | IMG_20200527 | Böden, Altbau | no |
| 14 | fischgraetparkett-eiche | Fischgrätparkett in Eiche | 1 | Böden | no |
| 15 | draussen-mit-holz | Sonnenplatz, Gartentor & Zaun | Sonnenplatze + zaun ×2 (confirm) | Terrassen | yes |

Photos without a project live in `src/assets/services/<key>/` (Phase 1 migration), e.g. `boeden/01-massivdielen-kiefer.jpg` and `fenster/01-balkontuer-altbau.jpg`.

Not migrated, pending the owner:
- `eiche_fischgratparkett.jpeg` is a different photo (Fujifilm 2011, 800×600), not a duplicate of the 2022 Fischgrät.
- `Treppe Eiche Massivholz naturgeölt.jpg` is a crop of IMG_20230203, so only the original is migrated.

Where the remaining photos go:
- Kiefer-Landhausdielen: illustrates the Böden type "Massivdielen".
- Balkontür: the Fenster and Altbau pages.
- Team1 and the Ulf portrait: Über uns.
- Sketch→photo candidates: Schrankwand, Eichentreppe, Shoji, KOWA, Fischgrät.

## 7. SEO patterns
**Titles:** `${seo.title} | Schreinerei Schmidt`, ≤ 60 characters.
- Home: "Schreinerei Schmidt Mannheim | Möbel, Böden, Treppen".
- Service example: "Parkett & Massivholzdielen in Mannheim | Schreinerei Schmidt".

**Description templates** (110–158 characters):
- Service: "{Leistung} vom Schreinermeister aus Mannheim: {konkreter USP}. Beratung, Aufmaß und Montage aus einer Hand – jetzt unverbindlich anfragen."
- Project: "{Titel}: {Kurzbeschreibung} – Referenzprojekt der Schreinerei Schmidt, Mannheim."
- Job: "{Jobtitel} in Mannheim: 4-Tage-Woche, eigener Montagebus, starkes Team. Jetzt direkt online bewerben."

**Indexing:**
- Demo: `noindex, nofollow, noimageindex` and **no canonical**.
- Production: `index, follow, max-image-preview:large` + a self-canonical.
- Danke pages and the 404 are always noindex.
- The demo has no sitemap. Production uses `@astrojs/sitemap` + robots.txt with a `Sitemap:` line.

**OG image:** `getImage({src, width: 1200, height: 630, fit: 'cover', format: 'jpg', quality: 80})` of the page hero, as an absolute URL, plus `og:image:width/height/alt`.

**JSON-LD** (`src/lib/jsonld.ts`, confirmed facts only):
- `HomeAndConstructionBusiness` with an `@id`: NAP, phone, email, founder `Person`, areaServed, openingHours (once confirmed), sameAs the Google profile.
- `WebSite`.
- `Service` per service page (provider = business `@id`).
- `BreadcrumbList`.
- `JobPosting` on `/karriere/[slug]/` only: `baseSalary` only if confirmed, plus `directApply` and `identifier`.
- **No** Review or AggregateRating markup.

## 8. Forms

| Mode | Without JS | With JS (`src/scripts/forms/enhance.ts`) |
|---|---|---|
| Demo | `<form method="dialog">` validates, then does nothing; notice "Demo: Es werden keine Daten übertragen." | Validate → error summary, or inline success "Demo – nichts übertragen". **Zero network.** |
| Production | `method=post action={endpoint}` `enctype=multipart/form-data` (every form, also without a file input; phase 7e); hidden `_next`, `_lang=de`, `_subject` | `fetch(endpoint, {method: 'POST', body: new FormData(form), headers: {Accept: 'application/json'}})` → `{success, error, error_msg}`; on failure, the error summary + tel/mailto fallback |

**Never** POST to Pages (it returns 405), and **never** use GET for personal data.

**Endpoint (decision D3, 2026-10-23, `docs/assistant.md` §0).** `src/lib/form-target.mjs` decides, for `astro.config.mjs` (build guard, CSP) and `src/components/forms/mode.ts` (form action) alike:
- `PUBLIC_ASSISTANT_ENDPOINT` set (an https origin without a path; a path fails the build): **every** form (Konfigurator, Kontakt, Karriere) posts to `${origin}/anfrage`, the assistant backend (`docs/angebot.md` §2). `PUBLIC_FORM_ENDPOINT` is then unused.
- Otherwise `PUBLIC_FORM_ENDPOINT` (form.taxi) as the fallback.
- A production build (`PUBLIC_DEMO=false`) needs one of the two. Demo builds post nowhere and add no origin to the CSP, whatever the env holds.
- CSP `connect-src` and `form-action` gain exactly one origin, the one in use (none in demo builds); `tests/dist/csp.test.ts` checks it per page.
- The backend accepts `multipart/form-data` only (415 otherwise), so FormShell always sets the enctype. The JS paths send `FormData` (multipart) with `Accept: application/json` and the default credentials mode (no cookies cross-origin); the backend answers with `Access-Control-Allow-Origin` for `SITE_ORIGIN`, which must equal the site's `SITE` origin. `_next` is the absolute danke URL on that origin (the backend redirects nowhere else). The backend's `error` is the site's reason key, derived from the status as `reasonOf()` does.
- In assistant builds the Konfigurator success view and `/konfigurator/danke/` show the Preisrahmen steps (`success.timelineLive`, `nextLive`), and the Datenschutz page renders its `assistant` blocks instead of the `formtaxi` ones (§9).
- Tests: `npm run test:assistant` builds the assistant variant into `.cache/dist-assistant` (`env/assistant.env`), runs the whole dist suite on it (`tests/dist/form-target.test.ts` checks action, enctype, `_next`, timeline and Datenschutz per build) and `tests/e2e/assistant*.spec.ts` with `page.route()` answering the endpoint. Those specs skip against the demo build.

**Spam protection:**
- Honeypot with a neutral name, hidden via a CSS class (never inline style); `aria-hidden` wrapper, `tabindex=-1`, `autocomplete=off`.
- Time-trap: a submit within 3 s of the first interaction gets a fake success.

**Fields:**

| Field | Attributes |
|---|---|
| Name | `autocomplete=name` |
| E-Mail | `type=email autocomplete=email spellcheck=false` |
| Telefon | `type=tel autocomplete=tel` |
| PLZ | `type=text inputmode=numeric pattern=[0-9]{5} maxlength=5 autocomplete=postal-code` |
| Ort | `autocomplete=address-level2` |
| CV | `type=file accept=".pdf,.doc,.docx,image/*"`, plus a 10 MB check |

Use a **privacy note with a link instead of a consent checkbox** (flag for legal review).

## 9. Legal templates
Both pages carry `review: needs-review` and show a demo banner "Rechtliche Prüfung ausstehend".

**Impressum (Angaben gemäß § 5 DDG):**
- **Identity:** Schreinerei Schmidt, Inh. Ulf Schmidt; legal form {{PLATZHALTER}}.
- **Address:** Andreas-Hofer-Str. 33, 68259 Mannheim.
- **Contact:** Telefon +49 179 9467822, landline {{?}}, E-Mail.
- **Berufsrechtliche Angaben:**
  - Schreinermeister, verliehen in Deutschland {{confirm}}.
  - Handwerkskammer Mannheim Rhein-Neckar-Odenwald, B 1, 1–2, 68159 Mannheim, hwk-mannheim.de.
  - Handwerksrolle Nr. {{PLATZHALTER}}.
  - Handwerksordnung (HwO), gesetze-im-internet.de/hwo.
- **USt-IdNr.** (§ 27a UStG) {{PLATZHALTER}}, or the W-IdNr.
- **Berufshaftpflicht** (DL-InfoV) {{PLATZHALTER}}, if any.
- **Verbraucherstreitbeilegung:** optional statement.
- **No ODR link** and no § 18 MStV block.
- **Bildnachweise:** "Fotos: Schreinerei Schmidt" {{confirm}}.

**Datenschutz:**
- Verantwortlicher.
- Overview: no cookies, tracking, analytics, external fonts, CDNs, social plugins or map embeds.
- **Hosting:** GitHub Pages (GitHub Inc., USA). Server logs (IP, time, URL, UA) under Art. 6(1)(f); transfers under the DPF. Written so the section can be swapped for an EU host.
- Contact by e-mail or phone.
- **Forms:** form.taxi as processor (AVV, servers in DE), Art. 6(1)(b). The demo transmits nothing. Spam protection explained.
- **Applications:** Art. 6(1)(b); deleted 6 months after a rejection. Flag § 26 BDSG (ECJ C-34/21) for review.
- **Browser storage (§ 25 Abs. 2 Nr. 2 TDDDG):**
  - `ss-theme`, only after the user toggles it;
  - sessionStorage for the configurator state;
  - an opt-in localStorage draft.
- Self-hosted fonts.
- External links load nothing until clicked.
- TLS.
- Rights under Art. 15–21 (with the objection right highlighted); complaints to the LfDI Baden-Württemberg.
- No automated decision-making.
- "Stand" date.

The hosting and form sections render conditionally on demo or production mode. In production builds the form sections also switch on the form service (D3, §8): `<!-- assistant -->` blocks (the assistant backend as processor and host, „Anfragen und Preisrahmen“ with the price evaluation by Claude, data minimisation, Art. 22, retention) or `<!-- formtaxi -->` blocks (form.taxi); exactly one kind renders (`src/lib/legal-tokens.ts`).

## 10. CI/CD (`.github/workflows/deploy.yml`)
```yaml
name: Build, test, deploy
on: { push: { branches: [main] }, pull_request: {}, workflow_dispatch: {} }
permissions: { contents: read }
jobs:
  build:
    runs-on: ubuntu-24.04
    permissions: { contents: read, pages: read }
    concurrency: { group: build-${{ github.ref }}, cancel-in-progress: true }
    env: { PUBLIC_DEMO: "${{ vars.PUBLIC_DEMO || 'true' }}", PUBLIC_FORM_ENDPOINT: "${{ vars.PUBLIC_FORM_ENDPOINT }}", PUBLIC_ASSISTANT_ENDPOINT: "${{ vars.PUBLIC_ASSISTANT_ENDPOINT }}" }
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - id: pages
        uses: actions/configure-pages@v6
      - run: |
          echo "SITE=${{ steps.pages.outputs.origin }}" >> "$GITHUB_ENV"
          echo "BASE_PATH=${{ steps.pages.outputs.base_path }}" >> "$GITHUB_ENV"
      - run: npm ci
      - uses: actions/cache@v6
        with: { path: .cache/astro, key: "astro-${{ runner.os }}-${{ hashFiles('package-lock.json','astro.config.mjs') }}-${{ hashFiles('src/assets/**') }}", restore-keys: "astro-${{ runner.os }}-" }
      - run: npm run format:check
      - run: npm run check
      - run: npm run test:unit
      - run: npm run build
      - run: npm run test:dist
      - uses: actions/cache@v6
        with: { path: ~/.cache/ms-playwright, key: "pw-${{ runner.os }}-${{ hashFiles('package-lock.json') }}" }
      - run: npx playwright install --with-deps chromium firefox webkit
      - run: npm run test:e2e
      - run: npm run test:links
      - if: failure()
        uses: actions/upload-artifact@v7
        with: { name: playwright-report, path: playwright-report/, retention-days: 7 }
      - if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
        uses: actions/upload-pages-artifact@v5
        with: { path: dist/ }
  deploy:
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-24.04
    permissions: { pages: write, id-token: write }
    concurrency: { group: pages, cancel-in-progress: false }
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    outputs: { url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
  smoke:
    needs: deploy
    runs-on: ubuntu-24.04
    steps:
      - env: { URL: "${{ needs.deploy.outputs.url }}" }
        run: |
          set -eu
          curl -fsS "$URL" | grep -q 'name="robots" content="noindex'
          test "$(curl -s -o /dev/null -w '%{http_code}' "${URL%/}")" = 301
          test "$(curl -s -o /dev/null -w '%{http_code}' "${URL}gibt-es-nicht/")" = 404
          curl -s -o /dev/null -w 'POST -> %{http_code} (expect 405)\n' -X POST "$URL"
```
- **Without Pages** (the repo is private and Pages is not enabled yet):
  - `configure-pages` runs with `continue-on-error`, and the build falls back to `env/pages.env`.
  - All tests still run.
  - The artifact upload and the deploy and smoke jobs are skipped until Pages exists: `steps.pages.outcome` and the build job's output `pages`.
- **`quality.yml`** (weekly + manual): `build:audit` → serve → Lighthouse, plus external link checks; reports uploaded.
- **`site-assistant.yml`** (push to main, pull requests, manual; phase 7e): `npm run test:assistant` on Chromium, the same step `verify` ends with (§8 "Endpoint"). It sets no env of its own, because `--env-file` never overrides a set variable, and it never deploys.
- **`dependabot.yml`:** npm weekly (Astro packages grouped, `typescript >= 7` ignored); Actions monthly.
- **One-time setup** (after user confirmation):
  1. Repo-local git identity.
  2. `git remote set-url origin https://github.com/gunnargehtab/schreinerschmidt.com.git`.
  3. `gh api -X POST repos/gunnargehtab/schreinerschmidt.com/pages -f build_type=workflow` (after the first push if needed).
  4. `gh variable set PUBLIC_DEMO --body true`.
  5. If a workflow push is rejected: `gh auth refresh -s workflow`.

## 11. Testing and quality gates
**Playwright projects:**
- `chromium`, `firefox`, `webkit`, `mobile` (Pixel 7).
- `no-js` (`javaScriptEnabled: false`).
- `a11y`: chromium with `reducedMotion: reduce`.
- `baseURL` = `http://localhost:4173${BASE}`; the `webServer` is `serve-dist`.

**What the e2e tests check:**
- **axe** on every page from `dist/**/index.html` + `404.html` (meta-refresh pages skipped), in light and dark, with tags `wcag2a/aa`, `wcag21a/aa`, `wcag22aa`.
- **Keyboard:** skip link, visible focus, Esc closes the popover.
- **Zero third parties:** every request is same-origin, `data:` or `blob:`; `context.cookies()` is `[]`; storage stays empty until the user toggles something; no `securitypolicyviolation` events.

**Dist tests** (Vitest project `dist`, using node-html-parser):
- Every inline script and style has a CSP hash.
- `connect-src` and `form-action` hold `'self'` plus the origin of the form service in use, once; only `'self'` in demo builds (§8 "Endpoint"). The demo build contains the assistant origin nowhere; the assistant build (`npm run test:assistant`) runs the whole suite again.
- No `style=` attribute except custom properties.
- No root-relative URL without the base.
- Redirect targets exist.
- Exactly one h1; `lang="de"`; unique titles; description lengths.
- Robots and canonical tags match the mode.
- JSON-LD parses, and JobPosting appears only on job pages.
- **Whitespace canary:** `[A-Za-zÄÖÜäöüß]<a\b` and `</a>[A-Za-zÄÖÜäöüß]` never match.
- Every img has alt, width and height.
- No three.js code outside the configurator.
- **Budgets per page (gz):** HTML ≤ 30 KB, CSS ≤ 25 KB, JS ≤ 15 KB, fonts ≤ 80 KB, LCP image ≤ 120 KB.
  - HTML is measured **without** the inline `<style>` blocks. All CSS is inlined (`inlineStylesheets: 'always'`), and it counts against the CSS budget. Since Phase 2, Home is about 23.5 + 13.9 KB.
  - Demo-only `/intern/` sheets have their own HTML budget (45 KB).
  - `konfigurator/` pages have an 11.25 KB JS budget (initial). The Möbel-preview chunk (≤ 8.75 KB) and the 3D loader it `import()`s at once (≤ 1.5 KB) are checked separately, and ≤ 21.5 KB together with the page JS. The **full flow** (page JS + every chunk a completed enquiry loads besides the preview, photos and three.js: validation/messages, summary, submit/mailto, payload) is capped at 19.0 KB, 29.0 KB with the Möbel preview and the 3D loader (raised from 18.75 / 28.75 KB with the user on 2026-10-10 for the demo snapshot); `scripts/check-budgets.mjs` enforces it (docs/configurator.md §3 "JS budget") and prints the chunk list. The 3D viewer (`viewer3d` + three.js, on request) is capped at 160 KB and must not be reachable from any other page.
  - The LCP image is evaluated for a 1280 px desktop (DPR 1) and a 390 px phone (DPR 2.625); the larger file must stay within the budget. The phone run picks art-directed `<source media>` candidates (Home: the 4:5 crop below 48rem).
- Typography lint: straight quotes, " - ".
- A green-claim word list feeds the owner checklist.

**Other tools:**
- html-validate with `html-validate:recommended` + `no-inline-style`.
- linkinator for internal links against `serve-dist`.
- **Lighthouse** on the **audit build**, mobile, median of 3. Targets: Performance ≥ 95 (configurator ≥ 85), A11y 100, Best Practices ≥ 95, SEO ≥ 95, LCP ≤ 2.0 s, CLS ≤ 0.02, TBT ≤ 100 ms.

**Vitest `unit`:**
- `createLinker`
- speculation rules
- the JSON-LD filter
- de-DE formatting
- the configurator model
- form messages
- the asset-manifest cross-check and the no-EXIF check

## 12. Risk register
- **R1:** redirects ignore the base → own redirect pages (`[...legacy].astro`) plus a dist test.
- **R2:** inline scripts aren't hashed → single source plus a hash test.
- **R3:** stray SVG styles → SVGO plus html-validate.
- **R4:** JSX whitespace → `compressHTML: true` plus the canary test.
- **R5:** font family name mismatch → inspect the `@font-face` output.
- **R6:** dotted-base quirks → the emulator plus relative `goto`.
- **R7:** POST to Pages returns 405 → demo uses `method=dialog`.
- **R8:** TS 7 → pin 6.0.3.
- **R9:** EXIF data in photos → strip it and test.
- **R10:** image rights → manifest gate plus owner sign-off.
- **R11:** slow AVIF builds → cached `.cache/astro`.
- **R12:** the Webflow CDN disappears → archive the originals now.
- **R13:** low-resolution legacy photos → card-only use.
- **R14:** UWG green claims → specific wording plus legal review.
- **R15:** the public demo republishes the owner's data → get his OK and show the banner.
- **R16:** workflow-scope push rejected → `gh auth refresh -s workflow`.
- **R17:** no git identity → set it before the first commit.
- **R18:** CRLF line endings → `.gitattributes` eol=lf.
- **R19:** Pages terms → decide the production host.
- **R20:** prerender shows a stale theme → handle `prerenderingchange`.
- **R21:** three.js leaks into shared chunks → dynamic import plus a dist test.
- **R22:** `configure-pages` permissions → verify in Phase 0.
- **R23:** expired JobPosting → `validThrough` / `active`.
- **R24:** unconfirmed facts in production → the build guard.
- **R25:** WebKit is not Safari → test on a real iPhone.
