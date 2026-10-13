# Schreinerei Schmidt: Website Relaunch (demo on GitHub Pages)

## Decisions confirmed with the user
- **Hosting:** GitHub Pages from the **private** repo `gunnargehtab/schreinerschmidt.com` (user has GitHub Pro). The site itself is public, so the demo is `noindex`. URL: `https://gunnargehtab.github.io/schreinerschmidt.com/`. The base path contains a dot.
- **Stack:** **Astro 7 (static) + hand-written modern CSS** (no Tailwind) + small vanilla-TS islands.
- **Configurator:** **multi-step quote wizard + parametric 3D furniture preview** (three.js, lazy-loaded on that page only).
- **Design direction:** **"Workshop Sketchbook"**. It evolves the current brand: cream paper, espresso ink, brand red as the carpenter's-pencil accent. Hand-drawn line sketches draw themselves and turn into real photos ("vom Entwurf zum Werkstück"). Dimension lines, hairlines and square corners. Light theme first, plus a dark theme "Werkstatt bei Nacht".
- **Execution:** the Claude 5.5 family, each model on the work it suits:
  - **Opus 5.5** orchestrates and owns the site infrastructure.
  - **Sonnet 5.5** does the bulk implementation and content migration.
  - **Haiku 5.5** handles scaffolding, test runs and search.
  - **Fable 5.1** is used wherever it raises output quality: the design system and motion, sketches, signature visuals, visual QA, the whole configurator core including 3D, flagship German copy and legal drafts, **every phase review**, and every escalation.

  **Escalate after 1 failed attempt.** Details in §13.

## Context
The owner (Ulf Schmidt, Schreinermeister since 2010, Mannheim, 1–10 employees) wants his site rebuilt. Today's www.schreinerschmidt.com is a barely customised **Webflow e-commerce template** ("Avery" by zerocodegirl), unchanged since Nov 2023. Audit findings that drive this plan:

- **Performance:** about **13–14 MB homepage**. Unresized 2–4 MB CSS-background photos, a 397 KB gz `webflow.js` that includes shop code, a blocking webfont loader for 27 font styles with invisible text until they load, and an artificial preloader / hero-wipe delay.
- **Legal (DE):**
  - Google Fonts and GTM load before consent.
  - The Datenschutz names the wrong host (amargo/Matomo), contains Lorem ipsum, and omits Webflow, GA4 and the Meta Pixel.
  - The Impressum still cites §5 TMG (now §5 DDG) and links the EU ODR platform, which was shut down on 20.07.2025.
  - A **watermarked Adobe Stock preview video** is used on the site.
  - Three "project" photos carry **EXIF copyright "PaX AG"**, a window manufacturer.
- **Broken funnel:** the advertised "Konfigurator" ("In 3 Minuten zu Ihrem individuellen Angebot") **never existed**. Its box is hidden, its CTA links to the template demo, and the footer links are `#`.
- **SEO and accessibility:**
  - English template meta descriptions; 8 H1s on the homepage and none on subpages.
  - No canonical, JSON-LD or og:image.
  - Shop and template pages appear in the sitemap; robots.txt returns 404.
  - Empty alt texts, hover states with 1:1 contrast, focus outlines removed, reduced motion ignored, and no menu icon at 480–991 px.
- **Content:**
  - Copy-paste errors: the Leistungen intro is the Fenster text, the Terrassen page talks about windows, and it claims linoleum is made from cork.
  - Typos and stale claims, plus slugs `/mobel` and `/turen`.
  - Mostly stock or supplier imagery.
- **Unused assets:**
  - **5.0 stars from 115 Google reviews** (snapshot 30.09.2026).
  - Recruiting USPs: 4-day week, personal Montagebus, €36–42k on join.com.
  - About 25 real project photos (company phones 2018–2023, plus 800 px Fujifilm shots from 2010–2012), hand-drawn service sketches, and an unused portrait of Ulf.
- **New law:** from **27.09.2026 the UWG (EU 2024/825) bans unsubstantiated generic green claims** such as "umweltfreundlich", "ökologisch" or "natürlich". The eco-heavy copy, and possibly the tagline "Umweltbewusstes Holzhandwerk", need legal review.

**Brand tokens from the current site:**

| Colour | Hex |
|---|---|
| brand red | `#9E2124` |
| logo red | `#8B101B` |
| espresso | `#2C1403` |
| cream | `#FFFBF5` |
| linen | `#F5F2E7` |
| sand | `#EBE5D1` |
| mahogany | `#6B3630` |

Red Hat Display is the main font. Corners are square and lines are 1 px hairlines. The logo is a 702×107 PNG wordmark; its tagline is illegible (`#BABABA`, 1.9:1 contrast).

**Intended outcome:**
- A fast, accessible, GDPR-clean static site that keeps the brand recognisable and fixes every issue above.
- A **working quote configurator with live 3D**.
- 2026-era platform features as progressive enhancement.
- Deployed as a noindexed demo for the owner; moving to the real domain later needs no code changes.

## Goals and success criteria
- **Page weight:** homepage first load **≈ 150–250 KB**, about 600 KB after a full scroll (today 13–14 MB).
- **Lighthouse (mobile, audit build):**
  - Performance ≥ 95 (configurator ≥ 85), Accessibility 100, Best Practices ≥ 95, SEO ≥ 95.
  - LCP ≤ 2.0 s, CLS ≤ 0.02, TBT ≤ 100 ms.
- **JavaScript:**
  - Content pages ≤ 15 KB gz; the realistic figure is about 2–6 KB.
  - Configurator ≤ 20 KB gz initially.
  - three.js chunk ≤ 160 KB gz, loaded **only on request**.
- **Privacy:** zero third-party requests and zero cookies, so no consent banner is needed.
- **Accessibility:** **WCAG 2.2 AA** (axe reports 0 violations in light and dark).
- **Robustness:**
  - Every page and form works **without JS**.
  - Every enhancement degrades cleanly in Firefox 157, which lacks cross-document view transitions and scroll-driven animations.
  - Older iOS Safari must also work.

---

## 1. Architecture

### 1.1 Versions
Checked on 2026-10-09. Pin exactly with `npm i -E`.

| Package | Version | Note |
|---|---|---|
| astro | 7.3.8 | Node ≥ 22.12 (local: 24.19). Vite 8 / Rolldown. Rust compiler: stricter HTML, JSX-style whitespace |
| @astrojs/markdown-satteri | 0.4.3 | Turn off smart quotes (German „…“ are authored by hand) |
| @astrojs/sitemap | 3.7.4 | Production builds only |
| three / @types/three | 0.186.1 / 0.186.0 | Configurator only; `WebGLRenderer` |
| @fontsource-variable/red-hat-display, @fontsource-variable/fraunces | 5.3.0 | Via the Astro Fonts API, `fontProviders.npm({ remote: false })` wrapped in `fontsourceLocal()` (see architecture §0.6): offline and self-hosted |
| roughjs | 4.6.6 | **Build time only.** Generates the hand-drawn SVG sketches; zero runtime JS |
| dev: typescript | **6.0.3** | **Not 7.x**: the @astrojs/check 0.9.10 peer is `^5 \|\| ^6` |
| dev: @astrojs/check | 0.9.10 | |
| dev: sharp | 0.35.5 | |
| dev: vitest, fast-check | 5.0.3, 4.10.2 | |
| dev: @playwright/test, @axe-core/playwright | 1.64.0, 4.13.0 | |
| dev: html-validate | 11.16.2 | |
| dev: linkinator | 8.1.0 | |
| dev: lighthouse + chrome-launcher | 13.5.0 + 1.2.2 | `@lhci/cli` is stale |
| dev: svgo | 4.1.0 | |
| dev: prettier, prettier-plugin-astro | 3.9.9, 1.1.1 | |
| dev: node-html-parser | 9.0.4 | DOM queries in the dist tests |

GitHub Actions: `checkout@v7`, `setup-node@v7`, `configure-pages@v6`, `cache@v6`, `upload-pages-artifact@v5`, `deploy-pages@v5`, `upload-artifact@v7`.

### 1.2 Build modes
Environment files are loaded with `node --env-file(-if-exists)=env/*.env`, which works on Windows without cross-env. CI variables take precedence.

| Mode | Command | SITE / BASE_PATH | PUBLIC_DEMO | Effect |
|---|---|---|---|---|
| dev | `npm run dev` | localhost / `/` | true | Fast local work |
| dev:base | `npm run dev:base` | `env/pages.env` | true | Base-path parity |
| pages (demo) | CI, or `npm run build` | configure-pages outputs `origin` / `base_path` | true | `noindex,nofollow,noimageindex`; no canonical; no sitemap; demo banner; forms transmit nothing |
| audit | `npm run build:audit` | `localhost:4173` / `/` | false | Lighthouse and SEO checks without noindex |
| production | later | real domain / `` | false | Needs `PUBLIC_FORM_ENDPOINT`. **The build fails on unconfirmed legal or contact facts.** |

Feature flags: `PUBLIC_3D` (default on) and `PUBLIC_PRICING` (default off; compiled out).

