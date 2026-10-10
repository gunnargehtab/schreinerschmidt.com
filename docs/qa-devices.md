# Real-device QA checklist (Phase 5)

Developer checklist for the things CI cannot measure: real browsers, real GPUs, OS settings, assistive tech. Source: `docs/plan.md` §10 (Verification), the Phase 4/5 notes, `docs/configurator.md` §4.13. Run against the live demo `https://gunnargehtab.github.io/schreinerschmidt.com/` (or `npm run build && npm run serve` → `http://localhost:4173/schreinerschmidt.com/`). Tick the matrix; note failures below it with device, OS and browser versions.

Legend: ☐ = check on this device, – = not applicable.

| # | Check | iPhone Safari 26/27 | Older iOS | Android Chrome (mid-range) | Desktop Chrome | Desktop Firefox | Desktop Safari | Keyboard only | NVDA |
|---|---|---|---|---|---|---|---|---|---|
| 1 | View transitions | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | – | – |
| 2 | Scroll-driven animations | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | – | – |
| 3 | Reduced motion (OS setting) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | – | – |
| 4 | Mobile nav sheet | ☐ | ☐ | ☐ | ☐ (narrow window) | ☐ (narrow window) | – | ☐ | ☐ |
| 5 | Forms (Kontakt, Karriere) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | Configurator steps, back button, share link | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | 3D: tap to load, time to first frame | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | – | – |
| 8 | 3D: orbit / pinch, view buttons, toggles | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | 3D: rotate the phone, memory, context loss | ☐ | ☐ | ☐ | ☐ | – | – | – | – |
| 10 | Print to PDF: service page, configurator summary | ☐ | – | ☐ | ☐ | ☐ | ☐ | – | – |
| 11 | Favicon / add to home screen | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | – | – |
| 12 | Dark mode | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | – |
| 13 | `?pruefen` review view | ☐ | – | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 14 | Network panel: same-origin, no cookies, no CSP violations | – | – | ☐ (remote) | ☐ | ☐ | ☐ | – | – |
| 15 | Keyboard: skip link, focus, popovers, dialog, wizard focus | – | – | – | – | – | – | ☐ | ☐ |
| 16 | NVDA: landmarks, labels, live regions, canvas label | – | – | – | – | – | – | – | ☐ |

Devices: note model, OS and browser build here → `iPhone: ______  older iOS: ______  Android: ______  desktop: ______`

## How and expected result

**1. View transitions.** Click a project card on `referenzen/`, then the browser back button; click a service card on `leistungen/`. → Chrome and Safari (18.2+): the card image morphs into the detail hero, the title swaps, the header stays put, forward and back slide in opposite directions. Firefox and older iOS: instant navigation, nothing flashes or stays hidden. No scrollbar jump.

**2. Scroll-driven animations.** Reload `` (home) and scroll slowly through stats, service cards, „Vom Entwurf zum Werkstück“ and „Ablauf“. → Chrome and Safari 26+: counters count up, sketches draw themselves, the sketch crossfades into the photo, the hero opens to full bleed. Firefox and older iOS: every section is in its finished state; nothing is invisible or half-drawn. The hero image is never hidden (LCP rule).

**3. Reduced motion via the OS.** iOS: Settings → Accessibility → Motion → Reduce Motion. Android: Accessibility → Remove animations. Windows: Settings → Accessibility → Visual effects → Animation effects off. macOS: Accessibility → Display → Reduce motion. Then repeat 1, 2 and the 3D toggles. → No movement anywhere: page changes are instant or a plain fade, sketches and counters appear finished, popovers only fade, „Türen öffnen“ and „Aufbau zeigen“ jump to the end state, camera presets jump instead of tweening.

**4. Mobile nav sheet.** Tap „Menü“; tap outside; tap „Menü schließen“; press Esc with a keyboard. → The sheet opens below the header with all links incl. the 7 services and the „Angebot konfigurieren“ / „Anrufen“ buttons; it closes on every method; focus returns to „Menü“. Older iOS (no `commandfor`): the sheet still opens via `popovertarget`. With JS off (Safari → Develop → Disable JavaScript, or Chrome DevTools): it still opens and closes.

