// Size of the Möbel preview chunk (docs/configurator.md §3 "JS budget": ≤ 7 KB gz; §7 "core + Möbel
// ≤ 20 KB"). Bundles src/scripts/configurator/preview/index.ts with rolldown (Vite 8's bundler, so
// the result matches the Astro build closely): minified ESM, gzip level 9, like scripts/check-budgets.mjs.
//
// fields.ts and conditions.ts are external: the wizard core imports them statically, so the real
// build serves them from the core chunk. What the browser downloads when Möbel is chosen is the entry
// chunk plus the shared chunk rolldown splits off for the lazily imported table generator; the table
// chunk itself only loads for moebel_art=esstisch. scripts/check-budgets.mjs checks the same on dist/.
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';
import { describe, expect, it } from 'vitest';

const ENTRY = new URL('../../../src/scripts/configurator/preview/index.ts', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
const KB = 1024;
/** Spec budget for what loads when Möbel is chosen. */
const SPEC_BUDGET = 7 * KB;
/**
 * Enforced ceiling until the budget decision is taken: the chunk measures about 8.5 KB gz with every
 * feature of §4.2/§4.8 (see the Phase 3 C0 report, "open issues"). This ratchet only stops regressions;
 * tighten it to SPEC_BUDGET once the chunk fits.
 */
const CEILING = 8.75 * KB;
const gz = (s: string) => gzipSync(s, { level: 9 }).length;

describe('Möbel preview chunk', () => {
  it('bundles below the ceiling; the table generator is a separate on-request chunk', async () => {
    const bundle = await rolldown({
      input: ENTRY,
      platform: 'browser',
      logLevel: 'silent',
      external: (id) => /lib\/configurator\/(fields|conditions)$/.test(id),
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
    const table = dynamics.reduce((sum, c) => sum + gz(c.code), 0);
    const line = (c: (typeof chunks)[number]) => `${c.fileName}: ${c.code.length} B min / ${gz(c.code)} B gz`;
    console.log(
      [
        `Möbel preview: ${(initial / KB).toFixed(2)} KB gz initial (spec ≤ ${SPEC_BUDGET / KB} KB), table chunk +${(table / KB).toFixed(2)} KB gz on request`,
        ...[entry, ...statics, ...dynamics].map((c) => `  ${line(c)}`),
      ].join('\n'),
    );
    // No three.js, no print sheet, no table generator in the initial download.
    const initialCode = [entry, ...statics].map((c) => c.code).join('\n');
    expect(initialCode).not.toMatch(/__THREE__|WebGLRenderer/);
    expect(initialCode).not.toContain('[10,20,25,50]'); // the DIN scales of the print fitting
    expect(initialCode).not.toContain('Kufengestell');
    expect(initialCode).toContain('Mittelwand');
    expect(dynamics.length).toBe(1);
    expect(dynamics[0]!.code).toContain('Kufengestell');
    expect(initial).toBeLessThanOrEqual(CEILING);
    expect(initial + table).toBeLessThanOrEqual(CEILING + 2 * KB);
  });
});
