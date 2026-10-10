// Visibility conditions and the generated `:has()` stylesheet (docs/configurator.md §1, §2 point 3).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  FORM_ID,
  OPTION_WHEN,
  PROJECT_TYPES,
  activeConditions,
  conditionsCss,
  holds,
  visible,
} from '../../../src/lib/configurator/conditions';
import { FIELDS, type Values } from '../../../src/lib/configurator/fields';
import { GET } from '../../../src/pages/konfigurator/bedingungen.css';

const ids = CONDITIONS.map((c) => c.id);

describe('CONDITIONS', () => {
  it('lists the 8 project types in spec order', () => {
    expect(PROJECT_TYPES).toEqual(['moebel', 'boden', 'treppe', 'fenster', 'tuer', 'terrasse', 'altbau', 'sonstiges']);
    expect(FIELDS['typ']?.values).toEqual(PROJECT_TYPES);
  });

  it('has unique, kebab-case ids', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it.each(CONDITIONS)('$id refers to an enum field and a subset of its values', (c) => {
    const f = FIELDS[c.field];
    expect(f?.kind).toBe('enum');
    expect(c.values.length).toBeGreaterThan(0);
    for (const v of c.values) expect(f?.values).toContain(v);
  });

  it('is referenced by every `when` in the registry, and every condition is used', () => {
    const used = new Set<string>();
    for (const [name, f] of Object.entries(FIELDS)) {
      if (!f.when) continue;
      expect(ids, `${name}.when`).toContain(f.when);
      used.add(f.when);
    }
    for (const field of Object.values(OPTION_WHEN)) for (const id of Object.values(field)) used.add(id);
    for (const id of ids) expect(used, `condition ${id} is unused`).toContain(id);
  });

  it('spec conditions: boden_art when neu, boden_zugang when dielen, boden_zustand when aufarbeiten|reparatur, treppe_geschosshoehe when neu', () => {
    const byId = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));
    expect(byId[FIELDS['boden_art']!.when!]).toMatchObject({ field: 'boden_leistung', values: ['neu'] });
    expect(byId[FIELDS['boden_zugang']!.when!]).toMatchObject({ field: 'boden_art', values: ['dielen'] });
    expect(byId[FIELDS['boden_zustand']!.when!]).toMatchObject({
      field: 'boden_leistung',
      values: ['aufarbeiten', 'reparatur'],
    });
    expect(byId[FIELDS['treppe_geschosshoehe']!.when!]).toMatchObject({ field: 'treppe_leistung', values: ['neu'] });
    expect(byId[FIELDS['rolllaeden_antrieb']!.when!]).toMatchObject({
      field: 'fenster_leistung',
      values: ['rolllaeden'],
    });
    expect(byId[FIELDS['fensterbaenke_ort']!.when!]).toMatchObject({
      field: 'fenster_leistung',
      values: ['fensterbaenke'],
    });
    expect(byId[FIELDS['moebel_rueckwand']!.when!]).toMatchObject({ field: 'moebel_art', values: ['regal'] });
    expect(byId[FIELDS['moebel_dachschraege']!.when!]).toMatchObject({
      field: 'moebel_art',
      values: ['einbauschrank'],
    });
    expect(byId[FIELDS['moebel_beschreibung']!.when!]).toMatchObject({ field: 'moebel_art', values: ['andere'] });
  });

  it('OPTION_WHEN points at real options and conditions', () => {
    for (const [field, map] of Object.entries(OPTION_WHEN)) {
      for (const [value, id] of Object.entries(map)) {
        expect(FIELDS[field]?.values).toContain(value);
        expect(ids).toContain(id);
      }
    }
  });
});

