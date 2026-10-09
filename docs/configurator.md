# Configurator spec: quote wizard and 3D preview

This is the authoritative spec for the configurator, written during planning.

**Verified facts** (October 2026):
- three r186 exports `.`, `./webgpu`, `./tsl` and `./addons/*`. It ships no `.min.js` builds, so the bundler must minify it.
- **Measured bundle sizes** (min + gz):

  | Build | Core | With OrbitControls + RoomEnvironment |
  |---|---|---|
  | WebGL path | 136 KB | **143 KB** |
  | WebGPU path | 217 KB | 254 KB |

- KTX2/Basis would add about 270 KB of transcoder, so it is rejected.
- **WebGLRenderer r186:**
  - `PCFSoftShadowMap` was removed (it maps to PCF with `shadow.radius`).
  - `compileAsync()`, `initTexture()` and `yieldToMain()` exist.
  - `Clock` is deprecated in favour of `Timer`.
- **OrbitControls r186:** `update()` returns true only while the camera moves. It forces `touch-action: none`, which we override to `pan-y`.
- **Playwright 1.64** launches Chromium with `--enable-unsafe-swiftshader`, so WebGL works in CI. Real Chrome M139+ can fail WebGL context creation, which makes the no-WebGL path mandatory.
- **Textures:** Poly Haven and ambientCG are CC0, and Poly Haven forbids scraping, so download once by hand. Neither library has beech or Kernbuche.
- **Astro 7 / Rust compiler:** only phrasing content is allowed inside `<label>`. Use `<span>`, never `<div>`.
- **History API:** Safari throws after about 100 `pushState`/`replaceState` calls per 30 s, so throttle.
- **View-transition types:** Firefox support is unclear. Drive slide direction with a `data-` attribute instead.
- **form.taxi:**
  - Send `Accept: application/json` to get `{success, error, error_msg}` back.
  - Native multipart uploads, max 10 MB per file, `name[]` + `multiple`, plus a `MAX_FILE_SIZE` field.
  - Honeypot `_gotcha` (can be renamed).
  - Fields `_replyto`, `_subject`, `_next`, `_lang`.
  - Limits: 500 fields, 10,000 characters per field.
- **Formspark** can only store links to files hosted by a third party. **Recommendation: form.taxi.**

## 1. Wizard information architecture (German UI)

Every branch uses the same six steps, so the progress line never changes length.

| # | `schritt=` | Title (Möbel) | Title (other branches) | Content |
|---|---|---|---|---|
| 1 | `projekt` | Projekt | Projekt | Project-type radio cards |
| 2 | `details` | Möbel & Maße | Ihr Vorhaben | Branch fieldset (+ preview panel for Möbel) |
| 3 | `ausfuehrung` | Holz & Oberfläche | Bestand & Fotos | Branch fieldset |
| 4 | `rahmen` | Zeitraum, Budget & Ort | same | Shared |
| 5 | `kontakt` | Kontakt | same | Shared |
| 6 | `pruefen` | Prüfen & senden | same | Summary + submit |

**Intro copy:** "In 3 Minuten zu Ihrem individuellen Angebot – Sie beschreiben Ihr Projekt, Schreinermeister Ulf Schmidt erstellt Ihr Angebot persönlich."

**Fastest path** (5 required interactions):
1. Projektart
2. Möbelart
3. PLZ
4. Name
5. E-Mail

There is **no consent checkbox**. A privacy note with a link explains the legal basis, Art. 6(1)(b) DSGVO. It is flagged for legal review.

### Step 1: `typ` (radio cards, `required` in HTML)
Each card has a line-drawing icon (stroke `currentColor`, 1.5 px, square). The selected card shows a red pencil tick. Minimum size 44×44 px.

| value | Label | Hint |
|---|---|---|
| moebel | Möbel nach Maß | Schrank, Regal, Sideboard, Tisch, Bett |
| boden | Boden | Parkett, Dielen, Kork & Linoleum, Abschleifen |
| treppe | Treppe | Neu bauen oder renovieren |
| fenster | Fenster | Holzfenster, Rollläden, Fensterbänke |
| tuer | Türen | Haustür, Innentüren, Restaurierung |
| terrasse | Terrasse & Zaun | Lärche, Douglasie, Robinie |
| altbau | Altbausanierung | Treppen, Vertäfelung, Dielen |
| sonstiges | Etwas anderes | Beschreiben Sie Ihr Vorhaben |

### Branch fields

**Conventions**
- **Names:** branch fields are prefixed with the branch, e.g. `boden_flaeche`.
- **JS-req:** carries `data-required`, which JS promotes to `required` (see §2).
- **URL:** marked ✓ when the field goes into the shareable URL. Only enums and numbers from steps 1–3 qualify, never free text, files, Rahmen or Kontakt.
- **Autocomplete:** configuration fields use `autocomplete="off"`.

#### Möbel, step 2

| name | Label | Control | Rules | URL |
|---|---|---|---|---|
| moebel_art | Welches Möbel? | cards: regal, sideboard, einbauschrank, esstisch, bett, andere | JS-req | ✓ |
| moebel_breite | Breite in cm (Einbauschrank: Nischenbreite) | number + range | HTML 40–400 (union of all types); JS narrows per type; step 1 | ✓ |
| moebel_hoehe | Höhe in cm | number + range | 40–320 | ✓ |
| moebel_tiefe | Tiefe in cm | number + range | 20–65 | ✓ |
| moebel_staerke | Materialstärke | radio 19 / 25 / 40 mm | JS default 19 | ✓ |
| moebel_front | Fronten | offen, tueren, schubkaesten, gemischt (filtered per type) | | ✓ |
| moebel_unterbau | Unterbau | sockel, fuesse, haengend, ohne | | ✓ |
| moebel_rueckwand | Rückwand (Regal) | mit, ohne | | ✓ |
| moebel_faecher | Fachböden je Feld | number (empty = auto) | JS min/max derived from height | ✓ |
| moebel_griffe | Griffe | grifflos, holz, metall | | ✓ |
| moebel_dachschraege | Nische hat eine Dachschräge | checkbox; shows hint "Bitte Foto/Skizze beifügen" | | ✓ |
| tisch_laenge, tisch_breite, tisch_hoehe | Länge / Breite / Höhe (cm) | number + range | 120–320 / 70–110 / 72–78 | ✓ |
| tisch_platte | Plattenstärke | 25 / 40 / 60 mm | Baumkante needs ≥ 40 | ✓ |
| tisch_kante | Kante | gerade, baumkante | | ✓ |
| tisch_gestell | Gestell | vierfuss, kufen-holz, kufen-stahl | | ✓ |
| tisch_brett | (hidden) live-edge seed | integer | | ✓ |
| bett_liegeflaeche | Liegefläche | 90×200 … 200×220, sondermass | JS-req for bett | ✓ |
| bett_hoehe | Einstiegshöhe | normal (≈45), komfort (≈55) | | ✓ |
| moebel_beschreibung | Was dürfen wir bauen? (andere) | textarea, `field-sizing` | JS-req, 10–2000 chars | ✗ |