### 1.3 Key `astro.config.mjs` decisions
- **Routing:** `site`/`base` from the environment; `output: 'static'`, `trailingSlash: 'always'`, `build.format: 'directory'`.
- **`compressHTML: true`:** Astro 7's default `'jsx'` whitespace rules drop spaces around inline links in German text. A dist test guards this.
- **CSS output:** `build.inlineStylesheets: 'always'` (about 8 KB gz per page, saves a render-blocking request) and `scopedStyleStrategy: 'where'`. Component `<style>` blocks are wrapped in `@layer components {}`.
- **`prefetch: false`:** we ship our own inline **Speculation Rules** instead (see §5).
- **`redirects`** come from `src/data/redirects.mjs`. **Destinations are prefixed with the base manually**, because Astro's static redirects ignore `base`.
- **Images:**
  - sharp service with AVIF + WebP (JPEG fallback only where needed).
  - `layout: 'constrained'`, `responsiveStyles: true`, breakpoints 400/640/960/1280/1600/1920.
  - `cacheDir: './.cache/astro'`, cached in CI.
- **Fonts:**
  - Red Hat Display Variable: wght 300–900, `display: swap`.
  - Fraunces Variable Italic: wght, `display: optional`.
  - Subsets latin + latin-ext. latin-ext is only fetched via `unicode-range` when needed (Turkish or Polish names). Only latin is preloaded.
- **Environment schema** (`env.schema`): `PUBLIC_DEMO`, `PUBLIC_FORM_ENDPOINT`, `PUBLIC_3D`, `PUBLIC_PRICING`.
- **CSP** (`security.csp`, emitted as a meta tag):
  - Astro hashes its own scripts and styles. The `is:inline` scripts (theme init, view-transition types, speculation rules) live in **one source**, `src/lib/inline-scripts.mjs`; the config imports them for hashing and the layout imports them for rendering, so the two can't drift.
  - Directives:
    - `default-src 'self'`
    - `img-src 'self' data: blob:`
    - `font-src 'self'`
    - `connect-src` and `form-action`: `'self'` plus the form backend origin
    - `base-uri 'self'`, `object-src 'none'`, `frame-src 'none'`
    - `style-src-attr 'unsafe-inline'`, for per-element custom properties such as `--vt`, `--pos`, `--to`
  - No `define:vars`. JSON-LD needs no hash.
  - **Fallback:** if CSP blocks progress in Phase 0, ship the demo without it and revisit for production.

### 1.4 Base path (`/schreinerschmidt.com/`)
- **`src/lib/url.ts` `createLinker(base)`:**
  - `url()`: internal pages; adds the base and a trailing slash, keeps `?query` and `#hash`.
  - `asset()`: files in `public/`.
  - `absolute()`: canonical, OG and JSON-LD URLs.
  - **Every internal link goes through it**, and a dist test fails on root-relative URLs that lack the base.
- **Other links:**
  - Markdown links: a tiny Sätteri hast plugin adds the base.
  - `site.webmanifest`: relative URLs.
  - Speculation-rule patterns: built from the base.
- **`scripts/serve-dist.mjs`** emulates GitHub Pages locally. It is a zero-dependency `node:http` server that:
  - mounts `dist/` at `BASE_PATH`;
  - answers 301 for URLs missing the trailing slash;
  - serves `404.html` with status 404;
  - **returns 405 for POST**;
  - sends correct MIME types for avif, webp, woff2 and webmanifest.
- **Server usage:** Playwright, the link checker and manual QA all use it. Don't rely on `astro preview` with a dotted base.
- **Playwright gotcha:** always navigate with relative paths (`goto('kontakt/')`). A leading `/` drops the base.

## 2. Repository layout
```
CLAUDE.md                                   (conventions + model-routing rules, see §13)
.claude/agents/ core-engineer · design-engineer · configurator-engineer · copywriter · reviewer · implementer · content-editor · scaffolder · test-runner · code-scout (.md)
.github/workflows/{deploy,quality}.yml · .github/dependabot.yml
docs/ plan.md · design-system.md · configurator.md · content-inventory.md (verbatim old copy) · owner-checklist.md   (written in Phase 0)
env/ pages.env · audit.env
public/ favicon.svg/.ico · apple-touch-icon.png · icon-512.png · site.webmanifest
scripts/ migrate-assets.mjs · asset-sources.mjs (allow-list) · make-sketch-variants.mjs · serve-dist.mjs
         check-links.mjs · check-budgets.mjs · lighthouse.mjs · textures/prepare.mjs
textures-src/SOURCES.md                 (CC0 texture provenance; raw files not committed)
src/
  assets/ brand/ · projects/<slug>/NN-*.jpg · team/ · sketches/ · textures/<species>/ · asset-manifest.json
  components/
    layout/  Head · SiteHeader · NavDesktop · NavSheet · SiteFooter · SkipLink · DemoBanner · ThemeToggle · Breadcrumbs · SpeculationRules
    ui/      Picture · Button · Masslinie · Sketch · SketchPhoto · Schriftfeld · RatingBadge · ReviewMark · Lightbox · StaticMap
    sections/ HomeHero · PageHero · ServiceCard · ServiceGrid · ProjectCard · ProjectGrid · FilterBar · BeforeAfter · Testimonials
              StatCounter · ProcessSteps · Jahresringe · Faq · CtaBand · InPageNav · JobCard · FactList
    forms/   FormShell · Field · TextField · TextArea · Select · Choice · FileField · ErrorSummary · Honeypot · FormStatus
    seo/     Seo · JsonLd
    configurator/ Wizard · Progress · SummarySidebar · steps/* · branches/* · fields/* · preview/*
  content/ services/*.md · projects/*.md · jobs/*.md · testimonials.yaml · team.yaml · woods.yaml · faqs.yaml · settings.yaml
  content.config.ts · data/redirects.mjs
  layouts/ BaseLayout · PageLayout · LegalLayout
  lib/   url.ts · seo.ts · jsonld.ts · format.ts (de-DE) · shy.ts (&shy; dictionary) · vt.ts (view-transition name registry)
         rings.ts · sketch/ (rough.js drawing definitions) · inline-scripts.mjs · markdown/base-path-links.mjs
         configurator/  (isomorphic, no three.js: runs in Astro build, browser and Vitest)
           furniture/{types,species,constraints,carcass,table,live-edge,describe,cutlist}.ts · drawing/elevation.ts
           conditions.ts · fields.ts · service-area.ts · pricing/{index,rules}.ts
  pages/ (see §3.1)
  scripts/ (browser) nav-sheet · theme-toggle · invoker-fallback · before-after · lightbox · referenzen-filter · forms/{enhance,messages.de}
           configurator/{main,controller,state,validate,serialize,history,draft,summary,announce,transitions,submit,mailto,photos}.ts
           configurator/preview/load3d.ts · configurator/viewer3d/* (dynamic import only)
  styles/ global.css (layer order) · reset · tokens/{color,type,space,motion} · base · layout · components/{buttons,forms,mass} · utilities · motion · print
tests/ unit/ · dist/ · e2e/ · helpers/
astro.config.mjs · playwright.config.ts · vitest.config.ts · .htmlvalidate.json · tsconfig.json (astro/tsconfigs/strictest)
.nvmrc (24) · .editorconfig · .gitattributes (* text=auto eol=lf; binaries) · .gitignore · .prettierrc.json
```
Conventions:
- **Naming:** components in PascalCase; libraries and scripts in kebab-case; ASCII German slugs (ä→ae, ö→oe, ü→ue, ß→ss).
- **JS hooks:** JS attaches to `data-*` attributes; islands are custom elements.
- **Language:** code and comments in English, copy in German; Conventional Commits.

---

## 3. Information architecture and content

### 3.1 Pages
| Route | Notes |
|---|---|
| `/` | Start |
| `/leistungen/` | Overview of all services |
| `/leistungen/moebel/`, `boeden/`, `treppen/`, `fenster/`, `tueren/`, `altbau/`, `terrassen/` | **Treppen is new** (real stair projects exist; owner to confirm). `altbau` is titled "Altbau & Restaurierung" and keeps its old URL. |
| `/referenzen/` | Filterable |
| `/referenzen/[slug]/` | Only for projects with `detailPage: true`. Single-photo projects open in the lightbox instead. |
| `/ueber-uns/` | |
| `/karriere/`, `/karriere/[slug]/`, `/karriere/danke/` | One page per job, so the JobPosting markup is valid |
| `/konfigurator/` | The wizard |
| `/konfigurator/[typ]/` | 8 static, preselected deep links that work without JS; canonical points to `/konfigurator/` |
| `/konfigurator/danke/` | |
| `/kontakt/`, `/kontakt/danke/` | |
| `/impressum/`, `/datenschutz/` | |
| `404` | "Hier fehlt ein Brett." |
| `/intern/pruefliste/` | **Demo only**, noindex. Auto-generated owner checklist of every unconfirmed item. |

**Redirects** (meta-refresh pages, base-prefixed):

| Old | New |
|---|---|
| `/leistungen/leistung` | `/leistungen/` |
| `/leistungen/boden` | `/leistungen/boeden/` |
| `/leistungen/mobel` | `/leistungen/moebel/` |
| `/leistungen/turen` | `/leistungen/tueren/` |
| `/team-karriere` | `/ueber-uns/` |
| `/bewerben` | `/karriere/#bewerbung` |
| `/home-no-cart`, `/search` | `/` |

The shop and template leftovers (`/checkout`, `/paypal-checkout`, `/order-confirmation`, `/template/*`) deliberately return 404.