**5. Forms.** `kontakt/` and `karriere/`: submit empty, then valid. → Empty: the error summary „Bitte prüfen Sie Ihre Eingaben“ receives focus and links to each field; fields show inline errors. Valid: „Demo – nichts übertragen.“ appears inline and the Network panel shows zero requests. Inputs do not zoom on focus on iOS (≥ 16 px). The Karriere CV field is marked „nur im Livebetrieb“. With JS off: submit validates and nothing is sent (the form uses `method="dialog"`), the note „Demo: Es werden keine Daten übertragen.“ is visible.

**6. Configurator steps, back button, share link.** On `konfigurator/` pick „Möbel nach Maß“, go „Weiter“ to step 3, press the browser back button twice, then forward. → Each back goes one step up, forward returns; the heading „Schritt n von 6: …“ receives focus on every change; values survive. Open `konfigurator/boden/` and `konfigurator/?typ=boden` → Boden is preselected, step 2 opens with JS, the no-JS page shows the long form with the Boden branch visible. In the sidebar press „Konfiguration teilen“ → „Link kopieren“, paste the link into a private window → the same configuration is restored at the same step; the URL contains no name, e-mail, PLZ or photos. Reload mid-flow → the session restores. Tick „Entwurf auf diesem Gerät speichern“, close the tab, reopen → the banner „Gespeicherter Entwurf vom …“ with „Fortsetzen“ / „Verwerfen“.

**7. 3D: tap to load, time to first frame.** `konfigurator/moebel/`, choose „Regal“. Phones: tap „3D-Ansicht laden (ca. 0,3 MB)“ and time until the first lit frame appears (screen recording, or the polite announcement „3D-Ansicht bereit“ in DevTools remote debugging). Desktop: the viewer auto-loads once the panel is visible and the pointer is idle; time it with the Performance panel from the `import()` of the three chunk to the first frame. → ≤ 0.8 s on desktop, ≤ 2.5 s on the mid-range Android (the §4.13 figures were set for 4× CPU / Fast 4G emulation, so a real device should be comfortably under). Flat colours first, then textures stream in; the SVG drawing stays visible until the first frame. The three.js chunk (~143 KB gz) loads only after the click / auto-load and never on other pages. `?3d=aus` → the poster button never appears, SVG only.

**8. 3D: orbit / pinch, view buttons, toggles.** Drag with one finger / the mouse, pinch to zoom, swipe vertically over the canvas. → Orbit within the angle limits (no flipping under the floor; the Einbauschrank stops at ±60°), zoom clamps, a vertical swipe scrolls the page (`touch-action: pan-y`), no panning. Buttons in the „Ansicht“ group: „Vorne“, „Seite“, „3/4-Ansicht“, „Draufsicht“ (tables only), „Nach links drehen“ / „Nach rechts drehen“ (15° steps), „Vergrößern“, „Verkleinern“, „Zurücksetzen“ → each one works by tap and by keyboard (Enter/Space); targets ≥ 44 px. Switch to „Sideboard“, „Fronten“ = „Gemischt“: „Türen und Schubkästen öffnen“ animates doors to 100° and drawers out (600 ms); „Aufbau zeigen“ explodes the parts; both buttons report `aria-pressed`, dimensions hide while a toggle is on, both reset on a kind switch. „Esstisch“ with „Kante“ = „Baumkante“ shows the live edge; „Kernbuche“ shows the note „Holzbild beispielhaft“. Idle: no continuous rendering (Performance panel shows no rAF loop while nothing moves).

**9. 3D: rotate the phone, memory, context loss.** With the viewer loaded, rotate portrait ↔ landscape → the canvas resizes crisply, the camera refits, the overlay labels stay upright. Memory: Chrome task manager (Shift+Esc) or `chrome://inspect` → Memory for the Android device: GPU memory ≤ ~60 MB and JS heap ≤ +25 MB above the page baseline; switch Möbelart 10 times, no growth. Context loss: load 3D, switch to the camera app or two other heavy apps for a minute, come back → either the viewer still renders, or the SVG drawing is back with „3D neu laden“; a second loss keeps the SVG permanently. Desktop Chrome: simulate in the console with `document.querySelector('[data-viewer] canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`, same expectation.