#### Möbel, step 3
- `moebel_holz`: swatches eiche, nussbaum, esche, kernbuche, kirsche, beratung. JS default eiche. In URL.
- `moebel_oberflaeche`: natur-geoelt, weiss-geoelt, lack-matt. JS default natur-geoelt. In URL.
- `moebel_wuensche`: textarea, max 1000 chars.
- `fotos[]`: see the photo policy below.

#### Boden

| name | Label | Control | Rules |
|---|---|---|---|
| boden_leistung | Was ist geplant? | neu, aufarbeiten (Abschleifen & Aufarbeiten), reparatur | JS-req |
| boden_art (when `neu`) | Bodenart | stabparkett, hochkant, mosaik, fertigparkett, dielen, kork, linoleum, offen | |
| boden_holz | Holzart | eiche, kernbuche, esche, kiefer, douglasie, offen | |
| boden_flaeche | Fläche ca. (m²) | text, `inputmode=decimal` | JS-req; pattern `\d{1,4}([.,]\d{1,2})?`; 1–2000 |
| boden_raeume | Anzahl Räume | number 1–30 | |

Step 3:
- `boden_untergrund`: estrich, holz, fliesen, teppich, pvc-laminat, unbekannt.
- `boden_fbh` (underfloor heating): ja, nein, unbekannt.
- `boden_zugang` (when `dielen`): "Können Dielen bis 5 m Länge ins Haus getragen werden?"
- `boden_zustand` (when aufarbeiten or reparatur): leicht, stark, schaeden.
- `boden_oberflaeche_alt`: geoelt, lackiert, unbekannt.
- `boden_sockelleisten`: checkbox.

#### Treppe
- `treppe_leistung` (JS-req): neu, renovieren, belegen ("Bestandstreppe mit Holz belegen"), gelaender.
- `treppe_form`: gerade, viertel, halb, podest, wendel, unbekannt.
- `treppe_geschosshoehe` (when `neu`): cm, 200–450. Hint: "Oberkante Fertigfußboden bis Oberkante Fertigfußboden".
- `treppe_stufen`: 2–30.
- `treppe_holz`.
- Step 3:
  - `treppe_bauart`: wange, holm, faltwerk, beratung.
  - `treppe_bestand`: holz, beton, stahl, unbekannt.
  - `treppe_gelaender`: neu, vorhanden, keins.
  - `treppe_zustand` textarea.
  - Photos.

#### Fenster
- `fenster_leistung`: checkboxes neu, restaurieren, rolllaeden, fensterbaenke. Rule: at least one.
- `fenster_anzahl`: 1–100.
- `fenster_breite` / `fenster_hoehe`: cm, 30–400, for "ein typisches Fenster".
- Step 3:
  - `fenster_verglasung`: 2fach, 3fach, unbekannt.
  - `fenster_denkmal`: ja, nein, unbekannt.
  - `rolllaeden_anzahl`.
  - `rolllaeden_antrieb`: gurt, elektrisch, beratung.
  - `fensterbaenke_ort`: innen, aussen, beides.
  - `fenster_zustand`.
  - Photos.

#### Tür
- `tuer_art` (JS-req): haustuer, innentuer, restaurierung.
- `tuer_anzahl`: 1–50.
- `tuer_breite` / `tuer_hoehe`: 60–200 / 180–300 cm.
- `tuer_anschlag`: din-links, din-rechts, unbekannt. An explainer popover covers DIN links/rechts.
- Step 3:
  - `tuer_sicherheit`: RC2 checkbox.
  - `tuer_glas`: ohne, lichtausschnitt, seitenteil.
  - `tuer_stil`: modern, klassisch, nach-vorlage.
  - `tuer_zustand`, linking to the before/after example.
  - Photos.

#### Terrasse & Zaun
- `terrasse_was` (JS-req): terrasse, zaun, beides.
- `terrasse_flaeche`: m², decimal.
- `terrasse_holz`: laerche, douglasie, robinie, beratung.
- `zaun_laenge`: running metres.
- `zaun_hoehe`: 60–220.
- `zaun_tore`: 0–10.
- Step 3:
  - `terrasse_untergrund`: beton-pflaster, erdreich, balkon, unbekannt.
  - `terrasse_hoehe`: bodennah, erhoeht.
  - `zaun_hang`: ja, nein.
  - Photos.

#### Altbau
- `altbau_bereiche`: checkboxes treppe, vertaefelung, dielen, tueren, fenster, einbauschraenke. Rule: at least one.
- `altbau_baujahr`: 1500–2026.
- `altbau_denkmal`.
- Step 3: `altbau_beschreibung` (JS-req, ≥ 10 chars) and photos.

#### Sonstiges
- `sonstiges_beschreibung`: JS-req, 10–2000 chars.
- Step 3: `sonstiges_masse` and photos.

### Photo policy (`fotos[]`)
**Live mode:**
- `accept="image/jpeg,image/png,image/webp"`. Leaving HEIC out makes iOS convert to JPEG.
- At most 6 files, each ≤ 10 MB, with a `MAX_FILE_SIZE` hidden field.
- With JS, each photo is downscaled to 2560 px on the long edge and re-encoded as JPEG at 0.82. This strips EXIF/GPS. Thumbnails show with a remove button.

**Demo mode:** there is no file input. Show this instead: "Fotos senden Sie uns einfach per E-Mail an … – oder zeigen Sie sie uns beim Aufmaß."

**Always:**
- Show the hint "Bitte achten Sie darauf, dass keine Personen zu erkennen sind."
- Photos are never stored in the URL, sessionStorage or the draft.

### Step 4: Rahmen

| name | Label | Control | Rules |
|---|---|---|---|
| zeitraum | Wann soll es losgehen? | asap (So bald wie möglich), 1-3 (In 1–3 Monaten), 3-6, offen | optional |
| termin | Fester Termin (z. B. Einzug) | date | optional; JS sets min = today |
| budget | Budgetrahmen (optional) | bis-2000, 2000-5000, 5000-10000, 10000-25000, ueber-25000, keine-angabe | optional |
| plz | Postleitzahl des Objekts | text, maxlength 5 | **required**; pattern `[0-9]{5}`; `autocomplete=postal-code`; `inputmode=numeric` |
| ort | Ort | text | optional; `autocomplete=address-level2` |
| `output#einzugsgebiet` | Service-area hint (`aria-live=polite`) | — | Never blocks |

**Service areas** (`src/lib/configurator/service-area.ts`; to be confirmed by the owner):

| Tier | PLZ | Message |
|---|---|---|
| `kern` | Mannheim 68159–68309, Ludwigshafen 67059–67071 | "liegt in unserem Einzugsgebiet" |
| `region` | 67/68/69xxx | "Rhein-Neckar – Anfahrt nach Absprache" |
| anything else | — | "Außerhalb unseres üblichen Gebiets – fragen Sie gern trotzdem." |

