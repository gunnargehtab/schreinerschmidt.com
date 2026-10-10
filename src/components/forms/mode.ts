// Shared helpers for the form components (docs/architecture.md §8).
import { PUBLIC_DEMO, PUBLIC_FORM_ENDPOINT } from 'astro:env/client';

/** `demo`: method="dialog", nothing is sent. `live`: POST to the form endpoint (form.taxi). */
export type FormMode = 'demo' | 'live';

/** The build's form mode, unless a component overrides it (test fixture only). */
export const formMode = (override?: FormMode): FormMode => override ?? (PUBLIC_DEMO ? 'demo' : 'live');

/** The production endpoint; astro.config.mjs refuses production builds without it. */
export const FORM_ENDPOINT = PUBLIC_FORM_ENDPOINT;

/** Default label text for the required marker, shown as text (design-system §5). */
export const REQUIRED_TEXT = '(Pflichtfeld)';

/** Space-separated id list for aria-describedby, or undefined when empty. */
export const describedBy = (...ids: (string | false | undefined)[]): string | undefined =>
  ids.filter(Boolean).join(' ') || undefined;