**10. Print to PDF.** `leistungen/boeden/` → print to PDF. → No demo banner, nav, theme button, in-page nav or filter chips; the hero is on the first page (no blank page); external links print their URL; the footer shows name, address, phone, e-mail and hours only; no half-drawn sketches. Configurator: finish a Möbel run with „Anfrage abschließen (Demo)“, then „Drucken / als PDF speichern“. → The summary, the elevation drawing at a DIN scale with the title block, no buttons; dark mode prints light. iOS: Share → Print → pinch the preview to get a PDF.

**11. Favicon / add to home screen.** Open any page; check the tab icon in light and dark; Safari iOS: Share → „Zum Home-Bildschirm“; Android Chrome: menu → „Zum Startbildschirm hinzufügen“. → The placeholder blocky „S“ shows as tab icon (`favicon.svg`/`.ico`), as the iOS icon (`apple-touch-icon.png`) and as the Android icon (192/512 px from `site.webmanifest`); the shortcut is named „Schreinerei Schmidt“ and opens under the base path, in the browser (no standalone mode).

**12. Dark mode.** OS dark theme on, open the site → it follows („Wie System“). Pick „Werkstatt bei Nacht“ via the „Farbschema“ button, navigate two pages, reload → the choice persists (`localStorage` key `ss-theme` exists only now, not before the pick). → Text and lines readable on every page, the brand red turns to the lighter accent, sketches and the 3D canvas sit on the dark paper, the inverse bands and the error/success colours are still legible, no white flash on navigation.

**13. `?pruefen` review view.** Open `?pruefen` on the home page, navigate to `kontakt/` and `impressum/`. → The legend „Prüfansicht: …“ sits bottom-left on every page; marks show „[prüfen]“ (dashed) and „[Platzhalter]“ (solid); the view stays on across pages in the same tab; „Prüfansicht beenden“ turns it off; a configurator share link with `?schritt=pruefen` does not turn it on; `intern/pruefliste/` lists every item and the table scrolls horizontally on phones.

**14. Network panel.** DevTools → Network (Android via `chrome://inspect`), reload the home page, the Konfigurator and the 3D load; Application → Cookies and Storage; Console. → Every request goes to the site origin only; fonts are self-hosted latin woff2; no cookies at all; sessionStorage/localStorage empty until the user picks a theme, starts the configurator or ticks the draft box; zero CSP violations and zero console errors; `/schreinerschmidt.com` without slash → 301; an unknown path → the styled 404 with status 404.

**15. Keyboard only.** Tab from the top of each main page. → „Zum Inhalt springen“ is the first focus stop; focus rings are visible (blue) on every control incl. cards and chips; the Leistungen dropdown and the theme menu open with Enter and close with Esc; the lightbox opens from a single-photo project, traps focus, closes with Esc and returns focus to the thumbnail; the before/after slider moves with arrow keys and the „Vorher“ / „Beide“ / „Nachher“ buttons work; the Referenzen chips are radios (arrow keys); the 3D canvas is not a focus trap and every camera action is reachable via the „Ansicht“ buttons; in the wizard, „Weiter“ moves focus to the step heading, the error summary receives focus on invalid input, and the submit button is reachable without a mouse.

**16. NVDA (Firefox and Chrome).** Browse mode, then forms mode in the wizard. → One h1 per page, sensible landmarks (banner, navigation „Hauptmenü“, main, contentinfo); every field announces its label and „(Pflichtfeld)“; errors are announced and linked; the polite region announces „Projektart Boden vorausgewählt“, „3D-Ansicht wird geladen“ / „3D-Ansicht bereit“; the canvas reads as an image „3D-Vorschau: Regal aus Eiche, natur geölt, …“ and updates after a value change; the toggles announce their pressed state; the before/after button group announces „Ansicht wählen“; the lightbox announces „Bildansicht“; the Prüfliste tables read with headers; the review marks read as plain text only (the „[prüfen]“ / „[Platzhalter]“ labels are `::after` content with empty alt text, so they are visual only).

## Failures

| Check | Device / browser | What happened | Expected |
|---|---|---|---|
| | | | |
