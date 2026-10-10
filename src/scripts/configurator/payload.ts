// Live payload (docs/configurator.md §5 "Payload"): the plain field names of the no-JS form plus
// `anfrage_json` (schema ss-anfrage@1), `zusammenfassung` (the same text as on screen, from
// summary.ts), `_subject`, `_replyto`, `anfrage_id` and the SVG drawing as `zeichnung`. Loaded on
// request by submit.ts, so the generators it needs stay out of the core. The pure parts
// (anfrageJson, appendPayload) are covered by tests/unit/configurator/payload.test.ts.
import { visible } from '../../lib/configurator/conditions';
import { FIELDS, type StepId, type Values } from '../../lib/configurator/fields';
import { cutList } from '../../lib/configurator/furniture/cutlist';
import { describe } from '../../lib/configurator/furniture/describe';
import type { Build, CutItem, FurnitureParams } from '../../lib/configurator/furniture/types';
import { serviceArea } from '../../lib/configurator/service-area';
import type { Item } from './summary';

export const SCHEMA = 'ss-anfrage@1';
/** The honeypot (components/forms/Honeypot.astro) never travels. */
export const HONEYPOT = 'homepage';

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
  /** Clock, for deterministic tests. */
  now?: number | undefined;
}

export interface MoebelInfo {
  params: FurnitureParams;
  derived: Build['derived'];
  hints: Build['hints'];
  stueckliste: CutItem[];
  beschreibung: string;
}

/**
 * Generator output for the Möbel branch, or null when there is nothing to generate (Bett, andere).
 * The Build comes from the preview chunk (already loaded while typ = moebel), so no generator is
 * bundled twice.
 */
export async function moebelInfo(values: Values): Promise<MoebelInfo | null> {
  const b = await (await import('./preview/index')).buildFor(values);
  return (
    b && { params: b.params, derived: b.derived, hints: b.hints, stueckliste: cutList(b), beschreibung: describe(b) }
  );
}

/** The visible values of the given steps. */
const of = (values: Values, steps: StepId[]): Values =>
  Object.fromEntries(
    Object.entries(FIELDS)
      .filter(([n, f]) => steps.includes(f.step) && f.kind !== 'file' && visible(n, values) && values[n])
      .map(([n]) => [n, values[n]]),
  );

export function anfrageJson(i: PayloadInput, moebel: MoebelInfo | null = null): Record<string, unknown> {
  const plz = String(i.values['plz'] ?? '');
  return {
    schema: SCHEMA,
    id: i.id,
    kurz: i.short,
    createdAt: new Date(i.now ?? Date.now()).toISOString(),
    source: { mode: i.mode, page: i.page, configUrl: i.configUrl },
    projekt: {
      typ: i.values['typ'] ?? null,
      felder: of(i.values, ['details', 'ausfuehrung']),
      lesbar: Object.fromEntries(i.items.map((x) => [x.name, `${x.label}: ${x.value}`])),
    },
    moebel,
    rahmen: { ...of(i.values, ['rahmen']), einzugsgebiet: serviceArea(plz)?.tier ?? null },
    kontakt: of(i.values, ['kontakt']),
    anhaenge: i.svg ? ['zeichnung.svg'] : [],
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
  if (i.svg) fd.set('zeichnung', new Blob([i.svg], { type: 'image/svg+xml' }), 'zeichnung.svg');
  return fd;
}

export async function buildPayload(form: HTMLFormElement, i: PayloadInput): Promise<FormData> {
  const moebel = i.values['typ'] === 'moebel' ? await moebelInfo(i.values) : null;
  return appendPayload(new FormData(form), i, anfrageJson(i, moebel));
}
