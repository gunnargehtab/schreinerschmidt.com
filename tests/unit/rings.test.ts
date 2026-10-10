// Jahresringe generator (docs/design-system.md §3, plan §4.4): deterministic, small, and free of
// anything the CSP, html-validate or the a11y gates would reject.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildRings, mulberry32, renderRings } from '../../src/lib/rings';

const YEAR = new Date().getFullYear();
const DEMO = { from: 2010, to: YEAR, milestones: [2010, 2018, 2023] };
/** ≤ ~6 KB per the task; the gz size is what the page actually pays. */
const MAX_BYTES = 6 * 1024;

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seq = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(seq);
    expect(Math.min(...seq)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...seq)).toBeLessThan(1);
    const mean = seq.reduce((s, v) => s + v, 0) / seq.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });
});

describe('buildRings', () => {
  it('renders the same SVG for the same input, a different one for another seed', () => {
    expect(renderRings(DEMO)).toBe(renderRings(DEMO));
    expect(renderRings({ ...DEMO, seed: 7 })).not.toBe(renderRings(DEMO));
    expect(renderRings({ ...DEMO, milestones: [2015] })).not.toBe(renderRings(DEMO));
  });

  it('draws one ring per year, radii strictly increasing, inside the box', () => {
    const { rings, size } = buildRings(DEMO);
    expect(rings).toHaveLength(YEAR - 2010 + 1);
    expect(rings.map((r) => r.year)).toEqual(Array.from({ length: rings.length }, (_, i) => 2010 + i));
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.radius).toBeGreaterThan(rings[i - 1]!.radius + 4);
    }
    expect(rings.at(-1)!.radius).toBeLessThan(size / 2);
    const numbers = rings.flatMap((r) => r.d.match(/-?\d+/g)!.map(Number));
    expect(numbers.every((n) => Number.isInteger(n))).toBe(true);
    const [mx, my] = rings[0]!.d
      .match(/M(\d+) (\d+)/)!
      .slice(1)
      .map(Number);
    expect(mx).toBeGreaterThan(size / 2);
    expect(my).toBeCloseTo(size / 2, -1);
  });

  it('marks the milestones in order and nothing else', () => {
    const svg = renderRings(DEMO);
    expect(svg.match(/rings__ring--mark/g)).toHaveLength(3);
    expect(svg).toContain('data-year="2010" data-milestone="1"');
    expect(svg).toContain('data-year="2018" data-milestone="2"');
    expect(svg).toContain('data-year="2023" data-milestone="3"');
    expect(svg).not.toMatch(/data-year="2011" data-milestone/);
  });

  it('stays small', () => {
    const svg = renderRings(DEMO);
    const bytes = Buffer.byteLength(svg);
    expect(bytes, `${bytes} bytes (${gzipSync(svg).length} gz)`).toBeLessThanOrEqual(MAX_BYTES);
    expect(gzipSync(svg).length).toBeLessThanOrEqual(3 * 1024);
  });

  it('carries the presentation and a11y attributes and nothing the CSP rejects', () => {
    const svg = renderRings(DEMO);
    expect(svg.startsWith('<svg class="rings" viewBox="0 0 480 480"')).toBe(true);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('fill="none"');
    expect(svg).not.toMatch(/<style|<script|<text|<title|\sstyle=|\sid=|\son[a-z]+=/i);
  });

  it('rejects an empty range and milestones outside it', () => {
    expect(() => renderRings({ from: 2020, to: 2010 })).toThrow(/range/);
    expect(() => renderRings({ from: 2010, to: 2020, milestones: [2021] })).toThrow(/outside/);
    expect(() => renderRings({ from: 2010.5, to: 2020 })).toThrow();
  });

  it('handles a single year', () => {
    const { rings } = buildRings({ from: 2026, to: 2026 });
    expect(rings).toHaveLength(1);
    expect(rings[0]!.milestone).toBe(0);
  });
});
