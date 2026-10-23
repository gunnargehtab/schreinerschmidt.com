// The recommendation for the owner (docs/angebot.md §7.1): pure code from the stored inputs, never
// Claude's choice. Every rule that fires adds a flag `{ code, text, stufe }` with a German reason line
// (texte/inhaber.ts); the recommendation is the strongest level among the flags:
//   absagen (any Absage flag) > pruefen (any Prüfen flag) > freigeben (no flag).
// Without a Claude assessment (`ohne_ki`, or the case failed) a Prüfen flag is always set, so such a
// case is at most „Prüfen“, never „Freigeben“; the deterministic Absage rules (Mindestauftrag,
// small job outside the area) still apply. The owner can always choose any action.
import type { Values } from '../../src/lib/configurator/fields';
import { SHARED } from '../../src/lib/configurator/pricing/common';
import type { Kalkulation } from '../../src/lib/configurator/pricing/types';
import type { ServiceTier } from '../../src/lib/configurator/service-area';
import type { BewertungRecord } from './steps/bewertung';
import { FLAG_TEXT } from './texte/inhaber';

export type Empfehlung = 'absagen' | 'pruefen' | 'freigeben';

export type FlagCode =
  // Absagen empfohlen
  | 'spam'
  | 'nicht_machbar'
  | 'passt_nicht'
  | 'unter_mindestauftrag'
  | 'aussen_klein'
  // Prüfen
  | 'fehlgeschlagen'
  | 'ohne_ki'
  | 'machbarkeit_unklar'
  | 'machbarkeit_eingeschraenkt'
  | 'ki_mengen'
  | 'kein_preis'
  | 'breite'
  | 'budget'
  | 'eilig'
  | 'denkmal'
  | 'build_mismatch'
  | 'anfrage_mail_failed';

export interface Flag {
  code: FlagCode;
  /** German reason line for the TL;DR and the review page. */
  text: string;
  stufe: 'absagen' | 'pruefen';
}

export interface EmpfehlungErgebnis {
  v: 1;
  empfehlung: Empfehlung;
  flags: Flag[];
}

export interface EmpfehlungInput {
  /** The `bewertung` step's record; null when the case failed before it. */
  bewertung: BewertungRecord | null;
  /** The case's Kalkulation (rules or Claude's quantities); null: no price. */
  kalkulation: Kalkulation | null;
  values: Values;
  /** Service tier of the PLZ; null (unknown) counts as `aussen`, as in the pricing. */
  tier: ServiceTier | null;
  /** Kinds of the case's events (`build_mismatch`, `anfrage_mail_failed`, `mengen_fehlen`, …). */
  ereignisse: readonly string[];
  /** The case is `bewertung_fehlgeschlagen`. */
  fehlgeschlagen?: boolean;
}

/** Threshold of the „Außerhalb und klein“ rule, € net (§7.1). */
export const AUSSEN_MIN_NETTO = 2000;
/** „Budget passt nicht“ when the customer's upper bound is below this share of the range min. */
export const BUDGET_ANTEIL = 0.8;
/** Werkstatt hours above which `zeitraum=asap` is flagged. */
export const EILIG_STUNDEN = 40;

/**
 * Upper bound (€ gross, as the customer reads it) of each `budget` option of fields.ts.
 * `ueber-25000` and `keine-angabe` have none and never trigger the rule.
 */
export const BUDGET_OBERGRENZE: Readonly<Record<string, number | null>> = {
  'bis-2000': 2000,
  '2000-5000': 5000,
  '5000-10000': 10000,
  '10000-25000': 25000,
  'ueber-25000': null,
  'keine-angabe': null,
};

/** Workshop hours: positions in h whose text starts „Werkstatt“, else Claude's `werkstatt_h`. */
export function werkstattStunden(k: Kalkulation | null, rec: BewertungRecord | null): number {
  if (k) {
    return k.positionen
      .filter((p) => p.einheit === 'h' && p.text.startsWith('Werkstatt'))
      .reduce((s, p) => s + (Number.isFinite(p.menge) ? p.menge : 0), 0);
  }
  const h = rec?.bewertung?.mengen?.werkstatt_h;
  return typeof h === 'number' && Number.isFinite(h) ? h : 0;
}

const str = (x: unknown): string | undefined => (typeof x === 'string' ? x : undefined);

