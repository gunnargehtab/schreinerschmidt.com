// Validation of the wizard (docs/configurator.md §3 "Validation"). The pure part (controlMessage,
// crossErrors, parseDecimal) chooses the German message for a ValidityState and checks the
// cross-field rules; tests/unit/configurator/validate.test.ts covers it without a DOM. The DOM part
// at the end (validateStep, showErrors, clearErrors) reads the controls of a step and drives the
// GOV.UK error summary and the inline errors. The controller loads this module on request
// (prefetched at the first interaction, awaited at the first "Weiter"), so the validation code and
// messages.de.ts stay out of the initial core bundle.
import { FIELDS, fieldRange, type StepId, type Values } from '../../lib/configurator/fields';
import { visible } from '../../lib/configurator/conditions';
import { MSG } from './messages.de';
import type { FieldError } from './state';
import { fieldEl } from './summary';

/** The PLZ hint (controller) and the payload read the service area from this chunk, not the core. */
export { serviceArea } from '../../lib/configurator/service-area';

/** The subset of ValidityState the messages depend on. */
export interface ValidityLike {
  valid?: boolean;
  valueMissing?: boolean;
  typeMismatch?: boolean;
  patternMismatch?: boolean;
  tooShort?: boolean;
  tooLong?: boolean;
  rangeUnderflow?: boolean;
  rangeOverflow?: boolean;
  stepMismatch?: boolean;
  badInput?: boolean;
  customError?: boolean;
}

/** What the controller collects per control: attributes plus the native validity. */
export interface ControlLike {
  name: string;
  /** `type` of the control (`text`, `number`, `email`, `tel`, `radio`, `checkbox`, `date`, `textarea`, `select-one`, …). */
  type: string;
  /** From `data-label` on the field wrapper (the visible label text). */
  label: string;
  /** From `data-unit`. */
  unit?: string | undefined;
  min?: string | number | undefined;
  max?: string | number | undefined;
  minLength?: number | undefined;
  maxLength?: number | undefined;
  autocomplete?: string | undefined;
  inputMode?: string | undefined;
  validity: ValidityLike;
  validationMessage?: string | undefined;
}

/** "12,5" → 12.5; "1 234,5" → 1234.5; anything else → NaN. */
export function parseDecimal(s: string): number {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const n = (x: string | number | undefined): number => (x === undefined || x === '' ? NaN : Number(x));
const isPlz = (c: ControlLike): boolean => c.autocomplete === 'postal-code' || c.name === 'plz';
const isDecimal = (c: ControlLike): boolean => c.inputMode === 'decimal';

/** The flags of a ValidityState are prototype getters, so they are read by name, never via Object.values(). */
const FLAGS = [
  'valueMissing',
  'typeMismatch',
  'patternMismatch',
  'tooShort',
  'tooLong',
  'rangeUnderflow',
  'rangeOverflow',
  'stepMismatch',
  'badInput',
  'customError',
] as const;

/** The German message for one control, or '' when it is valid. */
export function controlMessage(c: ControlLike): string {
  const v = c.validity;
  if (v.valid || !FLAGS.some((k) => v[k])) return '';
  const { label, type } = c;
  if (v.customError) return c.validationMessage ?? MSG.pattern;
  if (v.valueMissing) {
    if (type === 'radio' || type.startsWith('select')) return MSG.choose(label);
    if (type === 'checkbox') return MSG.confirm(label);
    return MSG.missing(label);
  }
  if (v.typeMismatch) return type === 'email' ? MSG.email : MSG.pattern;
  if (v.patternMismatch) {
    if (isPlz(c)) return MSG.plz;
    if (type === 'tel') return MSG.tel;
    if (isDecimal(c)) return MSG.decimal;
    return MSG.pattern;
  }
  if (v.badInput) return type === 'date' ? MSG.date : type === 'number' ? MSG.integer : MSG.pattern;
  if (v.rangeUnderflow) return type === 'date' ? MSG.datePast : MSG.min(label, n(c.min), c.unit);
  if (v.rangeOverflow) return MSG.max(label, n(c.max), c.unit);
  if (v.stepMismatch) return MSG.integer;
  if (v.tooShort) return MSG.tooShort(label, c.minLength ?? 0);
  if (v.tooLong) return MSG.tooLong(label, c.maxLength ?? 0);
  return MSG.pattern;
}

export interface CrossContext {
  /** ISO date `YYYY-MM-DD` of today, injected for testability. */
  today: string;
  /** Label of a field as shown in the DOM. */
  label(name: string): string;
}

const str = (x: string | string[] | undefined): string => (typeof x === 'string' ? x : '');
const list = (x: string | string[] | undefined): string[] => (Array.isArray(x) ? x : x ? [x] : []);

/**
 * Cross-field rules of one step for the active configuration: at least one checkbox in a required
 * group, Baumkante ≥ 40 mm, `termin` ≥ today, per-type dimension limits and decimal ranges.
 * Native validity (required, pattern, HTML min/max) is handled by controlMessage().
 */
export function crossErrors(values: Values, step: StepId, ctx: CrossContext): FieldError[] {
  const errors: FieldError[] = [];
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.step !== step || !visible(name, values)) continue;
    const raw = values[name];
    if (f.multi && f.required && !list(raw).length) {
      errors.push({ name, message: MSG.atLeastOne(ctx.label(name)) });
      continue;
    }
    if ((f.kind === 'int' || f.kind === 'dec') && str(raw) !== '') {
      const x = f.kind === 'int' ? Number(str(raw)) : parseDecimal(str(raw));
      const range = fieldRange(name, values);
      if (range && !Number.isNaN(x) && (x < range[0] || x > range[1]))
        errors.push({ name, message: MSG.between(ctx.label(name), range[0], range[1], f.unit) });
    }
  }
  if (step === 'details' && visible('tisch_kante', values) && str(values['tisch_kante']) === 'baumkante') {
    if (Number(str(values['tisch_platte']) || 0) < 40) errors.push({ name: 'tisch_platte', message: MSG.baumkante });
  }
  if (step === 'rahmen') {
    const t = str(values['termin']);
    if (t && t < ctx.today) errors.push({ name: 'termin', message: MSG.datePast });
  }
  return errors;
}

