// SVG elevation (docs/configurator.md §4.8, §7 "Elevation"): golden snapshots for 6 configs, no NaN,
// <title>/<desc> present, text escaped, CSP-clean (no style attributes), unique ids per prefix.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { renderElevation, escapeXml, type ElevationView } from '../../../src/lib/configurator/drawing/elevation';
import { describe as describeBuild, generate } from '../../../src/lib/configurator/furniture';
import type { CarcassParams, FurnitureParams, TableParams } from '../../../src/lib/configurator/furniture/types';

const DATE = '09.10.2026';
const REGAL: CarcassParams = {
  kind: 'regal',
  width: 1200,
  height: 2000,
  depth: 350,
  board: 19,
  front: 'offen',
  base: { type: 'sockel', height: 80 },
  back: 'eingenutet',
  shelvesPerBay: 'auto',
  handle: 'grifflos',
  species: 'eiche',
  finish: 'natur-geoelt',
};
const TISCH: TableParams = {
  kind: 'esstisch',
  length: 2000,
  width: 900,
  height: 750,
  top: 40,
  edge: 'baumkante',
  seed: 7,
  base: 'vierfuss',
  species: 'nussbaum',
  finish: 'natur-geoelt',
};

/** The six golden configurations: name, params, view, mode. */
const GOLDEN: [string, FurnitureParams, ElevationView, 'screen' | 'print'][] = [
  ['regal-vorne', REGAL, 'vorne', 'screen'],
  ['regal-vorne-print', REGAL, 'vorne', 'print'],
  [
    'sideboard-gemischt-vorne',
    {
      ...REGAL,
      kind: 'sideboard',
      width: 1800,
      height: 800,
      depth: 450,
      front: 'gemischt',
      base: { type: 'fuesse', height: 150 },
      handle: 'metall',
      species: 'nussbaum',
      finish: 'weiss-geoelt',
    },
    'vorne',
    'screen',
  ],
  [
    'einbauschrank-aufsatz-vorne',
    {
      ...REGAL,
      kind: 'einbauschrank',
      width: 2400,
      height: 2800,
      depth: 600,
      front: 'tueren',
      base: { type: 'sockel', height: 100 },
      handle: 'holz',
      finish: 'lack-matt',
      niche: { fillerSide: 30, fillerTop: 40, dachschraege: true },
    },
    'vorne',
    'screen',
  ],
  ['esstisch-baumkante-oben', TISCH, 'oben', 'screen'],
  ['esstisch-kufen-seite', { ...TISCH, base: 'kufen-stahl', edge: 'gerade', width: 800 }, 'seite', 'screen'],
];

const carcassArb: fc.Arbitrary<FurnitureParams> = fc.record({
  kind: fc.constantFrom('regal', 'sideboard', 'einbauschrank' as const),
  width: fc.integer({ min: 60, max: 300 }).map((v) => v * 10),
  height: fc.integer({ min: 50, max: 320 }).map((v) => v * 10),
  depth: fc.integer({ min: 20, max: 65 }).map((v) => v * 10),
  board: fc.constantFrom(19, 25, 40 as const),
  front: fc.constantFrom('offen', 'tueren', 'schubkaesten', 'gemischt' as const),
  base: fc.record({
    type: fc.constantFrom('sockel', 'fuesse', 'haengend', 'ohne' as const),
    height: fc.integer({ min: 60, max: 250 }),
  }),
  back: fc.constantFrom('ohne', 'eingenutet' as const),
  shelvesPerBay: fc.constant('auto' as const),
  handle: fc.constantFrom('grifflos', 'holz', 'metall' as const),
  species: fc.constantFrom('eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche' as const),
  finish: fc.constantFrom('natur-geoelt', 'weiss-geoelt', 'lack-matt' as const),
});
const tableArb: fc.Arbitrary<FurnitureParams> = fc.record({
  kind: fc.constant('esstisch' as const),
  length: fc.integer({ min: 120, max: 320 }).map((v) => v * 10),
  width: fc.integer({ min: 70, max: 110 }).map((v) => v * 10),
  height: fc.integer({ min: 72, max: 78 }).map((v) => v * 10),
  top: fc.constantFrom(25, 40, 60 as const),
  edge: fc.constantFrom('gerade', 'baumkante' as const),
  seed: fc.nat(),
  base: fc.constantFrom('vierfuss', 'kufen-holz', 'kufen-stahl' as const),
  species: fc.constantFrom('eiche', 'nussbaum', 'esche', 'kernbuche', 'kirsche' as const),
  finish: fc.constantFrom('natur-geoelt', 'weiss-geoelt', 'lack-matt' as const),
});
const viewArb = fc.constantFrom<ElevationView>('vorne', 'seite', 'oben');

