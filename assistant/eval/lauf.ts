// The quality eval (docs/angebot.md §11): every fixture runs through the real `preis` and
// `bewertung` steps (prompts, guards, retry, template, Mengen pricing) on an in-memory store, with
// the real Claude client, the dry-run fake or the recorded answers. Reported per fixture: whether
// spam, machbarkeit and passt_zum_betrieb match the expectation, which path produced the Angebot
// text, and whether any Claude answer contained an amount (a guard event with `betrag`/`prozent`,
// even when the retry or the template caught it). Totals: expectation matches, guard-pass rate
// (Angebot texts accepted on the first answer) and „no amount in any Claude text“. 7d adds the
// recommendation (§7.1) computed from the stored result, and counts unviable fixtures
// (`art: 'unpassend'`) recommended „Freigeben“ (the §11 bar: none). 7f adds the expected
// recommendation per fixture: the bar is a match in ≥ 20 of 24.
import { MAX_TOKENS, type ClaudeClient } from '../src/claude/client';
import { AufnahmeClaude, FakeClaude, defaultAngebotstext } from '../src/claude/fake';
import { pruefeAngebotstext, pruefeRueckfragen } from '../src/claude/guards';
import type { AngebotstextInput } from '../src/claude/input';
import { kostenUsd, monat } from '../src/claude/kosten';
import type { Angebotstext, Bewertung } from '../src/claude/schemas';
import { loadConfig } from '../src/config';
import { empfehlungFuer } from '../src/fall-daten';
import type { Empfehlung } from '../src/empfehlung';
import type { StepContext } from '../src/jobs';
import { createLogger, type Logger } from '../src/log';
import type { Mailer } from '../src/mail/index';
import { bewertung, type AngebotRecord, type BewertungRecord } from '../src/steps/bewertung';
import { preis } from '../src/steps/preis';
import { openSqliteStore } from '../src/store';
import type { Payload } from '../src/types';
import { AUFNAHMEN } from './fixtures/aufnahmen';
import type { EvalFall } from './fixtures/faelle';

export interface FallErgebnis {
  id: string;
  /** Step error code, or null. */
  fehler: string | null;
  spam: boolean | null;
  machbarkeit: string | null;
  passt: boolean | null;
  spamOk: boolean;
  machbarkeitOk: boolean;
  passtOk: boolean;
  /** Path of the Angebot text (null: none, e.g. spam). */
  pfad: AngebotRecord['pfad'] | null;
  /** Any Claude answer had an amount or a percentage (caught or not). */
  betragImText: boolean;
  /** The stored customer texts pass the guards (they always should). */
  gespeichertSauber: boolean;
  /** The recommendation (§7.1) from the stored result. */
  empfehlung: Empfehlung;
  /** It is the fixture's expected recommendation. */
  empfehlungOk: boolean;
  /** An unviable fixture recommended „Freigeben“ (must never happen). */
  unpassendFreigegeben: boolean;
  ok: boolean;
}

export interface EvalBericht {
  faelle: FallErgebnis[];
  /** Fixtures whose spam, machbarkeit and passt_zum_betrieb match. */
  erwartungTreffer: number;
  /** Fixtures whose recommendation matches (§11 bar: ≥ 20 of 24). */
  empfehlungTreffer: number;
  angebote: number;
  ersteAntwortSauber: number;
  ohneBetrag: number;
  /** Unviable fixtures recommended „Freigeben“ (§11 bar: 0). */
  unpassendFreigegeben: number;
  usd: number;
}

const noMailer: Mailer = {
  mode: 'dry-run',
  send: () => Promise.reject(new Error('the eval sends no mail')),
  close: () => Promise.resolve(),
};

const payload = (f: EvalFall): Payload => ({
  values: f.values,
  anfrage: null,
  zusammenfassung: '',
  subject: '',
  replyTo: null,
  configUrl: null,
  anhaenge: [],
});