### Step 5: Kontakt
- `name`: required, `autocomplete=name`, max 100.
- `email`: required, `type=email`, max 254.
- `telefon`: optional, `type=tel`, pattern `[0-9 +()/-]{6,30}`.
- `kontaktweg`: email, telefon, egal.
- `erreichbarkeit`: max 120.
- `nachricht`: textarea, max 2000.
- **Honeypot:** a neutral name, renamed in form.taxi. Hidden via a CSS class (no inline style), with `tabindex=-1` and an `aria-hidden` wrapper.
- **Hidden fields:** `_subject`, `_replyto`, `_lang=de`, `_next` (absolute URL of `/konfigurator/danke/`). JS also sets `anfrage_id`, `anfrage_json` and `zusammenfassung`.

### Deep links
- **Query link:** `/konfigurator/?typ=boden`, optionally with `&boden_leistung=aufarbeiten` or `&moebel_art=einbauschrank`.
  - Preselects with JS, opens step 2 and announces "Projektart Boden vorausgewählt".
- **No-JS deep links:** `src/pages/konfigurator/[typ].astro` uses `getStaticPaths` to generate 8 variants with `checked` set in the HTML. Canonical: `/konfigurator/`.
  - Service pages link to `/konfigurator/<typ>/`.
  - On those pages, JS calls `replaceState` to `/konfigurator/?typ=<typ>`.

## 2. No-JS baseline (one long native form)

**The problem:**
- Hidden controls are **still validated**.
- Only `disabled` exempts a control from validation, and toggling it needs JS.

**The solution:**
1. **HTML `required`** only on always-visible fields: typ, plz, name, email.
2. **Branch must-haves** carry `data-required`, not `required`.
   - The required marker comes from CSS: `.field:has(:required) .label::after { content: " (Pflichtfeld)" }`.
3. **Visibility comes from CSS in both modes.** Each `[data-branch]` element belongs to exactly one branch, so shared parts like photos are duplicated per branch with unique ids. The hide rules are generated from **one** source, `src/lib/configurator/conditions.ts`:
   ```astro
   ---
   import { PROJECT_TYPES, CONDITIONS } from '~/lib/configurator/conditions';
   const css = [
     ...PROJECT_TYPES.map(t => `#anfrage:not(:has([name="typ"][value="${t}"]:checked)) [data-branch="${t}"]{display:none}`),
     ...CONDITIONS.map(c => `#anfrage:not(:has(${c.values.map(v => `[name="${c.field}"][value="${v}"]:checked`).join(',')})) [data-when="${c.id}"]{display:none}`),
   ].join('\n');
   ---
   ```
   Under CSP, emit this as a processed or hashed stylesheet rather than `is:inline`. A good option is a build-generated CSS file imported by the component.
4. **JS** runs on init and on every `change`. It:
   - sets `required = true` on every `[data-required]`;
   - disables inactive `fieldset[data-branch]` and false `fieldset[data-when-*]`, which removes them from validation and from FormData while keeping their values;
   - sets `form.noValidate = true`, so the German error UI replaces native bubbles.
5. **Clean no-JS submissions:**
   - Branch radios have no `checked` attribute; number fields use `placeholder`, not `value`.
   - With JS, defaults are filled only into empty fields when a branch activates.
6. **What no-JS users see:**
   - The steps as `<section>`s with "Schritt n" headings.
   - The Möbel section shows the **SVG rendered at build time** with the caption "Beispielskizze".
   - Range sliders render `hidden`; JS reveals them.
   - Jargon popovers work through `popovertarget`.
   - Weiter/Zurück are hidden.
   - The final submit button comes before the step nav in the DOM, so Enter submits.
7. **Where the form goes:**
   - **Live:** `method=post action=https://form.taxi/s/… enctype=multipart/form-data`, `_next` → `/konfigurator/danke/`.
   - **Demo:** `method="dialog"` (validates, transmits nothing) plus a visible note "Demo: Es werden keine Daten übertragen."

## 3. JS enhancement

### Files
**Isomorphic** (`src/lib/configurator/`, no three.js; used in the Astro build, the browser and Vitest):
- `furniture/{types,species,constraints,carcass,table,live-edge,dims,describe,cutlist,index}.ts`
- `drawing/elevation.ts`
- `conditions.ts`, `fields.ts`, `service-area.ts`, `pricing/{index,rules}.ts`

**Browser** (`src/scripts/configurator/`):
- `main.ts`: entry point, core ≤ 13 KB gz.
- `controller.ts`, `steps.ts`, `state.ts`, `validate.ts`, `messages.de.ts`, `serialize.ts`, `history.ts`, `draft.ts`, `summary.ts`, `announce.ts`, `transitions.ts`, `submit.ts`, `payload.ts`, `mailto.ts`.
- `photos.ts`: lazy, on file selection.
- `preview/index.ts`, `preview/load3d.ts`: the Möbel chunk, ≤ 7 KB gz.
- `viewer3d/{index,types,renderer,scene,rig,panel-geometry,materials,textures,contact-shadow,camera,overlay,tween,snapshot,quality}.ts`: dynamic import only.

**Components** (`src/components/configurator/`):
- `Wizard.astro`, `Progress.astro`, `ErrorSummary.astro`, `SummarySidebar.astro`, `SuccessTimeline.astro`
- `steps/Step*.astro`
- `branches/{Moebel,MoebelMaterial,Boden,Treppe,Fenster,Tuer,Terrasse,Altbau,Sonstiges,Fotos}.astro`
- `fields/{Field,RadioCards,NumberRange,When}.astro`
- `preview/{PreviewPanel,ViewControls}.astro`

**Pages:** `src/pages/konfigurator/{index,[typ],danke}.astro`

**Other:**
- `src/assets/textures/<species>/{albedo-1024,albedo-512,normal-512}.webp` + a manifest.
- `scripts/textures/prepare.mjs`, `textures-src/SOURCES.md`.

### State
The DOM is the store; a pure reducer drives the rest.
```ts
export type ProjectType = 'moebel'|'boden'|'treppe'|'fenster'|'tuer'|'terrasse'|'altbau'|'sonstiges';
export type StepId = 'projekt'|'details'|'ausfuehrung'|'rahmen'|'kontakt'|'pruefen';
export interface ConfigState { v: 1; typ: ProjectType | null; details: Details | null;
  rahmen: { zeitraum?: string; termin?: string; budget?: string; plz?: string; ort?: string };
  kontakt: { name?: string; email?: string; telefon?: string; kontaktweg?: 'email'|'telefon'|'egal'; erreichbarkeit?: string; nachricht?: string } }
export interface FieldDef { kind: 'enum'|'int'|'dec'|'text'|'bool'|'date'|'file'; share: boolean; pii: boolean; step: StepId; branch?: ProjectType; unit?: 'cm'|'mm'|'m²'|'lfm' }
export interface WizardUi { step: StepId; furthest: number; phase: 'editing'|'submitting'|'done'|'failed'; errors: FieldError[] }
type Action = { t:'NEXT' } | { t:'BACK' } | { t:'GOTO'; step: StepId; via:'ui'|'history'|'summary' } | { t:'TYPE'; typ: ProjectType } | { t:'SUBMIT' } | { t:'SENT'; id:string } | { t:'FAILED'; reason: SubmitError };
type Effect = { e:'show'; step; dir:'fwd'|'back' } | { e:'focus'; target:'heading'|'errors'|'result' } | { e:'history'; mode:'push'|'replace' } | { e:'errors'; list } | { e:'announce'; text; level? } | { e:'persist' } | { e:'send' };
export function reduce(s: WizardUi, a: Action, ctx: { steps: StepId[]; validate(st: StepId): FieldError[] }): [WizardUi, Effect[]];
```
- **NEXT:** validate the current step. Errors → errors + focus on the summary. Otherwise → show, push history, focus the heading, persist.
- **GOTO:** clamp forward jumps to the first invalid step.
- **BACK:** `history.back()` if the previous entry is ours; otherwise GOTO + replace.
- **TYPE:** re-apply the conditions and announce that the other branch's values are kept.
- **SUBMIT:** validate all active steps; jump to the first invalid step.

