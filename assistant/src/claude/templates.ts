// Neutral Angebot text (docs/angebot.md §6.4): the fallback when Claude's text fails the guards
// twice, when Claude is off (no key, budget) or when the call cannot be used (refusal, max_tokens).
// Built only from the branch label and the Kalkulation's position texts, both produced by our own
// code, and every line still passes the guards (a position that would not is left out).
//
// needs-review (docs/owner-checklist.md "Angebot pilot"): the wording below is the copywriter's
// final draft (2026-10-22); the owner must approve this customer-facing text before SEND_MODE=live.
// Keep every customer sentence in these constants, and keep them free of digits, dates, amounts and
// the green-claim words, so the template itself can never trip guards.ts.
import type { Kalkulation } from '../../../src/lib/configurator/pricing/types';
import { pruefeText } from './guards';
import { LIST_LIMITS, TEXT_LIMITS, type Angebotstext } from './schemas';

/** Wording of the template (needs-review: owner approval of the customer-facing text). */
export const VORLAGE = {
  /** `typLabel` is the configurator's project type as the customer chose it („Boden“, „Möbel nach Maß“). */
  einleitung: (typLabel: string): string =>
    `Vielen Dank für Ihre Anfrage zur Projektart „${typLabel}“ über unseren Konfigurator. Wir haben Ihre Angaben durchgesehen und daraus einen ersten, unverbindlichen Preisrahmen für Sie zusammengestellt.`,
  /** When the Kalkulation has no usable position (e.g. a Mengen case without quantities). */
  leistungAllgemein: (typLabel: string): string => `${typLabel}: Planung und Ausführung nach Ihren Angaben`,
  nichtEnthalten: [
    'Arbeiten anderer Gewerke, zum Beispiel Elektro-, Maler- oder Maurerarbeiten',
    'Demontage und Entsorgung vorhandener Einbauten oder Beläge, sofern nicht in den Leistungen aufgeführt',
    'Weitere Leistungen, die nicht aufgeführt sind',
  ],
  naechsterSchritt:
    'Als nächsten Schritt vereinbaren wir mit Ihnen einen Termin für das Aufmaß vor Ort; sagen Sie uns gern, wann es Ihnen passt. Dabei sehen wir uns die Gegebenheiten an und klären die Einzelheiten. Danach erhalten Sie von uns ein verbindliches Angebot.',
} as const;

/** Position texts that never go to the customer: travel, surcharges and lines our own code marks as unpriced. */
const INTERN = /^(?:Anfahrt|Material pauschal|Zuschlag|Aufschlag)/;

/**
 * A Beschlag line of Claude's quantities (pricing/mengen.ts): „Scharniere, 4 Stk. (begruendung)“.
 * The parenthesised reason is Claude's text, so the template keeps only our part before it.
 */
const KI_BESCHLAG = /^((?:Türbeschläge|Schubkastenbeschläge|Scharniere), [\d.,]+\sStk\.)\s*\(.*\)$/su;

/** Our own words of a position text: Claude's reason cut off a Mengen Beschlag line. */
const eigenerText = (s: string): string => s.replace(KI_BESCHLAG, '$1');

/** U+202F between a number and its unit (docs/plan.md §3.4). */
const withNarrowSpace = (s: string): string => s.replace(/(\d) (m²|m|cm|mm|h|lfm|Stk\.)(?![\p{L}])/gu, '$1\u202f$2');

/**
 * Customer lines from the Kalkulation positions: own code only (no Claude-authored words),
 * deduplicated, guard-clean.
 */
export function leistungAusPositionen(positionen: Kalkulation['positionen'] | null | undefined): string[] {
  const out: string[] = [];
  for (const p of positionen ?? []) {
    if (typeof p?.text !== 'string' || INTERN.test(p.text)) continue;
    const line = withNarrowSpace(eigenerText(p.text.trim()));
    if (!line || line.length > TEXT_LIMITS.item || pruefeText(line).length || out.includes(line)) continue;
    out.push(line);
    if (out.length === LIST_LIMITS.leistung) break;
  }
  return out;
}

/** The neutral Angebot text for a case. */
export function vorlageAngebotstext(
  typLabel: string,
  positionen: Kalkulation['positionen'] | null | undefined,
): Angebotstext {
  const label = pruefeText(typLabel).length ? 'Sonstiges' : typLabel;
  const leistung = leistungAusPositionen(positionen);
  return {
    einleitung: VORLAGE.einleitung(label),
    leistung: leistung.length ? leistung : [VORLAGE.leistungAllgemein(label)],
    nicht_enthalten: [...VORLAGE.nichtEnthalten],
    naechster_schritt: VORLAGE.naechsterSchritt,
  };
}