### 3.2 Content model (`src/content.config.ts`, loaders + zod from `astro/zod`)
| Collection | Format | Fields |
|---|---|---|
| **services** | md | key, title, order, teaser, `seo{title ≤38, description 110–158}`, `hero{src, alt, sketch}`, `types[]` (e.g. 6 floor types), references to woods/faqs/projects, schemaServiceType |
| **projects** | md | title, summary, `categories[]` (first = primary), woods, location (district only), year, cover and gallery (alt ≥ 12 chars), optional `beforeAfter`, `detailPage`, `featured` |
| **testimonials** | yaml | verbatim quote, source, permission flag |
| **team** | yaml | `publicationConsent` |
| **jobs** | md | JobPosting fields; `baseSalary` as a `fact()` |
| **woods** | yaml | Site info, plus configurator data: texture id, average colour, E-modulus, allowed finishes |
| **faqs** | yaml | |
| **settings** | yaml | NAP, hours, rating snapshot `{5.0, 115, 2026-09-30, profileUrl}`, legal facts |

**Review flags:**
- Every entry has `review.status` (`confirmed | needs-review | placeholder`); individual facts use `fact()`.
- JSON-LD emits **confirmed facts only**.
- The production build **throws** if placeholders remain in legal, contact, hours or salary data.
- In the demo, `?pruefen` highlights unconfirmed text (ReviewMark), and `/intern/pruefliste/` lists everything still open.

### 3.3 Asset migration (`scripts/migrate-assets.mjs` with the allow-list in `asset-sources.mjs`)
1. **Download and archive.** Download originals from `cdn.prod.website-files.com/62e8c86393d73a7acebb0e1f/…` into `.cache/asset-originals/` (gitignored), then **archive them privately**: the CDN disappears when the Webflow plan ends.
2. **Check provenance.** Record sha256, dimensions and EXIF (make, model, date, copyright). **Abort on third-party copyright.**
3. **Process.** Strip all EXIF, auto-rotate, and resize to masters of ≤ 2400 px (mozjpeg q86) in `src/assets/projects/<slug>/`.
4. **Write the manifest:** rights status, German alt-text draft, category, project, role.
5. **Gate it.** A Vitest check requires every referenced image to be in the manifest with a publishable status, no unlisted files, and no EXIF.

**Rights statuses:**

| Status | Photos | Use |
|---|---|---|
| `own` (company phones 2018–2023) | Shoji ×2, IMG_20200527, IMG_20210423, Fischgrät, KOWA Haustür, IMG_20230203, Schrankwand ×2, Team1 (needs consent from the people pictured) | Any size |
| `own-legacy` (Fujifilm 2010–2012, 800 px) | — | **Cards only.** Owner must confirm these are Schreinerei Schmidt projects (UWG). |
| `own-unverified` | 2019-09-20, ss_Rezessionen1, ulf_schmidt | Pending confirmation |

**Exclude:**
- The PaX AG images (`_MG_2703`, `_MG_2939`, `Fenster Detail 13_1`).
- The Adobe Stock video and `video_Schreiner`.
- Steel Interior and Admonter supplier photos.
- The `schreiner_schmidt_terasse*` / `kuche` / `boden` / `Turen` stock images.
- Screenshot PNGs.
- Unsplash images.

**15 draft reference projects** (groupings to confirm with the owner):

| Area | Projects |
|---|---|
| Türen & Altbau | Holzhaustür aufgearbeitet (vorher/nachher); Haustür im Gründerzeithaus; Moderner Eingang mit Holzlamellen |
| Treppen | Massive Eichentreppe; Eichenstufen & schwarzer Handlauf |
| Möbel | Raumhohe Einbauschrankwand (open/closed); Shoji-Kleiderschrank; Schreibtisch & TV-Möbel; Glasvitrine; Kernbuchenbett; Bad nach Maß |
| Böden | Dachausbau mit Massivholzdielen; Eichendielen im Altbau; Fischgrätparkett Eiche |
| Terrassen & Zäune | Sonnenplatz, Gartentor & Zaun |

**Photos to request from the owner:** Fenster, Terrassen, Altbau, the workshop and the team.

### 3.4 Copy rules
- **Migrate and correct the old copy:**
  - Fix every typo found in the inventory.
  - Rewrite the Leistungen intro and fix the Terrassen "Fenster" mix-up.
  - Linoleum is linseed-oil based, not cork.
  - Replace "über 10-jährige" with "seit 2010", with the years computed at build time.
- **Naming and typography:**
  - One business name: "Schreinerei Schmidt".
  - Sentence case only (`text-transform` is banned).
  - German quotes „…“.
  - U+202F (narrow no-break space) between number and unit.
  - The `&shy;` dictionary (`src/lib/shy.ts`) handles long compounds such as "Hochkant­lamellen­parkett".
- **Green claims (UWG / EU 2024/825):**
  - No generic environmental claims.
  - Write specific, verifiable statements (certified sources, named products), each marked `needs-review`.
  - The tagline stays in the demo, flagged for legal review.
  - A dist test lists every claim word for the owner checklist.
- **Reviews:**
  - Testimonials stay verbatim; permission is flagged.
  - The rating is shown as plain text, "5,0 bei 115 Google-Bewertungen (Stand 30.09.2026)", with a link.
  - **No Review or AggregateRating markup**, because reviews of a business on its own site are self-serving.

---

## 4. Design system: "Workshop Sketchbook"

### 4.1 Colour
OKLCH tokens in `src/styles/tokens/color.css`, built with `light-dark()`. `[data-theme]` only switches `color-scheme`.

| Token | Light | Dark ("Werkstatt bei Nacht") |
|---|---|---|
| `--surface` / `--surface-alt` / `--surface-panel` | cream #FFFBF5 / linen #F5F2E7 / sand #EBE5D1 | #160D07 / espresso #2C1403 / #362113 |
| `--ink` / `--ink-muted` | espresso #2C1403 / #635146 | #F0EBDF / #C1B1A0 |
| `--line` (decorative) / `--line-strong` (inputs, ≥3:1) | #CDBAAB / #8C685C | #503E34 / #957A6B |
| `--accent` (text, lines) | #9E2124 | **#EB8278** (brand red on dark is only 2.4:1) |
| `--accent-fill` / hover (buttons, cream text) | #9E2124 / #8B101B | #BA2B2B / #C7332F |
| `--focus` ("Blaupause" blue) | #1659B5 | #86C5FA |
| `--success` / `--error` | #236436 / #AF2E13 | #7CCD8E / #F6946D |
| `--sketch` / `--wordmark` | #513E31 / #8B101B | #D0C2AF / #EB8278 |

- **Contrast:** every pair is verified ≥ 4.5:1 for text and ≥ 3:1 for UI. Examples: ink 16.9, accent 7.6 / 7.3, button text 7.6 / 5.9.
- **Inverse bands** (`.band--ink`) set `color-scheme: dark` on the band, so all tokens flip inside it. Never register colour tokens with `@property`, which would freeze `light-dark()` at the root.
- **Tints** are derived from primitives inside `light-dark()`, avoiding the WebKit bug with relative colours on a `light-dark()` origin.
- **Special modes:** `prefers-contrast: more` (stronger ink and lines, 4 px focus, no grain) and `forced-colors` are both handled. Errors always come with an icon and text.

### 4.2 Typography
- **Fonts:**
  - **Red Hat Display Variable** for UI, body and headings: 400 body, 600 headings, 650 strong.
  - **Fraunces Variable Italic** for accent words and quotes. It has the same cap height, and `font-size-adjust: 0.5` matches the x-heights.
  - `font-synthesis: none`; no `font-variant-caps`.
- **Fluid scale** (360 → 1440 px, max/min ≤ 2 for WCAG 1.4.4):

  | Step | Size (px) |
  |---|---|
  | `--step--2` | 13 → 14 |
  | `--step--1` | 15 → 16 |
  | `--step-0` | 17 → 19 |
  | `--step-1` | 19.7 → 24.7 |
  | `--step-2` | 22.9 → 32.1 |
  | `--step-3` | 26.5 → 41.7 |
  | `--step-4` | 30.8 → 54.3 |
  | `--step-5` | 35.7 → 70.5 |

  Card titles use `clamp(var(--step-1), 6.5cqi, var(--step-2))`, so "Hochkantlamellenparkett" fits.
- **Measures:** prose 65ch, lead 48ch, h1 22ch.
- **Wrapping and hyphenation:**
  - `text-wrap: balance` on headings, `pretty` on text.
  - `text-box: trim-both cap alphabetic` on headings and buttons.
  - Prose: `hyphens: auto` with `hyphenate-limit-chars: 8 3 3`.
  - Headings break only at `&shy;`.

### 4.3 Layout
- **Page grid** with named lines: full / breakout (84rem) / content (72rem). Component grids use 4, 8 or 12 columns depending on the size of the `section` container.
- **Subgrid** for card rows, process steps, the footer and fact lists.
- **Spacing:** a fluid scale from `--space-3xs` to `--space-3xl` plus one-up pairs. Section padding is `--space-xl-3xl`.
- **Drawing-board details:**
  - 1 px hairline grids, left "open" like a technical drawing.
  - Crop-mark frames and graph-paper panels.
  - Square corners throughout.
- **Paper grain:** one inline SVG `feTurbulence` tile on `body` at ≤ 5% alpha. Dropped for high contrast, forced colours and print.

### 4.4 Signature elements
- **Masslinie (dimension line).** CSS-only component with 45° architect's ticks and extension lines. The label is real text, and the line draws on view.
- **Sketches.**
  - Drawings are defined as primitives in `src/lib/sketch/*` and rendered **at build time with rough.js** (seeded, so the output is deterministic).
  - That gives a consistent pencil look: multiple strokes, overshooting construction lines, hatching, one red accent pass.
  - SVG attributes: `stroke="currentColor"`, `pathLength="1"` so they can draw themselves, optimised with SVGO, and `aria-hidden`.
  - The set:
    - 7 services and 5 process steps;
    - 404 (a shelf with a missing board);
    - configurator teaser (exploded cabinet);
    - 6 floor-pattern minis;
    - about 14 UI icons;
    - stretch goal: a Mannheim skyline in the footer.