### Validation
- Uses the Constraint Validation API.
- **Cross-field rules** in TS:
  - at least one checkbox in a group;
  - Baumkante ≥ 40 mm;
  - `termin` ≥ today;
  - per-type dimension limits.
- **German messages** (`messages.de.ts`):
  - `valueMissing` → "Bitte geben Sie {label} an." (radio: "Bitte wählen Sie …"; checkbox: "Bitte bestätigen Sie …")
  - `rangeUnderflow` → "{label} muss mindestens {min} {unit} betragen."
  - Email type mismatch → "… z. B. name@beispiel.de"
  - PLZ pattern mismatch → "Die Postleitzahl hat 5 Ziffern."
- **Error summary** (GOV.UK pattern): `<div tabindex="-1">` with the heading "Bitte prüfen Sie Ihre Angaben" and links to each field.
- **Inline errors:** `<p id="…-fehler">`, wired up with `aria-describedby` and `aria-invalid`.
- Errors appear after the first "Weiter" attempt, then re-validate on `input`.

### Focus, live regions, progress
- **On step change:**
  - Focus `<h2 tabindex="-1">` ("Schritt 2 von 6: Möbel & Maße") and update `document.title`.
  - Scroll the wizard into view (instant with reduced motion).
- **Live regions:** one polite region (debounced 1000 ms) and one assertive region, used only for submit failures.
- **Announcements:**
  - Derived changes, e.g. "Mittelwand ergänzt: 19 mm Eiche spannt maximal 74 cm".
  - The service area.
  - 3D status: loading, ready, unavailable.
  - Draft saved.
  - "Link kopiert".
- **Progress line:** `<nav aria-label="Fortschritt"><ol>`. Each step is a dimension-line segment with 45° ticks.
  - **Done steps:** buttons in ink.
  - **Current step:** `aria-current="step"`, thicker red line.
  - **Future steps:** dashed hairline.
  - Visually hidden "abgeschlossen" text marks done steps.
  - On narrow screens: the current label + "2/6".

### View transitions between steps
```ts
export function swapStep(update: () => void, dir: 'fwd'|'back'): Promise<void> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { update(); return Promise.resolve(); }
  document.documentElement.dataset.navDir = dir;
  const vt = document.startViewTransition(update);
  vt.finished.finally(() => delete document.documentElement.dataset.navDir);
  return vt.updateCallbackDone;
}
```
- **Named elements:** only `.step:not([hidden])` (`wizard-step`) and the progress line. The root is `view-transition-name: none`, so the canvas stays live.
- **Timing:** 180–220 ms slide-and-fade, mirrored for `data-nav-dir=back`.
- **During the transition:** `::view-transition { pointer-events: none }`.

### Summary sidebar
- `<aside aria-labelledby="h-auswahl">` with a generic `<dl>` built from the labels and `data-unit`. It is **not** a live region.
- **Mobile:** `<details>` "Ihre Auswahl (5)", with no sticky element covering focus.
- **Also contains:** "Konfiguration teilen" (popover with a copy button), "Entwurf auf diesem Gerät speichern", and the pricing box (only if enabled).

### Serialisation and history
- **URL:**
  - Readable keys, plus `v=1` and `schritt`; defaults are omitted.
  - Only fields with `share && !pii`.
  - **Parsing:** validate enums, clamp numbers, drop unknown keys.
  - **Writing:** `replaceState` on `change` only, throttled to ≤ 1 per 350 ms, in try/catch, only when the URL actually changed.
- **sessionStorage `ss-konfigurator-v1`:**
  - Stores all values except files and the honeypot, plus `step` and `furthest`.
  - Written debounced on `change` and on `pagehide`.
  - Cleared after a successful send.
- **Restore order:** URL > session > draft (the draft needs a confirm banner).
- **Opt-in draft `ss-konfigurator-entwurf-v1` (localStorage):**
  - Written only while the checkbox is ticked; carries `savedAt`.
  - Expires after 30 days.
  - Unticking the checkbox or "Entwurf löschen" deletes it.
  - Banner: "Gespeicherter Entwurf vom 09.10.2026 – Fortsetzen / Verwerfen".
  - The Datenschutz text must mention it.
- **History:** **one `pushState` per step**, handled via `popstate`. Don't use the Navigation API yet.
  - After a successful send, going Back shows "Anfrage bereits gesendet – neue Anfrage starten?".

### JS budget (gz)
- Core ≤ 13 KB.
- Möbel preview ≤ 7 KB (loaded when Möbel is chosen).
- Photos ≈ 1.5 KB (on file select).
- three.js chunk: on request only.
- `scripts/check-budgets.mjs` enforces these.

## 4. 3D preview

### 4.1 Scope
- **Carcass generator:** Regal, Sideboard/Anrichte, Einbauschrank/Schrankwand (fitted to a niche).
- **Table generator:** Esstisch (Vierfuß with Zarge, Kufen in wood or steel, optional Baumkante).
- **Bett:** form fields only for now. Bett 3D, sliding doors, Waschtisch and Vitrine come later.

### 4.2 Parameters (UI in cm, generators in mm)
Ranges with defaults in parentheses.

| | Regal | Sideboard | Einbauschrank (niche) | Esstisch |
|---|---|---|---|---|
| Breite / Länge | 40–300 (120) | 80–280 (180) | 60–400 (240) | 120–320 (200) |
| Höhe | 40–260 (200) | 50–100 (80) | 180–320 (250) | 72–78 (75) |
| Tiefe / Breite | 20–45 (35) | 35–55 (45) | 35–65 (60) | 70–110 (90) |
| Stärke | 19/25/40 | 19/25 | 19/25 | top 25/40/60 (40) |
| Unterbau | Sockel 6–12, Füße, ohne | Sockel, Füße 10–25, hängend | Sockel 8–12 | Vierfuß, Kufen Holz, Kufen Stahl |
| Fronten | offen | Türen, Schubkästen, gemischt | Drehtüren | — |

**Shelf span:** `L_max = t · (E / 0.16875)^(1/3)`. This assumes a simply supported shelf, load 1.2 kN/m², deflection limit L/600, creep factor 1.5.

