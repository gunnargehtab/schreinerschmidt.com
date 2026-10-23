// The review page's only stylesheet, served by the backend at /angebot/assets/review.css (CSP
// `style-src 'self'`: no inline styles). Colours from the site's tokens (src/styles/tokens/color.css),
// system fonts (no third-party requests). WCAG 2.2 AA: contrast ≥ 4.5:1 for text, a visible focus
// ring, targets ≥ 44 px, and nothing hidden that the page needs without JS.
export const REVIEW_CSS = `:root {
  color-scheme: light dark;
  --surface: #fffbf5;
  --surface-alt: #f5f2e7;
  --panel: #ebe5d1;
  --ink: #2c1403;
  --muted: #635146;
  --line: #cdbaab;
  --accent: #9e2124;
  --accent-ink: #fffbf5;
  --focus: #1659b5;
  --error: #9e2124;
  --ok: #236436;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #160d07;
    --surface-alt: #2c1403;
    --panel: #362113;
    --ink: #f0ebdf;
    --muted: #c1b1a0;
    --line: #503e34;
    --accent: #f7a597;
    --accent-ink: #160d07;
    --focus: #86c5fa;
    --error: #f7a597;
    --ok: #7ccd8e;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { font-size: 100%; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--ink);
  font: 1rem/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.skip { position: absolute; left: 0.5rem; top: -4rem; padding: 0.75rem 1rem; background: var(--ink); color: var(--surface); z-index: 1; }
.skip:focus { top: 0.5rem; }
.kopf { background: var(--surface-alt); border-bottom: 1px solid var(--line); padding: 0.75rem 1rem; }
.kopf p { margin: 0 auto; max-width: 52rem; color: var(--muted); font-size: 0.9375rem; }
main { display: block; max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
main:focus { outline: none; }
h1 { font-size: 1.625rem; line-height: 1.25; margin: 0 0 1rem; }
h2 { font-size: 1.25rem; line-height: 1.3; margin: 2.25rem 0 0.75rem; }
h3 { font-size: 1.0625rem; margin: 1.5rem 0 0.5rem; }
p, ul, ol, dl, table { margin: 0 0 1rem; }
a { color: var(--accent); text-underline-offset: 0.15em; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
.hinweis { border-left: 4px solid var(--muted); background: var(--surface-alt); padding: 0.75rem 1rem; }
.hinweis-ok { border-left-color: var(--ok); }
.hinweis-warn { border-left-color: var(--error); }
.empfehlung { border: 2px solid var(--line); border-radius: 6px; padding: 1rem 1.25rem; background: var(--surface-alt); }
.empfehlung h2 { margin-top: 0; }
.stufe-absagen { border-color: var(--error); }
.stufe-freigeben { border-color: var(--ok); }
dl.daten { display: grid; grid-template-columns: minmax(9rem, max-content) 1fr; gap: 0.25rem 1rem; }
dl.daten dt { font-weight: 600; }
dl.daten dd { margin: 0; overflow-wrap: anywhere; }
.freitext { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface-alt); padding: 0.75rem 1rem; border-radius: 4px; }
.tabelle { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 0.375rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
td.zahl, th.zahl { text-align: right; white-space: nowrap; }
tfoot th, tfoot td { font-weight: 600; }
section.aktion { border-top: 2px solid var(--line); margin-top: 2.5rem; }
fieldset { border: 1px solid var(--line); border-radius: 6px; margin: 0 0 1.25rem; padding: 0.75rem 1rem 1rem; min-width: 0; }
legend { font-weight: 600; padding: 0 0.25rem; }
.feld { margin: 0 0 1rem; }
.feld label, .feld .label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
.hilfe { display: block; color: var(--muted); font-size: 0.9375rem; margin: 0 0 0.375rem; }
.fehlertext { display: block; color: var(--error); font-weight: 600; margin: 0 0 0.375rem; }
input[type="text"], input[type="password"], textarea, select {
  font: inherit;
  color: inherit;
  background: var(--surface);
  border: 2px solid var(--muted);
  border-radius: 4px;
  padding: 0.5rem 0.625rem;
  min-height: 2.75rem;
  width: 100%;
  max-width: 40rem;
}
input.kurz { max-width: 12rem; }
textarea { min-height: 6rem; resize: vertical; }
[aria-invalid="true"] { border-color: var(--error); }
.reihe { display: flex; flex-wrap: wrap; gap: 0 1.5rem; }
.wahl { display: flex; align-items: flex-start; gap: 0.625rem; min-height: 2.75rem; padding: 0.5rem 0; }
.wahl input { width: 1.5rem; height: 1.5rem; margin: 0.0625rem 0 0; flex: none; accent-color: var(--accent); }
.wahl label { font-weight: 400; }
button, .knopf {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  min-width: 2.75rem;
  padding: 0.625rem 1.25rem;
  font: inherit;
  font-weight: 600;
  border-radius: 4px;
  border: 2px solid var(--accent);
  background: var(--accent);
  color: var(--accent-ink);
  cursor: pointer;
  text-decoration: none;
}
button.sekundaer, .knopf.sekundaer { background: transparent; color: var(--accent); }
.knoepfe { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 1.25rem 0 0; }
.fehlerliste { border: 3px solid var(--error); border-radius: 6px; padding: 1rem 1.25rem; margin: 0 0 1.5rem; }
.fehlerliste h2 { margin-top: 0; font-size: 1.125rem; }
.fehlerliste:focus { outline: 3px solid var(--focus); outline-offset: 3px; }
.mail { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; background: var(--surface-alt); border: 1px solid var(--line); border-radius: 4px; padding: 1rem; }
.leise { color: var(--muted); font-size: 0.9375rem; }
@media (max-width: 36rem) {
  dl.daten { grid-template-columns: 1fr; }
  dl.daten dd { margin-bottom: 0.5rem; }
}
`;