describe('holds / visible / activeConditions', () => {
  const dielen = CONDITIONS.find((c) => c.id === 'boden-dielen')!;
  const rolllaeden = CONDITIONS.find((c) => c.id === 'fenster-rolllaeden')!;

  it('holds for a radio value, a checkbox list and not for undefined', () => {
    expect(holds(dielen, { boden_art: 'dielen' })).toBe(true);
    expect(holds(dielen, { boden_art: 'kork' })).toBe(false);
    expect(holds(dielen, {})).toBe(false);
    expect(holds(rolllaeden, { fenster_leistung: ['neu', 'rolllaeden'] })).toBe(true);
    expect(holds(rolllaeden, { fenster_leistung: [] })).toBe(false);
  });

  it('visible follows the branch and the condition chain', () => {
    expect(visible('plz', {})).toBe(true);
    expect(visible('boden_flaeche', { typ: 'boden' })).toBe(true);
    expect(visible('boden_flaeche', { typ: 'moebel' })).toBe(false);
    expect(visible('boden_art', { typ: 'boden', boden_leistung: 'neu' })).toBe(true);
    expect(visible('boden_art', { typ: 'boden', boden_leistung: 'reparatur' })).toBe(false);
    // Stale boden_art=dielen does not reveal boden_zugang while the floor is not new.
    expect(visible('boden_zugang', { typ: 'boden', boden_leistung: 'reparatur', boden_art: 'dielen' })).toBe(false);
    expect(visible('boden_zugang', { typ: 'boden', boden_leistung: 'neu', boden_art: 'dielen' })).toBe(true);
    expect(visible('nope', { typ: 'boden' })).toBe(false);
  });

  it('shows carcass, table and bed fields per moebel_art', () => {
    const v = (moebel_art: string): Values => ({ typ: 'moebel', moebel_art });
    expect(visible('moebel_breite', v('regal'))).toBe(true);
    expect(visible('moebel_rueckwand', v('regal'))).toBe(true);
    expect(visible('moebel_front', v('regal'))).toBe(false);
    expect(visible('moebel_front', v('sideboard'))).toBe(true);
    expect(visible('moebel_dachschraege', v('einbauschrank'))).toBe(true);
    expect(visible('tisch_kante', v('esstisch'))).toBe(true);
    expect(visible('moebel_breite', v('esstisch'))).toBe(false);
    expect(visible('bett_liegeflaeche', v('bett'))).toBe(true);
    expect(visible('moebel_beschreibung', v('andere'))).toBe(true);
    expect(visible('moebel_holz', v('andere'))).toBe(true);
  });

  it('activeConditions lists exactly the holding ids', () => {
    expect(activeConditions({ moebel_art: 'sideboard' })).toEqual([
      'moebel-korpus',
      'moebel-fronten',
      'moebel-sideboard',
      'moebel-regal-sideboard',
    ]);
    expect(activeConditions({})).toEqual([]);
  });
});

describe('conditionsCss', () => {
  const css = conditionsCss();
  const lines = css.split('\n');

  it('emits one rule per project type and per condition, scoped to #anfrage', () => {
    expect(FORM_ID).toBe('anfrage');
    expect(lines).toHaveLength(PROJECT_TYPES.length + CONDITIONS.length);
    for (const line of lines)
      expect(line).toMatch(/^#anfrage:not\(:has\([^)]+\)\) \[data-(branch|when)="[a-z-]+"\]\{display:none\}$/);
  });

  it('matches the spec rule shape', () => {
    expect(lines[1]).toBe(
      '#anfrage:not(:has([name="typ"][value="boden"]:checked)) [data-branch="boden"]{display:none}',
    );
    expect(css).toContain(
      '#anfrage:not(:has([name="boden_leistung"][value="aufarbeiten"]:checked,[name="boden_leistung"][value="reparatur"]:checked)) [data-when="boden-bestand"]{display:none}',
    );
  });

  it('takes the form id as a parameter', () => {
    expect(conditionsCss('wizard').startsWith('#wizard:not(')).toBe(true);
    expect(conditionsCss('wizard')).not.toContain('#anfrage');
  });

  it('every data-when in the stylesheet is a known condition', () => {
    for (const [, id] of css.matchAll(/data-when="([^"]+)"/g)) expect(ids).toContain(id);
  });

  it('hides exactly the conditions that do not hold (simulated :has())', () => {
    const rules = CONDITIONS.map((c) => ({
      id: c.id,
      selectors: [
        ...lines[PROJECT_TYPES.length + CONDITIONS.indexOf(c)]!.matchAll(/\[name="([^"]+)"\]\[value="([^"]+)"\]/g),
      ].map((m) => [m[1]!, m[2]!] as const),
    }));
    const value = fc.oneof(
      fc.constant(undefined),
      fc.string({ maxLength: 12 }),
      fc.array(fc.string({ maxLength: 12 })),
    );
    const fields = [...new Set(CONDITIONS.map((c) => c.field))];
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...fields), value), (v) => {
        const active = new Set(activeConditions(v as Values));
        for (const r of rules) {
          const checked = r.selectors.some(([name, val]) => {
            const x = v[name];
            return Array.isArray(x) ? x.includes(val) : x === val;
          });
          expect(checked).toBe(active.has(r.id));
        }
      }),
    );
  });
});

describe('bedingungen.css endpoint', () => {
  it('serves the generated stylesheet as text/css', async () => {
    const res = await GET({} as never);
    expect(res.headers.get('Content-Type')).toBe('text/css; charset=utf-8');
    expect(await res.text()).toBe(conditionsCss('anfrage'));
  });
});
