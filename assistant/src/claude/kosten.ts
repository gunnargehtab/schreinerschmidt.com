// Cost guard (docs/assistant.md §6): estimated Claude spend from the usage tokens × list prices,
// summed per month in the store (`ki_kosten`). With CLAUDE_MONTHLY_LIMIT_USD set, the `bewertung`
// step skips Claude once the month's estimate reaches the limit (event `ki_budget`), like the
// no-key path. An estimate, not the bill: the Console's spend limit stays the hard stop.
import type { Store } from '../store';
import type { KiNutzung } from './client';

/**
 * Opus 5.5 list prices in USD per million tokens (docs/assistant.md §6, 2026-10-13; re-check before
 * launch). Cache writes (5-minute TTL) cost 1.25 × input. A refusal fallback model is billed at its
 * own (not higher) price, so the Opus figures stay an upper estimate.
 */
export const PREISE_USD_PRO_MTOK = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 } as const;

export function kostenUsd(u: KiNutzung): number {
  const p = PREISE_USD_PRO_MTOK;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1e6;
}

/** The billing month of a timestamp, `YYYY-MM` (UTC). */
export const monat = (ms: number): string => new Date(ms).toISOString().slice(0, 7);

export async function verbuche(store: Store, u: KiNutzung, now: number): Promise<void> {
  await store.addKiKosten(monat(now), kostenUsd(u), now);
}

/** True when a limit is set and this month's estimate has reached it. */
export async function budgetErschoepft(store: Store, limitUsd: number | null, now: number): Promise<boolean> {
  if (limitUsd === null) return false;
  return (await store.kiKosten(monat(now))) >= limitUsd;
}