| Species | E (GPa) | 19 mm | 25 mm | 40 mm |
|---|---|---|---|---|
| Eiche | 10.0 | 741 | 975 | 1560 |
| Nussbaum | 10.8 | 760 | 1000 | 1600 |
| Esche | 12.3 | 794 | 1045 | 1671 |
| Kernbuche | 14.3 | 834 | 1098 | 1757 |
| Kirsche | 10.3 | 748 | 985 | 1575 |

The E values need owner sign-off. Bay width = `min(L_max, 1200)`.

**Derived rules** (`constraints.ts`):
- **Bays:** `n = ceil((W − 2t + t) / (maxBay + t))`, all with equal clear width. When a Mittelwand is added, show a hint that also suggests the thicker board.
- **Shelves:**
  - Inner height `Hi = H − Sockel − 2t`.
  - Compartments `k ∈ [ceil(Hi/400), floor(Hi/200)]`, default `round(Hi/340)`, so shelves = k − 1.
  - Shelf positions snap to the 32 mm system grid.
- **Doors:**
  - 300–600 mm wide, ≤ 2400 mm tall.
  - A bay ≤ 600 mm gets 1 door; ≤ 1200 mm gets 2.
  - 3 mm gaps.
  - Hinges by door height: ≤ 900 → 2, ≤ 1600 → 3, ≤ 2000 → 4, ≤ 2400 → 5.
- **Drawers:** fronts 120–300 mm high, ≤ 1000 mm wide. Runner length 270–650 mm in 50 mm steps, derived from depth.
- **Sockel:** recessed 30 mm. **Füße:** inset 30 mm.
- **Rückwand:** 8 mm, in a groove 10 mm from the back edge. Einbauschrank leaves a 20 mm ventilation gap.
- **Einbauschrank:**
  - Passleisten 20–50 mm per side (default 30); Blende 30–80 mm (default 40).
  - Modules ≤ 1200 mm wide.
  - Carcass > 2600 mm tall → main cabinet ≤ 2250 mm + Aufsatz. If the Aufsatz would be < 300 mm, enlarge the Blende instead.
  - Dachschräge: flagged in the summary, not modelled.
- **Table:**
  - Legs 70–90 mm thick, inset 60–150 mm.
  - Zarge 80–100 mm high; its underside must stay ≥ 620 mm above the floor.
  - Kufen at `±(L/2 − max(300, 0.18L))`, joined by a Traverse.
  - Seats per long side: `floor((L − 200)/600)`, plus the ends when W ≥ 900. Shown as a range.
  - Baumkante needs a top ≥ 40 mm.

### 4.3 Types
```ts
export type Species = 'eiche'|'nussbaum'|'esche'|'kernbuche'|'kirsche';
export type Finish = 'natur-geoelt'|'weiss-geoelt'|'lack-matt';
export type Board = 19|25|40; export type Mm = number; export type Axis = 0|1|2; export type Vec3 = [Mm, Mm, Mm];
export interface CarcassParams { kind: 'regal'|'sideboard'|'einbauschrank'; width: Mm; height: Mm; depth: Mm; board: Board;
  front: 'offen'|'tueren'|'schubkaesten'|'gemischt'; base: { type: 'sockel'|'fuesse'|'haengend'|'ohne'; height: Mm };
  back: 'ohne'|'eingenutet'; shelvesPerBay: number|'auto'; handle: 'grifflos'|'holz'|'metall';
  niche?: { fillerSide: Mm; fillerTop: Mm }; species: Species; finish: Finish }
export interface TableParams { kind: 'esstisch'; length: Mm; width: Mm; height: Mm; top: 25|40|60; edge: 'gerade'|'baumkante'; seed: number;
  base: 'vierfuss'|'kufen-holz'|'kufen-stahl'; species: Species; finish: Finish }
export type FurnitureParams = CarcassParams | TableParams;
export type PartRole = 'seite'|'oberboden'|'unterboden'|'fachboden'|'mittelwand'|'rueckwand'|'sockel'|'fuss'|'tuer'|'schubkastenfront'|'griff'|'passleiste'|'blende'|'wand'|'platte'|'bein'|'zarge'|'kufe'|'traverse';
export interface Part { id: string; role: PartRole; label: string; min: Vec3; size: Vec3; grain: Axis;
  surface: 'holz'|'metall'|'wand'; solid: boolean; uvAnchor: 'world'|'local'; outline?: [Mm, Mm][];
  motion?: { kind: 'hinge'; pivot: Vec3; dir: 1|-1 } | { kind: 'slide'; dist: Mm }; explode?: [number, number, number] }
export interface DimSpec { id: string; a: Vec3; b: Vec3; offsetDir: [number, number, number]; level: number; text: string; views: ('vorne'|'seite'|'oben'|'3d')[] }
export interface Derived { bays: number; bayWidths: Mm[]; shelves: number[]; maxSpan: Mm; doors: number; drawers: number; hinges: number; modules?: number; aufsatz?: boolean; seats?: [number, number]; outer: Vec3 }
export interface Hint { code: string; level: 'info'|'warn'; field?: string; text: string }
export interface Build { params: FurnitureParams; parts: Part[]; dims: DimSpec[]; derived: Derived; hints: Hint[]; bounds: { min: Vec3; max: Vec3 } }
export declare function generate(p: FurnitureParams): Build;
export declare function maxShelfSpan(s: Species, t: Board | 60): Mm;
export declare function deriveBays(innerWidth: Mm, board: Board, maxBay: Mm): number;
export declare function deriveShelves(innerHeight: Mm): { min: number; max: number; def: number };
export declare function liveEdgeOutline(length: Mm, width: Mm, seed: number): [Mm, Mm][];
export declare function describe(b: Build): string;   // German; aria-label / alt / summary
export declare function cutList(b: Build): CutItem[];
```
- Coordinate system: x = width, y = height, z = depth; +z is the front.
- Part ids are stable across edits (e.g. `feld2/fach3`).

### 4.4 Materials, textures, grain
**Textures** (all CC0, from Poly Haven):

| Species | Texture | Notes |
|---|---|---|
| Eiche | `oak_veneer_01` | |
| Nussbaum | `european_walnut_veneer_04` | |
| Esche | `ash_veneer` | |
| Kirsche | `cherry_veneer` | Not `lacquered_cherry_wood` |
| Kernbuche | none exists | Use `white_maple_veneer`, tinted, plus a seeded reddish heart overlay. Label it "Holzbild beispielhaft". |

**Pipeline:**
- **Input:** download the 2K Diffuse + `nor_gl` maps manually.
- **Processing:** `scripts/textures/prepare.mjs` (sharp):
  - Rotates the grain along V.
  - Writes `albedo-1024.webp` (q≈80, ~100–160 KB), `albedo-512.webp` (~35 KB) and `normal-512.webp` (q≈90).
  - Stores the average colour for swatches and the first flat-colour frame.
- **Format:** WebP only. No KTX2; no AVIF in this pipeline.
- **Decoding:** off the main thread with `ImageBitmapLoader`. Normals use `imageOrientation: 'flipY'`.
- **Loading:**
  - Only the selected species loads; hovering or focusing a swatch prefetches its textures.
  - The old texture stays until the new one is uploaded (`initTexture` when idle).
  - LRU cache of 3.
