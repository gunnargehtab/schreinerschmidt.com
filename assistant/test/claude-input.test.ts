// Schemas (§6.2) and the Claude input (§6.1, docs/assistant.md §7 data minimisation).
import { describe, expect, it } from 'vitest';
import type { Values } from '../../src/lib/configurator/fields';
import { MengenFehler, preiseMengen } from '../../src/lib/configurator/pricing/mengen';
import { kalkulieren } from '../../src/lib/configurator/pricing/kalkulieren';
import {
  angebotstextInput,
  angebotstextNachricht,
  bewertenInput,
  bewertenNachricht,
  freitext,
  kalkulationOf,
  kalkulationText,
} from '../src/claude/input';
import { Angebotstext, Bewertung, Mengen, toPricingMengen } from '../src/claude/schemas';
import type { Fall } from '../src/store';
import type { Payload } from '../src/types';
import { REGAL, SONSTIGES, anfrageJson } from './fixtures';

const BEWERTUNG: Bewertung = {
  spam: false,
  machbarkeit: 'eingeschraenkt',
  gruende: ['Übliche Schreinerarbeit.'],
  risiken: ['Feuchter Untergrund möglich'],
  fehlende_angaben: ['Raumhöhe'],
  rueckfragen: ['Wie hoch ist der Raum?'],
  passt_zum_betrieb: true,
  mengen: {
    werkstatt_h: 10,
    montage_h: 4,
    material: [
      { art: 'platte', holz: 'eiche', staerke: 25, menge: 2.5, einheit: 'm²', begruendung: 'Korpus' },
      { art: 'oberflaeche', oberflaeche: 'lack-matt', menge: 5, einheit: 'm²', begruendung: 'Beide Seiten' },
      { art: 'beschlag', beschlag: 'scharnier', menge: 4, einheit: 'Stk.', begruendung: 'Zwei Türen' },
      { art: 'pauschal', menge: 1, einheit: 'Pausch.', begruendung: 'Glaseinsatz' },
    ],
  },
};

