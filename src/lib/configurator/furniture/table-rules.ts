// Table rules (docs/configurator.md §4.2 "Table"). Pure functions in mm, kept apart from
// constraints.ts: the Möbel preview chunk bundles constraints.ts for the carcasses, while the table
// generator (table.ts) loads on request, so these rules only travel with it.
import type { Mm } from './types';

/** The Zarge underside stays at least this high above the floor. */
export const KNEE_ROOM: Mm = 620;

/** Table legs: thickness by length, inset 60–150 mm from the edges. */
export const legSize = (length: Mm): Mm => (length >= 2400 ? 90 : length >= 1800 ? 80 : 70);
export const legInset = (length: Mm): Mm => Math.min(150, Math.max(60, Math.round(length * 0.05)));

/** Zarge height 80–100 mm, reduced so its underside keeps 620 mm knee room. Never below 40 mm. */
export function zargeHeight(height: Mm, top: Mm): Mm {
  return Math.max(40, Math.min(100, height - top - KNEE_ROOM));
}

/** Kufen centres sit at `±(L/2 − max(300, 0.18 L))` from the table centre. */
export const kufenOffset = (length: Mm): Mm => length / 2 - Math.max(300, 0.18 * length);

/** Seats: `floor((L − 200) / 600)` per long side, plus the two ends when the top is ≥ 900 mm wide. */
export function seatRange(length: Mm, width: Mm): [number, number] {
  const side = Math.max(1, Math.floor((length - 200) / 600));
  return [2 * side, 2 * side + (width >= 900 ? 2 : 0)];
}
