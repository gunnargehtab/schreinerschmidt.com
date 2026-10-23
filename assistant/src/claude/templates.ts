// Neutral Angebot text (docs/angebot.md §6.4): the fallback when Claude's text fails the guards
// twice, when Claude is off (no key, budget) or when the call cannot be used (refusal, max_tokens).
// Built only from the branch label and customer-level lines our own code makes from the form values
// (projekt.ts, phrases in texte/struktur.ts; 7d review: no internal positions), and every line
// still passes the guards (a line that would not is left out).
//
// needs-review (docs/owner-checklist.md "Angebot pilot"): the wording below is the copywriter's
// final draft (2026-10-22); the owner must approve this customer-facing text before SEND_MODE=live.
// Keep every customer sentence in these constants, and keep them free of digits, dates, amounts and
// the green-claim words, so the template itself can never trip guards.ts.
import type { Values } from '../../../src/lib/configurator/fields';
import { projektLeistungen } from '../projekt';
import { pruefeText } from './guards';
import { LIST_LIMITS, type Angebotstext } from './schemas';

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

/**
 * The neutral Angebot text for a case. The Leistungen describe the project at customer level from
 * the form values (projekt.ts), never the Kalkulation's internal positions (§8.1: no positions go
 * to the customer); without usable values the template names the project type.
 */
export function vorlageAngebotstext(typLabel: string, values: Values | null | undefined): Angebotstext {
  const label = pruefeText(typLabel).length ? 'Sonstiges' : typLabel;
  const leistung = values ? projektLeistungen(values, LIST_LIMITS.leistung) : [];
  return {
    einleitung: VORLAGE.einleitung(label),
    leistung: leistung.length ? leistung : [VORLAGE.leistungAllgemein(label)],
    nicht_enthalten: [...VORLAGE.nichtEnthalten],
    naechster_schritt: VORLAGE.naechsterSchritt,
  };
}
