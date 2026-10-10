// German messages of the wizard (docs/configurator.md §3 "Validation", §5). The only copy that
// ships in the client bundles; every other label is read from the DOM. Style follows
// src/scripts/forms/messages.de.ts: full sentences, „…“ quotes, U+202F before units.
// Loaded with the validation chunk (validate.ts) on the first "Weiter"; the reducer's own three
// texts sit in state.ts (STATE_MSG) and are re-exported here.
import { STATE_MSG } from './state';

const NNBSP = ' ';

/** "12.5" → "12,5"; integers unchanged. */
export const num = (n: number): string => String(n).replace('.', ',');

/** A label as it reads inside a sentence or a summary line: trailing question mark or colon dropped. */
export const bare = (label: string): string => label.replace(/\s*[?:]\s*$/, '');

const withUnit = (n: number, unit?: string): string => num(n) + (unit ? NNBSP + unit : '');

export const MSG = {
  missing: (label: string) => `Bitte geben Sie „${bare(label)}“ an.`,
  choose: (label: string) => `Bitte wählen Sie eine Option bei „${bare(label)}“.`,
  confirm: (label: string) => `Bitte bestätigen Sie „${bare(label)}“.`,
  atLeastOne: (label: string) => `Bitte wählen Sie mindestens eine Option bei „${bare(label)}“.`,
  min: (label: string, min: number, unit?: string) => `${bare(label)} muss mindestens ${withUnit(min, unit)} betragen.`,
  max: (label: string, max: number, unit?: string) => `${bare(label)} darf höchstens ${withUnit(max, unit)} betragen.`,
  between: (label: string, min: number, max: number, unit?: string) =>
    `${bare(label)} muss zwischen ${num(min)} und ${withUnit(max, unit)} liegen.`,
  tooShort: (label: string, min: number) => `Bitte geben Sie bei „${bare(label)}“ mindestens ${min} Zeichen ein.`,
  tooLong: (label: string, max: number) => `„${bare(label)}“ darf höchstens ${max} Zeichen lang sein.`,
  email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
  plz: 'Die Postleitzahl hat 5 Ziffern.',
  tel: 'Bitte geben Sie eine gültige Telefonnummer ein, z. B. 0621 1234567.',
  decimal: 'Bitte geben Sie eine Zahl ein, z. B. 12,5.',
  integer: 'Bitte geben Sie eine ganze Zahl ein.',
  pattern: 'Bitte prüfen Sie das Format.',
  date: 'Bitte geben Sie ein gültiges Datum ein.',
  datePast: 'Der Termin darf nicht in der Vergangenheit liegen.',
  baumkante: `Eine Baumkante braucht eine Plattenstärke von mindestens 40${NNBSP}mm.`,
  ...STATE_MSG,
} as const;

/** Photo policy (§1): shown as the file input's custom validity (photos.ts, lazy). */
export const PHOTO = {
  tooMany: 'Bitte wählen Sie höchstens 6 Fotos aus.',
  tooBig: `Ein Foto ist größer als 10${NNBSP}MB und wurde nicht übernommen.`,
} as const;

/** mailto texts (§5): the always-included footer and the truncation marker. */
export const MAIL = {
  truncated: '[gekürzt – vollständige Angaben über den Konfigurationslink]',
  link: 'Konfigurationslink: ',
  photos: 'Fotos bitte als Anhang hinzufügen.',
} as const;
