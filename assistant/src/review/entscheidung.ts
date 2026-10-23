// The owner's decision as stored on the case (`faelle.entscheidung`, docs/angebot.md §7.3): what was
// chosen, when, the internal Absage reason (never sent), the range and Angebotsnummer, and the mail
// that went to the customer exactly as sent. The retention job deletes it (§5).
import type { Angebotstext } from '../claude/schemas';
import type { KundenmailArt } from '../mail/kunde';
import type { AbsageGrund, KontaktArt } from './formular';

export interface GesendeteMail {
  art: KundenmailArt;
  /** The customer's address (the mail's `to`; in allowlist mode it may have gone to the owner). */
  an: string;
  betreff: string;
  /** The plain-text body as sent. */
  text: string;
  at: number;
  /** Allowlist mode redirected it to OWNER_EMAIL. */
  umgeleitet: boolean;
  anhang: string | null;
}

export type Aktion = 'freigeben' | 'eigener_preis' | 'manuell' | 'kontakt' | 'absage';

export interface Entscheidung {
  v: 1;
  aktion: Aktion;
  at: number;
  kontaktArt?: KontaktArt;
  /** Internal reason of an Absage; never part of a mail. */
  grund?: AbsageGrund;
  preis?: { min: number; max: number };
  angebotsnummer?: string;
  /** The Angebot text as sent (Freigeben / eigener Preisrahmen). */
  text?: Angebotstext;
  mail?: GesendeteMail;
}

/** An action in flight (`faelle.sperre`), set before a customer mail goes out. */
export interface Sperre {
  art: Aktion;
  at: number;
}

export const istEntscheidung = (x: unknown): x is Entscheidung =>
  !!x &&
  typeof x === 'object' &&
  (x as { v?: unknown }).v === 1 &&
  typeof (x as { aktion?: unknown }).aktion === 'string';

export const istSperre = (x: unknown): x is Sperre =>
  !!x && typeof x === 'object' && typeof (x as { at?: unknown }).at === 'number';
