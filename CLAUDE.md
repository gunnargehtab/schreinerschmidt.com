# Schreinerei Schmidt: website relaunch

This repository holds an Astro 7 static site for a carpentry business in Mannheim. It is deployed to GitHub Pages as a **noindexed demo** at `https://gunnargehtab.github.io/schreinerschmidt.com/`.

## Read first
- `docs/plan.md`: the approved plan. Scope, phases and decisions.
- `docs/architecture.md`: config, base path, CSP, content model, CI, tests.
- `docs/design-system.md`: tokens, typography, components, motion. All values are authoritative.
- `docs/configurator.md`: wizard and 3D spec.
- `docs/content-inventory.md`: the old site's copy, verbatim (the migration source), plus a list of corrections.
- `docs/owner-checklist.md`: open facts. Never invent them; mark them `needs-review` or `placeholder`.

## Hard rules
- **Languages:** code and comments in English; all site copy in German (sentence case, „…“ quotes, U+202F between number and unit).
- **Internal URLs** go through `url()` / `asset()` from `src/lib/url.ts`. The base path contains a dot (`/schreinerschmidt.com/`). Never hard-code `/…` links. In Playwright, use relative `goto('kontakt/')`.
- **CSP:**
  - No `define:vars`. No `<style is:inline>`.
  - No `style=""` except per-element custom properties (`--vt`, `--pos`, `--to`, `--ar`, `--digits`, `--dominant`, `--wordmark-mask`, `--wordmark-ar`, `--sketch-size`).
  - Inline scripts live only in `src/lib/inline-scripts.mjs`.
- **Motion:**
  - Base CSS renders the finished state.
  - Hidden start states exist only inside keyframes, gated by `prefers-reduced-motion: no-preference` and `@supports`.
  - Never hide the LCP image.
  - View-transition names come only from `src/lib/vt.ts`.
- **No third-party requests, no cookies.** Fonts are self-hosted. Storage only after the user acts (`ss-theme`) or as session state.
- **No generic green claims** ("umweltfreundlich", "nachhaltig", "ökologisch", "natürlich") unless substantiated. Write specific claims and flag them `needs-review`.
- **Images:** only files in `src/assets/asset-manifest.json` with a publishable rights status. EXIF must be stripped.
- **Accessibility:** WCAG 2.2 AA. One h1 per page, visible labels, focus visible, targets ≥ 24 px (44 px preferred), and every feature works without JS.
- **Budgets (gz):**
  - JS ≤ 15 KB per content page.
  - Configurator ≤ 13 KB initial + ≤ 7 KB for the Möbel preview.
  - three.js chunk ≤ 160 KB, loaded only on request.
- **Toolchain:** Node 24, npm, TypeScript pinned to 6.0.3 (`@astrojs/check` does not support TS 7).

## Commands
- `npm run dev`: dev server at `/`.
- `npm run dev:base`: dev server under the Pages base.
- `npm run build && npm run serve`: Pages emulation at `http://localhost:4173/schreinerschmidt.com/`.
- `npm run verify`: format, check, unit tests, build, dist tests, e2e tests, links.
- `npm run build:audit && npm run lighthouse`: Lighthouse on a build without noindex.

## Model routing (multi-agent execution)
The main session (Opus 5.5) orchestrates. It routes each task to the right agent in `.claude/agents/`, reviews every diff, integrates and commits.

| Agent | Model | Use for |
|---|---|---|
| core-engineer | Opus 5.5 | Site infrastructure: config, CSP, base path, `serve-dist`, asset migration, SEO/JSON-LD, form infrastructure, CI/test harness |
| design-engineer | Fable 5.1 | Design system core, motion/view transitions, sketches, sketch→photo, Home hero and signature interactions, visual QA from screenshots |
| configurator-engineer | Fable 5.1 | Wizard state machine, furniture generators + constraints, SVG elevation, three.js viewer, Baumkante |
| copywriter | Fable 5.1 | Flagship German copy, legal templates |
| reviewer | Fable 5.1 | Every phase review and the final review (read-only) |
| implementer | Sonnet 5.5 | Components, pages, CSS from the specs; forms; wizard branch markup; tests |
| content-editor | Sonnet 5.5 | Bulk content migration, typo fixes, YAML/MD entries, draft alt texts |
| scaffolder | Haiku 5.5 | Boilerplate, config, mechanical edits |
| test-runner | Haiku 5.5 | Runs builds, tests, links, Lighthouse, budgets; summarises failures; never edits |
| code-scout | Haiku 5.5 | Read-only search |

Rules:
1. **Cheapest capable agent first.** After **1 failed attempt**, escalate one tier: Haiku → Sonnet → Opus → Fable.
   - A failed attempt means the acceptance commands fail, the review rejects the work, or the agent reports it couldn't finish.
   - Quality-critical work starts directly on Fable: everything listed above for the Fable agents.
2. **Every delegation states:**
   - the spec file(s) in `docs/`;
   - the exact files to create or edit;
   - the acceptance commands;
   - the constraints from "Hard rules".
3. **Parallel agents** only work on disjoint files. Worktree isolation is only for long independent tracks.
4. **Subagents never commit or push.** The orchestrator reviews the diff, has `test-runner` verify it, and commits.
   - Pushes and deploys need the user's explicit OK.
   - Commits end with the attribution lines required by the session.
5. **Cost.** Fable is the main cost driver, so watch `/usage`. If cost is too high: lower the Fable agents to `effort: medium`, then move `copywriter` to Sonnet.