- **Quality tiers:**
  - low (Save-Data, SwiftShader/llvmpipe, or `deviceMemory ≤ 2`): 512 albedo, no normal map.
  - high: 1K albedo + 512 normal.

**Finishes:** applied via a Canvas2D filter on an OffscreenCanvas, cached per species × finish, with an ImageData fallback.

| Finish | Albedo transform | Material | roughness | normalScale | clearcoat |
|---|---|---|---|---|---|
| natur geölt | `saturate(1.12) brightness(0.93) sepia(0.06)` | Standard | 0.55 | 0.5 | — |
| weiß geölt | `saturate(0.7) brightness(1.1)` + screen #F4EFE7 α .28 | Standard | 0.62 | 0.45 | — |
| lackiert matt | `saturate(1.05) brightness(0.97)` | Physical | 0.5 | 0.25 | 0.6 / 0.38 |

Other materials:
- **Metal:** `metalness 1`, `roughness .35`, #1E1E1E.
- **Walls:** `roughness .95`, #F2EFE9.
- **End grain:** a second material slot, colour × 0.8.
- **Shader pre-warm:** 1×1 placeholder textures stop variant recompiles; the Physical variant is pre-compiled with `compileAsync`.

**Grain rule:** grain runs along the longest dimension, with these role overrides:
- Carcass grain wraps around: sides and Mittelwände y; tops, bottoms and shelves x; Rückwand y.
- Doors (Regal, Einbauschrank): y.
- **Sideboard fronts:** x with `uvAnchor: 'world'`, so the grain runs continuously across fronts.
- Sockel and Blende: along their length.
- Table top: x; legs y; Zarge, Traverse and Kufen: along their length.
- Each part gets a deterministic texture offset from a hash of its id (world-anchored fronts excepted).

```ts
// viewer3d/panel-geometry.ts — box with grain-aware real-scale UVs; ≤ 2 groups (side grain / end grain)
export function panelGeometry(part: Part, texMm: number, jitter: [number, number]): BufferGeometry {
  const { size, grain } = part, c = part.min.map((m, i) => m + size[i] / 2) as Vec3;
  const anchor: Vec3 = part.uvAnchor === 'world' ? c : [0, 0, 0];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], side: number[] = [], end: number[] = [];
  for (const n of [0, 1, 2] as const) for (const s of [1, -1] as const) {
    const [a, b] = ([0, 1, 2] as const).filter(i => i !== n) as [Axis, Axis];
    const endGrain = n === grain;
    const vAx = endGrain ? (size[a] >= size[b] ? a : b) : grain;
    const uAx = vAx === a ? b : a;
    const base = pos.length / 3;
    for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const p: Vec3 = [0, 0, 0]; p[n] = s * size[n] / 2; p[a] = sa * size[a] / 2; p[b] = sb * size[b] / 2;
      pos.push(p[0] / 1000, p[1] / 1000, p[2] / 1000);
      nrm.push(n === 0 ? s : 0, n === 1 ? s : 0, n === 2 ? s : 0);
      uv.push((anchor[uAx] + p[uAx] + jitter[0]) / texMm, (anchor[vAx] + p[vAx] + jitter[1]) / texMm);
    }
    const ccw = (s > 0) === ((a + 1) % 3 === b);
    const tri = (ccw ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(i => base + i);
    (endGrain && part.solid ? end : side).push(...tri);
  }
  const g = new BufferGeometry();
  g.setIndex([...side, ...end]);
  g.addGroup(0, side.length, 0); if (end.length) g.addGroup(side.length, end.length, 1);
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g; // mesh.position = c / 1000
}
```
- **Live edge (Baumkante):** `ExtrudeGeometry` with a custom `UVGenerator`. Group 1 gets a darker "Waldkante" material.

### 4.5 Renderer
- **Choice:** `WebGLRenderer` behind `viewer3d/renderer.ts` `createBackend(kind)`. No GLSL or TSL anywhere else.
- **Why not WebGPU:**
  - +75–110 KB gz.
  - The default HalfFloat + MSAA intermediate target uses a lot of memory (about 90 MB vs 15 MB).
  - WebGPU is flaky in headless CI, and its API keeps changing.
- **Switches:**
  - No WebGL2, or 2 context losses → SVG-only mode.
  - `PUBLIC_3D=off` compiles the 3D path out.
  - `?3d=aus` forces it off for QA.

### 4.6 Scene
- **Canvas:** transparent (`alpha: true`), so the furniture sits on the sketchbook paper.
- **Lighting:**
  - `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture`; dispose both afterwards.
  - `NeutralToneMapping`, exposure 1.
  - Optional for the high tier: one DirectionalLight with 1024² PCF shadows, radius 4.
- **Contact shadow:**
  - A Canvas2D footprint texture (256 px) made from the part list.
  - Blur per part: 4 mm + 0.12·h. Alpha: `0.55·e^(−h/350) + 0.08`.
  - Rendered on a floor plane with `MeshBasicMaterial({transparent, depthWrite: false, toneMapped: false})`. Shadow strength comes from a CSS variable.
- **Einbauschrank walls:** plaster walls; section hatching comes in Phase C.
- **Camera:** `PerspectiveCamera(30°)`, 3/4 view by default.
- **OrbitControls:**
  - Damping .12, no pan.
  - Polar angle 0.12 to π/2 − .03.
  - Azimuth ±60° for the Einbauschrank, ±120° for other carcasses, free for tables.
  - Distance 0.4–2.5 × the fit distance.
  - `touch-action: pan-y`; **do not** use `listenToKeyEvents`.
- **View buttons:** `role=group aria-label="Ansicht"`: Vorne / Seite / 3/4 (+ Draufsicht for tables), ◀ Drehen / Drehen ▶ in 15° steps, Vergrößern / Verkleinern, Zurücksetzen. Native buttons, ≥ 44 px.
- **Phase C additions:**
  - Doors open up to 100°; drawers slide 0.7 × depth.
  - 600 ms animation, instant with reduced motion.
  - "Türen öffnen" and "Aufbau zeigen" toggles with `aria-pressed`. Explode distance = 15% of the largest dimension. Dimensions hide while either is active.
  - "Entwurf ↔ Werkstück" sketch mode via `EdgesGeometry`.

**Camera fit:**
```ts
export function fitDistance(box: Box3, forward: Vector3, cam: PerspectiveCamera, margin = 1.1): number {
  const c = box.getCenter(_c), right = _r.crossVectors(forward, cam.up).normalize(), up = _u.crossVectors(right, forward);
  const tanV = Math.tan(MathUtils.degToRad(cam.fov) / 2), tanH = tanV * cam.aspect;
  let d = 0;
  for (let i = 0; i < 8; i++) {
    _p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
    const x = Math.abs(_p.dot(right)) * margin, y = Math.abs(_p.dot(up)) * margin, z = _p.dot(forward);
    d = Math.max(d, x / tanH - z, y / tanV - z);
  }
  return d; // near = d/100, far = d*10
}
```
- Refit only when |NDC| > 0.95 or the object fills < 55% of the view.
- Wait 250 ms after the last change, then tween 350 ms (jump with reduced motion).

