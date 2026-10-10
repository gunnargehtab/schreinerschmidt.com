// Size of the Möbel preview chunk (docs/configurator.md §3 "JS budget": ≤ 8.75 KB gz; §7 "core + Möbel
// ≤ 20 KB"). Bundles src/scripts/configurator/preview/index.ts with rolldown (Vite 8's bundler, so
// the result matches the Astro build closely): minified ESM, gzip level 9, like scripts/check-budgets.mjs.
//
// fields.ts and conditions.ts are external: the wizard core imports them statically, so the real
// build serves them from the core chunk. drawing/elevation.ts (the print fitting printSheet()
// import()s on request) is external too: in the real build its chunk imports the SVG core from the
// preview chunk, whereas a standalone bundle would split the SVG core into a chunk of its own.
// What the browser downloads when Möbel is chosen is the entry chunk plus the shared chunk rolldown
// splits off for the lazily imported table generator; the table chunk itself only loads for
// moebel_art=esstisch, and the 3D loader (preview/load3d.ts, ≤ 1.5 KB gz) on the poster click or
// the desktop auto-load gate; its viewer chunk (three.js) is external here, like in
// tests/unit/configurator/viewer3d. scripts/check-budgets.mjs checks the same on dist/.
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { describe, expect, it } from 'vitest';

const ENTRY = new URL('../../../src/scripts/configurator/preview/index.ts', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
const KB = 1024;
/** Budget for what loads when Möbel is chosen (re-split from 7 KB on 2026-10-10; core + preview ≤ 20 KB). */
const CEILING = 8.75 * KB;
const gz = (s: string) => gzipSync(s, { level: 9 }).length;

describe('Möbel preview chunk', () => {
  it('bundles below the ceiling; the table generator is a separate on-request chunk', async () => {
    const bundle = await rolldown({
      input: ENTRY,
      platform: 'browser',
      logLevel: 'silent',
      external: (id) => /lib\/configurator\/(fields|conditions|drawing\/elevation)$|viewer3d\/index$/.test(id),
    });
    const { output } = await bundle.generate({ format: 'esm', minify: true, codeSplitting: true });
    await bundle.close();
    const chunks = output.filter((c) => c.type === 'chunk');
    const entry = chunks.find((c) => c.isEntry)!;
    expect(entry).toBeDefined();
    const byName = Object.fromEntries(chunks.map((c) => [c.fileName, c]));
    const statics = entry.imports.filter((f) => byName[f]).map((f) => byName[f]!);
    const dynamics = entry.dynamicImports.map((f) => byName[f]!).filter(Boolean);
    const initial = gz(entry.code) + statics.reduce((sum, c) => sum + gz(c.code), 0);
    const tableChunk = dynamics.find((c) => c.code.includes('Kufengestell'))!;
    const loader = dynamics.find((c) => c !== tableChunk)!;
    const table = gz(tableChunk.code);
    const line = (c: (typeof chunks)[number]) => `${c.fileName}: ${c.code.length} B min / ${gz(c.code)} B gz`;
    console.log(
      [
        `Möbel preview: ${(initial / KB).toFixed(2)} KB gz initial (budget ≤ ${CEILING / KB} KB), table chunk +${(table / KB).toFixed(2)} KB gz on request, 3D loader +${(gz(loader.code) / KB).toFixed(2)} KB gz`,
        ...[entry, ...statics, ...dynamics].map((c) => `  ${line(c)}`),
      ].join('\n'),
    );
    // No three.js, no print sheet, no table generator in the initial download.
    const initialCode = [entry, ...statics].map((c) => c.code).join('\n');
    expect(initialCode).not.toMatch(/__THREE__|WebGLRenderer/);
    expect(initialCode).not.toContain('[10,20,25,50]'); // the DIN scales of the print fitting
    expect(initialCode).not.toContain('Kufengestell');
    expect(initialCode).toContain('Mittelwand');
    expect(dynamics.length).toBe(2);
    expect(loader.code).toContain('webgl2');
    expect(loader.code).not.toMatch(/__THREE__|WebGLRenderer/);
    expect(gz(loader.code)).toBeLessThanOrEqual(1.5 * KB);
    expect(initial).toBeLessThanOrEqual(CEILING);
    expect(initial + table).toBeLessThanOrEqual(CEILING + 2 * KB);
  });
});