- **Sketch → photo.**
  - `scripts/make-sketch-variants.mjs` uses sharp to make a pixel-aligned "pencil" version of chosen photos: greyscale, edge convolution, invert and levels, then espresso tint on cream.
  - On scroll the sketch crossfades into the photo, **below the fold only**. Above the fold, the photo is visible immediately and vector annotations draw over it.
  - Fallback if the generated sketches look poor: crossfade from the service illustration instead.
- **Jahresringe (tree rings).** Seeded generative SVG growth rings (`src/lib/rings.ts`) for the Über-uns timeline, 2010 to today.
- **Wordmark.**
  - Phase 1: crop the PNG wordmark and use it as a CSS mask filled with `--wordmark`, so it follows the theme. The tagline becomes legible live text.
  - Later: replace it with the owner's vector logo.

---

## 5. Modern techniques map
Browsers today: Chrome/Edge 155, Safari 27, Firefox 157.

| Technique | Where | Support | Fallback |
|---|---|---|---|
| **Cross-document View Transitions** (`@view-transition`, `view-transition-class`, types via `pageswap`/`pagereveal` + Navigation API) | Every navigation: card→detail morphs (`proj-<slug>`, `hero-media-<service>`), persistent header, title swap, direction-aware slides | Chrome, Safari 18.2+ | Instant navigation (Firefox) |
| Same-document View Transitions | Referenzen filter, lightbox, theme switch, wizard steps | All three | Instant |
| **Scroll-driven animations** (`view()`, `scroll()`, `timeline-scope`) | Reveals staggered with `sibling-index()`, hero inset → full-bleed, sketch draw-on, sketch → photo, `@property` count-up counters, header condensing, process Masslinie, Jahresringe highlight | Chrome, Safari 26+ | Finished state (Firefox) |
| **Speculation Rules** (inline, `prerender` moderate) | All internal links except `konfigurator/*` (prefetch only) and `*/danke/` | Chrome | Normal navigation |
| Popover API + `@starting-style` + `allow-discrete` | Mobile nav sheet, Leistungen dropdown, theme picker, jargon tips | All | — |
| Invoker commands (`commandfor`/`command`) + `popovertarget` | Navigation, lightbox, dialogs | All current; `popovertarget` covers older Safari without JS | 0.4 KB JS for dialogs |
| Anchor positioning | Leistungen dropdown, theme picker, tips | All (core) | Fixed panel under the header |
| `<dialog closedby="any">` | Lightbox | Chrome, Firefox | Backdrop-click JS (Safari) |
| `::details-content` + `interpolate-size` | FAQ; job details (`<details name>` makes them exclusive) | Animated in Chrome | Instant |
| Customizable `<select>` (`appearance: base-select`) | Job select, configurator selects with wood swatches | Chrome, Safari 27 | Styled native select |
| `field-sizing: content`, `:user-invalid` | All forms | All | Fixed rows |
| Container size and style queries, `:has()`, nesting, `@layer`, subgrid | Everywhere. `:has()` drives the Referenzen filter and the configurator branches **without JS**. | All | — |
| `display: grid-lanes` (masonry) | Referenzen gallery | Safari 26.4+ | Uniform 4:3 grid |
| `scroll-target-group` / `:target-current` | Scroll-spy for the in-page nav on service pages | Chrome | No active state |
| OKLCH, `light-dark()`, `color-mix()`, relative colours | Tokens and themes | All | — |
| `text-box`, `text-wrap`, `font-size-adjust`, variable fonts | Typography | All (`pretty`: Chrome and Safari) | Normal wrapping |
| `content-visibility: auto`, AVIF, `fetchpriority`, `sizes="auto"` | Below-fold sections, images | All | — |
| WebGL (three.js r186) | Configurator 3D | WebGL2 | Live SVG technical drawing |

**Deliberately not used:**
- **CSS carousels:** there are only 3 testimonials, so a grid works better, and the controls are Chrome-only.
- **WebGPU:** +75–110 KB gz for no visual gain in this scene. The renderer adapter allows a switch later.
- **Other features with too little support:** interest invokers, `if()`, typed `attr()`, `@function`, `random()`, `reading-flow`, scroll-triggered animations, JPEG XL, `@scope` for critical styles.

**Motion rules (non-negotiable):**
- **Finished state by default.** Base CSS always renders the end state. Hidden start states exist only inside `@keyframes` (`fill-mode: both`), within `@media (prefers-reduced-motion: no-preference)` plus `@supports (animation-timeline: …)`. Declare `animation-timeline` *after* the `animation` shorthand, which resets it.
- **Never hide content while loading.** The LCP image's visibility is never animated. No preloaders, no artificial delays, and nothing loops or autoplays longer than 5 s.
- **Compositor-friendly properties only** (opacity, transform). Allowed exceptions: `stroke-dashoffset` on small SVGs, the hero `clip-path`, the counters, and details `block-size`.
- **View-transition naming:**
  - Names come from `src/lib/vt.ts`, a per-page registry that **throws on duplicates** and only emits ASCII idents.
  - Direction types (forward / back / lateral, from URL depth) are set by a hashed inline head script.
  - `<link rel="expect" blocking="render">` is added for Chrome.
- **Tokens:** durations of 120 / 220 / 380 / 900 ms; `linear()` easings for out, in-out, spring (lightbox only) and pencil.

**JS per page** (minified, before gzip):

| Script | Size |
|---|---|
| Inline head | ~1 KB |
| Nav | 0.4 KB |
| Theme | 0.7 KB |
| Invoker fallback | 0.4 KB |
| Before/after | 0.6 KB |
| Lightbox | 2 KB |
| Filter | 1 KB |
| Forms | 2.2 KB (accepted in Phase 2) |
| **Worst content page** | **≈ 6 KB** |

No framework; custom elements and event delegation.

### Page compositions
- **Home:**
  1. Demo banner and header.
  2. Hero: "Meisterbetrieb in Mannheim · seit 2010" with the h1 "Ihr Experte für *umwelt­bewusstes* Holzhandwerk"; CTAs "In 3 Minuten zum Angebot" and "Referenzen ansehen"; rating badge; framed panorama that opens to full-bleed on scroll, with Masslinien drawing over it.
  3. Stats (counters).
  4. 7 service cards in a hairline grid; their sketches draw on view.
  5. "Vom Entwurf zum Werkstück" (sketch → photo).
  6. Ablauf: 5 steps on a Masslinie.
  7. 3 featured projects plus the front-door before/after.
  8. "Holz mit Herkunft": specific, verifiable claims only.
  9. Testimonials grid.
  10. Configurator teaser.
  11. Careers teaser.
  12. CTA band and footer.
- **Service page:** page hero (sketch over photo, `hero-media-*`); sticky in-page nav; type cards (e.g. 6 Bodenarten with spec lists; the Landhausdiele diagram labelled "bis 5 m × 60 cm"); Holz & Oberflächen; Ablauf; related projects; FAQ; CTA linking to `/konfigurator/<typ>/`.
- **Referenzen:** filter chips (radio inputs + `:has()`), status line, masonry gallery.
- **Project page:** facts as a "Schriftfeld" (drawing title block); hero image (`proj-*`); Ausgangslage → Lösung → Ergebnis; gallery with lightbox; before/after; previous/next.
- **Über uns:** portrait; values; team photo; Jahresringe timeline (sticky rings, milestone list).
- **Karriere:** benefits; job cards; job pages; application form with CV upload (production) and a customizable select.
- **Kontakt:** call / e-mail / route actions; address and hours; static map (© OpenStreetMap-Mitwirkende, links out); short form.
- **Legal pages:** prose; table of contents with scroll-spy.

---

## 6. Konfigurator: wizard + 3D

### 6.1 Wizard
- **Steps.** 6 fixed steps for every branch, so the progress bar never changes length: **Projekt → Details → Ausführung → Rahmen → Kontakt → Prüfen & senden**.
  - 8 branches: Möbel, Boden, Treppe, Fenster, Tür, Terrasse & Zaun, Altbau, Sonstiges. Field tables per branch go in `docs/configurator.md`.
  - Shared fields: Zeitraum, Termin, Budget (optional), **PLZ** with a soft service-area hint, Ort, Name, E-Mail, Telefon, Kontaktweg, Nachricht.
- **No-JS baseline.** One native form.
  - Branch fieldsets are shown through CSS `:has()` rules generated from a single source, `conditions.ts`.
  - HTML `required` sits only on always-visible fields: Projektart, PLZ, Name, E-Mail.
  - Branch must-haves carry `data-required`. JS promotes them to `required` and also `disables` inactive branches, which removes them from validation and FormData.
  - `/konfigurator/[typ]/` preselects a project type without JS.
- **JS enhancement** (core ≤ 11.25 KB gz):
  - Pure reducer + effects state machine, with the DOM as the store.
  - Per-step validation with an error summary (GOV.UK pattern).
  - On step change, focus moves to the step heading.
  - Polite and assertive live regions.
  - Progress drawn as a dimension line.
  - Same-document view transitions between steps.
  - A live summary sidebar (a `<details>` on mobile).
  - **Shareable URL state** for non-personal fields only, with throttled `replaceState`.
  - sessionStorage; an **opt-in** localStorage draft that expires after 30 days; one `pushState` per step with `popstate` handling.