// ---- DOM part: a step's controls, the error summary and the inline errors ------------------------

type Control = HTMLInputElement;

/** The error summary (GOV.UK pattern): a focusable box with one link per invalid field. */
export interface ErrorUi {
  form: HTMLFormElement;
  summary: HTMLElement | null;
  list: HTMLElement | null;
}

/** The visible label of a field (`data-label`), or its name. */
export const labelOf = (form: HTMLFormElement, name: string): string => fieldEl(form, name)?.dataset['label'] ?? name;

/**
 * Errors of one step: the native validity of its enabled controls (one per name, so a radio group
 * reports once), then the cross-field rules for the fields without a native error.
 */
export function validateStep(form: HTMLFormElement, section: HTMLElement, step: StepId, values: Values): FieldError[] {
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  for (const el of section.querySelectorAll<Control>('input,select,textarea')) {
    const { name } = el;
    if (!name || !FIELDS[name] || seen.has(name) || el.matches(':disabled') || !el.willValidate) continue;
    seen.add(name);
    const field = el.closest<HTMLElement>('.field');
    const message = controlMessage({
      name,
      type: el.type,
      label: field?.dataset['label'] ?? name,
      unit: field?.dataset['unit'],
      min: el.min,
      max: el.max,
      minLength: el.minLength > 0 ? el.minLength : undefined,
      maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      autocomplete: el.autocomplete,
      inputMode: el.inputMode,
      validity: el.validity,
      validationMessage: el.validationMessage,
    });
    if (message) errors.push({ name, message });
  }
  // The Swedish locale writes the local date as YYYY-MM-DD, the format of the date input.
  const today = new Date().toLocaleDateString('sv');
  for (const e of crossErrors(values, step, { today, label: (n) => labelOf(form, n) })) {
    if (!errors.some((x) => x.name === e.name)) errors.push(e);
  }
  return errors;
}

/**
 * Shows or clears the inline error of a field and wires aria-describedby / aria-invalid. Radio and
 * checkbox groups carry the state on their fieldset (aria-invalid is not allowed on radios).
 * Returns the first control, the target of the summary link.
 */
function wire(field: HTMLElement, message: string): Control | null {
  const el = field.querySelector<Control>('input,select,textarea');
  const err = field.querySelector<HTMLElement>('.field__error');
  if (!el || !err) return null;
  const group = el.type === 'radio' || (el.type === 'checkbox' && FIELDS[el.name]?.multi);
  const target = group ? field : el;
  err.textContent = message;
  err.hidden = !message;
  field.classList.toggle('is-invalid', !!message);
  if (!group) el.ariaInvalid = message ? 'true' : null;
  const ids = [field.querySelector('.field__hint')?.id, message && err.id].filter(Boolean).join(' ');
  if (ids) target.setAttribute('aria-describedby', ids);
  else target.removeAttribute('aria-describedby');
  return el;
}

export function clearErrors(ui: ErrorUi): void {
  for (const f of ui.form.querySelectorAll<HTMLElement>('.field.is-invalid')) wire(f, '');
  if (ui.summary) ui.summary.hidden = true;
  ui.list?.replaceChildren();
}

/** Replaces the shown errors; the summary stays hidden when the list is empty. */
export function showErrors(ui: ErrorUi, errors: FieldError[]): void {
  clearErrors(ui);
  const { form, summary, list } = ui;
  if (!summary || !list) return;
  for (const { name, message } of errors) {
    const field = fieldEl(form, name);
    const el = field && wire(field, message);
    if (!el) continue;
    const a = list.appendChild(document.createElement('li')).appendChild(document.createElement('a'));
    a.href = `#${el.id}`;
    a.textContent = `${labelOf(form, name)}: ${message}`;
    a.onclick = (e) => {
      e.preventDefault();
      el.focus();
    };
  }
  summary.hidden = !errors.length;
}
