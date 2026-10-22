// Shared backend types: the case payload (docs/angebot.md §5) and the injected clock.
import type { Values } from '../../src/lib/configurator/fields';

export type { Values };

/** Injected time source, so tests control backoff, rate-limit windows and timestamps. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** The parts of the client's `anfrage_json` (ss-anfrage@1) the backend keeps; see anfrage-json.ts. */
export interface AnfrageJson {
  schema: 'ss-anfrage@1';
  id: string;
  kurz?: string | undefined;
  createdAt?: string | undefined;
  source?:
    { mode?: 'demo' | 'live' | undefined; page?: string | undefined; configUrl?: string | undefined } | undefined;
  moebel?:
    | {
        derived?: { doors?: number | undefined; drawers?: number | undefined; hinges?: number | undefined } | undefined;
        beschreibung?: string | undefined;
      }
    | null
    | undefined;
}

/**
 * What a case stores (`faelle.payload`): the server-validated, effective, visible values plus the
 * kept parts of anfrage_json and the sanitized mail fields. Attachments are never stored, only
 * their sanitized names (§5).
 */
export interface Payload {
  values: Values;
  anfrage: AnfrageJson | null;
  /** The enquiry mail body text (the client's zusammenfassung, or the server summary without JS). */
  zusammenfassung: string;
  /** Sanitized `_subject`. */
  subject: string;
  /** Validated customer address for Reply-To. */
  replyTo: string | null;
  /** Config link on SITE_ORIGIN, or null. */
  configUrl: string | null;
  /** Sanitized names of the attachments that travelled with the enquiry mail. */
  anhaenge: string[];
}
