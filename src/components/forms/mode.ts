// Shared helpers for the form components (docs/architecture.md §8).
import { PUBLIC_ASSISTANT_ENDPOINT, PUBLIC_DEMO, PUBLIC_FORM_ENDPOINT } from 'astro:env/client';
import { formTarget, type FormService } from '../../lib/form-target.mjs';

/** `demo`: method="dialog", nothing is sent. `live`: POST to the form endpoint (assistant or form.taxi). */
export type FormMode = 'demo' | 'live';

/** The build's form mode, unless a component overrides it (test fixture only). */
export const formMode = (override?: FormMode): FormMode => override ?? (PUBLIC_DEMO ? 'demo' : 'live');

const target = formTarget({ demo: PUBLIC_DEMO, assistant: PUBLIC_ASSISTANT_ENDPOINT, form: PUBLIC_FORM_ENDPOINT });

/**
 * The production form action: `${PUBLIC_ASSISTANT_ENDPOINT}/anfrage` when the assistant is set
 * (D3, docs/assistant.md §0), else PUBLIC_FORM_ENDPOINT (form.taxi). Undefined in demo builds;
 * astro.config.mjs refuses production builds without either.
 */
export const FORM_ENDPOINT = target.action;

/** Which service the production forms post to; null in demo builds. */
export const FORM_SERVICE: FormService | null = target.service;

/** True when the forms post to the assistant backend (live timeline, Datenschutz section). */
export const USES_ASSISTANT = FORM_SERVICE === 'assistant';

/** Default label text for the required marker, shown as text (design-system §5). */
export const REQUIRED_TEXT = '(Pflichtfeld)';

/** Space-separated id list for aria-describedby, or undefined when empty. */
export const describedBy = (...ids: (string | false | undefined)[]): string | undefined =>
  ids.filter(Boolean).join(' ') || undefined;
