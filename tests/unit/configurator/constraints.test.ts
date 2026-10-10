// Carpentry constraints (docs/configurator.md §4.2, §7 "Constraints").
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GRID,
  MAX_BAY,
  bayWidth,
  deriveBays,
  deriveShelves,
  doorRows,
  doorsPerBay,
  drawerCount,
  hingesFor,
  maxShelfSpan,
  runnerLength,
  shelfPositions,
  splitAufsatz,
} from '../../../src/lib/configurator/furniture/constraints';
import {
  KNEE_ROOM,
  kufenOffset,
  legInset,
  legSize,
  seatRange,
  zargeHeight,
} from '../../../src/lib/configurator/furniture/table-rules';
import type { Board, Species } from '../../../src/lib/configurator/furniture/types';

const BOARDS: Board[] = [19, 25, 40];
const SPEC_TABLE: Record<Species, [number, number, number]> = {
  eiche: [741, 975, 1560],
  nussbaum: [760, 1000, 1600],
  esche: [794, 1045, 1671],
  kernbuche: [834, 1098, 1757],
  kirsche: [748, 985, 1575],
};
const SPECIES = Object.keys(SPEC_TABLE) as Species[];
const board = fc.constantFrom<Board>(...BOARDS);
const species = fc.constantFrom<Species>(...SPECIES);

describe('maxShelfSpan', () => {
  it('matches the spec table within ±1 mm (oak 19 mm → 741)', () => {
    expect(Math.abs(maxShelfSpan('eiche', 19) - 741)).toBeLessThanOrEqual(1);
    for (const s of SPECIES) {
      BOARDS.forEach((t, i) => expect(Math.abs(maxShelfSpan(s, t) - SPEC_TABLE[s][i]!)).toBeLessThanOrEqual(1));
    }
  });

  it('grows with board thickness and species stiffness', () => {
    for (const s of SPECIES) {
      expect(maxShelfSpan(s, 19)).toBeLessThan(maxShelfSpan(s, 25));
      expect(maxShelfSpan(s, 25)).toBeLessThan(maxShelfSpan(s, 40));
      expect(maxShelfSpan(s, 40)).toBeLessThan(maxShelfSpan(s, 60));
    }
    expect(maxShelfSpan('kernbuche', 19)).toBeGreaterThan(maxShelfSpan('eiche', 19));
    expect(maxShelfSpan('esche', 25)).toBeGreaterThan(maxShelfSpan('kirsche', 25));
  });
});

describe('deriveBays / bayWidth', () => {
  it('W = 1200, oak 19 mm → 2 bays', () => {
    expect(deriveBays(1200 - 38, 19, Math.min(maxShelfSpan('eiche', 19), MAX_BAY))).toBe(2);
  });

  it('never exceeds the span and uses the minimum number of bays', () => {
    fc.assert(
      fc.property(fc.integer({ min: 300, max: 4000 }), board, species, (inner, t, s) => {
        const maxBay = Math.min(maxShelfSpan(s, t), MAX_BAY);
        const n = deriveBays(inner, t, maxBay);
        expect(n).toBeGreaterThanOrEqual(1);
        const w = bayWidth(inner, t, n);
        if (n > 1) expect(w).toBeLessThanOrEqual(maxBay + 1e-9);
        if (n > 1) expect(bayWidth(inner, t, n - 1)).toBeGreaterThan(maxBay);
        expect(w * n + (n - 1) * t).toBeCloseTo(inner, 6);
      }),
    );
  });

  it('door widths stay within 300–600 mm for every bay the rules produce', () => {
    fc.assert(
      fc.property(fc.integer({ min: 400, max: 4000 }), board, species, (W, t, s) => {
        const inner = W - 2 * t;
        const n = deriveBays(inner, t, Math.min(maxShelfSpan(s, t), MAX_BAY));
        const w = bayWidth(inner, t, n);
        const doors = doorsPerBay(w);
        const dw = (w - 3 * (doors + 1)) / doors;
        expect(dw).toBeGreaterThanOrEqual(298.5); // 606–609 mm openings, see doorsPerBay
        expect(dw).toBeLessThanOrEqual(600);
      }),
    );
  });
});

