# Design system: "Workshop Sketchbook"

This is the authoritative spec for tokens, typography, layout, components and motion. All contrast ratios below were computed against WCAG and pass AA. Browsers checked: Chrome/Edge 155, Safari 27, Firefox 157 (October 2026).

## 0. Key decisions

1. **Colour tokens**
   - Tokens use `light-dark()`. `[data-theme]` only changes `color-scheme`.
   - Inverse bands set `color-scheme: dark` on the band.
   - Brand red is the button fill in both themes. As text on dark backgrounds it becomes `#EB8278`.
   - The focus ring is a separate "Blaupause" blue.
2. **Fonts:** Red Hat Display Variable plus Fraunces Variable Italic (the wght file) as the only accent face.
3. **Finished state by default:** every hidden start state lives inside `@keyframes` (`fill-mode: both`), inside `@supports` and `prefers-reduced-motion: no-preference`. Base CSS always renders the finished state.
4. **The LCP image is never hidden.** Sketch→photo reveals happen only below the fold. Above the fold, sketches draw over an image that is already visible.
5. **View-transition names** come from `src/lib/vt.ts`, which throws on duplicates. Names reach CSS via `--vt`.
6. **Mobile navigation:** `commandfor` + `command="toggle-popover"` **plus** `popovertarget` on the same button. A resolved `commandfor` takes precedence, so older Safari gets a working menu with zero JS.
7. **Testimonials:** a grid, not a carousel. There are only 3, and carousel controls are Chrome-only.
8. **JS budget:** about 2–6 KB per content page (cap 15 KB gz).

## 1. Colour

### 1.1 Primitives (OKLCH)
These round-trip exactly to the brand hex values.

| Primitive | Hex | OKLCH |
|---|---|---|
| cream | #FFFBF5 | `oklch(98.95% 0.0090 78.3)` |
| linen | #F5F2E7 | `oklch(96.05% 0.0149 94.2)` |
| sand | #EBE5D1 | `oklch(92.13% 0.0274 93.1)` |
| espresso | #2C1403 | `oklch(22.23% 0.0487 55.0)` |
| red-600 (brand) | #9E2124 | `oklch(45.89% 0.1608 25.3)` |
| red-700 (logo) | #8B101B | `oklch(40.92% 0.1548 24.2)` |
| mahogany | #6B3630 | `oklch(39.97% 0.0767 27.7)` |

Derived primitives:

| Primitive | Hex |
|---|---|
| walnut-950 | #160D07 |
| walnut-850 | #362113 |
| bone-100 | #F0EBDF |
| taupe-600 | #635146 |
| taupe-300 | #C1B1A0 |
| graphite-light | #513E31 |
| graphite-dark | #D0C2AF |
| clay-500 | #8C685C |
| clay-400 | #957A6B |
| hair-200 | #CDBAAB |
| hair-800 | #503E34 |
| red-500 | #BA2B2B |
| red-450 | #C7332F |
| red-300 | #EB8278 |
| red-200 | #F7A597 |
| blue-600 | #1659B5 |
| blue-300 | #86C5FA |
| green-700 | #236436 |
| green-300 | #7CCD8E |
| rust-600 | #AF2E13 |
| rust-300 | #F6946D |

### 1.2 Semantic tokens (`src/styles/tokens/color.css`)
```css
@layer tokens {
  :root {
    color-scheme: light dark;
    --surface:           light-dark(var(--cream),     var(--walnut-950));
    --surface-alt:       light-dark(var(--linen),     var(--espresso));
    --surface-panel:     light-dark(var(--sand),      var(--walnut-850));
    --ink:               light-dark(var(--espresso),  var(--bone-100));
    --ink-muted:         light-dark(var(--taupe-600), var(--taupe-300));
    --line:              light-dark(var(--hair-200),  var(--hair-800));   /* decorative only */
    --line-strong:       light-dark(var(--clay-500),  var(--clay-400));   /* inputs, >=3:1 */
    --accent:            light-dark(var(--red-600),   var(--red-300));    /* text, icons, lines */
    --accent-hover:      light-dark(var(--red-700),   var(--red-200));
    --accent-fill:       light-dark(var(--red-600),   var(--red-500));    /* button bg */
    --accent-fill-hover: light-dark(var(--red-700),   var(--red-450));
    --accent-ink:        var(--cream);
    --focus:             light-dark(var(--blue-600),  var(--blue-300));
    --success:           light-dark(var(--green-700), var(--green-300));
    --error:             light-dark(var(--rust-600),  var(--rust-300));
    --sketch:            light-dark(var(--graphite-light), var(--graphite-dark));
    --wordmark:          light-dark(var(--red-700),   var(--red-300));
  }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"]  { color-scheme: dark; }
}
```

Rules:
- **Never register colour tokens with `@property`.** It freezes `light-dark()` at `:root`.
- **Inverse bands:** `.band--ink { color-scheme: dark; background: var(--surface-alt); color: var(--ink); }`. Re-declare `color` on the band.
- **Tints:** derive them from primitives *inside* `light-dark()`. WebKit has a bug with relative colours on a `light-dark()` origin.
  ```css
  --accent-tint: light-dark(color-mix(in oklch, var(--red-600) 8%, var(--cream)), color-mix(in oklch, var(--red-300) 14%, var(--walnut-950)));
  --selection:   light-dark(color-mix(in oklch, var(--red-600) 18%, var(--cream)), color-mix(in oklch, var(--red-300) 30%, var(--walnut-950)));
  --ink-a10:     light-dark(oklch(from var(--espresso) l c h / .10), oklch(from var(--bone-100) l c h / .12));
  --backdrop:    light-dark(oklch(from var(--espresso) l c h / .45), oklch(from var(--walnut-950) l c h / .7));
  --shadow-paper: .25rem .25rem 0 var(--ink-a10);   /* hard "stacked sheet" shadow, no blur */
  ```