- **Submission.**
  - **Demo:** nothing is transmitted. The success view shows the summary, the drawing and the 3D snapshot, plus mailto, copy, download and print.
  - **Production:** `fetch` sends a multipart POST to form.taxi (JSON response), with honeypot, time-trap and one retry.
  - **Payload:** the plain field names; `anfrage_json`; a German `zusammenfassung`; photos (≤ 6, each ≤ 10 MB, downscaled client-side and EXIF-stripped); the 3D snapshot; the SVG drawing.
- **Afterwards:**
  - A "Was passiert jetzt?" timeline.
  - `/konfigurator/danke/` for production submissions without JS.
  - A privacy note in place of a consent checkbox (Art. 6(1)(b) DSGVO; legal review).

### 6.2 3D preview
- **Scope:** 4 furniture types from **2 pure generators**.
  - Carcass: Regal, Sideboard, Einbauschrank/Schrankwand fitted into a niche.
  - Table: Esstisch, with an optional Baumkante (live edge).
  - Bett gets form fields only; 3D for it comes later.
- **Generators** (`src/lib/configurator/furniture/`) produce a `Build`:
  - parts with a grain axis and stable ids;
  - dimension specs;
  - derived values;
  - German hints.
  - One `Build` feeds the 3D view, the SVG drawing, the summary, the tests and the future pricing module.
- **Carpentry constraints** (E-moduli are confirmed by the owner):
  - **Shelves:** max span `L_max = t·(E/0.16875)^(1/3)` (oak 19 mm ≈ 74 cm); bays split automatically, capped at 1200 mm; shelf positions on the 32 mm system grid.
  - **Doors:** 300–600 mm wide; hinge count follows door height.
  - **Drawers:** runner length derived from depth.
  - **Einbauschrank:** filler strips (Passleisten), and a split into cabinet plus Aufsatz above 2600 mm.
  - **Table:** apron ≥ 620 mm above the floor; estimated seat count.
- **Renderer:**
  - `WebGLRenderer` (about 143 KB gz with OrbitControls and RoomEnvironment) behind a one-file adapter.
  - NeutralToneMapping and RoomEnvironment PMREM lighting.
  - A Canvas2D contact shadow.
  - A transparent canvas, so the furniture sits on the sketchbook paper.
  - The camera auto-fits with hysteresis.
- **Controls:**
  - OrbitControls: no pan, with angle limits, and `touch-action: pan-y` so vertical swipes still scroll the page.
  - Buttons for Vorne / Seite / 3/4 / drehen / zoom / reset, which are the non-drag alternative required by WCAG 2.5.7.
- **Lifecycle:**
  - Renders on demand only; zero animation frames while idle.
  - Full dispose plus `forceContextLoss`.
  - If the WebGL context is lost, it falls back to the SVG drawing.
- **Materials:**
  - **Textures:** CC0 Poly Haven veneers: `oak_veneer_01`, `european_walnut_veneer_04`, `ash_veneer`, `cherry_veneer`. Kernbuche is approximated from `white_maple_veneer` and labelled "Holzbild beispielhaft".
    - `scripts/textures/prepare.mjs` turns them into 1K WebP albedo plus 512 normal maps, committed together with `SOURCES.md`.
    - Loaded lazily per species (LRU of 3).
  - **Finishes:** natur geölt / weiß geölt / lackiert matt, made with Canvas2D filters plus roughness and clearcoat.
  - **Grain:** UVs follow the grain per part, with continuous grain across sideboard fronts.
- **Loading:**
  - A "3D-Ansicht laden (ca. 0,3 MB)" poster button is always there.
  - Auto-load happens only on desktop, when the panel is visible, the browser is idle and Save-Data is off.
  - WebGL2 is probed before anything downloads.
  - `yieldToMain()` runs between init phases. Flat colours render first, then textures stream in.
- **Live SVG elevation drawing** (`src/lib/configurator/drawing/elevation.ts`):
  - Content: chains of dimension lines (Maßketten), door symbols and a title block (Schriftfeld).
  - Used before 3D loads, as the fallback, in the summary, and in print at a DIN scale.
  - It is also rendered at build time.
- **Accessibility:**
  - The canvas is `role="img"` with a debounced `describe(build)` label.
  - Every value has a number + range pair.
  - No auto-rotate.
- **Snapshot:** render the 3/4 preset and call `toBlob` in the same task; `preserveDrawingBuffer` stays off.
- **Pricing:** an `estimate()` stub with `enabled: false` and every rate `null`. It returns `null` and is never shown in the demo.
- **Budgets:**
  - Wizard ≤ 11.25 KB gz; Möbel preview ≤ 8.75 KB gz (re-split from 13 + 7 KB on 2026-10-10); 3D loader ≤ 1.5 KB gz (Phase 4); 21.5 KB total.
  - three.js chunk ≤ 160 KB gz.
  - First textures ≤ 260 KB.
  - Click → first frame ≤ 0.8 s on desktop, ≤ 2.5 s on a mid-range Android.
  - No task over 250 ms.

---

## 7. Forms, SEO, legal, privacy
- **Forms** (contact, application, configurator): shared `FormShell` plus `scripts/forms/enhance.ts`.
  - **Markup:** visible labels, "(Pflichtfeld)" as text, `autocomplete` and `inputmode` attributes, inputs ≥ 16 px.
    - PLZ: `inputmode=numeric pattern=[0-9]{5}`.
  - **Errors:** an error summary that receives focus; inline errors via `aria-describedby` and `aria-invalid`; `:user-invalid` styling.
  - **Demo:**
    - Without JS: `method="dialog"`, so validation runs and nothing is sent, with the note "Demo: Es werden keine Daten übertragen."
    - With JS: an inline success message and zero network requests.
  - **Production:**
    - POST to form.taxi with `_next` (danke page), `_subject`, `_replyto` and `_lang=de`, or `fetch` with `Accept: application/json`.
    - Honeypot (class-hidden) plus a 3 s time-trap.
    - CV upload on the job form.
  - **Never GET** personal data, and never POST to Pages (it returns 405).
- **SEO:**
  - Titles `{title} | Schreinerei Schmidt` (≤ 60 characters) and German descriptions.
  - `lang="de"`, `og:locale=de_DE`; OG images are 1200×630 crops via `getImage()`.
  - Demo: noindex and no canonical. Production: self-canonical, sitemap, robots.txt.
  - **JSON-LD (confirmed facts only):**
    - `HomeAndConstructionBusiness`: founder, areaServed, `sameAs` the Google profile.
    - `WebSite`.
    - `Service` per service page.
    - `BreadcrumbList`.
    - `JobPosting` only on `/karriere/[slug]/`.
    - No review markup. FAQPage is optional (no rich results).
- **Legal templates**, flagged "Rechtliche Prüfung ausstehend":
  - **Impressum per §5 DDG:**
    - Owner, legal form, address, phone, e-mail.
    - Schreinermeister (DE); Handwerkskammer Mannheim Rhein-Neckar-Odenwald; Handwerksrolle no.; HwO.
    - USt-IdNr. or W-IdNr.; professional liability insurance if any.
    - **No ODR link.**
  - **Datenschutz:**
    - No cookies, tracking or external fonts or embeds.
    - **GitHub Pages hosting logs (DPF)**; this section can be swapped for an EU host.
    - form.taxi as processor with a DPA (AVV); the demo transmits nothing.
    - Applications, with the retention period.
    - Browser storage under §25 Abs. 2 Nr. 2 TDDDG: theme only after the user chooses, configurator session state, opt-in draft.
    - Data subject rights; LfDI BW as supervisory authority.
- **BFSG:** the micro-enterprise exemption is likely, but WCAG 2.2 AA is the target anyway.
- **Demo banner** (not sticky): "Entwurf – nicht die offizielle Website", with a link to the live site.

---

## 8. CI/CD and one-time setup
- **`.github/workflows/deploy.yml`.** Explicit steps rather than `withastro/action`, because we need `npm ci`, tests that gate the deploy, and the env from configure-pages.
  - **build** (pull requests and main):
    1. checkout and setup-node (`.nvmrc`, npm cache).
    2. configure-pages: pass `origin` and `base_path` on as `SITE` and `BASE_PATH`.
    3. `npm ci`; cache `.cache/astro`.
    4. `format:check`, `astro check`, unit tests, build, dist tests + html-validate.
    5. Playwright (chromium/firefox/webkit, mobile, no-JS, axe) with cached browsers.
    6. Internal link check.
    7. `upload-pages-artifact` (main only). On failure, upload the Playwright report.
  - **deploy** (main only): `deploy-pages`, with `concurrency: pages` and `cancel-in-progress: false`, and permissions `pages: write` + `id-token: write`.
  - **smoke** (after deploy), checks the live URL:
    - the noindex meta tag is present;
    - `/schreinerschmidt.com` → 301;
    - an unknown path → 404;
    - POST → 405.
- **`quality.yml`** (weekly and manual): audit build → Lighthouse (median of 3, mobile) plus external link checks; reports uploaded as artifacts.
- **`dependabot.yml`:** npm weekly, with Astro packages grouped and `typescript >= 7` ignored; Actions monthly.
- **One-time setup (Phase 0, confirm with the user first):**
  1. **Git identity.** None is configured. Use a repo-local identity, e.g. the GitHub noreply address.
  2. **Remote URL.** `git remote set-url origin https://github.com/gunnargehtab/schreinerschmidt.com.git`, fixing the old repo name.
  3. **Line endings.** `.gitattributes` with `eol=lf`, because the system-wide `autocrlf=true` would break CSP hashes.
  4. **First push.** Only after the user OKs publishing to the public URL. If the workflow file is rejected, run `gh auth refresh -s workflow`.
  5. **Enable Pages.** `gh api -X POST repos/gunnargehtab/schreinerschmidt.com/pages -f build_type=workflow`, then `gh variable set PUBLIC_DEMO --body true`.

