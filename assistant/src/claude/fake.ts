// An in-process ClaudeClient for tests and `npm run eval -- --dry`: no network, no key. Answers
// come from queues (a value, a thrown error, or a function of the input), else from defaults that
// pass the guards. Every call is recorded with its input and corrective codes.
import type { AngebotstextInput, BewertenInput } from './input';
import type { ClaudeClient, KiErgebnis, KiNutzung, KiOptionen } from './client';
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
