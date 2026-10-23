// The recorded Claude answers of eval/fixtures/aufnahmen.ts (phase 7f): one per fixture, every one
// valid under the zod schemas of the structured output, clean under the output guards except the
// deliberate slips (which are never amounts), consistent with the fixture (spam, Mengen only where
// the branch needs them), and together they meet the §11 bar of the recorded eval.
import { describe, expect, it } from 'vitest';
import { kalkulieren } from '../../src/lib/configurator/pricing/kalkulieren';
import { preiseMengen } from '../../src/lib/configurator/pricing/mengen';
import { AufnahmeClaude } from '../src/claude/fake';
import { pruefeAngebotstext, pruefeRueckfragen, pruefeText } from '../src/claude/guards';
import { Angebotstext, Bewertung, toPricingMengen } from '../src/claude/schemas';
import { AUFNAHMEN } from '../eval/fixtures/aufnahmen';
import { FAELLE } from '../eval/fixtures/faelle';
import { BAR_TREFFER, aufnahmeClient, evaluiere } from '../eval/lauf';

/** The deliberate guard slips: fixture → [first answer's codes, retry's codes]. */
const ABSICHTLICH = {
  'tuer-grenzfall': { bewerten: [['frist'], []] },
  'terrasse-grenzfall': { angebotstext: [['gruen'], []] },
  'fenster-grenzfall': { angebotstext: [['frist'], ['gruen']] },
} as const;

const mengenNoetig = (id: string): boolean => {
  const f = FAELLE.find((x) => x.id === id)!;
  return kalkulieren(f.values, { tier: 'kern' }).kind === 'mengen-noetig';
};

describe('recorded answers', () => {
  it('exist for exactly the 24 fixtures', () => {
    expect(Object.keys(AUFNAHMEN).sort()).toEqual(FAELLE.map((f) => f.id).sort());
  });

  it.each(FAELLE.map((f) => [f.id, f] as const))('%s: valid under the zod schemas', (id, f) => {
    const a = AUFNAHMEN[id]!;
    expect(a.bewerten.length).toBeGreaterThan(0);
    for (const b of a.bewerten) {
      const r = Bewertung.safeParse(b);
      expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
      expect(b.spam).toBe(f.erwartet.spam);
      // Mengen only for the §4.4 branches, and never for spam.
      if (!mengenNoetig(id) || b.spam) expect(b.mengen).toBeNull();
      if (b.mengen) expect(() => preiseMengen(toPricingMengen(b.mengen!), { tier: 'kern' })).not.toThrow();
    }
    // Spam gets no Angebot text (the step never asks); everything else has one.
    expect(a.angebotstext.length > 0).toBe(!f.erwartet.spam);
    for (const t of a.angebotstext) {
      const r = Angebotstext.safeParse(t);
      expect(r.success, JSON.stringify(!r.success && r.error.issues)).toBe(true);
    }
  });

  it('pass the guards, except the deliberate slips, which are no amounts', () => {
    let slips = 0;
    for (const f of FAELLE) {
      const a = AUFNAHMEN[f.id]!;
      const soll = ABSICHTLICH[f.id as keyof typeof ABSICHTLICH] as
        { bewerten?: readonly (readonly string[])[]; angebotstext?: readonly (readonly string[])[] } | undefined;
      a.bewerten.forEach((b, i) => {
        const v = pruefeRueckfragen(b.rueckfragen);
        expect(v, `${f.id} bewerten ${i}`).toEqual(soll?.bewerten?.[i] ?? []);
        // Owner-only lines too: no URL, address or phone number of anyone.
        for (const x of [...b.gruende, ...b.risiken, ...b.fehlende_angaben]) {
          expect(
            pruefeText(x).filter((c) => c === 'url' || c === 'email' || c === 'telefon' || c === 'betrag'),
          ).toEqual([]);
        }
      });
      a.angebotstext.forEach((t, i) => {
        const v = pruefeAngebotstext(t);
        expect(v, `${f.id} angebotstext ${i}`).toEqual(soll?.angebotstext?.[i] ?? []);
      });
      for (const v of [
        ...a.bewerten.map((b) => pruefeRueckfragen(b.rueckfragen)),
        ...a.angebotstext.map(pruefeAngebotstext),
      ]) {
        if (v.length) slips++;
        expect(v).not.toContain('betrag');
        expect(v).not.toContain('prozent');
      }
    }
    expect(slips).toBeGreaterThanOrEqual(2);
  });

  it('the client serves them in call order and repeats the last one', async () => {
    const c = new AufnahmeClaude(() => AUFNAHMEN['terrasse-grenzfall']);
    const input = {
      fall: 'x',
      typ: 'terrasse',
      typLabel: 'Terrasse',
      mengenNoetig: false,
      anfrage: '',
      kalkulation: '',
      bewertung: '',
    };
    const a = await c.angebotstext(input);
    const b = await c.angebotstext(input, { korrektur: ['gruen'] });
    const d = await c.angebotstext(input);
    expect(pruefeAngebotstext(a.output)).toEqual(['gruen']);
    expect(pruefeAngebotstext(b.output)).toEqual([]);
    expect(d.output).toEqual(b.output);
    expect(a.usage).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    await expect(new AufnahmeClaude(() => null).bewerten(input)).rejects.toMatchObject({
      code: 'ki_keine_aufnahme',
      permanent: true,
    });
  });

  it('the recorded eval meets the §11 bar and takes the scripted guard paths', async () => {
    const r = await evaluiere(aufnahmeClient, FAELLE, { now: Date.UTC(2026, 9, 22) });
    expect(r.faelle.every((f) => !f.fehler && f.gespeichertSauber)).toBe(true);
    expect(r.empfehlungTreffer).toBeGreaterThanOrEqual(BAR_TREFFER);
    expect(r.empfehlungTreffer).toBe(24);
    expect(r.erwartungTreffer).toBe(24);
    expect(r.unpassendFreigegeben).toBe(0);
    expect(r.ohneBetrag).toBe(24);
    const byId = new Map(r.faelle.map((f) => [f.id, f]));
    expect(byId.get('terrasse-grenzfall')?.pfad).toBe('ki_retry');
    expect(byId.get('fenster-grenzfall')?.pfad).toBe('vorlage');
    expect(byId.get('moebel-klar')?.pfad).toBe('ki');
    for (const id of ['moebel-injection', 'treppe-injection', 'altbau-injection', 'tuer-spam']) {
      expect(byId.get(id)).toMatchObject({ spam: true, pfad: null, empfehlung: 'absagen' });
    }
    expect(r.usd).toBe(0);
  });
});