### 4.7 Dimension overlay
- An SVG overlay (`aria-hidden`), not CSS2DRenderer, drawn from the `DimSpec`s on rendered frames only.
- Each dimension line is offset `60 + 40·level` mm from the object.
- Skip a dimension when its projected length is < 48 px.
- Text angle is folded into ±90°, so it is never upside down.
- Labels use `paint-order: stroke` for a paper-coloured halo.

### 4.8 SVG elevation (`src/lib/configurator/drawing/elevation.ts`, pure)
`renderElevation(b, { view: 'vorne'|'seite'|'oben', widthPx, mode: 'screen'|'print', title }): string`
1. **Projection:** parts sorted by z; shelves hidden behind doors are drawn dashed.
2. **Scale:**
   - screen: fit to the width, fixed 12 px labels;
   - print: DIN 1:10/20/25/50 to fit A4 landscape, 3.5 mm text, 0.25/0.5 mm lines.
3. **Output:** `<svg role="img" aria-labelledby>` with `<title>` and `<desc>{describe(b)}</desc>`, containing:
   - defs: 45° hatch and tick marker;
   - the parts, with a species "watercolour wash" at about 12% opacity;
   - symbols: door-opening triangles and handles;
   - dimension chains: overall width, bay widths, overall height, shelf pitches (`non-scaling-stroke`);
   - a title block: "Schreinerei Schmidt · Regal · Eiche natur geölt · Maße in cm · M 1:20 · Datum".

Escape all text. The same SVG is used at build time, live, as the fallback, in the summary, for print (`beforeprint`) and as the live-mode attachment.

### 4.9 Loading
```ts
export function load3D(panel: HTMLElement, init): Promise<Viewer> {
  if (pending) return pending;
  const canvas = document.createElement('canvas'), dpr = Math.min(devicePixelRatio || 1, 2);
  const gl = canvas.getContext('webgl2', { antialias: dpr < 2, alpha: true, premultipliedAlpha: true, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' });
  if (!gl) { setState(panel, 'unsupported'); return Promise.reject(new Error('webgl2')); }   // nothing downloaded
  setState(panel, 'loading');
  pending = import('../viewer3d/index').then(m => m.createViewer({ ...init, canvas, gl, host })).then(v => (setState(panel, 'ready'), v))
    .catch(e => { pending = null; setState(panel, 'failed'); throw e; });
  return pending;
}
```
- **Poster:** the live SVG plus a "3D-Ansicht laden (ca. 0,3 MB)" button, always shown.
- **Auto-load** only when all of these hold:
  - `(pointer: fine) and (min-width: 64rem)`;
  - the panel is visible (IntersectionObserver ≥ 0.5);
  - the browser is idle;
  - no Save-Data;
  - no 2g/3g connection;
  - no user interaction in the last second.
- **Renderer:** pass the probed context to `new WebGLRenderer({ canvas, context })`.
- **Init:** call `yieldToMain()` between phases (module, renderer, PMREM, meshes, `compileAsync`, first frame).
- **First frame:** flat species colours, then the textures stream in.
- three.js is reachable **only** through this `import()`. Optionally, a Rolldown codeSplitting group `three` gives it a stable chunk name.

### 4.10 Lifecycle
```ts
const invalidate = () => { dirty = true; if (!raf && visible) raf = requestAnimationFrame(frame); };
function frame(now: number) { raf = 0;
  const moving = controls.update(); const animating = rig.tick(now) || camTween.tick(now);
  if (dirty || moving || animating) { renderer.render(scene, camera); overlay.draw(build.dims, camera); dirty = false; }
  if (moving || animating) raf = requestAnimationFrame(frame); }
```
- **Render triggers:** `controls change`, texture ready, resize (ResizeObserver), back on screen (IntersectionObserver).
- **Parameter changes:** coalesced per rAF → `generate()` → `rig.apply(build)`, diffed by part id.
- **`dispose()`:**
  - cancel the rAF;
  - `AbortController.abort()` for all listeners;
  - disconnect the observers and call `controls.dispose()`;
  - dispose geometries, materials, textures, PMREM and the shadow texture;
  - `renderer.dispose()` + `forceContextLoss()`.
- **When:** leaving the Möbel branch, or switching to bett/andere.
- **Context loss:** fall back to SVG and offer "3D neu laden". After 2 losses, stay on SVG.

### 4.11 Accessibility
- **Canvas:** `role="img"` with `aria-label = describe(build)`, debounced 500 ms. Example: "3D-Vorschau: Regal aus Eiche, natur geölt, 120 cm breit, 200 cm hoch, 35 cm tief; 2 Felder mit je 5 Fachböden; Sockel 8 cm."
- **Inputs:** each number input (it carries the `name`) is synced with a range slider labelled "(Schieberegler)".
- **Motion:** no auto-rotate. Status updates go to the polite region. The overlay is `aria-hidden`.

### 4.12 Snapshot
- Render the 3/4 preset and capture it **in the same task**:
  1. Draw the canvas onto a 2D canvas filled with the paper colour.
  2. `toBlob('image/webp', .85)`, falling back to PNG.
  3. Restore the user's camera and re-render.
- Keep `preserveDrawingBuffer` **false**.
- Shown as an `<img>` via an object URL.
- **Demo:** offered as a download. **Live:** attached as `ansicht_3d.webp`.

### 4.13 Budgets

| Metric | Target |
|---|---|
| three + addons | ≈ 143 KB gz |
| Viewer code | +8–12 KB |
| Total 3D chunk | ≤ 160 KB gz |
| First textures | ≤ 260 KB high tier / ≤ 50 KB low tier |
| Click → first lit frame | ≤ 0.8 s desktop / ≤ 2.5 s mid-range Android (4× CPU, Fast 4G) |
| Textured frame | +0.6 s / +1.5 s |
| Longest task | ≤ 120 ms desktop / ≤ 250 ms Android |
| Slider drag | ≤ 10 ms per frame; INP p75 < 200 ms |
| GPU memory | ≤ ~60 MB (no MSAA at DPR ≥ 2) |
| JS heap | +25 MB |
| DPR | ≤ 2 (low tier = 1) |

**INP rule:** handlers only record state. Decoding, filtering and compiling never run inside an event handler.

## 5. Submission
**Payload:** the same ASCII field names as the no-JS form, plus:
- `anfrage_json`: schema `ss-anfrage@1` with id, createdAt, source {mode, page, configUrl}, projekt, moebel {params, derived, hints, stueckliste}, rahmen (+ einzugsgebiet), kontakt, anhaenge.
- `zusammenfassung`: German plain text, from `summary.ts`, the same source as the screen summary.
- Attachments: `fotos[]`, `ansicht_3d`, `zeichnung`.
- `_subject`: e.g. "Anfrage Möbel: Regal 120×200×35 – 68161 Mannheim – #7F3K".
- `_replyto`, `_lang=de`, `anfrage_id` (from `crypto.randomUUID()`).

