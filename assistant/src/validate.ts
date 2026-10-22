// Server-side validation of POST /anfrage (docs/angebot.md §2 "The backend re-derives everything",
// docs/assistant.md §8). Configurator posts are checked against the field registry (fields.ts):
// only known names, enum values (fieldValues), numeric ranges (fieldRange), required fields (both
// 'html' and 'js') while visible (conditions.ts), lengths, patterns and checkbox groups. Hidden
// fields (other branches, failed conditions) are dropped, not validated: the no-JS form submits
// them and the customer cannot see or fix them. Contact and application posts have their own small
// registry and are lenient on purpose: the backend never rejects what the site's own form accepts
// (TextField.astro sets no pattern or maxlength there), so optional fields are cleaned and
// truncated, never rejected; only a missing required field and an e-mail the browser's
// `type=email` check would refuse are. Failures carry a code and, for known fields only, the
// registry name; input is never echoed. Pure.
import { visible } from '../../src/lib/configurator/conditions';
import {
  FIELDS,
  DECIMAL_PATTERN,
  effectiveValues,
  fieldRange,
  type FieldDef,
  type Values,
} from '../../src/lib/configurator/fields';
import { z } from 'zod';
import { bodyText, isEmail, lineText } from './sanitize';
import type { AnfrageJson } from './types';

export type Reason =
  | 'unknown_field'
  | 'duplicate_field'
  | 'bad_value'
  | 'out_of_range'
  | 'missing_required'
  | 'too_long'
  | 'too_short'
  | 'bad_pattern'
  | 'bad_format'
  | 'bad_id'
  | 'bad_json';

export interface Invalid {
  ok: false;
  code: Reason;
  /** A registry field name (never a client-supplied unknown name). */
  field?: string;
}
export type Checked<T> = { ok: true; value: T } | Invalid;

const invalid = (code: Reason, field?: string): Invalid =>
  field === undefined ? { ok: false, code } : { ok: false, code, field };

/** English messages for `error_msg` (form.taxi contract); the site never shows them. */
export const REASON_MSG: Readonly<Record<Reason, string>> = {
  unknown_field: 'The form contains an unknown field.',
  duplicate_field: 'A field was sent more than once.',
  bad_value: 'A field has a value that is not allowed.',
  out_of_range: 'A number is out of range.',
  missing_required: 'A required field is missing.',
  too_long: 'A field is too long.',
  too_short: 'A field is too short.',
  bad_pattern: 'A field has an invalid format.',
  bad_format: 'A field has an invalid format.',
  bad_id: 'The request id is invalid.',
  bad_json: 'The configuration data is invalid.',
};

/** Text fields of a multipart body, by name, in order (files are handled by attachments.ts). */
export type TextFields = ReadonlyMap<string, readonly string[]>;

/** The honeypot (components/forms/Honeypot.astro). */
export const HONEYPOT = 'homepage';

/** form.taxi-style meta fields every form may send, with their length caps. */
const META: Readonly<Record<string, number>> = {
  _subject: 1000,
  _replyto: 254,
  _next: 2048,
  _lang: 10,
  MAX_FILE_SIZE: 12,
  [HONEYPOT]: 1000,
};
/** Meta fields only the configurator sends (payload.ts). */
const CONFIGURATOR_META: Readonly<Record<string, number>> = {
  anfrage_id: 64,
  anfrage_json: 256 * 1024,
  zusammenfassung: 20000,
};

/** File fields per form (attachments.ts checks them). */
export const CONFIGURATOR_FILES = ['fotos[]', 'zeichnung', 'ansicht_3d'] as const;
export const CONTACT_FILES = ['lebenslauf'] as const;

/** Length cap for enum and number values (they have no maxLength); a sanity cap only. */
const ENUM_MAX = 64;

/**
 * Contact form (/kontakt/) and application (/karriere/), docs/architecture.md §8. `max` is where a
 * value is truncated (never rejected); the e-mail is the exception: an address is not truncated, so
 * one beyond `max` (no real mailbox has that) is refused.
 */
const CONTACT: Readonly<Record<string, { max: number; required?: true; multiline?: true }>> = {
  name: { max: 200, required: true },
  email: { max: 1000, required: true },
  telefon: { max: 60 },
  plz: { max: 20 },
  ort: { max: 200 },
  thema: { max: 200 },
  stelle: { max: 200 },
  nachricht: { max: 10000, multiline: true },
};
/** Raw size cap of a contact field before cleaning (a sanity bound on the multipart part). */
const CONTACT_RAW_MAX = 100_000;