---

## 9. Implementation phases
| # | Phase | Scope | Definition of done | Size |
|---|---|---|---|---|
| 0 | **Pipeline spike** | See below | See below | S |
| 1 | **Foundations** | See below | See below | M |
| 2 | **Pages** | See below | See below | L |
| 3 | **Configurator A: wizard + SVG drawing** | §6.1 with all 8 branches; isomorphic generators; SVG elevation at build time and live | All non-3D unit and e2e specs green in 3 engines + mobile; the no-JS long form works; axe 0 in every step and state; JS budgets hold; lab INP < 100 ms | L |
| 4 | **Configurator B: 3D carcass** | §6.2 for Regal, Sideboard, Einbauschrank: renderer adapter, loader, materials, controls, overlay, snapshot, quality tiers | three chunk ≤ 160 KB gz and absent from every other page; time-to-first-frame and memory targets met; 0 rAF while idle; pixel test passes in Chromium (SwiftShader); clean fallbacks in WebKit, Firefox and with WebGL blocked; 10 load/dispose cycles without leaks | L |
| 5 | **Configurator C + polish** | See below | See below | M |
| 6 | **Production** (after owner sign-off; not part of the demo) | See below | Old URLs resolve on the real domain; the build refuses placeholders | S |

**Phase 0: pipeline spike**
- **Scope:**
  - **First, the multi-model setup (§13):**
    - `CLAUDE.md` with the conventions and routing rules.
    - The 10 agent files in `.claude/agents/`.
    - `docs/`: plan, design system (tokens, motion catalogue), configurator spec (field tables, constraints), **content inventory** with the verbatim old German copy, and the owner checklist.
    - Subagents can't see this conversation, so every delegated task works from these files.
  - Scaffold and pins.
  - `BaseLayout`: CSP, theme-init script, view-transition types, speculation rules, noindex.
  - 3 stub pages, the 404 page and one redirect.
  - One migrated photo rendered through `<Picture>`.
  - Fonts.
  - `serve-dist.mjs`.
  - Chromium smoke test and dist tests.
  - The workflow; enabling Pages.
  - **Archive all CDN originals.**
- **Definition of done:**
  - The live URL returns 200 with noindex, and `/schreinerschmidt.com` returns 301.
  - Deep misses show the styled 404, and `/leistungen/boden/` lands on `/boeden/` under the base.
  - 0 CSP violations in Chrome, Firefox and WebKit.
  - Only self-hosted, base-prefixed latin woff2 font files are requested.
  - `astro check` is clean on TS 6.0.3.

**Phase 1: foundations**
- **Scope:**
  - Tokens, layers, typography and `shy.ts`.
  - Light/dark themes and the theme toggle.
  - Header (wordmark mask, desktop nav with anchored dropdown, mobile popover sheet), footer, skip link, demo banner, breadcrumbs.
  - `Seo`, `JsonLd`, the URL helpers, `vt.ts`.
  - All content schemas with seeded, corrected copy and flagged placeholders.
  - The migration script and manifest, and the sketch-variant script.
  - The rough.js pipeline with the first 3 drawings.
  - All CI gates live.
  - **Follow-ups from the Phase 0 review:**
    - Replace Astro's generated redirect pages, which have English copy, no `lang`, no charset, no CSP and a canonical even in demo mode. Use `src/pages/[...legacy].astro` over `legacyRedirects`: German copy, `lang="de"`, meta refresh, noindex and no canonical. Then drop `redirects` from the config and re-enable html-validate's `doctype-style`.
    - Unit-test the forward/back/lateral/reload classifier in `vtTypesScript` with stubbed activations, or factor it into an exported pure function.
    - Specs for the Playwright `no-js` and `a11y` projects.
    - A `test:dist:audit` script with `env/audit.env`, together with `quality.yml`, `scripts/lighthouse.mjs` and `scripts/migrate-assets.mjs`.
- **Definition of done:**
  - Every gate is green on placeholder pages.
  - The migration is reproducible and the manifest cross-check passes.
  - axe is clean on the header and footer in both themes.

**Phase 2: pages**
- **Scope:**
  - Home.
  - Leistungen plus 7 service pages.
  - Referenzen (`:has()` filter, view transitions, grid-lanes) and the detail pages (lightbox, before/after).
  - Über uns (Jahresringe).
  - Karriere, the job pages and the application form.
  - Kontakt and the danke pages.
  - Legal templates and `/intern/pruefliste/`.
  - The remaining sketches.
  - **Follow-ups from the Phase 1 review:**
    - The 404 page gets its 4 section links (design-system §8).
    - Kontakt reads its NAP from `settings`, with `data-review` marks, instead of hard-coded text. `rating.profileUrl` is rendered only once it is `confirmed`.
    - Sketch hatching (pass 3) scales with `drawing.strokeWidth` (e.g. ×0.5) instead of a fixed `.75`; it is too faint on hero art.
    - `check-budgets.mjs`: review the LCP candidate evaluation (1280 px / DPR 1 vs. Lighthouse mobile) once the real hero lands.
    - The green-claim scan flags the adverb „natürlich“; accept the noise or refine the stem list.
  - **Phase 3:** add the configurator rows (13 KB / 7 KB) to `ROUTE_BUDGETS` in `check-budgets.mjs`.
- **Definition of done:**
  - axe, html-validate, link and budget checks are green.
  - The audit build meets the Lighthouse targets.
  - Every page works without JS and in Firefox's fallback mode.
  - All 8 legacy redirects from §3.1 are active. (Done in Phase 1.)

**Phase 3 entry: follow-ups from the Phase 2 review**
- Service CtaBand → `/konfigurator/<typ>/`. Key→typ map: boeden→boden, tueren→tuer, terrassen→terrasse, treppen→treppe, fenster, moebel, altbau. `[key].astro` hard-codes the TypeCards section id `unsere-bodenarten`; make it data-driven.
- `ROUTE_BUDGETS`: add the configurator rows (13 KB initial + 7 KB Möbel preview).
- `check-budgets.mjs`: also evaluate the mobile LCP candidate (4:5 crop) or document the decision.
- Clean up duplication: the `.gallery` grid CSS (FilterBar and Gallery), job TYPES/UNITS + salary logic (→ `src/lib/jobs.ts`), the review `marked()/status()` helpers, the project-count text. Wire or delete the dead copy keys in `ui.yaml` / `home.yaml`.
- `src/lib/map.ts` pin sits on the street, not no. 33. Confirm the coordinates or route by address text, and list it in the Prüfliste.
- Project bodies need owner facts (Ausgangslage / Lösung / Ergebnis, pull quote). Don't invent them.
- Datenschutz already describes the configurator's PLZ check and storage. Keep it in sync when Phase 3 lands.
- Tests: replace the short `waitForTimeout`s in `home-hero.spec.ts` with `expect.poll`. Optionally unit-test `jobPostingJsonLd()` and drop the demo address override.

**Phase 3 status** (done 2026-10-10, last commit `91d7a73`): wizard, no-JS form, 8 deep-link variants, generators, SVG elevation, review fixes. `npm run verify` green: 977 unit, 1095 dist and 824 e2e tests in 7 Playwright projects (incl. iPhone 15).

**Phase 4 entry: notes from Phase 3**
- **Budget headroom:**
  - The Möbel preview chunk measures 8.52 of 8.75 KB gz. `preview/load3d.ts` (poster button, WebGL2 probe, auto-load conditions; docs/configurator.md §4.9) must fit into the remaining 0.23 KB. Everything else goes into the `import()`ed viewer chunk.
  - If the loader doesn't fit, ask the user before changing a budget. The budgets were already re-split twice: 11.25 / 8.75 / 20 KB initial, and the full flow ≤ 18.75 KB (≤ 27.25 KB with the preview).
- **Already settled:**
  - Vite's preload helper (about 1 KB) can't be switched off from `astro.config` in Astro 7.3.
  - `check-budgets.mjs` reads rolldown's backtick `import()` specifiers. The three.js chunk check (≤ 160 KB) is still a TODO there.
- **DOM:**
  - `[data-viewer]` sits in the same grid cell as `[data-preview-drawing]` (`grid-area: 1/1` in `.preview__stage`).
  - The stage no longer clips, so add `overflow: clip` on `[data-viewer]` if needed.
  - The `data-msg-viewer-*` strings (loading / ready / unavailable) exist in the markup, and `announce.viewer.*` is in `konfigurator.yaml`.
- **Code:**
  - `describe()` returns the sentence without the "3D-Vorschau: " prefix; the viewer adds it.
  - The viewer gets its `Build` through `preview/index.ts` `buildFor()`.
  - The species `avgColor`s in `furniture/species.ts` are placeholders until `scripts/textures/prepare.mjs` measures them.