- **Contrast** (light / dark, against surface):

  | Pair | Light | Dark |
  |---|---|---|
  | ink | 16.89 | 16.07 |
  | ink-muted | 7.29 | 9.21 |
  | accent | 7.56 | 7.31 |
  | focus | 6.48 | 10.36 |
  | line-strong | 4.81 | 4.79 |
  | Button text: cream on #9E2124 / cream on #BA2B2B | 7.56 | 5.86 |
  | Wordmark (#8B101B in light, #EB8278 in dark) | 9.33 | 7.31 |

- **Focus:** the light focus ring on the red fill is only 1.17:1. Always use `outline-offset: 3px` so the ring sits on the surface.
- **Errors:** always icon + text, never colour alone. The error rust is close to the accent red.

### 1.3 `prefers-contrast: more` / `forced-colors`
```css
@media (prefers-contrast: more) {
  :root {
    --ink: light-dark(oklch(16% .03 55), oklch(98% .01 85));
    --surface: light-dark(var(--cream), oklch(12% .012 55));
    --ink-muted: var(--ink);
    --line-strong: light-dark(var(--taupe-600), oklch(70% .03 60));
    --line: var(--line-strong);
    --accent: light-dark(var(--red-700), var(--red-200));
    --focus: light-dark(oklch(40% .15 258), oklch(85% .09 245));
    --sketch: var(--ink); --grain: none; --focus-width: 4px;
  }
  a { text-decoration-thickness: 2px; }
}
@media (forced-colors: active) {
  .btn { border: 1px solid ButtonText; }
  .wordmark__img { forced-color-adjust: none; background-color: CanvasText; }
  body { background-image: none; }
}
```

## 2. Typography

**Font choice: Fraunces Italic** (wght file, 45.7 KB latin) next to Red Hat Display Variable (30.7 KB latin).
- Fraunces has the same cap height as Red Hat Display (.700), and `font-size-adjust: 0.5` matches the x-heights.
- The Fontsource wght file pins opsz at 14, the text cut. It is robust at display sizes.
- **Unsupported features:**
  - Red Hat Display has **no `smcp`**, so never use `font-variant-caps`.
  - Fraunces has no `tnum`, so never use it for numbers.
- **Loading** (Astro Fonts API, `fontProviders.npm({ remote: false })`):

  | Font | Weight | Style | Display | Subsets | Preload |
  |---|---|---|---|---|---|
  | Red Hat Display | 300–900 | normal | `swap` | latin + latin-ext | latin only |
  | Fraunces | 100–900 | italic | `optional` | latin + latin-ext | latin only |

  `font-synthesis: none` is on. Red Hat Display italic is not loaded: `em`/`i` render in Fraunces.
- **Character rules:**
  - Normalise content to **NFC**.
  - Avoid "→" and "★" as text, because they are not in the latin subset. Use inline SVG instead.
  - Use U+202F between a number and its unit ("5 m × 60 cm").

**Fluid scale** (360 → 1440 px viewport; max/min ≤ 1.98, so 200% zoom stays safe):
```css
--step--2: clamp(0.8125rem, 0.7917rem + 0.0926vw, 0.875rem);  /* 13→14 legal, Maßlinie labels */
--step--1: clamp(0.9375rem, 0.9167rem + 0.0926vw, 1rem);      /* 15→16 meta, labels, eyebrow */
--step-0:  clamp(1.0625rem, 1.0208rem + 0.1852vw, 1.1875rem); /* 17→19 body, inputs */
--step-1:  clamp(1.232rem, 1.129rem + 0.4611vw, 1.544rem);    /* lead, h4 */
--step-2:  clamp(1.43rem, 1.237rem + 0.8551vw, 2.007rem);     /* h3, card titles */
--step-3:  clamp(1.658rem, 1.342rem + 1.408vw, 2.609rem);     /* h2 */
--step-4:  clamp(1.924rem, 1.435rem + 2.175vw, 3.392rem);     /* h1 inner pages */
--step-5:  clamp(2.232rem, 1.506rem + 3.226vw, 4.409rem);     /* home hero */
```
- Card titles use `font-size: clamp(var(--step-1), 6.5cqi, var(--step-2))`, because "Hochkantlamellenparkett" is 11.61 em wide.
- **Weights:** body 400 with line-height 1.6; headings 600 with line-height 1.05–1.2 and letter-spacing −0.012em; `strong` 650; UI 600; eyebrow 600 + `tabular-nums` (e.g. "Blatt 02 · Leistungen").
- **Measures:** prose 65ch, lead 48ch, captions 50ch, card text 40ch, h1 22ch, h2 26ch, hero h1 18ch.

**Hyphenation and wrapping:**
```css
html { hyphens: manual; overflow-wrap: break-word; }
.prose :is(p, li, dd), .card p {
  hyphens: auto; hyphenate-limit-chars: 8 3 3;
  -webkit-hyphenate-limit-before: 3; -webkit-hyphenate-limit-after: 3; }
:is(h1, h2, h3) { hyphens: manual; }               /* break only at &shy; */
@container (inline-size < 22rem) { :is(h2, h3) { hyphens: auto; hyphenate-limit-chars: 10 4 4; } }
:is(h1, h2, h3, h4) { text-wrap: balance; text-box: trim-both cap alphabetic; }
:is(p, li, dd, figcaption, blockquote) { text-wrap: pretty; }
.btn, .eyebrow, .mass__label { text-box: trim-both cap alphabetic; }
:is(em, i, .accent) { font-family: var(--font-accent); font-style: italic; font-weight: 400; font-size-adjust: 0.5; }
:is(h1, h2) :is(em, .accent) { color: var(--accent); }
```
- `src/lib/shy.ts` inserts U+00AD into headings at build time. Its dictionary includes Hoch­kant­lamellen­parkett, Altbau­sanierung, Landhaus­dielen, Massiv­dielen, Datenschutz­erklärung, umwelt­bewusstes, Holz­handwerk and Schreiner­meister.
- Never put `&shy;` in `<title>` or meta tags.
- **`text-transform` is banned everywhere** (no Title Case). German capitalisation is authored in the content.

## 3. Layout

### Page grid
```css
.page-grid {
  --gutter: var(--space-s-l); --content: 72rem; --breakout: 84rem;
  display: grid;
  grid-template-columns:
    [full-start] minmax(var(--gutter), 1fr)
    [breakout-start] minmax(0, calc((var(--breakout) - var(--content)) / 2))
    [content-start] min(100% - 2 * var(--gutter), var(--content)) [content-end]
    minmax(0, calc((var(--breakout) - var(--content)) / 2)) [breakout-end]
    minmax(var(--gutter), 1fr) [full-end];
  > * { grid-column: content; } > .breakout { grid-column: breakout; } > .full-bleed { grid-column: full; }
}
.grid { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: var(--space-l) var(--space-s-m); }
@container section (inline-size >= 40rem) { .grid { --cols: 8; } }
@container section (inline-size >= 64rem) { .grid { --cols: 12; } }
```
- **Subgrid** is used for card rows (`grid-row: span 4; grid-template-rows: subgrid`), process steps, footer columns, fact `<dl>`s and the contact form.
- **Containers:** every `.section` is `container: section / inline-size`. Cards are `container: card / inline-size`, and the header is `container: header`.
- **Container style queries** (`@container style(--on: panel)`) are progressive enhancement.
- **Viewport media queries** are used only for prefers-\*, hover, and the sticky-header height tokens.

### Spacing scale

| Token | px (360 → 1440) |
|---|---|
| 3xs | 4→5 |
| 2xs | 8→10 |
| xs | 12→15 |
| s | 16→20 |
| m | 24→30 |
| l | 32→40 |
| xl | 48→60 |
| 2xl | 64→80 |
| 3xl | 96→120 |

One-up pairs: `s-m` 16→30, `s-l` 16→40, `m-xl` 24→60, `l-2xl` 32→80, `xl-3xl` 48→120. Sections are padded with `--space-xl-3xl`.

Example: `--space-s: clamp(1rem, 0.9167rem + 0.3704vw, 1.25rem)`. Generate the rest the same way: linear interpolation between 360 and 1440 px.

### Section rhythm
- Widths: content 72rem, breakout 84rem.
- **Section intro:** eyebrow ("Blatt 03 · Ablauf") + h2 + lead, max 40rem wide.
- **Backgrounds:**
  - Cream and linen alternate.
  - Sand panels are for special bands (Holz mit Herkunft, configurator teaser).
  - The ink band is reserved for the CTA.
  - Neighbouring sections with the same surface get a hairline between them.

### Hairlines and paper
- **Tokens:** `--hairline: 1px`, `--rule: var(--hairline) solid var(--line)`, `--rule-strong` uses `--line-strong`.
- **`.hairline-grid`:** the container carries the block-start and inline-start borders; each cell carries the inline-end and block-end borders. Incomplete rows stay "open", like a technical drawing.
- **`.frame`:** crop marks drawn as 8 linear-gradient ticks.
- **`.graph-paper`:** a 1.5rem grid.
- **Paper grain:**
  - **Cost:** about 450 B of CSS, about 2–5 ms to rasterise once.
  - **Off:** high contrast, forced colours, print.
  - **Exit plan:** a 3–4 KB AVIF tile, if the grain costs more than 8 ms on low-end Android.
  ```css
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .38 0 0 0 0 .31 0 0 0 .09 -.02'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
  body { background: var(--surface) var(--grain); }   /* effective alpha ≤ 0.05 */
  ```

### Maßlinie (`src/components/ui/Masslinie.astro`)
- **Props:** `label`, `orientation` (`h`/`v`), `ends` (`tick`/`arrow`), `tone` (`accent`/`ink`), `draw`.
- **Markup:** `<p class="mass">`, with two `.mass__line` spans (`aria-hidden`) around a real-text `.mass__label`.
- **Ticks:**
  - The `::before`/`::after` pseudo-elements draw the extension lines.
  - The line spans' pseudo-elements draw the 45° ticks (`rotate: -45deg`).
- **Draw-on:** the line scales from `scale: 0 1` to `1 1`.
- **Accessibility:** diagrams use `<figure>` with a prose `figcaption` that states the measurements.

### Sketch system (rough.js at build time)
- **Sources:** drawings are defined as primitives in `src/lib/sketch/*.ts` and rendered by the rough.js generator with a fixed `seed`.
- **SVG attributes:** `fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"`.
- **Sizes:** icons use a 96 px viewBox at stroke 1.5; hero art 640×480 at stroke 2; UI icons 24 px at 1.5.
- **Draw passes** (`<g data-pass="1..4">`):
  1. Construction lines with 2–4 px overshoot.
  2. Outlines.
  3. Hatching at 0.75 stroke, opacity .55.
  4. **One** red accent, `stroke: var(--accent)`.
- **Animation:** animated paths use `pathLength="1"` and **no** `vector-effect`. `non-scaling-stroke` is for static art only.
- **Limits:** at most ~40 paths and 4 KB per icon. Run SVGO but keep `pathLength`. No text inside the SVG.
- **Accessibility:** `aria-hidden="true" focusable="false"`.

**The set:**

| Group | Drawings |
|---|---|
| Services (7) | Möbel = built-in cabinet with an open door; Böden = herringbone in perspective; Treppen = stringer stair with handrail; Fenster = sash window with glazing bars; Türen = panelled front door with transom; Altbau = Gründerzeit door frame or stucco; Terrassen = deck boards with substructure |
| Process (5) | Beratung & Aufmaß = folding rule + notepad; Entwurf & Angebot = pencil + sheet; Fertigung = workbench + plane + shavings; Montage = Montagebus + spirit level; Pflege = oil can + cloth |
| Other | 404 shelf with a missing board ("? cm"); configurator teaser (exploded cabinet); 6 floor-pattern minis; ~14 UI icons |
| Optional | Mannheim skyline (Wasserturm, Jesuitenkirche, Fernmeldeturm) |
| Generated in code | Jahresringe (`src/lib/rings.ts`, seeded wobble) |

**Draw-on CSS:**
```css
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .sketch[data-draw~="scroll"] { view-timeline: --sketch block; }
    .sketch[data-draw~="scroll"] path { stroke-dasharray: 1 1.1; animation: draw linear both; animation-timeline: --sketch; animation-range: entry 0% cover 30%; }
    .sketch [data-pass="2"] path { animation-range: entry 15% cover 38%; }
    .sketch [data-pass="3"] path { animation-range: entry 30% cover 45%; }
    .sketch [data-pass="4"] path { animation-range: cover 35% cover 50%; }
  }
  @media (hover: hover) {
    .service-card:hover .sketch [data-pass="4"] path { stroke-dasharray: 1 1.1; animation: draw var(--dur-4) var(--ease-pencil) both; }
  }
}
@keyframes draw { from { stroke-dashoffset: 1.05; } to { stroke-dashoffset: 0; } }
```

**Sketch → photo** (below the fold only):
- `scripts/make-sketch-variants.mjs` creates a pixel-aligned pencil version of a photo with sharp: greyscale → edge convolution → invert/levels → espresso-on-cream tint.
- **Fallback:** if the generated sketches look poor, crossfade from the service illustration instead.
```css
.sketch-photo { display: grid; aspect-ratio: var(--ar); overflow: clip; }
.sketch-photo > * { grid-area: 1 / 1; inline-size: 100%; block-size: 100%; }
.sketch-photo__sketch { opacity: 0; }   /* static/finished state = photo */
@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) {
  .sketch-photo { view-timeline: --sp block; }
  .sketch-photo__sketch { animation: sp-sketch linear both; animation-timeline: --sp; animation-range: entry 0% cover 60%; }
  .sketch-photo__img { animation: sp-photo linear both; animation-timeline: --sp; animation-range: cover 30% cover 55%; }
}}
@keyframes sp-sketch { 0%, 55% { opacity: 1; } to { opacity: 0; } }
@keyframes sp-photo  { from { opacity: 0; scale: 1.03; } }
```

## 4. CSS architecture

- **Layer order:** `@layer reset, tokens, base, layout, components, utilities, motion;` goes in an inline `<style>` at the very top of `<head>`.
- **`@view-transition`** stays unlayered, inside `@media (prefers-reduced-motion: no-preference)`.
- **Files** in `src/styles/`:
  - `global.css` (imports)
  - `reset.css`
  - `tokens/{color,type,space,motion}.css`
  - `base.css`
  - `layout.css`
  - `components/{buttons,forms,mass}.css`
  - `utilities.css`
  - `motion.css`
  - `print.css`
- **Global vs scoped:**
  - Global: anything shared or rendered by JS (buttons, form controls, Maßlinie, motion and view-transition rules).
  - Astro scoped `<style>` for component visuals, **wrapped in `@layer components {}`**.
  - Astro is configured with `scopedStyleStrategy: 'where'`.
- **Naming:**
  - BEM-lite blocks named after the file (`.project-card__img`).
  - Unprefixed layout primitives (`.stack`, `.cluster`).
  - State lives in ARIA or `data-*` attributes.
  - Private custom properties use `--_x`.
- **Avoid `@scope`.**
- **JS reading colours:** apply the token to an element and read `getComputedStyle(el).color`. The raw custom property returns the `light-dark()` string.

## 5. Components (`src/components/…`)

### Skip link and demo banner
- **SkipLink:** "Zum Inhalt springen" → `#main`. `scroll-padding-block-start: calc(var(--header-sticky-h) + var(--space-s))`.
- **DemoBanner:** `<aside aria-label="Hinweis">`, **not sticky**. Text: "Entwurf – nicht die offizielle Website", with a link to the live site.

### SiteHeader
- **Rows:** a utility row (2rem, desktop only: tagline, hours, phone) and a main row (4.5rem desktop, 3.5rem mobile).
- **Sticky:** `position: sticky; top: calc(-1 * var(--utility-h))`. The utility row scrolls away; the main row stays.
- **Wordmark:**
  - Phase 1: the cropped PNG wordmark as a CSS mask filled with `--wordmark`, plus a visually hidden "Schreinerei Schmidt" inside the link.
  - The tagline "Umweltbewusstes Holzhandwerk" sits **outside** the link as live text.
  - Later: an inline SVG once the owner supplies the vector logo.
- **Leistungen dropdown:**
  ```html
  <button class="nav__trigger" type="button" commandfor="menu-leistungen" command="toggle-popover" popovertarget="menu-leistungen">Leistungen</button>
  <div id="menu-leistungen" class="nav__panel" popover><ul role="list">…</ul></div>
  ```
  ```css
  .nav__trigger { anchor-name: --leistungen; }
  .nav__panel { position-anchor: --leistungen; position-area: block-end span-inline-end; position-try-fallbacks: flip-inline;
    inset: auto; margin: var(--space-2xs) 0 0; inline-size: min(36rem, 100vw - 2 * var(--gutter));
    border: var(--rule-strong); background: var(--surface); box-shadow: var(--shadow-paper);
    opacity: 0; translate: 0 -.25rem;
    transition: opacity var(--dur-2) var(--ease-out), translate var(--dur-2) var(--ease-out), display var(--dur-2) allow-discrete, overlay var(--dur-2) allow-discrete;
    &:popover-open { opacity: 1; translate: 0; @starting-style { opacity: 0; translate: 0 -.25rem; } } }
  @supports not (anchor-name: --a) { .nav__panel { inset: var(--header-sticky-h) var(--gutter) auto auto; } }
  ```
  - It is a disclosure, not an ARIA menu.
  - The current page link gets `aria-current="page"`.
- **Phone CTA:** shows the number as text on desktop. Below 74rem it becomes a 44×44 icon with an `aria-label`.
- **Breakpoint:** the nav and the menu button switch on the **same** `@container header (inline-size >= 74rem)` rule, so a state with neither visible is impossible.

### NavSheet (mobile)
```html
<button class="menu-button" type="button" commandfor="site-menu" command="toggle-popover" popovertarget="site-menu"><svg aria-hidden="true">…</svg><span>Menü</span></button>
<div id="site-menu" class="nav-sheet" popover> <nav aria-label="Hauptmenü">…</nav> <a class="btn btn--primary" href="…/konfigurator/">Angebot konfigurieren</a>
  <button type="button" commandfor="site-menu" command="hide-popover" popovertarget="site-menu" popovertargetaction="hide">Menü schließen</button></div>
```
```css
.nav-sheet { position: fixed; inset: var(--header-sticky-h) 0 0; margin: 0; inline-size: 100%; border: 0; overscroll-behavior: contain; background: var(--surface); opacity: 0; translate: 0 -.75rem;
  transition: opacity var(--dur-2), translate var(--dur-2) var(--ease-out), display var(--dur-2) allow-discrete, overlay var(--dur-2) allow-discrete;
  &:popover-open { opacity: 1; translate: 0; @starting-style { opacity: 0; translate: 0 -.75rem; } }
  & li { transition: opacity var(--dur-2), translate var(--dur-2) var(--ease-out); transition-delay: calc(sibling-index() * 30ms); }
  &:popover-open li { @starting-style { opacity: 0; translate: 0 .5rem; } } }
html:has(#site-menu:popover-open) { overflow: hidden; }
```
- The sheet starts below the header, so the menu button stays visible.
- **List order:** **all links, including Kontakt**.
- **`nav-sheet.ts`** (0.4 KB):
  - Closes the sheet on `focusout` outside the sheet and the button (WCAG 2.4.11).
  - Closes it when the viewport reaches desktop width.

### Footer
- **Top:** the skyline sketch (optional).
- **Columns:** wordmark + tagline; `<address>` (NAP); hours `<dl>` ("Mo–Fr 7–17 Uhr", needs review); navigation in two columns.
- **Bottom row:** © · Impressum · Datenschutz.
- **Layout:** subgrid on desktop.

### Heroes
- **HomeHero / PageHero:** the LCP image gets `fetchpriority="high"` and `loading="eager"`, and is never hidden.
- **Annotations:** decorative SVG annotations draw once over the image.
- **PageHero contents:** h1 `.page-title` + Breadcrumbs + lead + optional media.

### Cards
- **ServiceCard:**
  - Structure: `<article>` → sketch → `h3` with a stretched `<a>`; the "Mehr erfahren" hint is `aria-hidden`.
  - **Focus:** `.service-card:has(a:focus-visible)` draws the ring.
  - **Hover:** `--accent-tint` background; the red sketch pass redraws.
  - **Transition:** the sketch carries `.vt-media` with `--vt: hero-media-<service>`.
  - **Mobile:** the card container query switches it to a horizontal layout.
- **ProjectCard:**
  - Structure: `<article>` → link → `img.vt-media`, then `h3` + meta ("Möbel · 2024").
  - **Image:** `--vt: proj-<slug>`, dominant-colour background, `alt=""` (the title names it), 4:3 `object-fit: cover`.

### Testimonials
- **Markup:** `<figure><blockquote><p>…</p></blockquote><figcaption><cite>…</cite>, Stadtteil · Leistung</figcaption></figure>` in a hairline grid with subgrid.
- **Rating line:** "5,0" + SVG stars + visually hidden "von 5 Sternen" + "aus 115 Google-Bewertungen (Stand 30.09.2026)", linking to the Google profile.

### StatCounter
```css
@property --n { syntax: '<integer>'; inherits: false; initial-value: 0; }
.stat__value { font-variant-numeric: tabular-nums; min-inline-size: calc(var(--digits) * 1ch); }
@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: view()) {
  .stat__value { counter-reset: n var(--n); animation: count-up linear both; animation-timeline: view(); animation-range: entry 20% cover 45%; }
  .stat__value::after { content: counter(n); content: counter(n) / ""; }
  .stat__num { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}}
@keyframes count-up { from { --n: 0; } to { --n: var(--to); } }
```
- **Markup:** `<span class="stat__value" style="--to:115; --digits:3"><span class="stat__num">115</span></span>`.
- "5,0" stays static, because counters are integers only.

### ProcessSteps
- **Markup:** `<ol role="list">` with 5 `<li>`: number (`aria-hidden`), sketch, h3, p.
- **Desktop:** 5 columns with subgrid. An `ol::before` Maßlinie scales from 0 to 1 on a `view()` timeline, and the steps fade in staggered via `sibling-index()`.
- **Mobile:** a vertical line.
- **Fallback:** the full line, static.

### Faq
- Native `details`/`summary`, at least 44 px tall. Non-exclusive (job details use `name="jobs"` instead).
```css
.faq details::details-content { block-size: 0; overflow-y: clip; transition: block-size var(--dur-2) var(--ease-out), content-visibility var(--dur-2) allow-discrete; }
.faq details[open]::details-content { block-size: auto; }
@media (prefers-reduced-motion: no-preference) { :root { interpolate-size: allow-keywords; } }
```

### BeforeAfter (`before-after.ts`, 0.6 KB)
- **Markup:** `<figure class="ba" data-ba>` with a `.ba__stage` (`--pos:50%`) containing:
  - the after image and the before image;
  - a divider;
  - a visually hidden label "Vorher-Nachher-Vergleich, Anteil Vorher-Bild";
  - `<input type=range min=0 max=100 value=50 hidden>`.
- **Buttons:** a group "Vorher / Beide / Nachher" (`hidden` until JS runs).
- **Without JS:** the two images sit side by side, labelled.
- **With JS:**
  - JS adds `data-enhanced`, and the images stack.
  - `.ba__before { clip-path: inset(0 calc(100% - var(--pos)) 0 0) }`.
  - The range covers the stage, has a 44 px thumb and `touch-action: pan-y`.
  - JS keeps `aria-valuetext` current.
- **WCAG 2.5.7:** clicking the track jumps the divider there; keys and the three buttons also work.

### Gallery and Lightbox (`lightbox.ts`, ~2 KB)
- **Without JS:** thumbnails are `<a href="full" data-lightbox>`.
- **Dialog:** `<dialog id="lightbox" closedby="any" aria-label="Bildansicht">` containing `img`, `figcaption`, an "Bild 3 von 8" counter (`aria-live`), and buttons with `command="--prev"`, `command="--next"` and `command="close"` (`autofocus`).
- **Opening:**
  1. `preventDefault` on the thumbnail link.
  2. Set `src`/`alt` and `await img.decode()`.
  3. Give the thumbnail `view-transition-name: lightbox-img`.
  4. `startViewTransition(() => { move the name to the dialog image; dialog.showModal() })`.
  5. Clear the names on `finished`.
  6. Closing reverses this.
- **Keys:** ArrowLeft and ArrowRight move between images.
- **Safari** (no `closedby`): `e.target === dialog` closes the dialog.
- **Scroll lock:** `html:has(dialog:modal) { overflow: hidden }`.

### CtaBand
- **Layout:** `section.band--ink` (`color-scheme: dark`) with h2, a Maßlinie that draws on view, a configurator button, a `tel:` link and hours.

### Forms (global CSS; `src/components/forms/*`; `scripts/forms/enhance.ts`)
- **Labels:** visible `<label>` above the field; "(Pflichtfeld)" as text.
- **Inputs:**
  - `font-size: max(1rem, var(--step-0))`, at least 2.75rem tall.
  - `--line-strong` border.
  - Focus: `outline: 3px solid var(--focus)`.
- **Errors:**
  - `:user-invalid` → 2 px `--error` border plus an icon.
  - `.field:has(:user-invalid) .field__error { display: block }`.
  - JS wires `aria-describedby` and `aria-invalid`, adds an error summary (`role="alert"`, focused), and sets `novalidate`.
- **Textarea:** `field-sizing: content; min-block-size: 6lh; max-block-size: 20lh`.
- **Select:** inside `@supports (appearance: base-select)`, `.select, .select::picker(select) { appearance: base-select }`.
- **Checkboxes and radios:** `accent-color: var(--accent-fill)`, 1.25rem.

### ThemeToggle (`theme-toggle.ts`, 0.7 KB)
- **Control:** a 44×44 button opens an anchored popover with 3 radios: "Wie System" / "Hell" / "Werkstatt bei Nacht".
- **Storage:** `localStorage['ss-theme']` is written **only after the user picks**; "Wie System" deletes the key.
- **Switching:** runs inside `startViewTransition` unless reduced motion is on.
- **No-JS:** `@media (scripting: none)` hides the control.
- **Meta tags:** `<meta name="color-scheme" content="light dark">`; two `theme-color` metas, #FFFBF5 and #160D07.

### Other components
- **Breadcrumbs:** `<nav aria-label="Brotkrumen"><ol>`. The last item has `aria-current="page"`. Separators use `content: "/" / ""`.
- **Schriftfeld:** a drawing title block, rendered as a `<dl>` figcaption (Projekt | Ort | Jahr | Holz).
- **Picture:** AVIF + WebP; widths 400/800/1200/1600/2000; art direction (hero 4:5 on mobile, 21:9 on desktop); dominant-colour background.
- **Also:** RatingBadge, Jahresringe, FilterBar, InPageNav (`scroll-target-group: auto` + `:target-current`, Chrome only), JobCard, FactList, StaticMap (static AVIF linking to OSM, "© OpenStreetMap-Mitwirkende"), SpeculationRules, Head.

## 6. Motion

### Principles
1. Motion explains relationships.
2. UI feedback is fast; drawings move at "pencil pace".
3. Animate compositor-only properties first.
4. Nothing loops, and nothing autoplays for more than 5 s.
5. With reduced motion: no navigation transitions, no scroll-linked motion, static counters, instant `details`.

### Tokens
```css
--dur-1: 120ms; --dur-2: 220ms; --dur-3: 380ms; --dur-4: 900ms;
--ease-out: linear(0, 0.294 8.333%, 0.518 16.67%, 0.684 25%, 0.802 33.33%, 0.884 41.67%, 0.938 50%, 0.970 58.33%, 0.988 66.67%, 0.996 75%, 0.999 83.33%, 1);
--ease-in-out: linear(0, 0.019 16.67%, 0.062 25%, 0.148 33.33%, 0.289 41.67%, 0.5 50%, 0.711 58.33%, 0.852 66.67%, 0.938 75%, 0.981 83.33%, 1);
--ease-spring: linear(0, 0.072 4%, 0.232 8%, 0.420 12%, 0.598 16%, 0.748 20%, 0.886 25%, 0.972 30%, 1.018 35%, 1.036 40%, 1.036 47%, 1.022 55%, 1.007 65%, 0.999 78%, 1);
--ease-pencil: linear(0, 0.086 12.5%, 0.194 25%, 0.336 37.5%, 0.5 50%, 0.664 62.5%, 0.806 75%, 0.914 87.5%, 1);
```

### Catalogue
"NP" = `@media (prefers-reduced-motion: no-preference)`.

| Animation | Technique | Gate | Fallback |
|---|---|---|---|
| Page transition (forward/back/lateral) | Cross-document view transitions + types | NP | Instant (Firefox) |
| Persistent header | `site-header` (group not animated, `z-index: 100`) | same | — |
| Title swap | `page-title`, class `title`, natural-size snapshots | same | — |
| Card → detail morph | `proj-<slug>`, `hero-media-<slug>`, class `media` | same | Crossfade |
| Lightbox | Same-document VT + dialog | JS: VT supported and reduce does not match | `@starting-style` fade |
| Referenzen filter | Same-document VT, `match-element`, class `card` | JS gate | Instant `:has()` filter |
| Theme switch | Same-document VT, root crossfade | JS gate | Instant |
| Section reveals | `view()`; opacity + translate | NP + `@supports` | Visible |
| Grid stagger | `animation-range` offset by `mod(sibling-index() - 1, var(--cols))` | same | No stagger |
| Hero inset → full-bleed | `scroll(root)`; clip-path | NP + `@supports` | Framed |
| Hero annotation draw | Time-based, 900 ms, once | NP | Static |
| Sketch draw-on / hover redraw / sketch → photo | See §3 | NP (+ `@supports`) | Finished state |
| Counters | `@property` + `view()` | NP + `@supports` | Static number |
| Header condense | `scroll(root)`: wordmark scale .85, hairline opacity | NP + `@supports` | Condensed |
| Process Maßlinie | `view()`: scale + opacity | NP + `@supports` | Full line |
| Jahresringe highlight | `timeline-scope` + per-milestone view timelines | NP + `@supports (timeline-scope: --a)` | Static |
| Popovers | `@starting-style` + `allow-discrete` | NP (reduce = opacity only) | Instant |
| Details | `::details-content` + `interpolate-size` | NP | Instant |

**Hard rules:**
- No `opacity: 0` or other start state in base styles.
- Write `animation-timeline` **after** the `animation` shorthand.
- Allowed non-compositor exceptions: `stroke-dashoffset` (small SVGs), the hero `clip-path`, counters, details `block-size`.

### Cross-document view transitions
**Name registry:** `src/lib/vt.ts` provides `vt(Astro.locals, 'proj', slug)`.
- It keeps a per-page `Set` and **throws on duplicates**.
- Names are ASCII only (umlauts transliterated), never `none`/`auto`/`match-element`.
- **Names:** `site-header`; `page-title` (inner pages only); `hero-media-<service>`; `proj-<slug>`.
- **Avoiding duplicates:**
  - "Weitere Projekte" never includes the current project.
  - The home hero never shares a name with a featured card.
  - Before/after images get no names.

```css
@media (prefers-reduced-motion: no-preference) { @view-transition { navigation: auto; } }
@layer motion {
  .site-header { view-transition-name: site-header; }
  .page-title  { view-transition-name: page-title; view-transition-class: title; }
  .vt-media    { view-transition-name: var(--vt, none); view-transition-class: media; }
  .is-filtering .vt-media { view-transition-name: none; }
  .is-filtering > .gallery__item { view-transition-name: match-element; view-transition-class: card; }
  @media (prefers-reduced-motion: no-preference) {
    ::view-transition-group(site-header) { animation: none; z-index: 100; }
    ::view-transition-old(site-header) { display: none; }
    ::view-transition-new(site-header) { animation: none; }
    ::view-transition-group(*.media) { animation-duration: var(--dur-3); animation-timing-function: var(--ease-out); z-index: 50; }
    ::view-transition-old(*.media), ::view-transition-new(*.media) { block-size: 100%; object-fit: cover; }
    ::view-transition-old(*.title), ::view-transition-new(*.title) { inline-size: auto; block-size: auto; }
    html:active-view-transition-type(forward) { &::view-transition-old(root) { animation: var(--dur-2) var(--ease-out) both vt-out-start; }
                                                &::view-transition-new(root) { animation: var(--dur-3) var(--ease-out) both vt-in-end; } }
    html:active-view-transition-type(back)    { /* mirrored */ }
    html:active-view-transition-type(lateral) { &::view-transition-new(root) { animation: var(--dur-3) var(--ease-out) both vt-rise-in; } }
  }
  @keyframes vt-out-start { to { opacity: 0; translate: -2rem 0; } }  @keyframes vt-in-end { from { opacity: 0; translate: 2rem 0; } }
  @keyframes vt-rise-in { from { opacity: 0; translate: 0 .75rem; } }
}
```

**Direction types:** an inline head script, part of `src/lib/inline-scripts.mjs` (CSP-hashed, base path baked in, **no `define:vars`**). It compares the URL path depth (relative to the base) of `navigation.activation.from` and `entry`: deeper = `forward`, shallower = `back`, equal = `lateral`, reload = none.
- In `pageswap`, add the type with `e.viewTransition.types.add(t)`.
- In `pagereveal`, set the type the same way. If the hero `img.vt-media[data-hero]` hasn't finished loading, set its `--vt` to `none`.
- Also add `<link rel="expect" href="#main" blocking="render">`.

### Scroll-driven patterns
```css
@media (prefers-reduced-motion: no-preference) { @supports (animation-timeline: scroll()) {
  .hero__media { animation: hero-open linear both; animation-timeline: scroll(root); animation-range: 0 50svh; }
  .site-header .wordmark { animation: shrink linear both; animation-timeline: scroll(root); animation-range: 0 6rem; transform-origin: left center; }
}}
.hero__media { clip-path: inset(0 max(var(--gutter), (100% - var(--content)) / 2)); }
@keyframes hero-open { to { clip-path: inset(0 0); } }
@keyframes shrink { to { scale: .85; } }
.reveal > * { animation: fade-up linear both; animation-timeline: view();
  animation-range: entry 10% cover 30%;
  animation-range: entry calc(10% + mod(sibling-index() - 1, var(--cols, 3)) * 6%) cover calc(30% + mod(sibling-index() - 1, var(--cols, 3)) * 6%); }
```

### Referenzen filter (`referenzen-filter.ts`, ~1 KB)
- **Markup:** a radio fieldset (`name="kategorie"`, with counts), a `role="status"` line, and `ul.gallery > li.gallery__item[data-cat~=…]`.
- **CSS:** `.refs:has(input[value="X"]:checked) .gallery__item:not([data-cat~="X"]) { display: none; }` for each category: moebel, boeden, treppen, fenster-tueren, altbau, terrassen.
- **JS on `change`:**
  1. Revert to the previous radio.
  2. Add `.is-filtering`.
  3. `startViewTransition(() => next.checked = true)`.
  4. Remove `.is-filtering` on finish. If a transition is already running, call `skipTransition()`.
- **URL:** `?kategorie=` is read by a tiny inline script right after the fieldset.

### JS budget (minified, before gzip)

| Script | Size |
|---|---|
| Head inline | ~1 KB |
| Nav | 0.4 KB |
| Theme | 0.7 KB |
| Invoker fallback | 0.4 KB |
| Before/after | 0.6 KB |
| Lightbox | 2 KB |
| Filter | 1 KB |
| Forms | 1.5 KB |

## 7. Loading

**Speculation rules** (part of `inline-scripts.mjs`):
- **Prerender** (`moderate`): every `${base}*` link, except `${base}konfigurator/*`, `${base}*/danke/`, `[data-no-prerender]`, `[download]` and `[target=_blank]`.
- **Prefetch** (`moderate`): `${base}konfigurator/*`.

**Rendering and images:**
- `content-visibility: auto` + `contain-intrinsic-size: auto <estimate>` on below-the-fold home sections (6–12), Referenzen cards, Datenschutz sections and Jahresringe. **Never** above the fold.
- **LCP image:** `fetchpriority="high" loading="eager"`.
- **Other images:** `loading="lazy" decoding="async" sizes="auto, (min-width: 64em) 33vw, 100vw"`.
- No preloaders and no fade-ins of content.
- `build.inlineStylesheets: 'always'`.

**Homepage budget:**

| Item | Size |
|---|---|
| HTML | ~12 KB gz |
| CSS | ~8 KB gz |
| JS | ~2 KB gz |
| Fonts | 76 KB |
| Hero image (AVIF) | 45 KB mobile / 110 KB desktop |
| **First load** | **≈ 150–210 KB** |
| Full scroll | ≈ 500 KB |

## 8. Page compositions

### Home
1. Demo banner and header.
2. **Hero:**
   - Eyebrow: "Meisterbetrieb in Mannheim · seit 2010".
   - h1: "Ihr Experte für *umwelt­bewusstes* Holzhandwerk".
   - Lead.
   - CTAs: "In 3 Minuten zum Angebot" / "Referenzen ansehen".
   - RatingBadge.
   - Panoramic photo, framed and opening on scroll, with Maßlinie annotations and a Schriftfeld caption.
   - Mobile: 4:5 crop with stacked CTAs.
3. **Stats:** years since 2010 (computed), 115 reviews, 5,0 (static). Counters.
4. **Leistungen:** 7 ServiceCards in a hairline grid (4+3 on desktop, 2 on tablet, horizontal on mobile), with draw-on and stagger.
5. **"Vom Entwurf zum Werkstück":** a large SketchPhoto, 7/5 split.
6. **Ablauf:** ProcessSteps.
7. **Referenzen:** 3 ProjectCards plus the front-door BeforeAfter.
8. **"Holz mit Herkunft":** sand panel on graph paper. Specific, verifiable claims only.
9. **Testimonials.**
10. **Configurator teaser:** the exploded cabinet draws itself. "In 3 Minuten zu Ihrem individuellen Angebot".
11. **Careers teaser:** Montagebus, 4-Tage-Woche.
12. **CtaBand and footer.**

### Other pages
- **Leistungen:** PageHero, 7 larger ServiceCards, compact Ablauf, sustainability teaser, general FAQ, CtaBand.
- **Service detail:**
  - Breadcrumbs.
  - PageHero split: SketchPhoto above the fold with the photo visible immediately, `hero-media-<slug>`.
  - InPageNav: sticky sidebar on desktop, chips on mobile.
  - Type cards (Böden: 6 types, subgrid 3/2/1, pattern sketches, spec `<dl>`; Landhausdielen plank diagram "bis 5 m × 60 cm").
  - Holz & Oberflächen, ProcessSteps, 3 related ProjectCards, FAQ.
  - CtaBand → `/konfigurator/<typ>/`.
- **Referenzen:** PageHero with count, FilterBar + status line, gallery (`display:grid; display:grid-lanes;`, 3/2/1 columns, reveal stagger), CtaBand.
- **Projekt detail:**
  - Breadcrumbs.
  - h1 + summary + FactList, breakout hero image (`proj-<slug>`).
  - Ausgangslage / Lösung / Ergebnis, with a Fraunces pull quote.
  - Gallery + Lightbox, optional BeforeAfter and testimonial.
  - Previous/next (lateral transition), "Weitere Projekte" (3, excluding the current one), CtaBand.
- **Über uns:**
  - PageHero with Ulf's portrait (sketch over photo).
  - 4 values with sketches; full-bleed team photo (needs consent).
  - Jahresringe: sticky rings on the left, an `<ol>` of `<time>` milestones on the right; on mobile, small rings above the list.
  - Stats, careers teaser, CTA.
- **Karriere:**
  - PageHero and benefits grid.
  - JobCards (`details name="jobs"`).
  - Application form: base-select dropdown, `field-sizing` textarea, CV upload (production only), privacy note.
  - FAQ.
- **Konfigurator shell:**
  - Breadcrumbs + compact PageHero with a 3-step Maßlinie.
  - `<section class="configurator graph-paper">`: viewport 7 / wizard 5 columns on desktop; on mobile, a 4:3 viewport above the wizard.
  - A reserved `aspect-ratio` poster sketch.
  - Prefetch only (never prerendered).
- **Kontakt:**
  - PageHero and quick actions (Anrufen, E-Mail, Route).
  - Desktop: address, hours and static map in one column; short form in the other.
  - Mobile order: actions → form → address → map.
- **Legal pages:** prose at 65ch, `hyphens: auto`; Datenschutz gets a TOC with scroll-spy (PE).
- **404:**
  - h1 "Hier fehlt ein Brett."
  - The shelf sketch draws itself.
  - 4 section links.
  - Asset paths must include the base path.

## 9. Browser-support quick matrix (Chrome 155 / Safari 27 / Firefox 157)

| Feature | Support |
|---|---|
| Cross-document VT | Chrome, Safari 18.2+; Firefox no → instant |
| Scroll-driven animations | Chrome, Safari 26+; Firefox flag only → finished state |
| `appearance: base-select` | Chrome, Safari 27; Firefox → styled native select |
| `dialog closedby` | Chrome, Firefox; Safari → JS backdrop click |
| `interpolate-size` | Chrome only |
| `display: grid-lanes` | Safari 26.4+ only → uniform 4:3 grid |
| `scroll-target-group` | Chrome only |
| Speculation rules | Chrome only |
| Invoker commands | Chrome 135, Safari 26.2, Firefox 144; older Safari → `popovertarget` / tiny JS fallback for dialogs |
| `text-wrap: pretty` | Chrome, Safari |
| `hyphenate-limit-chars` | Chrome, Firefox; Safari → `-webkit-hyphenate-limit-*` |

**Testing:**
- Firefox is the "everything visible without the fancy layers" reference.
- Playwright `emulateMedia` covers reducedMotion, colorScheme and forcedColors.

## 10. Risks
- **Duplicate VT names:** the registry throws. Slugs must be valid custom-idents.
- **`@supports` gating mistakes:**
  - A hidden start state outside keyframes.
  - `animation` written after `animation-timeline`.
  - `calc()` in `animation-range` (unsupported in Safari 26, which falls back to the full range).
- **Focus obscured by the sticky header:** `scroll-padding-block-start` + a constant sticky height. The demo banner is not sticky, and the nav sheet closes on `focusout`.
- **LCP:** never animate the hero photo's opacity. Fraunces uses `optional`.
- **Dotted base path:** every link goes through `url()`; use `trailingSlash: 'always'`.
