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
 * Cross-document view-transition direction types (docs/design-system.md §6 "Direction types").
 * Compares the path depth (relative to the base) of the old and new history entries:
 * deeper = forward, shallower = back, equal = lateral, reload = no type.
 * In pagereveal, an unfinished hero image (img.vt-media[data-hero]) drops its transition name.
 * No-ops where pageswap/pagereveal, the Navigation API or ViewTransition.types are missing.
 * @param {string} base The site base path, e.g. "/schreinerschmidt.com/".
 * @returns {string}
 */
export const vtTypesScript = (base) => {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `(()=>{if(!('onpagereveal' in window))return;const B=${JSON.stringify(root)},d=u=>{try{const p=new URL(u,location.href).pathname;return p.startsWith(B)?p.slice(B.length).split('/').filter(Boolean).length:-1}catch{return -1}},k=a=>{if(!a||!a.from||!a.entry||a.navigationType==='reload')return null;const f=d(a.from.url),t=d(a.entry.url);return f<0||t<0?null:t>f?'forward':t<f?'back':'lateral'},s=(v,a)=>{const t=k(a);t&&v&&v.types&&v.types.add(t)};addEventListener('pageswap',e=>{e.viewTransition&&s(e.viewTransition,e.activation)});addEventListener('pagereveal',e=>{const v=e.viewTransition;if(!v)return;s(v,self.navigation&&navigation.activation);const h=document.querySelector('img.vt-media[data-hero]');h&&!h.complete&&h.style.setProperty('--vt','none')})})()`;
};

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
