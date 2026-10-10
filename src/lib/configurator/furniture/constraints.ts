// Carpentry constraints (docs/configurator.md §4.2 "Derived rules"). Pure functions in mm.
import { SPECIES } from './species';
import type { Board, Mm, Species } from './types';

/** Longest bay the generators allow, whatever the shelf span. */
export const MAX_BAY: Mm = 1200;
/** Shelf positions snap to the 32 mm system grid. */
export const GRID: Mm = 32;
/** Gap around doors and drawer fronts. */
export const GAP: Mm = 3;
/** Sockel recess and Füße inset, both from the front/side faces. */
export const INSET: Mm = 30;
/** Rückwand: 8 mm panel in a groove 10 mm from the back edge. */
export const BACK_PANEL: Mm = 8;
export const BACK_GROOVE: Mm = 10;
/** Einbauschrank: ventilation gap behind the carcass. */
export const VENT_GAP: Mm = 20;
/** Einbauschrank: module width limit and the Aufsatz split. */
export const MAX_MODULE: Mm = 1200;
export const SPLIT_ABOVE: Mm = 2600;
export const MAIN_CABINET: Mm = 2250;
export const MIN_AUFSATZ: Mm = 300;
/** Table: the Zarge underside stays at least this high above the floor. */
export const KNEE_ROOM: Mm = 620;

const DRAWER_FRONT = [120, 300] as const;
const DOOR_MAX_HEIGHT: Mm = 2400;
const RUNNERS = [270, 300, 350, 400, 450, 500, 550, 600, 650] as const;

/**
 * Maximum clear shelf span: `L_max = t · (E / 0.16875)^(1/3)` with t in mm and E in N/mm²; simply
 * supported, 1.2 kN/m², L/600, creep factor 1.5. Oak 19 mm → 741 mm. E is owner-to-confirm (species.ts).
 */
export function maxShelfSpan(s: Species, t: Board | 60): Mm {
  return Math.round(t * Math.cbrt((SPECIES[s].eModulusGPa * 1000) / 0.16875));
}

/** Bay count for one carcass: `n = ceil((W − 2t + t) / (maxBay + t))` with `innerWidth = W − 2t`. */
export function deriveBays(innerWidth: Mm, board: Board, maxBay: Mm): number {
  return Math.max(1, Math.ceil((innerWidth + board) / (maxBay + board)));
}

/** Clear width of each of `n` equal bays separated by Mittelwände of thickness `t`. */
export const bayWidth = (innerWidth: Mm, board: Board, n: number): Mm => (innerWidth - (n - 1) * board) / n;

/** Compartments per bay from the inner height: 200–400 mm each, default about 340 mm. Shelves = k − 1. */
export function deriveShelves(innerHeight: Mm): { min: number; max: number; def: number } {
  const min = Math.max(1, Math.ceil(innerHeight / 400));
  const max = Math.max(min, Math.floor(innerHeight / 200));
  const def = Math.min(max, Math.max(min, Math.round(innerHeight / 340)));
  return { min, max, def };
}

/**
 * Shelf undersides for `k` compartments, measured from the inner bottom. Shelf centres sit on the
 * 32 mm system grid (`n · 32 − t/2`), clamped so every shelf stays inside the opening.
 */
export function shelfPositions(innerHeight: Mm, k: number, board: Board): Mm[] {
  const out: Mm[] = [];
  const nMax = Math.max(1, Math.floor((innerHeight - board / 2) / GRID));
  for (let i = 1; i < k; i++) {
    const n = Math.min(nMax, Math.max(1, Math.round((i * innerHeight) / k / GRID)));
    out.push(n * GRID - board / 2);
  }
  return out;
}

/**
 * Doors per bay: one up to a 606 mm opening (door ≤ 600 mm with 3 mm gaps), otherwise two. Bays never
 * exceed 1200 mm, so doors stay ≥ 300 mm except in the 606–609 mm window, where they are ≥ 298.5 mm.
 */
export const doorsPerBay = (clear: Mm): number => (clear <= 606 ? 1 : 2);

/** Stacked door rows so no door is taller than 2400 mm. */
export const doorRows = (innerHeight: Mm): number => Math.max(1, Math.ceil((innerHeight - 2 * GAP) / DOOR_MAX_HEIGHT));

/** Hinges by door height. */
export function hingesFor(doorHeight: Mm): number {
  return doorHeight <= 900 ? 2 : doorHeight <= 1600 ? 3 : doorHeight <= 2000 ? 4 : 5;
}

/** Drawer fronts in a stack of `innerHeight`: as few as possible with fronts ≤ 300 mm and ≥ 120 mm. */
export function drawerCount(innerHeight: Mm): number {
  let n = Math.max(1, Math.ceil(innerHeight / DRAWER_FRONT[1]));
  while (n > 1 && (innerHeight - GAP * (n + 1)) / n < DRAWER_FRONT[0]) n--;
  return n;
}

/** Runner length from the clear depth behind the front: the longest standard runner that fits. */
export function runnerLength(clearDepth: Mm): Mm {
  let best: Mm = RUNNERS[0];
  for (const r of RUNNERS) if (r <= clearDepth) best = r;
  return best;
}

/**
 * Einbauschrank split: a carcass taller than `splitAbove` becomes a main cabinet of `main` plus an
 * Aufsatz. If the Aufsatz would be smaller than `minAufsatz`, the Blende grows instead.
 */
export function splitAufsatz(
  carcassHeight: Mm,
  { splitAbove = SPLIT_ABOVE, main = MAIN_CABINET, minAufsatz = MIN_AUFSATZ } = {},
): { main: Mm; aufsatz: Mm; extraBlende: Mm } {
  if (carcassHeight <= splitAbove) return { main: carcassHeight, aufsatz: 0, extraBlende: 0 };
  const aufsatz = carcassHeight - main;
  return aufsatz < minAufsatz ? { main, aufsatz: 0, extraBlende: aufsatz } : { main, aufsatz, extraBlende: 0 };
}

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
