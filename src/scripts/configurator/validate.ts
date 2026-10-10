// Pure validation of the wizard (docs/configurator.md §3 "Validation"). The controller reads each
// control's ValidityState and data attributes from the DOM and passes them in; this module only
// chooses the German message and checks the cross-field rules.
import { FIELDS, fieldRange, type StepId, type Values } from '../../lib/configurator/fields';
import { visible } from '../../lib/configurator/conditions';
import { MSG } from './messages.de';
import type { FieldError } from './state';

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

/** The German message for one control, or '' when it is valid. */
export function controlMessage(c: ControlLike): string {
  const v = c.validity;
  if (v.valid || !Object.values(v).some(Boolean)) return '';
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