const DECIMAL = new RegExp(`^(?:${DECIMAL_PATTERN})$`);
const INT = /^\d{1,9}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** `crypto.randomUUID()` or the fallback id of submit.ts (`<hex>-<hex>`). */
const ANFRAGE_ID = /^[A-Za-z0-9-]{8,64}$/;

/** True when the text field belongs to the configurator (a no-JS wizard post has `typ` but no JSON). */
export const isConfiguratorPost = (fields: TextFields): boolean => fields.has('typ') || fields.has('anfrage_json');

/** "12,5" → 12.5 (the pure parseDecimal of src/scripts/configurator/validate.ts, which imports DOM code). */
export function parseDecimal(s: string): number {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const filled = (x: Values[string]): boolean => (Array.isArray(x) ? x.length > 0 : !!x && x.trim() !== '');

/** Single-line inputs lose CR/LF (they are `<input>`s; only textareas keep line breaks). */
const singleLine = (s: string): string => s.replace(/[\r\n]+/g, ' ');

/** Unknown names, repeated single fields and meta lengths, shared by both forms. */
function checkNames(fields: TextFields, allowed: (name: string) => number | 'multi' | null): Invalid | null {
  for (const [name, list] of fields) {
    const cap = allowed(name);
    if (cap === null) return invalid('unknown_field');
    if (cap !== 'multi' && list.length > 1) return invalid('duplicate_field', name);
  }
  return null;
}

export interface ConfiguratorInput {
  values: Values;
  meta: Record<string, string>;
}

/** Splits a configurator post into registry values and meta fields, checking names and caps. */
export function validateConfigurator(fields: TextFields): Checked<ConfiguratorInput> {
  const allowedCap = (name: string): number | 'multi' | null => {
    const f = FIELDS[name];
    if (f && f.kind !== 'file') return f.multi ? 'multi' : (f.maxLength ?? ENUM_MAX);
    return META[name] ?? CONFIGURATOR_META[name] ?? null;
  };
  const bad = checkNames(fields, allowedCap);
  if (bad) return bad;

  const raw: Values = {};
  const meta: Record<string, string> = {};
  for (const [name, list] of fields) {
    const f = FIELDS[name];
    if (!f) {
      const v = list[0] ?? '';
      if (v.length > (META[name] ?? CONFIGURATOR_META[name] ?? 0)) return invalid('too_long', name);
      meta[name] = v;
      continue;
    }
    const cap = f.maxLength ?? ENUM_MAX;
    if (list.some((v) => v.length > cap)) return invalid('too_long', name);
    raw[name] = f.multi ? [...list] : (list[0] ?? '');
  }

  // Enum values outside the full list: an error while the field is visible, dropped while hidden.
  for (const [name, x] of Object.entries(raw)) {
    const f = FIELDS[name];
    if (f?.kind !== 'enum' || x === undefined) continue;
    const list = Array.isArray(x) ? x : x === '' ? [] : [x];
    const all = f.values ?? [];
    if (list.every((v) => all.includes(v))) {
      if (Array.isArray(x) && new Set(x).size !== x.length) return invalid('duplicate_field', name);
      continue;
    }
    if (visible(name, raw)) return invalid('bad_value', name);
    delete raw[name];
  }

  // Stale options of another moebel_art (hidden labels) are dropped, as on the client.
  const eff = effectiveValues(raw);
  const values: Values = {};
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.kind === 'file' || !visible(name, eff)) continue;
    const x = eff[name];
    if (!filled(x)) {
      if (f.required) return invalid('missing_required', name);
      continue;
    }
    const err = checkField(name, f, x!, eff);
    if (err) return err;
    values[name] = Array.isArray(x)
      ? x
      : name === 'email'
        ? x!.trim()
        : f.kind === 'text' && (f.maxLength ?? 0) < 500
          ? singleLine(x!)
          : x;
  }
  return { ok: true, value: { values, meta } };
}

