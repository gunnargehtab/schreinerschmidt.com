// Live payload (docs/configurator.md §5 "Payload"): the pure parts of payload.ts. Node has FormData
// and Blob, so appendPayload() is tested for real; moebelInfo()/buildPayload() import the preview
// chunk and are exercised through anfrageJson() with a hand-made MoebelInfo.
import { describe, expect, it } from 'vitest';
import { FIELDS, type Values } from '../../../src/lib/configurator/fields';
import { generate, type CarcassParams } from '../../../src/lib/configurator/furniture';
import { cutList } from '../../../src/lib/configurator/furniture/cutlist';
import { describe as describeBuild } from '../../../src/lib/configurator/furniture/describe';
import {
  HONEYPOT,
  SCHEMA,
  anfrageJson,
  appendPayload,
  type MoebelInfo,
  type PayloadInput,
} from '../../../src/scripts/configurator/payload';
import type { Item } from '../../../src/scripts/configurator/summary';

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const values: Values = {
  typ: 'moebel',
  moebel_art: 'regal',
  moebel_breite: '120',
  moebel_hoehe: '200',
  moebel_tiefe: '35',
  moebel_staerke: '19',
  moebel_holz: 'eiche',
  // Stale values of other branches and hidden conditions never travel.
  boden_flaeche: '42',
  tisch_laenge: '200',
  zeitraum: 'asap',
  plz: '68161',
  ort: 'Mannheim',
  name: 'Erika Mustermann',
  email: 'erika@example.com',
  telefon: '',
  nachricht: 'Bitte um Rückruf.',
};
const items: Item[] = [
  { name: 'typ', label: 'Projektart', value: 'Möbel nach Maß', step: 'projekt' },
  { name: 'moebel_art', label: 'Welches Möbel', value: 'Regal', step: 'details' },
  { name: 'plz', label: 'Postleitzahl des Objekts', value: '68161', step: 'rahmen' },
];
const input: PayloadInput = {
  id: '3b241101-e2bb-4255-8caf-4136c566a962',
  short: '7F3K',
  mode: 'live',
  page: 'https://example.org/konfigurator/?typ=moebel',
  configUrl: 'https://example.org/konfigurator/?v=1&typ=moebel&moebel_art=regal',
  values,
  items,
  text: 'Projekt\nProjektart: Möbel nach Maß',
  subject: 'Anfrage Möbel nach Maß: Regal 120×200×35 – 68161 Mannheim – #7F3K',
  svg: '<svg role="img"></svg>',
  now: NOW,
};

const params: CarcassParams = {
  kind: 'regal',
  width: 1200,
  height: 2000,
  depth: 350,
  board: 19,
  front: 'offen',
  base: { type: 'sockel', height: 80 },
  back: 'eingenutet',
  shelvesPerBay: 'auto',
  handle: 'grifflos',
  species: 'eiche',
  finish: 'natur-geoelt',
};
const build = generate(params);
const moebel: MoebelInfo = {
  params,
  derived: build.derived,
  hints: build.hints,
  stueckliste: cutList(build),
  beschreibung: describeBuild(build),
};

describe('anfrageJson', () => {
  const json = anfrageJson(input, moebel);

  it('carries the schema, ids, time and source', () => {
    expect(json).toMatchObject({
      schema: SCHEMA,
      id: input.id,
      kurz: '7F3K',
      createdAt: '2026-10-10T12:00:00.000Z',
      source: { mode: 'live', page: input.page, configUrl: input.configUrl },
    });
    expect(SCHEMA).toBe('ss-anfrage@1');
  });

  it('splits the values by step and keeps only the visible, filled ones', () => {
    const projekt = json['projekt'] as { typ: string; felder: Values; lesbar: Record<string, string> };
    expect(projekt.typ).toBe('moebel');
    expect(projekt.felder).toEqual({
      moebel_art: 'regal',
      moebel_breite: '120',
      moebel_hoehe: '200',
      moebel_tiefe: '35',
      moebel_staerke: '19',
      moebel_holz: 'eiche',
    });
    expect(projekt.lesbar['moebel_art']).toBe('Welches Möbel: Regal');
    expect(json['rahmen']).toEqual({ zeitraum: 'asap', plz: '68161', ort: 'Mannheim', einzugsgebiet: 'kern' });
    expect(json['kontakt']).toEqual({
      name: 'Erika Mustermann',
      email: 'erika@example.com',
      nachricht: 'Bitte um Rückruf.',
    });
    // No step mixes into another and nothing unknown slips in.
    for (const [part, steps] of [
      ['rahmen', ['rahmen']],
      ['kontakt', ['kontakt']],
    ] as const) {
      for (const key of Object.keys(json[part] as object)) {
        if (key === 'einzugsgebiet') continue;
        expect(steps, `${part}.${key}`).toContain(FIELDS[key]?.step);
      }
    }
  });

  it('includes the Möbel generator output and the attachments', () => {
    expect(json['moebel']).toBe(moebel);
    expect((json['moebel'] as MoebelInfo).stueckliste.length).toBeGreaterThan(0);
    expect((json['moebel'] as MoebelInfo).beschreibung).toMatch(/^Regal aus Eiche/);
    expect(json['anhaenge']).toEqual(['zeichnung.svg']);
    expect(anfrageJson({ ...input, svg: undefined }, null)).toMatchObject({ moebel: null, anhaenge: [] });
  });

  it('classifies the service area, and null for an unknown PLZ', () => {
    const outside = anfrageJson({ ...input, values: { ...values, plz: '10115' } });
    expect((outside['rahmen'] as { einzugsgebiet: string }).einzugsgebiet).toBe('aussen');
    const none = anfrageJson({ ...input, values: { ...values, plz: '' } });
    expect((none['rahmen'] as { einzugsgebiet: null }).einzugsgebiet).toBeNull();
  });

  it('round-trips through JSON (no cycles, no undefined-only parts)', () => {
    expect(JSON.parse(JSON.stringify(json))).toEqual(JSON.parse(JSON.stringify(json)));
    expect(JSON.stringify(json)).not.toContain('boden_flaeche');
    expect(JSON.stringify(json)).not.toContain('tisch_laenge');
  });
});

describe('appendPayload', () => {
  it('adds the JS-only fields, drops the honeypot and attaches the drawing', async () => {
    const fd = new FormData();
    fd.set('typ', 'moebel');
    fd.set(HONEYPOT, 'spam');
    const json = anfrageJson(input, moebel);
    appendPayload(fd, input, json);
    expect(fd.get(HONEYPOT)).toBeNull();
    expect(fd.get('typ')).toBe('moebel');
    expect(fd.get('anfrage_id')).toBe(input.id);
    expect(fd.get('_subject')).toBe(input.subject);
    expect(fd.get('_replyto')).toBe('erika@example.com');
    expect(fd.get('zusammenfassung')).toBe(input.text);
    expect(JSON.parse(fd.get('anfrage_json') as string)).toEqual(JSON.parse(JSON.stringify(json)));
    const drawing = fd.get('zeichnung');
    expect(drawing).toBeInstanceOf(Blob);
    expect((drawing as Blob).type).toBe('image/svg+xml');
    expect(await (drawing as Blob).text()).toBe(input.svg);
  });

  it('attaches nothing without a drawing and keeps _replyto empty without an e-mail', () => {
    const fd = appendPayload(new FormData(), { ...input, svg: undefined, values: { typ: 'boden' } }, {});
    expect(fd.get('zeichnung')).toBeNull();
    expect(fd.get('_replyto')).toBe('');
    expect(fd.get('anfrage_json')).toBe('{}');
  });
});