**Demo mode** (`PUBLIC_FORM_ENDPOINT` unset):
- Nothing is sent.
- A "Demo-Modus" ribbon shows, and the button reads "Anfrage abschließen (Demo)".
- The success view offers: the summary, drawing and snapshot, plus "Per E-Mail senden" (mailto), "Zusammenfassung kopieren", "Als Textdatei speichern", "Drucken / als PDF speichern" and "Konfigurationslink kopieren".

**Live mode:**
- `fetch(endpoint, { method: 'POST', body: fd, headers: { Accept: 'application/json' }, signal: AbortSignal.any([AbortSignal.timeout(20000), userSignal]) })`. Success means `res.ok && json.success`.
- **Time-trap:** a submit within 5 s with no recorded input gets a fake success.
- **Retries:**
  - network error or timeout: retry once after 1.5 s with the same id;
  - `success:false` or 4xx: no retry; map `error_msg` to German;
  - offline: show it immediately and re-enable on `online`.
- **Error panel** (`role="alert"`): "Ihre Anfrage konnte nicht gesendet werden. Ihre Eingaben bleiben erhalten." with "Erneut senden / Per E-Mail senden / Zusammenfassung kopieren".

**mailto budget:** the full encoded URL must stay ≤ 1800 characters.
- Sections are added by priority until the budget runs out; then "[gekürzt – vollständige Angaben über den Konfigurationslink]" is appended.
- The config link and "Fotos bitte als Anhang hinzufügen" are always included.
- Line breaks are `%0D%0A`.

**Success view, "Was passiert jetzt?"** (shown as a vertical dimension chain; * = owner to confirm):
1. Heute – Anfrage eingegangen (Vorgangsnummer).
2. Innerhalb von 2 Werktagen* – Rückfragen.
3. Aufmaß vor Ort*.
4. Schriftliches Angebot.
5. Fertigung in unserer Werkstatt in Mannheim.
6. Montage & Übergabe.

Focus moves to the heading; the session and draft are cleared.

## 6. Pricing module (disabled)
- `pricing/index.ts` is never imported unless `PUBLIC_PRICING === 'on'`.
- `estimate(state, build, rules): PriceEstimate | null`, using `PricingRules` with rates per species/board/finish, doors, drawers, hinges, hours, Montage and Anfahrt per tier. **Every rate is null** → it returns null.
- Output when enabled: a range rounded to 50 or 100 €, "inkl. 19 % MwSt.", and "unverbindliche Orientierung, kein Angebot". **Never shown in the demo.**

## 7. Testing
**Vitest 5** (Astro `getViteConfig()`; property tests with fast-check; ≥ 90% statement coverage on furniture, drawing, serialize, validate, mailto, pricing and controller):

| Area | Checks |
|---|---|
| Constraints | Oak 19 mm → 741 ± 1; span grows with board thickness and species stiffness; W=1200 oak 19 → 2 bays; door widths stay 300–600 |
| Generators | Bounds = outer dimensions; no overlaps; spans ≤ max; stable ids; 3 mm gaps; Zarge ≥ 620; live edge deterministic within ±40 mm |
| Elevation | Golden SVG snapshots for 6 configs; no NaN; `<title>`/`<desc>` present; text escaped |
| Serialize | Round trip; **never** PII keys; junk input clamped; URL < 600 chars; draft expires |
| Validate | German messages; "12,5" → 12.5 |
| Controller | Reducer transitions |
| mailto | ≤ 1800 chars; umlauts and CRLF encoded |
| Summaries | One per branch |
| Service area | 68161 → kern, 69117 → region, 10115 → außerhalb |
| Pricing | Disabled → null |
| Markup | Every named control is in `fields.ts`, and vice versa |

**Playwright 1.64:**
- **Projects:** chromium, firefox, webkit, Pixel 7, iPhone 15.
- **Servers:** a demo build, plus a live build with `PUBLIC_FORM_ENDPOINT=https://form.taxi/s/e2e` (intercepted with `page.route`).
- `baseURL` includes `/schreinerschmidt.com/`.

| Spec | Covers |
|---|---|
| `flow-moebel` | Full flow; focus and live regions |
| `flow-branches` | Parameterised across all branches; the multipart payload |
| `nojs` | `:has()` reveal; hidden branches never block; POST has no PII in the URL; demo `method=dialog`; path deep link |
| `deeplink-state` | `?typ`, share URL restore, reload, Back/Forward, no PII in the URL |
| `viewer3d` | Chromium/SwiftShader: load → `data-viewer-state=ready`; canvas screenshot is non-blank (use `sharp().stats()`: ≥ 5% of pixels differ from the background, luma stdev > 5); zero rAF while idle; context-loss path |
| `fallback` | `getContext('webgl2')` → null shows SVG only and downloads no chunk |
| `isolation` | The three.js chunk never loads on content pages, nor before the click when auto-load is off |
| `a11y` | axe with `wcag22aa` on every step, in the error state, no-JS, both schemes, and the success view |
| `motion-print` | Reduced motion: no `startViewTransition`; print shows summary + drawing + title block |

**Budgets:** content pages ≤ 15 KB gz; configurator initial ≤ 13 KB, core + Möbel ≤ 20 KB; three.js chunk ≤ 160 KB.

**Manual:** NVDA + Firefox, VoiceOver + Safari, TalkBack, keyboard-only, 400% zoom, forced colours.

## 8. Phases
**A: wizard + SVG**
- **Scope:** all 8 branches, the no-JS form + 8 path variants, controller/validation/a11y, VT, URL/session/draft, history, service area, photos, summary/mailto/print, the submit adapter, the danke page, generators + elevation.
- **Done when:**
  - All non-3D tests pass in 3 engines + mobile.
  - axe reports 0 issues.
  - Budgets hold; INP < 100 ms.
  - The owner has reviewed the copy.
  - The Datenschutz section is drafted.

**B: 3D carcass**
- **Scope:** renderer adapter, loader, PMREM, contact shadow, walls, controls + buttons, camera fit, overlay, 5 species × 3 finishes, render on demand, dispose, context loss, aria-label, snapshot, quality tiers.
- **Done when:**
  - The three.js chunk is ≤ 160 KB and isolated.
  - TTFF and memory targets are met.
  - 0 rAF while idle.
  - The pixel test passes.
  - Fallbacks are clean.
  - 10 load/dispose cycles leak nothing.

**C: polish**
- **Scope:** Esstisch 3D + Baumkante, doors/drawers/explode, 2 mm chamfers, finish tuning against the owner's samples, a Kernbuche scan, optional PCF shadows, wall hatching, sketch mode, side view.

**D: later**
- Bett, Waschtisch and Vitrine 3D; sliding doors; pricing; re-evaluate WebGPU.

## 9. Open questions for the owner
1. Recipient address.
2. form.taxi plan and DPA (AVV).
3. Response-time promise.
4. Aufmaß cost.
5. PLZ tiers.
6. Species and finishes actually offered (Auro products?).
7. Handles.
8. Steel bases: made in-house or by a partner?
9. Maximum part sizes.
10. Sample photos for calibrating the textures.
11. Budget bracket wording.
12. Pricing rules (for later).
