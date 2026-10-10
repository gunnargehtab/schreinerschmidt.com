// German form messages (docs/architecture.md §8): the single source for the field components and
// src/scripts/forms/enhance.ts. Each field renders its error text at build time (defaultMessage),
// so the message is the same with and without JS (`:user-invalid` shows it natively). enhance.ts
// reuses that text and only adds the file-size message, which keeps the client script small.

/** Upload limit of the CV field (architecture §8). */
export const MAX_FILE_MB = 10;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/** U+202F between number and unit (CLAUDE.md). */
export const FILE_TOO_LARGE = `Die Datei ist größer als ${MAX_FILE_MB} MB. Bitte wählen Sie eine kleinere Datei.`;

export const MESSAGES = {
  required: 'Bitte füllen Sie dieses Feld aus.',
  choose: 'Bitte wählen Sie eine Option.',
  confirm: 'Bitte bestätigen Sie dieses Feld.',
  file: 'Bitte wählen Sie eine Datei aus.',
  email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
  plz: 'Bitte geben Sie eine fünfstellige Postleitzahl ein.',
  pattern: 'Bitte prüfen Sie das Format.',
  tooShort: (min: number) => `Bitte geben Sie mindestens ${min} Zeichen ein.`,
} as const;

/** What decides a field's message. */
export interface MessageContext {
  /** Control type: `text`, `email`, `tel`, `radio`, `checkbox`, `select`, `file`, `textarea`, … */
  type: string;
  /** `autocomplete` token; `postal-code` gets the PLZ message. */
  autocomplete?: string | undefined;
  /** `pattern` attribute, if any. */
  pattern?: string | undefined;
  /** `minlength`; the message then names the minimum, which also covers an empty field. */
  minLength?: number | undefined;
}

/**
 * The one message a field shows when it is invalid. It is phrased to cover every way the field can
 * fail (empty, wrong format, too short), so neither the markup nor the script has to tell them apart.
 */
export function defaultMessage(c: MessageContext): string {
  const { type } = c;
  if (type === 'radio' || type.startsWith('select')) return MESSAGES.choose;
  if (type === 'checkbox') return MESSAGES.confirm;
  if (type === 'file') return MESSAGES.file;
  if (type === 'email') return MESSAGES.email;
  if (c.autocomplete === 'postal-code') return MESSAGES.plz;
  if (c.minLength && c.minLength > 0) return MESSAGES.tooShort(c.minLength);
  if (c.pattern) return MESSAGES.pattern;
  return MESSAGES.required;
}
