import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cspHash, filterPreselectScript } from '../../src/lib/inline-scripts.mjs';
import { FILTER_CHIPS, chipCounts, chipOf, dataCat, projectCountLabel } from '../../src/lib/referenzen-filter';

describe('chipOf / dataCat', () => {
  it('maps fenster and tueren to the shared chip', () => {
    expect(chipOf('fenster')).toBe('fenster-tueren');
    expect(chipOf('tueren')).toBe('fenster-tueren');
    expect(chipOf('moebel')).toBe('moebel');
  });

  it('de-duplicates chips in data-cat', () => {
    expect(dataCat(['fenster', 'tueren', 'altbau'])).toBe('fenster-tueren altbau');
    expect(dataCat(['boeden'])).toBe('boeden');
  });
});

describe('chipCounts', () => {
  it('counts per chip once per project and totals under "alle"', () => {
    const counts = chipCounts([
      { categories: ['moebel', 'tueren'] },
      { categories: ['fenster', 'tueren'] },
      { categories: ['altbau'] },
    ]);
    expect(counts).toEqual({ alle: 3, moebel: 1, 'fenster-tueren': 2, altbau: 1 });
  });

  it('only produces known chip values', () => {
    const known = new Set<string>(FILTER_CHIPS.map((c) => c.value));
    const counts = chipCounts([{ categories: ['moebel', 'fenster', 'terrassen'] }]);
    for (const key of Object.keys(counts)) expect(key === 'alle' || known.has(key)).toBe(true);
  });
});

describe('projectCountLabel', () => {
  it('uses the singular for one project', () => {
    expect(projectCountLabel(1)).toBe('1 Projekt');
    expect(projectCountLabel(0)).toBe('0 Projekte');
    expect(projectCountLabel(15)).toBe('15 Projekte');
  });
});

describe('filterPreselectScript', () => {
  const radio = { checked: false };
  const run = (search: string, known: string[]) => {
    radio.checked = false;
    const doc = {
      querySelector: (sel: string) => (known.some((k) => sel.includes(`[value="${k}"]`)) ? radio : null),
    };
    new Function('location', 'document', 'CSS', filterPreselectScript)({ search }, doc, { escape: (s: string) => s });
  };

  it('is a single-line IIFE', () => {
    expect(filterPreselectScript).not.toMatch(/[\r\n]/);
    expect(() => new Function(filterPreselectScript)).not.toThrow();
  });

  it('checks the radio named by ?kategorie=', () => {
    run('?kategorie=boeden', ['boeden']);
    expect(radio.checked).toBe(true);
  });

  it('ignores unknown values and a missing parameter', () => {
    run('?kategorie=nope', ['boeden']);
    expect(radio.checked).toBe(false);
    run('', ['boeden']);
    expect(radio.checked).toBe(false);
  });
});

describe('CSP config', () => {
  it('astro.config.mjs hashes the filter preselect script', () => {
    const config = readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8');
    expect(config).toMatch(/scriptDirective:[\s\S]*cspHash\(filterPreselectScript\)/);
    expect(cspHash(filterPreselectScript)).toMatch(/^sha256-/);
  });
});
