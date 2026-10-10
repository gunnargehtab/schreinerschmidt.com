// Serialisation of the wizard values (docs/configurator.md §3 "Serialisation and history"):
// shareable URL query, sessionStorage snapshot and the opt-in localStorage draft. Pure: no window,
// no storage; the controller passes plain objects and URLSearchParams in and out.
import {
  FIELDS,
  STEPS,
  fieldDefault,
  fieldRange,
  fieldValues,
  type StepId,
  type Values,
} from '../../lib/configurator/fields';
import { visible } from '../../lib/configurator/conditions';

export const URL_VERSION = '1';
export const SESSION_KEY = 'ss-konfigurator-v1';
export const DRAFT_KEY = 'ss-konfigurator-entwurf-v1';
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const isStep = (s: unknown): s is StepId => typeof s === 'string' && (STEPS as readonly string[]).includes(s);
const clamp = (x: number, [lo, hi]: [number, number]): number => Math.min(hi, Math.max(lo, x));

/** Parses one raw value for a field; '' when it is invalid. Numbers are clamped per moebel_art. */
function normalise(name: string, raw: string | string[] | undefined, v: Values): string | string[] {
  const f = FIELDS[name];
  if (!f) return '';
  const s = Array.isArray(raw) ? raw.join(',') : (raw ?? '');
  switch (f.kind) {
    case 'enum': {
      const allowed = fieldValues(name, v);
      if (f.multi) return s.split(',').filter((x, i, a) => allowed.includes(x) && a.indexOf(x) === i);
      return allowed.includes(s) ? s : '';
    }
    case 'int':
    case 'dec': {
      const x = f.kind === 'int' ? Number(s) : Number(s.replace(',', '.'));
      if (s === '' || !Number.isFinite(x) || (f.kind === 'int' && !Number.isInteger(x))) return '';
      const range = fieldRange(name, v);
      const y = range ? clamp(x, range) : x;
      return f.kind === 'dec' ? String(y).replace('.', ',') : String(y);
    }
    case 'bool':
      return s === '1' || s === 'on' || s === 'true' ? '1' : '';
    default:
      return s;
  }
}

/**
 * The shareable query (without `?`): `v=1`, `schritt`, then every visible `share && !pii` field of
 * the active branch whose value differs from its default. '' when no project type is chosen.
 */
export function toQuery(values: Values, step?: StepId | null): string {
  const typ = values['typ'];
  if (typeof typ !== 'string' || !FIELDS['typ']?.values?.includes(typ)) return '';
  const q = new URLSearchParams({ v: URL_VERSION });
  if (step && isStep(step)) q.set('schritt', step);
  const v: Values = { typ };
  for (const [name, f] of Object.entries(FIELDS)) {
    if (!f.share || f.pii || !visible(name, { ...values, ...v })) continue;
    const x = normalise(name, values[name], v);
    const s = Array.isArray(x) ? x.join(',') : x;
    if (s === '' || s === fieldDefault(name, v)) continue;
    v[name] = x;
    // Decimals travel with a point, so the URL stays readable without %2C.
    q.set(name, f.kind === 'dec' ? s.replace(',', '.') : s);
  }
  return q.toString();
}

/**
 * Parses a query: unknown keys are dropped, enums validated, numbers clamped, hidden fields of the
 * chosen branch ignored. Values come back in DOM form (checkbox groups as arrays, booleans as '1').
 */
export function fromQuery(input: URLSearchParams | string): { values: Values; step: StepId | null } {
  const q = typeof input === 'string' ? new URLSearchParams(input) : input;
  const step = q.get('schritt');
  const values: Values = {};
  for (const [name, f] of Object.entries(FIELDS)) {
    if (!f.share || f.pii || !q.has(name)) continue;
    const x = normalise(name, q.get(name) ?? '', values);
    if (x === '' || (Array.isArray(x) && !x.length)) continue;
    values[name] = x;
  }
  for (const name of Object.keys(values)) if (!visible(name, values)) delete values[name];
  return { values, step: isStep(step) ? step : null };
}

/** sessionStorage shape: all values except files and the honeypot, plus the step and furthest. */
export interface Snapshot {
  v: 1;
  step: StepId;
  furthest: number;
  values: Values;
}

/** localStorage draft shape: a snapshot with its save time (ISO). */
export interface Draft extends Snapshot {
  savedAt: string;
}

/** Keeps the known, non-file fields with string or string-list values; everything else is dropped. */
function cleanValues(raw: unknown): Values {
  const out: Values = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, x] of Object.entries(raw as Record<string, unknown>)) {
    const f = FIELDS[name];
    if (!f || f.kind === 'file') continue;
    if (typeof x === 'string') out[name] = x;
    else if (Array.isArray(x) && x.every((s) => typeof s === 'string')) out[name] = x as string[];
  }
  return out;
}

export const toSnapshot = (values: Values, step: StepId, furthest: number): Snapshot => ({
  v: 1,
  step,
  furthest: clamp(Math.trunc(furthest) || 0, [0, STEPS.length - 1]),
  values: cleanValues(values),
});

/** Validates a parsed JSON value; null when it is not a snapshot. */
export function fromSnapshot(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object' || (raw as Snapshot).v !== 1) return null;
  const { step, furthest, values } = raw as Snapshot;
  return toSnapshot(values, isStep(step) ? step : 'projekt', typeof furthest === 'number' ? furthest : 0);
}

export const toDraft = (snap: Snapshot, now: number): Draft => ({ ...snap, savedAt: new Date(now).toISOString() });

/** Validates a parsed JSON value; null when it is not a draft or is older than 30 days. */
export function fromDraft(raw: unknown, now: number): Draft | null {
  const snap = fromSnapshot(raw);
  const savedAt = (raw as Draft | null)?.savedAt;
  if (!snap || typeof savedAt !== 'string') return null;
  const t = Date.parse(savedAt);
  if (Number.isNaN(t) || now - t > DRAFT_MAX_AGE_MS || t > now) return null;
  return { ...snap, savedAt };
}