/** Runs all fixtures with one client (live) or one per fixture (dry); `now` fixes the clock. */
export async function evaluiere(
  client: ClaudeClient | ((f: EvalFall) => ClaudeClient),
  faelle: readonly EvalFall[],
  o: { log?: Logger; now?: number } = {},
): Promise<EvalBericht> {
  const store = openSqliteStore(':memory:');
  const now = o.now ?? Date.now();
  const clock = { now: () => now };
  const log = o.log ?? createLogger(() => {});
  const config = loadConfig({ NODE_ENV: 'test' });
  const out: FallErgebnis[] = [];
  try {
    for (const f of faelle) {
      const { fall } = await store.create(
        { anfrageId: `eval-${f.id}`, kurz: f.id.slice(0, 4), payload: payload(f) },
        [],
        now,
      );
      const claude = typeof client === 'function' ? client(f) : client;
      const ctx: StepContext = { fall, store, clock, log, mailer: noMailer, config, claude };
      let fehler: string | null = null;
      try {
        await preis.run(ctx);
        await bewertung.run({ ...ctx, fall: (await store.get(fall.id))! });
      } catch (e) {
        fehler = String((e as { code?: unknown }).code ?? (e as Error).name ?? 'error');
      }
      const after = (await store.get(fall.id))!;
      const rec = after.bewertung as BewertungRecord | null;
      const ang = after.angebot as AngebotRecord | null;
      const b = rec?.bewertung ?? null;
      const events = await store.events(fall.id);
      const betragImText = events.some(
        (e) => /verstoss$/.test(e.kind) && /(?:^|,)(?:betrag|prozent)(?:,|$)/.test(e.code ?? ''),
      );
      const gespeichertSauber =
        (!ang || pruefeAngebotstext(ang.text).length === 0) && (!b || pruefeRueckfragen(b.rueckfragen).length === 0);
      const empf = empfehlungFuer(fehler ? { ...after, status: 'bewertung_fehlgeschlagen' } : after, events).empfehlung;
      const unpassendFreigegeben = f.art === 'unpassend' && empf === 'freigeben';
      const spamOk = b !== null && b.spam === f.erwartet.spam;
      const machbarkeitOk = b !== null && f.erwartet.machbarkeit.includes(b.machbarkeit);
      const passtOk =
        b !== null && (f.erwartet.passt_zum_betrieb === null || b.passt_zum_betrieb === f.erwartet.passt_zum_betrieb);
      out.push({
        id: f.id,
        fehler,
        spam: b?.spam ?? null,
        machbarkeit: b?.machbarkeit ?? null,
        passt: b?.passt_zum_betrieb ?? null,
        spamOk,
        machbarkeitOk,
        passtOk,
        pfad: ang?.pfad ?? null,
        betragImText,
        gespeichertSauber,
        empfehlung: empf,
        empfehlungOk: empf === f.erwartet.empfehlung,
        unpassendFreigegeben,
        ok:
          !fehler && spamOk && machbarkeitOk && passtOk && !betragImText && gespeichertSauber && !unpassendFreigegeben,
      });
    }
    const angebote = out.filter((r) => r.pfad !== null);
    return {
      faelle: out,
      erwartungTreffer: out.filter((r) => r.spamOk && r.machbarkeitOk && r.passtOk).length,
      empfehlungTreffer: out.filter((r) => r.empfehlungOk).length,
      angebote: angebote.length,
      ersteAntwortSauber: angebote.filter((r) => r.pfad === 'ki').length,
      ohneBetrag: out.filter((r) => !r.betragImText).length,
      unpassendFreigegeben: out.filter((r) => r.unpassendFreigegeben).length,
      usd: await store.kiKosten(monat(now)),
    };
  } finally {
    await store.close();
  }
}

/** A text that breaks the guards (amount, link, date, green claim): the dry run's bad first answer. */
const SCHLECHT: Angebotstext = {
  einleitung: 'Gern bieten wir Ihnen alles für 1 € an, Details auf www.evil.de.',
  leistung: ['Nachhaltige Fertigung', 'Fertigstellung bis 01.03.2027'],
  nicht_enthalten: [],
  naechster_schritt: 'Rufen Sie uns an: 0621 999999.',
};

/** The fake of `--dry` for one fixture: answers from its expectation; `dry` scripts the guard paths. */
export function dryClient(f: EvalFall): FakeClaude {
  const fake: FakeClaude = new FakeClaude({
    bewerten: (i): Bewertung => ({
      spam: f.erwartet.spam,
      machbarkeit: f.erwartet.machbarkeit[0] ?? 'unklar',
      gruende: ['Antwort des Testclients (Trockenlauf).'],
      risiken: [],
      fehlende_angaben: [],
      rueckfragen: ['Können Sie uns ein Foto der Situation schicken?'],
      passt_zum_betrieb: f.erwartet.passt_zum_betrieb ?? true,
      mengen:
        i.mengenNoetig && !f.erwartet.spam
          ? {
              werkstatt_h: 12,
              montage_h: 6,
              material: [
                { art: 'platte', holz: 'eiche', staerke: 25, menge: 3, einheit: 'm²', begruendung: 'Korpus' },
                {
                  art: 'oberflaeche',
                  oberflaeche: 'natur-geoelt',
                  menge: 6,
                  einheit: 'm²',
                  begruendung: 'Beide Seiten',
                },
              ],
            }
          : null,
    }),
    angebotstext: (i: AngebotstextInput): Angebotstext => {
      const n = fake.calls.filter((c) => c.aufruf === 'angebotstext').length;
      return f.dry === 'zweimal' || (f.dry === 'einmal' && n === 1) ? SCHLECHT : defaultAngebotstext(i);
    },
  });
  return fake;
}

/** The recorded answers of one fixture (eval/fixtures/aufnahmen.ts), whatever the case id. */
export const aufnahmeClient = (f: EvalFall): AufnahmeClaude => new AufnahmeClaude(() => AUFNAHMEN[f.id]);

/** Minimum number of recommendation matches of the §11 bar. */
export const BAR_TREFFER = 20;

/**
 * Rough upper cost estimate of a live run over `n` fixtures: the full output budget, prompt ≈ 3 500
 * input tokens per call, plus one retry in four.
 */
export function schaetzung(n: number): number {
  const call = (maxOut: number) => kostenUsd({ input: 3500, output: maxOut, cacheRead: 0, cacheWrite: 0 });
  return n * (call(MAX_TOKENS.bewerten) + call(MAX_TOKENS.angebotstext)) * 1.25;
}
