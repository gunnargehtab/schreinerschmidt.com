// Where the production forms post (docs/assistant.md §0 D3, docs/angebot.md §9, docs/architecture.md §8).
// Decision D3 (2026-10-23): the assistant backend replaces form.taxi. When PUBLIC_ASSISTANT_ENDPOINT
// is set, every form (configurator, kontakt, karriere) posts to `${endpoint}/anfrage`; form.taxi
// (PUBLIC_FORM_ENDPOINT) is only the fallback while the assistant endpoint is unset. Demo builds post
// nowhere, so they add no origin to the CSP whatever the env holds.
// Shared by astro.config.mjs (build guard, CSP `connect-src`/`form-action`) and
// src/components/forms/mode.ts (form action, live timeline, Datenschutz blocks), so the CSP origin
// and the form action can't drift. Pure; never imported by client code.

/** @typedef {'assistant' | 'formtaxi'} FormService */
/**
 * @typedef {{ service: FormService, action: string, origin: string }
 *   | { service: null, action: undefined, origin: undefined }} FormTarget
 */

/** The backend route every form posts to (assistant/src/app.ts). */
export const ASSISTANT_PATH = '/anfrage';

/**
 * The origin of PUBLIC_ASSISTANT_ENDPOINT. It must be an https origin without a path, query,
 * fragment or credentials (`https://anfrage.example.de`, a trailing slash is fine): the route is
 * appended here, and the CSP allows exactly this origin.
 * @param {string} value
 * @returns {string}
 */
export function assistantOrigin(value) {
  /** @type {URL} */
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`PUBLIC_ASSISTANT_ENDPOINT is not a URL: "${value}"`);
  }
  if (u.protocol !== 'https:') throw new Error('PUBLIC_ASSISTANT_ENDPOINT must use https');
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || /[?#]/.test(value)) {
    throw new Error(
      `PUBLIC_ASSISTANT_ENDPOINT must be an origin without a path (e.g. https://anfrage.example.de), got "${value}"`,
    );
  }
  return u.origin;
}

/**
 * The form target of a build. Production: the assistant when set (D3), else form.taxi, else none
 * (astro.config.mjs refuses that combination). Demo: none.
 * @param {{ demo: boolean, assistant?: string | undefined, form?: string | undefined }} env
 * @returns {FormTarget}
 */
export function formTarget({ demo, assistant, form }) {
  if (demo) return { service: null, action: undefined, origin: undefined };
  if (assistant) {
    const origin = assistantOrigin(assistant);
    return { service: 'assistant', action: origin + ASSISTANT_PATH, origin };
  }
  if (form) {
    const u = new URL(form);
    if (u.protocol !== 'https:') throw new Error('PUBLIC_FORM_ENDPOINT must use https');
    return { service: 'formtaxi', action: form, origin: u.origin };
  }
  return { service: null, action: undefined, origin: undefined };
}

/**
 * The CSP source list suffix for `connect-src` and `form-action`: ` <origin>` for the service in
 * use, '' when the build posts nowhere. Only one origin is ever added.
 * @param {FormTarget} target
 * @returns {string}
 */
export const cspFormSource = (target) => (target.origin ? ` ${target.origin}` : '');