/** A stored recommendation (`faelle.empfehlung`). */
export const istEmpfehlung = (x: unknown): x is EmpfehlungErgebnis =>
  !!x &&
  typeof x === 'object' &&
  (x as { v?: unknown }).v === 1 &&
  Array.isArray((x as { flags?: unknown }).flags) &&
  ['absagen', 'pruefen', 'freigeben'].includes(String((x as { empfehlung?: unknown }).empfehlung));

export function empfehlung(i: EmpfehlungInput): EmpfehlungErgebnis {
  const flags: Flag[] = [];
  const add = (code: FlagCode, stufe: Flag['stufe'], text: string): void => void flags.push({ code, text, stufe });
  const rec = i.bewertung;
  const b = rec?.quelle === 'ki' ? rec.bewertung : null;
  const k = i.kalkulation;
  const tier = i.tier ?? 'aussen';

  // Absagen empfohlen
  if (b?.spam) add('spam', 'absagen', FLAG_TEXT.spam);
  if (b?.machbarkeit === 'nicht_machbar') add('nicht_machbar', 'absagen', FLAG_TEXT.nicht_machbar);
  if (b && b.passt_zum_betrieb === false) add('passt_nicht', 'absagen', FLAG_TEXT.passt_nicht);
  if (k && k.netto < SHARED.mindestauftrag) {
    add('unter_mindestauftrag', 'absagen', FLAG_TEXT.unter_mindestauftrag(k.netto, SHARED.mindestauftrag));
  }
  if (k && tier === 'aussen' && k.netto < AUSSEN_MIN_NETTO) {
    add('aussen_klein', 'absagen', FLAG_TEXT.aussen_klein(AUSSEN_MIN_NETTO));
  }

  // Prüfen
  if (i.fehlgeschlagen) add('fehlgeschlagen', 'pruefen', FLAG_TEXT.fehlgeschlagen);
  else if (!rec || rec.quelle === 'ohne_ki' || !b) add('ohne_ki', 'pruefen', FLAG_TEXT.ohne_ki(rec?.grund ?? null));
  if (b?.machbarkeit === 'unklar') add('machbarkeit_unklar', 'pruefen', FLAG_TEXT.machbarkeit_unklar);
  if (b?.machbarkeit === 'eingeschraenkt')
    add('machbarkeit_eingeschraenkt', 'pruefen', FLAG_TEXT.machbarkeit_eingeschraenkt);
  if (k?.quelle === 'ki-mengen') add('ki_mengen', 'pruefen', FLAG_TEXT.ki_mengen);
  if (!k && !i.fehlgeschlagen && !b?.spam) {
    const grund = i.ereignisse.includes('mengen_ungueltig')
      ? 'ungueltig'
      : i.ereignisse.includes('mengen_fehlen') || rec?.mengen === 'fehlen'
        ? 'fehlen'
        : null;
    add('kein_preis', 'pruefen', FLAG_TEXT.kein_preis(grund));
  }
  if (k && k.quelle !== 'ki-mengen' && k.breite >= 0.25) add('breite', 'pruefen', FLAG_TEXT.breite(k.breite));
  const budget = str(i.values['budget']);
  const obergrenze =
    budget !== undefined && Object.hasOwn(BUDGET_OBERGRENZE, budget) ? BUDGET_OBERGRENZE[budget] : null;
  if (k && typeof obergrenze === 'number' && obergrenze < BUDGET_ANTEIL * k.min) {
    add('budget', 'pruefen', FLAG_TEXT.budget(obergrenze, k.min));
  }
  const stunden = werkstattStunden(k, rec);
  if (str(i.values['zeitraum']) === 'asap' && stunden > EILIG_STUNDEN) {
    add('eilig', 'pruefen', FLAG_TEXT.eilig(stunden, EILIG_STUNDEN));
  }
  if (Object.entries(i.values).some(([key, v]) => key.endsWith('_denkmal') && v === 'ja')) {
    add('denkmal', 'pruefen', FLAG_TEXT.denkmal);
  }
  if (i.ereignisse.includes('build_mismatch')) add('build_mismatch', 'pruefen', FLAG_TEXT.build_mismatch);
  if (i.ereignisse.includes('anfrage_mail_failed')) {
    add('anfrage_mail_failed', 'pruefen', FLAG_TEXT.anfrage_mail_failed);
  }

  const stufe: Empfehlung = flags.some((f) => f.stufe === 'absagen')
    ? 'absagen'
    : flags.length
      ? 'pruefen'
      : 'freigeben';
  return { v: 1, empfehlung: stufe, flags };
}
