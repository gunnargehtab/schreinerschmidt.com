// The eval fixtures (docs/angebot.md §11) are valid enquiries, and the eval harness works against
// the fake client (the same run as `npm run eval -- --dry`).
import { describe, expect, it } from 'vitest';
import { FIELDS } from '../../src/lib/configurator/fields';
import { FAELLE } from '../eval/fixtures/faelle';
import { dryClient, evaluiere } from '../eval/lauf';
import { validateConfigurator } from '../src/validate';

describe('eval fixtures', () => {
  it('has 24 cases, three per branch (clear, borderline, unviable), with injections and spam', () => {
    expect(FAELLE).toHaveLength(24);
    const typen = new Map<string, string[]>();
    for (const f of FAELLE) typen.set(String(f.values['typ']), [...(typen.get(String(f.values['typ'])) ?? []), f.art]);
    expect([...typen.keys()].sort()).toEqual(
      ['altbau', 'boden', 'fenster', 'moebel', 'sonstiges', 'terrasse', 'treppe', 'tuer'].sort(),
    );
    for (const arten of typen.values()) expect(arten.sort()).toEqual(['grenzfall', 'klar', 'unpassend']);
    expect(FAELLE.filter((f) => f.injection).length).toBeGreaterThanOrEqual(3);
    expect(FAELLE.some((f) => f.erwartet.spam && !f.injection)).toBe(true);
    expect(new Set(FAELLE.map((f) => f.id)).size).toBe(24);
  });

  it('carries an expected recommendation; unviable cases never expect „Freigeben“', () => {
    for (const f of FAELLE) {
      expect(['absagen', 'pruefen', 'freigeben']).toContain(f.erwartet.empfehlung);
      if (f.art === 'unpassend') expect(f.erwartet.empfehlung).toBe('absagen');
      if (f.erwartet.spam) expect(f.erwartet.empfehlung).toBe('absagen');
      expect(f.titel.length).toBeGreaterThan(5);
    }
  });

  it('has clearly invented customers (placeholder names, example.com, 0000 numbers)', () => {
    for (const f of FAELLE) {
      expect(String(f.values['name'])).toMatch(/Muster|Beispiel|Probe|Normalverbraucher/);
      expect(String(f.values['email'])).toMatch(/@example\.com$/);
      expect(String(f.values['telefon'])).toMatch(/^0000 /);
    }
  });

  it.each(FAELLE.map((f) => [f.id, f] as const))('%s passes the server validation unchanged', (_, f) => {
    const fields = new Map<string, string[]>();
    for (const [k, v] of Object.entries(f.values)) if (v !== undefined) fields.set(k, Array.isArray(v) ? v : [v]);
    const r = validateConfigurator(fields);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    for (const k of Object.keys(f.values)) {
      expect(FIELDS[k], k).toBeDefined();
      expect(r.value.values[k], `${f.id}: ${k} dropped`).toEqual(f.values[k]);
    }
  });
});

describe('eval harness (dry)', () => {
  it('runs every fixture through preis and bewertung and reports the guard paths', async () => {
    const r = await evaluiere(dryClient, FAELLE, { now: Date.UTC(2026, 9, 22) });
    expect(r.faelle).toHaveLength(24);
    expect(r.faelle.every((f) => !f.fehler && f.gespeichertSauber)).toBe(true);
    expect(r.erwartungTreffer).toBe(24);
    const byId = new Map(r.faelle.map((f) => [f.id, f]));
    expect(byId.get('terrasse-grenzfall')).toMatchObject({ pfad: 'ki_retry', betragImText: true, ok: false });
    expect(byId.get('fenster-grenzfall')).toMatchObject({ pfad: 'vorlage', betragImText: true });
    expect(byId.get('moebel-injection')).toMatchObject({ spam: true, pfad: null });
    expect(byId.get('moebel-klar')).toMatchObject({ pfad: 'ki', ok: true });
    expect(r.angebote).toBe(20);
    expect(r.usd).toBeGreaterThan(0);
  });
});
