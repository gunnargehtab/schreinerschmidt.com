// Realistic configurator posts with the exact field names of fields.ts and the payload of
// src/scripts/configurator/payload.ts: one Möbel Regal, one Boden, one Sonstiges; plus a contact form.
import type { Values } from '../../src/lib/configurator/fields';
import { generate } from '../../src/lib/configurator/furniture';
import { paramsFromValues } from '../../src/scripts/configurator/preview/params';
import { shortId } from '../src/validate';
import { NEXT, SITE } from './helpers';

export const REGAL: Values = {
  typ: 'moebel',
  moebel_art: 'regal',
  moebel_breite: '120',
  moebel_hoehe: '200',
  moebel_tiefe: '35',
  moebel_staerke: '19',
  moebel_unterbau: 'sockel',
  moebel_rueckwand: 'mit',
  moebel_holz: 'eiche',
  moebel_oberflaeche: 'natur-geoelt',
  moebel_wuensche: 'Bitte mit Platz für Schallplatten.',
  zeitraum: '1-3',
  budget: '2000-5000',
  plz: '68161',
  ort: 'Mannheim',
  name: 'Erika Mustermann',
  email: 'erika@example.com',
  telefon: '0621 123456',
  kontaktweg: 'email',
  erreichbarkeit: 'Vormittags',
  nachricht: 'Bitte um Rückruf.',
};

export const BODEN: Values = {
  typ: 'boden',
  boden_leistung: 'neu',
  boden_art: 'stabparkett',
  boden_holz: 'eiche',
  boden_flaeche: '24,5',
  boden_raeume: '2',
  boden_untergrund: 'estrich',
  boden_fbh: 'nein',
  boden_sockelleisten: '1',
  zeitraum: '3-6',
  plz: '68159',
  ort: 'Mannheim',
  name: 'Max Muster',
  email: 'max@example.com',
};

export const SONSTIGES: Values = {
  typ: 'sonstiges',
  sonstiges_beschreibung: 'Eine Sitzbank für den Flur mit Stauraum darunter.',
  sonstiges_masse: 'ca. 140 × 45 cm',
  plz: '10115',
  ort: 'Berlin',
  name: 'Kim Beispiel',
  email: 'kim@example.com',
};

export const CONTACT: Record<string, string> = {
  name: 'Erika Mustermann',
  email: 'erika@example.com',
  telefon: '0621 123456',
  plz: '68161',
  ort: 'Mannheim',
  thema: 'Möbel',
  nachricht: 'Ich hätte gern einen Termin.',
  _subject: 'Kontaktanfrage über die Website',
  _next: `${SITE}/danke/`,
  _lang: 'de',
};

let n = 0;
/** A fresh UUID-shaped id per call. */
export const newId = (): string => {
  n++;
  return `3b241101-e2bb-4255-8caf-${n.toString(16).padStart(12, '0')}`;
};

/** The client's ss-anfrage@1 document (payload.ts anfrageJson()), with the real generator output for Möbel. */
export function anfrageJson(id: string, v: Values, derived?: Record<string, number>): Record<string, unknown> {
  const params = v['typ'] === 'moebel' ? paramsFromValues(v) : null;
  const build = params ? generate(params) : null;
  return {
    schema: 'ss-anfrage@1',
    id,
    kurz: shortId(id),
    createdAt: '2026-10-22T09:00:00.000Z',
    source: { mode: 'live', page: `${SITE}/konfigurator/`, configUrl: `${SITE}/konfigurator/?v=1&typ=${v['typ']}` },
    projekt: { typ: v['typ'], felder: {}, lesbar: {} },
    moebel: build
      ? {
          params: build.params,
          derived: derived ?? build.derived,
          hints: build.hints,
          stueckliste: [],
          beschreibung: 'Regal aus Eiche',
        }
      : null,
    rahmen: { plz: v['plz'], einzugsgebiet: null },
    kontakt: { name: v['name'], email: v['email'] },
    anhaenge: [],
  };
}

export interface PostOptions {
  id?: string | null;
  json?: Record<string, unknown> | null;
  subject?: string;
  extra?: Record<string, string>;
  files?: { name: string; file: File }[];
}

/** A configurator FormData as payload.ts builds it (values + meta + JSON + files). */
export function configuratorForm(v: Values, o: PostOptions = {}): FormData {
  const fd = new FormData();
  for (const [k, x] of Object.entries(v)) {
    if (Array.isArray(x)) for (const s of x) fd.append(k, s);
    else if (x !== undefined) fd.append(k, x);
  }
  fd.set('_lang', 'de');
  fd.set('_next', NEXT);
  fd.set('MAX_FILE_SIZE', String(10 * 1024 * 1024));
  const id = o.id === undefined ? newId() : o.id;
  if (id !== null) {
    fd.set('anfrage_id', id);
    const json = o.json === undefined ? anfrageJson(id, v) : o.json;
    if (json) fd.set('anfrage_json', JSON.stringify(json));
    fd.set('zusammenfassung', `Projektart: ${String(v['typ'])}\nPostleitzahl des Objekts: ${String(v['plz'])}`);
    fd.set('_subject', o.subject ?? `Anfrage ${String(v['typ'])} – ${String(v['plz'])} – #${shortId(id)}`);
    fd.set('_replyto', String(v['email'] ?? ''));
  }
  for (const [k, x] of Object.entries(o.extra ?? {})) fd.set(k, x);
  for (const f of o.files ?? []) fd.append(f.name, f.file);
  return fd;
}

export function contactForm(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [k, x] of Object.entries({ ...CONTACT, ...extra })) fd.set(k, x);
  return fd;
}

/** Minimal files with the right magic bytes. */
export const jpeg = (name = 'Küche Foto.jpg', bytes = 2048): File => {
  const b = new Uint8Array(bytes);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return new File([b], name, { type: 'image/jpeg' });
};
export const svg = (): File =>
  new File(
    ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Regal</title></svg>'],
    'zeichnung.svg',
    {
      type: 'image/svg+xml',
    },
  );
export const exe = (): File =>
  new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'virus.jpg', { type: 'image/jpeg' });