const render = (p: FurnitureParams, view: ElevationView, mode: 'screen' | 'print' = 'screen', extra = {}) =>
  renderElevation(generate(p), { view, widthPx: 640, mode, date: DATE, ...extra });

describe('renderElevation', () => {
  it.each(GOLDEN)('golden: %s', async (name, p, view, mode) => {
    await expect(render(p, view, mode)).toMatchFileSnapshot(`__golden__/${name}.svg`);
  });

  it('is deterministic', () => {
    expect(render(REGAL, 'vorne')).toBe(render(REGAL, 'vorne'));
  });

  it('has role="img", aria-labelledby pointing at <title> and <desc> = describe(build)', () => {
    const svg = render(REGAL, 'vorne', 'screen', { idPrefix: 'z1' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-labelledby="z1-t z1-d"');
    expect(svg).toContain('<title id="z1-t">Regal, Ansicht von vorne</title>');
    expect(svg).toContain(`<desc id="z1-d">${describeBuild(generate(REGAL))}</desc>`);
    expect(svg).toContain('url(#z1-k)');
    expect(svg).not.toContain('"ze-');
    expect(svg).toContain('data-view="vorne"');
  });

  it('escapes title, desc and labels', () => {
    const svg = render(REGAL, 'vorne', 'screen', { title: 'A <b> & "c" \'d\'' });
    expect(svg).toContain('<title id="ze-t">A &#60;b&#62; &#38; &#34;c&#34; &#39;d&#39;</title>');
    expect(escapeXml('<&>"\'')).toBe('&#60;&#38;&#62;&#34;&#39;');
  });

  it('contains the title block with Firma · Möbel · Holz Oberfläche · Maße in cm · scale · date', () => {
    expect(render(REGAL, 'vorne')).toContain(
      'Schreinerei Schmidt · Regal · Eiche natur geölt · Maße in cm · o. M. · 09.10.2026',
    );
    const print = render(REGAL, 'vorne', 'print');
    expect(print).toContain('M 1:20');
    expect(print).toMatch(/width="\d+(\.\d)?mm" height="\d+(\.\d)?mm"/);
    expect(print).not.toContain('non-scaling-stroke');
    expect(render(REGAL, 'vorne', 'screen', { date: undefined })).toContain('· o. M.</text>');
  });

  it('draws parts with the species wash, hatch and tick defs, door symbols and dimension chains', () => {
    const svg = render(GOLDEN[3]![1], 'vorne');
    expect(svg).toContain('fill="#C9A97C" fill-opacity=".12"');
    expect(svg).toContain('<pattern id="ze-h"');
    expect(svg).toContain('<marker id="ze-k"');
    expect(svg).toContain('fill="url(#ze-h)"'); // niche walls hatched
    expect((svg.match(/class="ze__s"/g) ?? []).length).toBe(8); // one triangle per door
    expect(svg).toContain('class="ze__h"'); // shelves behind doors are dashed
    expect(svg).toContain('stroke-dasharray=');
    expect((svg.match(/marker-start=/g) ?? []).length).toBeGreaterThanOrEqual(8); // width, bays, height, pitches, sockel
    expect(svg).toContain('>240</text>');
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
    expect(svg).toContain('stroke="var(--ze-accent, currentColor)"');
  });

  it('door triangles point their apex to the hinge edge (Bandseite), away from the handle', () => {
    const b = generate({ ...REGAL, front: 'tueren', handle: 'holz' });
    const doors = b.parts.filter((p) => p.role === 'tuer');
    expect(doors).toHaveLength(2);
    const left = doors[0]!;
    const right = doors[1]!;
    expect(left.motion).toMatchObject({ kind: 'hinge', dir: 1 });
    expect(right.motion).toMatchObject({ kind: 'hinge', dir: -1 });
    const svg = renderElevation(b, { view: 'vorne', widthPx: 640, mode: 'screen', date: DATE });
    const tris = [...svg.matchAll(/class="ze__s" d="M([\d.-]+) [\d.-]+L([\d.-]+) [\d.-]+L([\d.-]+) /g)].map((m) =>
      m.slice(1, 4).map(Number),
    );
    expect(tris).toHaveLength(2);
    // Left door: hinge on its left edge → apex x = min.x; free corners at min.x + width.
    expect(tris[0]).toEqual([left.min[0] + left.size[0], left.min[0], left.min[0] + left.size[0]]);
    // Right door: hinge on its right edge → apex x = min.x + width.
    expect(tris[1]).toEqual([right.min[0], right.min[0] + right.size[0], right.min[0]]);
    const pivotX = (p: (typeof doors)[number]) => (p.motion?.kind === 'hinge' ? p.motion.pivot[0] : NaN);
    expect(tris[0]![1]).toBe(pivotX(left));
    expect(tris[1]![1]).toBe(pivotX(right));
  });

  it('table: live-edge outline in the plan, rect elsewhere', () => {
    expect(render(TISCH, 'oben')).toMatch(/<path d="M0 [\d.]+L[^"]*Z" fill="#6E4B36"/);
    expect(render(TISCH, 'vorne')).not.toMatch(/Z" fill=/);
    expect(render(TISCH, 'vorne')).toContain('>200</text>');
    expect(render(TISCH, 'seite')).toContain('>90</text>');
  });

  it('never emits NaN, inline styles or scripts; the viewBox and size are finite', () => {
    fc.assert(
      fc.property(
        fc.oneof(carcassArb, tableArb),
        viewArb,
        fc.constantFrom('screen', 'print' as const),
        fc.integer({ min: 200, max: 1200 }),
        (p, view, mode, widthPx) => {
          const svg = renderElevation(generate(p), { view, widthPx, mode, date: DATE });
          expect(svg).not.toMatch(/NaN|Infinity|undefined/);
          // Well-formed: every attribute value quoted, tags balanced.
          for (const tag of svg.match(/<[a-z][^>]*>/g) ?? []) expect((tag.match(/"/g) ?? []).length % 2).toBe(0);
          const opens = (svg.match(/<(svg|g|text|title|desc|defs|pattern|marker)[ >]/g) ?? []).length;
          const closes = (svg.match(/<\/(svg|g|text|title|desc|defs|pattern|marker)>/g) ?? []).length;
          expect(opens).toBe(closes);
          expect(svg).not.toMatch(/ style=|<script|<style/);
          expect(svg).toContain('<title id="ze-t">');
          expect(svg).toContain('<desc id="ze-d">');
          const vb = /viewBox="([^"]+)"/.exec(svg)![1]!.split(' ').map(Number);
          expect(vb).toHaveLength(4);
          expect(vb.every(Number.isFinite)).toBe(true);
          expect(vb[2]).toBeGreaterThan(0);
          expect(vb[3]).toBeGreaterThan(0);
          if (mode === 'screen') {
            expect(svg).toContain(`width="${widthPx}"`);
            expect(svg).toContain('font-size="');
          } else {
            const [w, h] = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg)!.slice(1).map(Number);
            expect(w).toBeLessThanOrEqual(277.1);
            expect(h).toBeLessThanOrEqual(190.1);
          }
          expect(svg.endsWith('</svg>')).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('keeps ids unique inside one drawing and distinct across prefixes', () => {
    const a = render(REGAL, 'vorne', 'screen', { idPrefix: 'a' });
    const b = render(REGAL, 'seite', 'screen', { idPrefix: 'b' });
    const ids = (s: string) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids(a)).size).toBe(ids(a).length);
    expect(ids(a).some((id) => ids(b).includes(id))).toBe(false);
  });
});