describe('deriveShelves / shelfPositions', () => {
  it('bounds compartments to 200–400 mm with a default near 340 mm', () => {
    expect(deriveShelves(1882)).toEqual({ min: 5, max: 9, def: 6 });
    expect(deriveShelves(362)).toEqual({ min: 1, max: 1, def: 1 });
    expect(deriveShelves(100)).toEqual({ min: 1, max: 1, def: 1 });
  });

  it('keeps min ≤ def ≤ max for any inner height', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4000 }), (h) => {
        const { min, max, def } = deriveShelves(h);
        expect(min).toBeLessThanOrEqual(def);
        expect(def).toBeLessThanOrEqual(max);
      }),
    );
  });

  it('snaps shelf centres to the 32 mm grid and stays inside the opening', () => {
    fc.assert(
      fc.property(fc.integer({ min: 300, max: 3000 }), fc.integer({ min: 1, max: 12 }), board, (h, k, t) => {
        const pos = shelfPositions(h, k, t);
        expect(pos).toHaveLength(k - 1);
        for (const y of pos) {
          expect((y + t / 2) % GRID).toBe(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y + t).toBeLessThanOrEqual(h);
        }
      }),
    );
  });
});

describe('doors and drawers', () => {
  it('counts doors, rows and hinges', () => {
    expect(doorsPerBay(606)).toBe(1);
    expect(doorsPerBay(607)).toBe(2);
    expect(doorRows(2000)).toBe(1);
    expect(doorRows(2562)).toBe(2);
    expect(hingesFor(900)).toBe(2);
    expect(hingesFor(1600)).toBe(3);
    expect(hingesFor(2000)).toBe(4);
    expect(hingesFor(2400)).toBe(5);
  });

  it('drawer fronts stay 120–300 mm high', () => {
    fc.assert(
      fc.property(fc.integer({ min: 120, max: 3000 }), (h) => {
        const n = drawerCount(h);
        const fh = (h - 3 * (n + 1)) / n;
        expect(fh).toBeLessThanOrEqual(300 + 1e-9);
        if (n > 1) expect(fh).toBeGreaterThanOrEqual(120);
      }),
    );
  });

  it('picks the longest standard runner that fits, 270–650 mm', () => {
    expect(runnerLength(100)).toBe(270);
    expect(runnerLength(403)).toBe(400);
    expect(runnerLength(900)).toBe(650);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), (d) => {
        const r = runnerLength(d);
        expect(r).toBeGreaterThanOrEqual(270);
        expect(r).toBeLessThanOrEqual(650);
        if (d >= 270) expect(r).toBeLessThanOrEqual(d);
      }),
    );
  });
});

describe('splitAufsatz', () => {
  it('splits above 2600 mm into 2250 mm + Aufsatz, otherwise keeps one carcass', () => {
    expect(splitAufsatz(2500)).toEqual({ main: 2500, aufsatz: 0, extraBlende: 0 });
    expect(splitAufsatz(2660)).toEqual({ main: 2250, aufsatz: 410, extraBlende: 0 });
  });

  it('grows the Blende instead of a too-small Aufsatz', () => {
    expect(splitAufsatz(2400, { splitAbove: 2300, main: 2250, minAufsatz: 300 })).toEqual({
      main: 2250,
      aufsatz: 0,
      extraBlende: 150,
    });
  });
});

describe('table rules', () => {
  it('legs, inset, Zarge and Kufen', () => {
    expect(legSize(1200)).toBe(70);
    expect(legSize(1800)).toBe(80);
    expect(legSize(2400)).toBe(90);
    expect(legInset(1200)).toBe(60);
    expect(legInset(2000)).toBe(100);
    expect(legInset(3200)).toBe(150);
    expect(zargeHeight(750, 40)).toBe(90);
    expect(zargeHeight(780, 25)).toBe(100);
    expect(zargeHeight(720, 60)).toBe(40);
    expect(kufenOffset(2000)).toBe(640);
    expect(kufenOffset(1200)).toBe(300);
  });

  it('the Zarge underside keeps 620 mm knee room for every table', () => {
    fc.assert(
      fc.property(fc.integer({ min: 720, max: 780 }), fc.constantFrom(25, 40, 60), (h, top) => {
        const zh = zargeHeight(h, top);
        expect(h - top - zh).toBeGreaterThanOrEqual(KNEE_ROOM);
        expect(zh).toBeLessThanOrEqual(100);
      }),
    );
  });

  it('seats: 3 per long side at 200 cm, ends only from 90 cm width', () => {
    expect(seatRange(2000, 900)).toEqual([6, 8]);
    expect(seatRange(2000, 800)).toEqual([6, 6]);
    expect(seatRange(1200, 700)).toEqual([2, 2]);
  });
});