- **Textures need the user.** Poly Haven forbids scraping, so the 2K Diffuse + `nor_gl` maps must be downloaded by hand (docs/configurator.md §4.4): `oak_veneer_01`, `european_walnut_veneer_04`, `ash_veneer`, `cherry_veneer` and `white_maple_veneer`. Ask for them at the start of Phase 4. Until they arrive, build with flat species colours, which is the first-frame path anyway.
- **Owner open items** (flagged; don't invent):
  - the E-moduli;
  - the PLZ tiers;
  - the list of form.taxi `error_msg` texts for German mapping;
  - "3 Minuten" / "2 Werktage" / Aufmaß;
  - the privacy note (legal);
  - the before/after door reference;
  - the map pin.

**Phase 4 status** (2026-10-10): three.js viewer for Regal, Sideboard and Einbauschrank (`src/scripts/configurator/viewer3d/*`), the loader `preview/load3d.ts`, view controls, overlay, context loss, quality tiers, the texture pipeline (`scripts/textures/prepare.mjs`) and the e2e specs `konfigurator-viewer{3d,-fallback,-isolation}`. Follow-ups: real textures with per-species calibration, the demo snapshot, the observable orbit limit, and the auto-load gate counting `input` events (last commit `da9b253`). Measured (gz): Möbel preview 8.62 / 8.75, 3D loader 1.41 / 1.5, core + preview + loader 21.17 / 21.5, three + viewer 143.2 / 160, full flow 18.90 / 19.0, flow + preview + loader 28.93 / 29.0. SwiftShader: click → ready about 2.5 s, +1.2 MB heap over 10 load/dispose cycles, 0 live contexts. `npm run verify` green: 1024 unit, 1095 dist and 878 e2e tests.

**Deployment** (2026-10-10): the repo is public and GitHub Pages is enabled (Source: GitHub Actions); before that the deploy job was skipped on every run since Phase 0 because `configure-pages` failed. The demo is live at `https://gunnargehtab.github.io/schreinerschmidt.com/` (noindex, 404, redirects and the 3D viewer checked live). The owner's OK for sharing the URL (§12 point 1) is still open. Check the `deploy` job, not only the run conclusion.

**Phase 5 entry: notes from Phase 4**
- **Budgets raised for the demo snapshot** (with the user, 2026-10-10): full flow ≤ 19.0 KB and flow + preview + loader ≤ 29.0 KB (were 18.75 / 28.75). The demo success view now shows the 3D snapshot as an `<img>` with a download link and the live payload attaches `ansicht_3d.webp` (configurator.md §4.12). Headroom after that is small again (see `scripts/check-budgets.mjs`); any new bytes in the core, preview, submit or payload chunks need a decision with the user first.
- **Orbit limit is observable:** `[data-viewer]` carries `data-viewer-az` (camera azimuth in whole degrees, written when the camera has settled) for the e2e test of the per-kind limits (configurator.md §4.6).
- **Textures:** processed and committed (`src/assets/textures/`, real tile sizes from the Poly Haven API: oak 1830 mm, the others 1000 mm). The per-species calibration (`SPECIES_ADJUST` in `prepare.mjs`) and the finish filters (configurator.md §4.4) are `needs-review` against the owner's samples: Kirsche still reads flat and salmon, and the Kernbuche heartwood is synthetic. After any change: `npm run textures`, then copy the printed `avgColor`s into `furniture/species.ts` (golden SVGs change with them).
- **CI:** the desktop 3D auto-load fires in Desktop Chrome projects; specs that assert the polite live region close its gate with Save-Data (see `konfigurator-flow.spec.ts`). `chrome.spec.ts` "mobile sheet" was flaky in two CI runs (retry passed); worth a look.
- **Not measurable in CI:** time to first frame (≤ 0.8 s desktop / ≤ 2.5 s mid-range Android) and GPU memory. Check on real devices in Phase 5 QA.
- Table builds render as boxes; the Esstisch live edge (`ExtrudeGeometry`) is Phase 5. The optional DirectionalLight shadow was not added.

**Phase 5: configurator C + polish**
- **Scope:**
  - Esstisch 3D with Baumkante, door and drawer animation, explode view, finish tuning.
  - Motion polish (view transitions and scroll-driven animations).
  - Print CSS, OG images, favicons.
  - The `?pruefen` review marks.
  - Real-device QA.
  - An owner walkthrough script.
- **Definition of done:**
  - Budgets still hold.
  - Reduced motion is respected everywhere.
  - The demo walkthrough is ready.

**Phase 5 status (3D)** (2026-10-10): Esstisch in 3D with the Baumkante (`viewer3d/live-edge-geometry.ts`: `ExtrudeGeometry` from `liveEdgeOutline()` with a custom `UVGenerator`, group 1 on a darker „Waldkante“ material derived from the species set), doors (100°) and drawers (0.7 × depth) that open, the exploded view (15 % of the largest size) and the two `aria-pressed` toggles „Türen öffnen“ (label by fronts: Türen / Schubkästen / both; hidden without fronts) and „Aufbau zeigen“ in the view-button group, 600 ms (a jump under reduced motion), dimensions hidden while a toggle is on, both off on a kind switch, the snapshot always closed and assembled. The explode directions and the handles' motion are derived in the pure `furniture/assembly.ts`, which only the viewer chunk imports: the preview chunk (carcass generator) had no room for them, so the generators are unchanged. Finish tuning (`SPECIES_ADJUST`), chamfers, sketch mode, PCF shadows and wall hatching are still open. Test hook: `data-viewer-pose` on `[data-viewer]`.

**Phase 5 status** (done 2026-10-11, reviewer verdict APPROVE): besides the 3D work above, favicons and a base-aware manifest (placeholder „S“ until a vector logo exists), a site-wide default og:image, print polish (NAP kept, before/after side by side, no blank first page, break rules), the `?pruefen` view (exact parameter, session flag `ss-pruefen`, legend with „Prüfansicht beenden“ / „Prüfliste“; rendered in demo builds only), the motion audit against design-system §6 (view-transition exits/entries, token timings, header hairline, popover fade under reduce) with `tests/e2e/motion-reduced.spec.ts` in every engine, a deterministic `chrome.spec.ts`, `docs/walkthrough.md` (owner walkthrough, German) and `docs/qa-devices.md`. Measured (gz): full flow 18.96 / 19.0, flow + preview + loader 28.98 / 29.0, Möbel preview 8.62 / 8.75, 3D loader 1.41 / 1.5, three + viewer 153.2 / 160 (`ExtrudeGeometry` pulls in Shape/Earcut, about 10 KB; a hand-rolled strip mesh would cost about 1 KB).

**Phase 5 follow-ups**
- **Budget headroom is about 20–40 bytes** on the configurator flow rows. Any new byte in the core, preview, submit, payload or shared BaseLayout scripts needs a decision with the user first (trim something or raise a budget).
- **Real-device QA** (`docs/qa-devices.md`) needs the user: time to first frame and GPU memory can't be measured in CI.
- **3D cosmetics** from the final visual QA (none blocking):
  - a faint horizontal line across the Esstisch Zarge in the front view (part overlap or a group edge?);
  - in Draufsicht, skip dimensions whose `offsetDir` is parallel to the view direction (the „75“ stub, the length line under the slab);
  - Kufen Stahl almost merge with the dark paper in dark mode (lighter metal or more env reflection in dark);
  - the flat grey shadow footprint under an exploded Sockel.
- **Still open from configurator.md §8 C:** finish tuning against the owner's samples (Kirsche flat/salmon, synthetic Kernbuche heart), 2 mm chamfers, sketch mode, PCF shadows, wall hatching.
- **Review view:** „Prüfansicht beenden“ drops other query parameters (`?kategorie`, wizard state). Accepted for an owner tool; the fix costs JS on configurator pages.
- **Print:** Chromium mis-paginates `break-inside: avoid` on grid items, so cards may split across pages (documented in `print.css`).
- **`konfigurator-viewer3d` frame-count tests** can fail under heavy parallel load (SwiftShader); they pass when rerun alone.

**Phase 6: production**
- **Scope:**
  - Choose the host and domain. GitHub's terms discourage hosting a business site, so recommend an EU static host.
  - form.taxi plus the DPA (AVV); set `PUBLIC_DEMO=false`.
  - Legal sign-off.
  - Sitemap and Search Console.
  - DNS and HTTPS; host-level 301 redirects.
  - Real photos.

---

## 10. Verification
1. **Locally:** `npm run verify` runs format, `astro check`, unit tests, the base-path build, dist tests and html-validate, Playwright (chromium/firefox/webkit, mobile, no-JS, axe in light and dark), and the internal link check.
2. **Pages emulation:** `npm run build && npm run serve` → `http://localhost:4173/schreinerschmidt.com/`.
   - **Chrome/Edge:** view transitions, scroll-driven animations, and DevTools → Application → Speculative loads.
   - **Firefox:** the fallback reference; everything must be visible.
   - Keyboard-only.
   - NVDA.
3. **Lighthouse:** `npm run build:audit && npm run lighthouse`, checked against the targets above.
4. **Configurator:**
   - Every branch end to end, with and without JS.
   - Deep links `/konfigurator/boden/` and `?typ=boden`.
   - Restoring from a shared link.
   - 3D loading and fallback (`?3d=aus`, WebGL blocked).
   - The print summary.
   - The demo submit shows the summary and the mailto link.
5. **Deploy:** a push to main runs build, test, deploy and smoke green. Then open the Pages URL and confirm:
   - the noindex meta tag;
   - the 404 page;
   - the legacy redirects;
   - in the Network panel: same-origin requests only, no cookies, no CSP violations.
6. **Real devices:**
   - iPhone with Safari 26/27 (view transitions and scroll-driven animations).
   - Older iOS (the `popovertarget` fallback).
   - Android Chrome.

## 11. Top risks and mitigations

| Risk | Mitigation |
|---|---|
| Dotted base path, and redirects that ignore it | `url()` helper, `withBase()` on redirects, `serve-dist` emulator, dist tests |
| CSP hash drift or inline styles | Single-source inline scripts, LF line endings, hash test, `style-src-attr` for custom properties. Fallback: no CSP in the demo. |
| Astro 7 compiler strictness and whitespace | `compressHTML: true`, html-validate, a whitespace canary test |
| TS 7 breaks `astro check` | Pin TS 6.0.3; Dependabot ignore |
| Image rights and privacy (PaX, legacy photos, team consent, EXIF) | Manifest rights gate, EXIF test, owner confirmations, demo banner, owner OK before the URL is shared |
| Green-claims law | Specific claims, claim-word list, legal review |
| 3D on weak devices or without WebGL | On-demand load, SVG as a first-class fallback, render on demand, quality tiers, budgets enforced in CI |
| Animations hide content in Firefox | "Finished state by default" rule, plus an e2e visibility test in Firefox |
| Duplicate view-transition names | The `vt.ts` registry throws at build time |
| The Webflow CDN goes away | Archive the originals in Phase 0 |

## 12. Open questions for the owner
None of these block the demo; placeholders are flagged.

1. OK to publish the demo with his photos and data at a public, noindexed URL?
2. Legal form, USt-IdNr. or W-IdNr., Handwerksrolle number, insurance, a landline number.
3. Opening hours (Mo–Fr 7–17?), service area and PLZ tiers, response-time promise, Aufmaß policy.
4. Photos and services:
   - Is Treppen a service of its own?
   - Are the 2010–2012 photos his own projects?
   - Do the draft project groupings belong together?
   - Does the team photo have consent?
   - Does he hold PaX marketing rights?
5. Jobs still open? Salary? Details of the 4-day week?
6. Reviews and profile: permission to quote the testimonials? Is "1.000+ Projekte" accurate? The Google Business Profile URL?
7. Evidence for the sustainability claims (FSC/PEFC, Auro), or reworded copy.
8. Configurator: furniture types, woods, finishes, handles, maximum part sizes, prices (later).
9. New photos and a vector logo.
10. Production host, domain and DNS; form.taxi account and DPA (AVV).
11. AI assistant for enquiries and chat: proposed in `docs/assistant.md` (not part of this plan until approved).

---

## 13. Execution: multi-model routing (Claude 5.5 family)

**Verified.** Claude Code **2.1.295** is installed. The aliases need these versions or later: `opus` → Opus 5.5 (2.1.280), `sonnet` → Sonnet 5.5 (2.1.284), `haiku` → Haiku 5.5 (2.1.293), `fable` → Fable 5.1 (2.1.257).

| Model | Price per M tokens (input / output) | Note |
|---|---|---|
| Haiku 5.5 | $0.10 / $0.50 | |
| Sonnet 5.5 | $2 / $10 | |
| Opus 5.5 | $4 / $20 | |
| Fable 5.1 | $10 / $50 | Most capable. Not a plan default; it may bill to usage credits. |

**How it works:**
- **Main session = orchestrator on Opus 5.5** (`/model opus`, `/effort high`). It keeps the plan, delegates, reviews every diff, integrates, runs verification and commits.
- **Project subagents** in `.claude/agents/*.md` each pin a `model`, an `effort` and a `tools` list.
- **Model precedence:** per-call override > agent frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > main model.
- **Cheap search:** the built-in Explore, Plan and general-purpose agents would inherit Opus, so search goes to a Haiku `code-scout` instead.
- **Context:** subagents start without this conversation, so Phase 0 writes `docs/` and `CLAUDE.md` first. Every delegation names its spec file(s), the exact files to touch, and the acceptance commands.
- **Workflows** (`ultracode` / "use a workflow") are optional and only start when the user asks. Sensible uses: fan-out in Phase 2 (pages) and the final QA sweep. The default size guideline is fewer than 10 agents.

**Agent roster** (`.claude/agents/`):

| Agent | model | effort | tools | Responsibilities |
|---|---|---|---|---|
| *(main session)* | Opus 5.5 | high | all | Orchestration, routing, integration, commits. Writes `docs/`, `CLAUDE.md` and the agent files in Phase 0. |
| `core-engineer` | opus | high | Read, Glob, Grep, Edit, Write, Bash | Site infrastructure: `astro.config` + CSP inline scripts, url/vt helpers, `serve-dist`, asset migration + provenance, SEO/JSON-LD libraries, form infrastructure, CI/test harness |
| `design-engineer` | **fable** | high | Read, Glob, Grep, Edit, Write, Bash | Design-system core: tokens, typography, layout primitives, motion/view-transition system. rough.js sketches and the sketch→photo pipeline. Home hero and signature interactions. **Visual QA** from Playwright screenshots (light/dark/mobile). |
| `configurator-engineer` | **fable** | high | Read, Glob, Grep, Edit, Write, Bash | Wizard controller/state/serialize/history; furniture generators + constraints; SVG elevation; three.js viewer core (renderer adapter, grain-aware geometry, materials, camera fit, lifecycle, contact shadow, overlay, snapshot); Baumkante |
| `copywriter` | **fable** | high | Read, Glob, Grep, Edit, Write | Flagship German copy: home, service intros, Über uns, Karriere, configurator microcopy. Also the Impressum and Datenschutz templates. Claims must be specific and UWG-compliant. |
| `reviewer` | **fable** | high | Read, Glob, Grep, Bash | Read-only review of **every** phase diff against the plan and specs: correctness, a11y, base path, CSP, budgets, visual consistency. Also the final pre-demo review. |
| `implementer` | sonnet | medium (high for bug fixes) | Read, Glob, Grep, Edit, Write, Bash | Components, pages and CSS from the specs and the patterns `design-engineer` sets up; content schemas; forms; wizard branch markup; tests |
| `content-editor` | sonnet | medium | Read, Glob, Grep, Edit, Write | Bulk content migration from the inventory: typo fixes, YAML/MD entries, draft alt texts (it looks at the photos) |
| `scaffolder` | haiku | low | Read, Glob, Grep, Edit, Write, Bash | Boilerplate, config and dotfiles; exact mechanical edits (redirect map, dependabot, package pins) |
| `test-runner` | haiku | low | Read, Glob, Grep, Bash | Runs build/check/tests/links/Lighthouse/budgets and returns concise failure summaries. Never edits. |
| `code-scout` | haiku | low | Read, Glob, Grep | Finds files, symbols and call sites with line numbers |

**Routing rules** (these go into `CLAUDE.md`):
1. **Cheapest capable agent first.** After **1 failed attempt**, escalate one tier: Haiku → Sonnet → Opus → Fable.
   - A failed attempt means the acceptance commands fail, the review rejects the work, or the agent reports it couldn't finish.
   - The work listed in rule 4 starts on Fable, because quality is the deciding factor there.
2. Parallel agents only work on disjoint files. Worktree isolation is only for long independent tracks; the orchestrator merges them.
3. Subagents never commit or push. The orchestrator reviews the diff, has `test-runner` verify, then commits. **Pushes and deploys only happen with the user's OK.**
4. **Fable 5.1 is used wherever it raises output quality:**
   - the design system and motion;
   - sketches;
   - the Home hero and signature interactions;
   - visual QA;
   - the whole configurator core, including 3D;
   - flagship German copy and the legal drafts;
   - every phase review;
   - every escalation.
5. **Cost.** Fable is the main cost driver, so watch `/usage`. The first levers, if needed:
   - Lower the Fable agents to `effort: medium`.
   - Move `copywriter` back to Sonnet.

**Work per phase:**

| Phase | Fable (design / configurator / copywriter / reviewer) | Opus (main / core-engineer) | Sonnet (implementer / content-editor) | Haiku (scaffolder / test-runner / scout) |
|---|---|---|---|---|
| 0 | Review of the pipeline spike | `docs/` + `CLAUDE.md` + agent files; config, CSP, base path, `serve-dist`, workflow | Layout stubs, smoke tests | Package pins and dotfiles; build and test runs |
| 1 | Tokens, typography, layout primitives, motion system, first sketches; phase review | url/vt helpers, migration + provenance, SEO/JSON-LD libraries, CI gates | Header/nav/footer/theme following the design spec, content schemas; content seeding, draft alt texts | YAML and redirect data; test runs |
| 2 | Home hero and signature interactions, remaining sketches, sketch→photo; flagship copy and legal drafts; visual QA; phase review | Form infrastructure, integration | Remaining pages and sections, lightbox, filter, before/after, forms | axe, link and Lighthouse triage |
| 3 | Wizard controller/state/history, generators + constraints, SVG elevation; wizard microcopy; phase review | Integration | Branch fieldsets, sidebar, submission UI, tests | Test runs |
| 4 | three.js viewer core; phase review | Integration | Texture-prep script, view controls | Pixel and budget tests |
| 5 | Esstisch/Baumkante, door and explode animation; final visual QA; final review | Integration, final fixes | Print, OG images, favicons, polish | QA sweeps |

**User setup before implementation:**
1. The session already runs on Opus 5.5. Only run `/effort high`, which changes nothing in the context. Planning ran at `max`, which is fine for planning but "prone to overthinking" during implementation.
2. **Don't compact yet.** The detailed specs (verbatim old-site copy, exact tokens, configurator field tables, constraint formulas) so far exist only in this conversation. Phase 0 writes them to `docs/` first.
3. Approve the plan. Phase 0 starts with `docs/`, `CLAUDE.md` and the agent files.
4. **Then compact**, e.g. `/compact Keep plan file path, routing rules, Phase 0 status`, or start a fresh session. From then on, everything the agents need lives in the repo.
5. Optional: `/statusline show model, effort, session cost and context percentage`. `/usage` shows cost per model, and `/tasks` shows running subagents.
