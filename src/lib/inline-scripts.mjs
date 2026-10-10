// Single source for every inline <script> on the site.
// astro.config.mjs imports these to compute CSP hashes; BaseLayout imports them to render.
// The emitted text must be byte-identical in both places, so never post-process it.
import { createHash } from 'node:crypto';

/**
 * CSP source expression for an inline script body.
 * @param {string} code
 * @returns {`sha256-${string}`}
 */
export const cspHash = (code) => `sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}`;

/** Applies a stored theme choice before first paint and marks the document as JS-enabled. */
export const themeInitScript =
  "(()=>{const d=document.documentElement,a=()=>{try{const t=localStorage.getItem('ss-theme');t==='light'||t==='dark'?d.dataset.theme=t:delete d.dataset.theme}catch{}};a();d.classList.add('js');document.prerendering&&document.addEventListener('prerenderingchange',a,{once:true})})()";

/**
 * Source of `classifyNavigation`, inlined verbatim into `vtTypesScript`.
 *
 * Kept as a string on purpose: Astro's bundler reprints function bodies (quotes, indentation), so
 * `Function.prototype.toString` yields different text in astro.config.mjs (which hashes the script)
 * and in the SSR bundle (which renders it), and the CSP hash no longer matches. A string literal
 * survives bundling byte for byte. `classifyNavigation` is evaluated from this exact string, so the
 * unit tests exercise the code that ships. Self-contained and browser-safe: it may only use its
 * parameters and `URL`.
 * Parameters: f = from URL, t = to URL, n = navigationType, b = base.
 */
export const classifyNavigationSource =
  "function(f,t,n,b){if(!f||!t||n==='reload')return null;const r=b.endsWith('/')?b:b+'/',d=u=>{try{const p=new URL(u,'http://localhost/').pathname;return p.startsWith(r)?p.slice(r.length).split('/').filter(Boolean).length:-1}catch{return -1}},x=d(f),y=d(t);return x<0||y<0?null:y>x?'forward':y<x?'back':'lateral'}";

/**
 * View-transition direction for a same-site navigation (docs/design-system.md §6 "Direction types").
 * Compares the path depth below `base` of the old and new URL: deeper = forward, shallower = back,
 * equal = lateral. Reloads, missing URLs and URLs outside the base get no type (null).
 * Accepts absolute URLs (NavigationHistoryEntry.url) and root-relative paths.
 * @type {(from: string | null | undefined, to: string | null | undefined, navigationType: string | null | undefined, base: string) => 'forward' | 'back' | 'lateral' | null}
 */
export const classifyNavigation = new Function(`return (${classifyNavigationSource})`)();

/**
 * Cross-document view-transition direction types (docs/design-system.md §6 "Direction types").
 * Adds the `classifyNavigation` type in pageswap (old page) and pagereveal (new page).
 * In pagereveal, an unfinished hero image (img.vt-media[data-hero]) drops its transition name.
 * No-ops where pageswap/pagereveal, the Navigation API or ViewTransition.types are missing.
 * @param {string} base The site base path, e.g. "/schreinerschmidt.com/".
 * @returns {string}
 */
export const vtTypesScript = (base) => {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `(()=>{if(!('onpagereveal' in window))return;const c=${classifyNavigationSource},B=${JSON.stringify(root)},s=(v,a)=>{if(!v||!v.types||!a||!a.from||!a.entry)return;const t=c(a.from.url,a.entry.url,a.navigationType,B);t&&v.types.add(t)};addEventListener('pageswap',e=>{e.viewTransition&&s(e.viewTransition,e.activation)});addEventListener('pagereveal',e=>{const v=e.viewTransition;if(!v)return;s(v,self.navigation&&navigation.activation);const h=document.querySelector('img.vt-media[data-hero]');h&&!h.complete&&h.style.setProperty('--vt','none')})})()`;
};

/**
 * Referenzen filter preselect (docs/design-system.md §6): `?kategorie=<chip>` checks the matching
 * radio. Runs right after the FilterBar fieldset, so the first paint is already filtered.
 * Unknown values leave the default ("alle") checked.
 */
export const filterPreselectScript =
  "(()=>{try{const v=new URLSearchParams(location.search).get('kategorie'),r=v&&document.querySelector('input[name=\"kategorie\"][value=\"'+CSS.escape(v)+'\"]');r&&(r.checked=true)}catch{}})()";

/**
 * Speculation rules (docs/design-system.md §7): prerender same-site pages, prefetch the configurator.
 * @param {string} base The site base path, e.g. "/schreinerschmidt.com/".
 * @returns {string}
 */
export const speculationRulesScript = (base) =>
  JSON.stringify({
    prerender: [
      {
        eagerness: 'moderate',
        where: {
          and: [
            { href_matches: `${base}*` },
            { not: { href_matches: `${base}konfigurator/*` } },
            { not: { href_matches: `${base}*/danke/` } },
            { not: { selector_matches: '[data-no-prerender],[download],[target="_blank"]' } },
          ],
        },
      },
    ],
    prefetch: [{ eagerness: 'moderate', where: { href_matches: `${base}konfigurator/*` } }],
  });