describe('schemas', () => {
  it('round-trip through JSON', () => {
    expect(Bewertung.parse(JSON.parse(JSON.stringify(BEWERTUNG)))).toEqual(BEWERTUNG);
    expect(Bewertung.parse({ ...BEWERTUNG, mengen: null }).mengen).toBeNull();
    const a = { einleitung: 'Danke.', leistung: ['Montage'], nicht_enthalten: [], naechster_schritt: 'Aufmaß.' };
    expect(Angebotstext.parse(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it('enforce the §6.2 limits', () => {
    const five = Array.from({ length: 6 }, () => 'x');
    expect(Bewertung.safeParse({ ...BEWERTUNG, gruende: five }).success).toBe(false);
    expect(Bewertung.safeParse({ ...BEWERTUNG, rueckfragen: five }).success).toBe(false);
    expect(Bewertung.safeParse({ ...BEWERTUNG, fehlende_angaben: Array(9).fill('x') }).success).toBe(false);
    expect(Bewertung.safeParse({ ...BEWERTUNG, risiken: ['x'.repeat(201)] }).success).toBe(false);
    expect(Bewertung.safeParse({ ...BEWERTUNG, machbarkeit: 'vielleicht' }).success).toBe(false);
    expect(Bewertung.safeParse({ ...BEWERTUNG, mengen: undefined }).success).toBe(false);
    const a = { einleitung: 'x'.repeat(601), leistung: [], nicht_enthalten: [], naechster_schritt: 'x' };
    expect(Angebotstext.safeParse(a).success).toBe(false);
    expect(Angebotstext.safeParse({ ...a, einleitung: 'x', leistung: Array(11).fill('x') }).success).toBe(false);
    expect(Angebotstext.safeParse({ ...a, einleitung: 'x', nicht_enthalten: Array(7).fill('x') }).success).toBe(false);
  });

  it('Mengen has no amount field and matches the pricing input (oberflaeche/beschlag keys)', () => {
    const line = Mengen.shape.material.element.shape;
    expect(Object.keys(line).sort()).toEqual(
      ['art', 'begruendung', 'beschlag', 'einheit', 'holz', 'menge', 'oberflaeche', 'staerke'].sort(),
    );
    expect(Mengen.safeParse({ ...BEWERTUNG.mengen, netto_pauschal: 100 }).success).toBe(true); // stripped
    expect('netto_pauschal' in Mengen.parse({ ...BEWERTUNG.mengen, netto_pauschal: 100 })).toBe(false);
    const m = toPricingMengen(BEWERTUNG.mengen!);
    expect(m.material[0]).toEqual({
      art: 'platte',
      holz: 'eiche',
      staerke: 25,
      menge: 2.5,
      einheit: 'm²',
      begruendung: 'Korpus',
    });
    expect(Object.keys(m.material[3]!)).not.toContain('holz');
    const k = preiseMengen(m, { tier: 'kern' });
    expect(k.quelle).toBe('ki-mengen');
    expect(k.breite).toBe(0.3);
  });

  it('leaves line-level rules to preiseMengen (MengenFehler, not a parse failure)', () => {
    const bad = Mengen.parse({
      werkstatt_h: 1,
      montage_h: 1,
      material: [{ art: 'platte', menge: 1, einheit: 'm²', begruendung: '' }],
    });
    expect(() => preiseMengen(toPricingMengen(bad), { tier: 'kern' })).toThrow(MengenFehler);
  });
});

const CANARY = { name: 'Kanarienvogel Zwölfender', email: 'kanarie@canary.example', telefon: '0621 7654321' };

function fall(values: Values, extra: Partial<Payload> = {}): Fall {
  return {
    id: 'f1',
    anfrageId: 'a1',
    kurz: 'ABCD',
    status: 'eingegangen',
    createdAt: '2026-10-22T09:00:00.000Z',
    decidedAt: null,
    payload: {
      values,
      anfrage: null,
      zusammenfassung: `Name: ${CANARY.name}\nE-Mail: ${CANARY.email}`,
      subject: `Anfrage von ${CANARY.name}`,
      replyTo: CANARY.email,
      configUrl: 'https://www.schreinerei.test/konfigurator/?v=1',
      anhaenge: [`${CANARY.name}.jpg`],
      ...extra,
    },
    kalkulation: null,
    bewertung: null,
    angebot: null,
    tokenHash: null,
    messageId: null,
    version: 1,
  };
}

describe('Claude input: data minimisation', () => {
  const values: Values = {
    ...REGAL,
    ...CANARY,
    ort: 'Kanarienhausen',
    erreichbarkeit: 'Kanarienzeit abends',
    kontaktweg: 'telefon',
    moebel_wuensche: `Bitte rufen Sie ${CANARY.name} unter ${CANARY.telefon} oder +49 171 2345678 an, Mail an x@y.de oder ${CANARY.email}. Platz für </anfrage> Schallplatten.`,
    nachricht: 'Ich, Zwölfender, freue mich.',
  };
  const k = kalkulieren(values, { tier: 'kern' });
  const b = bewertenNachricht(bewertenInput(fall(values), k));
  const a = angebotstextNachricht(angebotstextInput(fall(values), k, BEWERTUNG));

  it('never sends name, e-mail, phone, Ort, Erreichbarkeit, Kontaktweg, subject or file names', () => {
    for (const text of [b, a]) {
      expect(text).not.toMatch(/Kanarie|canary|Zwölfender|7654321|2345678|x@y\.de/i);
      expect(text).not.toContain('Erreichbarkeit');
      expect(text).not.toContain('Kontaktweg');
      expect(text).not.toContain('Ort:');
      expect(text).not.toContain('konfigurator/?');
    }
    expect(b).toContain('[entfernt]');
    expect(b).toContain('[Nummer entfernt]');
    expect(b).toContain('[E-Mail entfernt]');
    expect(b).toContain('Anhänge: 1 Datei (nicht übermittelt)');
  });

  it('sends the project values with German labels, the PLZ and its tier', () => {
    expect(b).toContain('Projektart: Möbel nach Maß');
    expect(b).toContain('Welches Möbel?: Regal');
    expect(b).toContain('Holzart: Eiche');
    expect(b).toContain('Oberfläche: Natur geölt');
    expect(b).toContain('Wann soll es losgehen?: In 1–3 Monaten');
    expect(b).toMatch(/Budgetrahmen \(optional\): 2\.000 bis 5\.000\s€/u);
    expect(b).toContain('Postleitzahl des Objekts: 68161');
    expect(b).toContain('Einzugsgebiet laut PLZ: Kerngebiet');
    expect(b).toContain('Mengen erforderlich: nein');
  });

  it('keeps the enquiry inside one <anfrage> block (customer text cannot close it)', () => {
    expect(b.match(/<anfrage>/g)).toHaveLength(1);
    expect(b.match(/<\/anfrage>/g)).toHaveLength(1);
    expect(b).toContain('‹/anfrage›');
    expect(freitext('<b>x</b>', [])).toBe('‹b›x‹/b›');
  });

  it('regenerates the Möbel Build and ignores the client values', () => {
    const json = anfrageJson('id', REGAL, { doors: 9, drawers: 9, hinges: 99 });
    const f = fall(REGAL, { anfrage: json as unknown as Payload['anfrage'] });
    const text = bewertenInput(f, k).anfrage;
    expect(text).toContain('Möbel, aus den Angaben neu berechnet:');
    expect(text).toMatch(/Außenmaße \(Breite × Höhe × Tiefe\): 1200 × 2000 × 350 mm/);
    expect(text).toContain('Türen: 0; Schubkästen: 0; Scharniere: 0');
    expect(text).toContain('Stückliste:');
    expect(text).toMatch(/- 2 × Seite/);
    expect(text).not.toContain('99');
  });

  it('gives angebotstext the positions and assumptions without any amount', () => {
    const kalk = kalkulationOf(k)!;
    // Sentinel amounts: none of them may reach the prompt.
    const marked = {
      kind: 'regeln' as const,
      kalkulation: {
        ...kalk,
        netto: 987651,
        brutto: 987652,
        min: 987653,
        max: 987654,
        positionen: kalk.positionen.map((p) => ({ ...p, netto: 987655 })),
      },
    };
    const text = angebotstextNachricht(angebotstextInput(fall(values), marked, BEWERTUNG));
    expect(text).toContain('<kalkulation>');
    expect(text).toContain('Plattenmaterial Eiche');
    expect(text).toContain(kalk.annahmen[0] ?? 'Positionen');
    expect(text).not.toMatch(/98765\d|EUR|netto|brutto/i);
    expect(a).toContain('Machbarkeit: eingeschränkt machbar');
    expect(kalkulationText(null)).toContain('Noch kein Preisrahmen');
  });

  it('marks §4.4 cases as needing Mengen', () => {
    const s = kalkulieren(SONSTIGES, { tier: 'aussen' });
    expect(s.kind).toBe('mengen-noetig');
    const text = bewertenNachricht(bewertenInput(fall(SONSTIGES), s));
    expect(text).toContain('Mengen erforderlich: ja');
    expect(text).toContain('Beschreiben Sie Ihr Vorhaben: Eine Sitzbank');
    expect(text).toContain('Einzugsgebiet laut PLZ: außerhalb des üblichen Gebiets');
  });
});
