// Live payload (docs/configurator.md §5 "Payload"): the plain field names of the no-JS form plus
// `anfrage_json` (schema ss-anfrage@1), `zusammenfassung` (the same text as on screen, from
// summary.ts), `_subject`, `_replyto`, `anfrage_id` and the SVG drawing as `zeichnung`. Loaded on
// request by submit.ts; the Möbel generator output comes from preview/info.ts (on request, with the
// preview chunk), so no generator code sits in the flow budget. The pure parts (anfrageJson,
// appendPayload) are covered by tests/unit/configurator/payload.test.ts.
import { visible } from '../../lib/configurator/conditions';
import { FIELDS, effectiveValues, type StepId, type Values } from '../../lib/configurator/fields';
// From the validation chunk (loaded long before a submit), so the service area is bundled once.
import { serviceArea } from './validate';
import type { MoebelInfo } from './preview/info';
import type { Item } from './summary';

export type { MoebelInfo };

export const SCHEMA = 'ss-anfrage@1';
/** The honeypot (components/forms/Honeypot.astro) never travels. */
export const HONEYPOT = 'homepage';
const PHOTOS = 'fotos[]';
const DRAWING = 'zeichnung.svg';

export interface PayloadInput {
  id: string;
  short: string;
  mode: 'demo' | 'live';
  page: string;
  configUrl: string;
  values: Values;
  items: Item[];
  text: string;
  subject: string;
  /** Markup of the drawing, attached as zeichnung.svg when present. */
  svg?: string | undefined;
  /** File names of the attached photos (`fotos[]`), listed in `anhaenge`. */
  fotos?: readonly string[] | undefined;
  /** Clock, for deterministic tests. */
  now?: number | undefined;
}

/** A value the user actually gave: no empty strings, no empty checkbox groups. */
const filled = (x: Values[string]): boolean => (Array.isArray(x) ? x.length > 0 : !!x);

/** The visible, filled values of the given steps. */
const of = (values: Values, steps: StepId[]): Values =>
  Object.fromEntries(
    Object.entries(FIELDS)
      .filter(([n, f]) => steps.includes(f.step) && f.kind !== 'file' && visible(n, values) && filled(values[n]))
      .map(([n]) => [n, values[n]]),
  );

export function anfrageJson(i: PayloadInput, moebel: MoebelInfo | null = null): Record<string, unknown> {
  // Stale options of another moebel_art never travel (the summary and the generator ignore them too).
  const values = effectiveValues(i.values);
  const plz = String(values['plz'] ?? '');
  return {
    schema: SCHEMA,
    id: i.id,
    kurz: i.short,
    createdAt: new Date(i.now ?? Date.now()).toISOString(),
    source: { mode: i.mode, page: i.page, configUrl: i.configUrl },
    projekt: {
      typ: values['typ'] ?? null,
      felder: of(values, ['details', 'ausfuehrung']),
      lesbar: Object.fromEntries(i.items.map((x) => [x.name, `${x.label}: ${x.value}`])),
    },
    moebel,
    rahmen: { ...of(values, ['rahmen']), einzugsgebiet: serviceArea(plz)?.tier ?? null },
    kontakt: of(values, ['kontakt']),
    anhaenge: [...(i.svg ? [DRAWING] : []), ...(i.fotos ?? [])],
  };
}

/** Adds the JS-only fields to a FormData of the form (the honeypot is removed). */
export function appendPayload(fd: FormData, i: PayloadInput, json: Record<string, unknown>): FormData {
  fd.delete(HONEYPOT);
  fd.set('anfrage_id', i.id);
  fd.set('anfrage_json', JSON.stringify(json));
  fd.set('zusammenfassung', i.text);
  fd.set('_subject', i.subject);
  fd.set('_replyto', String(i.values['email'] ?? ''));
  if (i.svg) fd.set('zeichnung', new Blob([i.svg], { type: 'image/svg+xml' }), DRAWING);
  return fd;
}

/** Names of the photos in a FormData (the empty file of an untouched input does not count). */
export const photoNames = (fd: FormData): string[] =>
  fd.getAll(PHOTOS).flatMap((f) => (f instanceof File && f.size > 0 ? [f.name] : []));

export async function buildPayload(form: HTMLFormElement, i: PayloadInput): Promise<FormData> {
  const fd = new FormData(form);
  const input = { ...i, fotos: photoNames(fd) };
  const moebel = i.values['typ'] === 'moebel' ? await (await import('./preview/info')).moebelInfo(i.values) : null;
  return appendPayload(fd, input, anfrageJson(input, moebel));
}