function checkField(name: string, f: FieldDef, x: string | string[], v: Values): Invalid | null {
  if (Array.isArray(x)) return f.multi ? null : invalid('bad_value', name);
  if (f.multi) return invalid('bad_value', name);
  switch (f.kind) {
    case 'enum':
      return null; // checked above against the full list; effectiveValues() narrowed it per moebel_art
    case 'bool':
      return x === '1' ? null : invalid('bad_value', name);
    case 'int':
    case 'dec': {
      const ok = f.kind === 'int' ? INT.test(x) : DECIMAL.test(x.trim());
      if (!ok) return invalid('bad_format', name);
      const n = f.kind === 'int' ? Number(x) : parseDecimal(x);
      const r = fieldRange(name, v);
      return r && (n < r[0] || n > r[1]) ? invalid('out_of_range', name) : null;
    }
    case 'date': {
      if (!DATE.test(x)) return invalid('bad_format', name);
      const d = new Date(`${x}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x ? invalid('bad_format', name) : null;
    }
    case 'text': {
      if (f.minLength !== undefined && x.trim().length < f.minLength) return invalid('too_short', name);
      if (f.pattern && !new RegExp(`^(?:${f.pattern})$`).test(x)) return invalid('bad_pattern', name);
      if (name === 'email' && !isEmail(x.trim())) return invalid('bad_pattern', name);
      return null;
    }
    default:
      return invalid('bad_value', name);
  }
}

export interface ContactInput {
  values: Record<string, string>;
  meta: Record<string, string>;
}

/** Contact form and application: name + e-mail required, everything else optional. */
/** Cuts a cleaned value to `max` characters, marking the cut with „…“. */
const truncate = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/**
 * Contact form and application. Lenient like the browser: name + e-mail required (a whitespace-only
 * name counts as given, as for `required`), the e-mail checked like `type=email`, everything else
 * cleaned (controls removed, single-line fields joined) and truncated, never rejected.
 */
export function validateContact(fields: TextFields): Checked<ContactInput> {
  const bad = checkNames(fields, (name) => (CONTACT[name] ? CONTACT_RAW_MAX : (META[name] ?? null)));
  if (bad) return bad;
  const values: Record<string, string> = {};
  const meta: Record<string, string> = {};
  const given = new Set<string>();
  for (const [name, list] of fields) {
    const v = list[0] ?? '';
    const def = CONTACT[name];
    if (!def) {
      if (v.length > (META[name] ?? 0)) return invalid('too_long', name);
      meta[name] = v;
      continue;
    }
    if (v.length > CONTACT_RAW_MAX) return invalid('too_long', name);
    // The browser drops CR/LF from <input> values; an empty value is what `required` refuses.
    if ((def.multiline ? v : v.replace(/[\r\n]/g, '')) !== '') given.add(name);
    if (name === 'email') {
      const e = v.trim();
      if (e === '') continue;
      if (!isEmail(e, def.max)) return invalid('bad_pattern', name);
      values[name] = e;
      continue;
    }
    const clean = def.multiline ? bodyText(v, Infinity).trim() : lineText(v);
    if (clean !== '') values[name] = truncate(clean, def.max);
  }
  for (const [name, def] of Object.entries(CONTACT))
    if (def.required && !given.has(name)) return invalid('missing_required', name);
  return { ok: true, value: { values, meta } };
}

/** The kept part of `anfrage_json` (ss-anfrage@1); felder/kontakt/rahmen/lesbar/stueckliste are re-derived. */
const count = z.number().int().min(0).max(100000).optional();
const AnfrageSchema = z.object({
  schema: z.literal('ss-anfrage@1'),
  id: z.string().regex(ANFRAGE_ID),
  kurz: z.string().max(8).optional(),
  createdAt: z.string().max(40).optional(),
  source: z
    .object({
      mode: z.enum(['demo', 'live']).optional(),
      page: z.string().max(2048).optional(),
      configUrl: z.string().max(2048).optional(),
    })
    .optional(),
  moebel: z
    .object({
      derived: z.object({ doors: count, drawers: count, hinges: count }).optional(),
      beschreibung: z.string().max(2000).optional(),
    })
    .nullable()
    .optional(),
});

/** Validates `anfrage_id` and parses `anfrage_json` (when present); the ids must agree. */
export function parseAnfrage(meta: Record<string, string>): Checked<{ id: string | null; json: AnfrageJson | null }> {
  const id = meta['anfrage_id'] ?? '';
  const text = meta['anfrage_json'] ?? '';
  if (id !== '' && !ANFRAGE_ID.test(id)) return invalid('bad_id');
  if (text === '') return { ok: true, value: { id: id || null, json: null } };
  if (id === '') return invalid('bad_id');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return invalid('bad_json');
  }
  const r = AnfrageSchema.safeParse(data);
  if (!r.success || r.data.id !== id) return invalid('bad_json');
  return { ok: true, value: { id, json: r.data as AnfrageJson } };
}

/**
 * Four characters, A–Z/0–9, from a UUID („7F3K“): the same algorithm as shortId() in
 * src/scripts/configurator/submit.ts (which imports DOM code), so the Vorgangsnummer the customer
 * saw matches the mail.
 */
export function shortId(uuid: string): string {
  const n = Number.parseInt(uuid.replace(/-/g, '').slice(0, 10), 16);
  return Number.isFinite(n) ? n.toString(36).toUpperCase().slice(-4).padStart(4, '0') : '';
}
