// An in-process ClaudeClient for tests and `npm run eval -- --dry`: no network, no key. Answers
// come from queues (a value, a thrown error, or a function of the input), else from defaults that
// pass the guards. Every call is recorded with its input and corrective codes.
//
// AufnahmeClaude (7f) serves recorded answers per case for `npm run demo` and the recorded eval:
// a lookup maps the case id to its recording, the n-th call of a kind gets the n-th recorded
// answer (the first answer, then the corrective retry), and the last one repeats. Recorded answers
// cost nothing, so their usage is zero.
import type { AngebotstextInput, BewertenInput } from './input';
import { KiFehler, type ClaudeClient, type KiErgebnis, type KiNutzung, type KiOptionen } from './client';
import type { Verstoss } from './guards';
import type { Angebotstext, Bewertung } from './schemas';

export const FAKE_MODEL = 'fake-claude';
export const FAKE_USAGE: KiNutzung = { input: 3000, output: 800, cacheRead: 0, cacheWrite: 0 };

export type FakeAntwort<I, T> = T | Error | ((input: I, o: KiOptionen) => T | Error);

export interface FakeCall {
  aufruf: 'bewerten' | 'angebotstext';
  input: BewertenInput | AngebotstextInput;
  korrektur: readonly Verstoss[];
}

export const defaultBewertung = (i: BewertenInput): Bewertung => ({
  spam: false,
  machbarkeit: 'machbar',
  gruende: ['Übliche Schreinerarbeit nach den Angaben im Konfigurator.'],
  risiken: [],
  fehlende_angaben: [],
  rueckfragen: ['Können Sie uns ein Foto der Einbausituation schicken?'],
  passt_zum_betrieb: true,
  mengen: i.mengenNoetig
    ? {
        werkstatt_h: 16,
        montage_h: 6,
        material: [
          { art: 'platte', holz: 'eiche', staerke: 19, menge: 4, einheit: 'm²', begruendung: 'Korpus und Fronten' },
          { art: 'oberflaeche', oberflaeche: 'natur-geoelt', menge: 8, einheit: 'm²', begruendung: 'Beide Seiten' },
        ],
      }
    : null,
});

export const defaultAngebotstext = (i: AngebotstextInput): Angebotstext => ({
  einleitung: `Vielen Dank für Ihre Anfrage. Gern fertigen wir Ihr Vorhaben „${i.typLabel}“ nach Ihren Angaben.`,
  leistung: ['Planung nach Ihren Angaben', 'Fertigung in unserer Werkstatt', 'Lieferung und Montage vor Ort'],
  nicht_enthalten: ['Arbeiten anderer Gewerke'],
  naechster_schritt:
    'Als Nächstes vereinbaren wir einen Termin für das Aufmaß vor Ort. Danach erhalten Sie den verbindlichen Preis.',
});

export class FakeClaude implements ClaudeClient {
  readonly calls: FakeCall[] = [];
  readonly bewertenQueue: FakeAntwort<BewertenInput, Bewertung>[] = [];
  readonly angebotQueue: FakeAntwort<AngebotstextInput, Angebotstext>[] = [];
  usage: KiNutzung = FAKE_USAGE;

  constructor(
    private readonly defaults: {
      bewerten?: (i: BewertenInput) => Bewertung;
      angebotstext?: (i: AngebotstextInput) => Angebotstext;
    } = {},
  ) {}

  private answer<I, T>(q: FakeAntwort<I, T>[], fallback: (i: I) => T, input: I, o: KiOptionen): KiErgebnis<T> {
    const next = q.length ? q.shift()! : fallback;
    const r = typeof next === 'function' ? (next as (i: I, o: KiOptionen) => T | Error)(input, o) : next;
    if (r instanceof Error) throw r;
    return { output: structuredClone(r), usage: { ...this.usage }, model: FAKE_MODEL };
  }

  async bewerten(input: BewertenInput, o: KiOptionen = {}): Promise<KiErgebnis<Bewertung>> {
    this.calls.push({ aufruf: 'bewerten', input, korrektur: o.korrektur ?? [] });
    return this.answer(this.bewertenQueue, this.defaults.bewerten ?? defaultBewertung, input, o);
  }

  async angebotstext(input: AngebotstextInput, o: KiOptionen = {}): Promise<KiErgebnis<Angebotstext>> {
    this.calls.push({ aufruf: 'angebotstext', input, korrektur: o.korrektur ?? [] });
    return this.answer(this.angebotQueue, this.defaults.angebotstext ?? defaultAngebotstext, input, o);
  }
}

/** Recorded answers of one case: in call order (first answer, then the retry after a guard note). */
export interface Aufnahme {
  bewerten: readonly Bewertung[];
  /** Empty for spam (the step never asks for an Angebot text then). */
  angebotstext: readonly Angebotstext[];
}

export const AUFNAHME_MODEL = 'aufnahme';
const NULL_USAGE: KiNutzung = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Serves recorded answers by case id. A case without a recording, or a call kind without one, is a
 * permanent `ki_keine_aufnahme` failure (the step then takes its normal failure path).
 */
export class AufnahmeClaude implements ClaudeClient {
  readonly calls: FakeCall[] = [];
  private readonly zaehler = new Map<string, number>();

  constructor(private readonly finde: (fall: string) => Aufnahme | null | undefined) {}

  private naechste<T>(fall: string, aufruf: FakeCall['aufruf'], liste: readonly T[] | undefined): KiErgebnis<T> {
    const key = `${fall}|${aufruf}`;
    const n = this.zaehler.get(key) ?? 0;
    this.zaehler.set(key, n + 1);
    const antwort = liste?.[Math.min(n, liste.length - 1)];
    if (antwort === undefined) throw new KiFehler('ki_keine_aufnahme', false);
    return { output: structuredClone(antwort), usage: { ...NULL_USAGE }, model: AUFNAHME_MODEL };
  }

  async bewerten(input: BewertenInput, o: KiOptionen = {}): Promise<KiErgebnis<Bewertung>> {
    this.calls.push({ aufruf: 'bewerten', input, korrektur: o.korrektur ?? [] });
    return this.naechste(input.fall, 'bewerten', this.finde(input.fall)?.bewerten);
  }

  async angebotstext(input: AngebotstextInput, o: KiOptionen = {}): Promise<KiErgebnis<Angebotstext>> {
    this.calls.push({ aufruf: 'angebotstext', input, korrektur: o.korrektur ?? [] });
    return this.naechste(input.fall, 'angebotstext', this.finde(input.fall)?.angebotstext);
  }
}
