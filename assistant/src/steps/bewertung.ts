// Step `bewertung` (docs/angebot.md §4.4, §6): Claude's assessment and the Angebot text, after
// `preis`. The status stays `eingegangen`; 7d sets `bewertet` once the TL;DR is out.
//
// 1. `bewerten` → Bewertung. Its rueckfragen may be mailed in 7d, so they pass the guards: on a
//    violation one corrective retry, then only the clean questions are kept.
// 2. A `mengen-noetig` case is priced from Claude's quantities with preiseMengen() (§4.4); an
//    invalid Mengen (MengenFehler) leaves it `mengen-noetig` with event `mengen_ungueltig`, missing
//    ones with `mengen_fehlen`.
// 3. Unless spam: `angebotstext` with the (possibly new) Kalkulation, through the guards (one
//    corrective retry, then the neutral template). The stored record says which path produced the
//    text: `ki`, `ki_retry` or `vorlage`.
// Without ANTHROPIC_API_KEY (dev, dry-run) or with the monthly budget used up, the step stores a
// BewertungRecord with `bewertung: null` (event `ki_deaktiviert` / `ki_budget`) and the template
// text, and completes, so 7d can still send a TL;DR "ohne KI-Bewertung".
//
// Resumable: the Bewertung (and the new Kalkulation) are stored before `angebotstext` runs, so a
// retry after a failed or interrupted second call does not pay for the first one again.
// Retryable API errors of the first call of each kind throw (the runner's backoff, then
// `bewertung_fehlgeschlagen`); permanent ones (4xx, refusal, max_tokens) fail `bewerten` at once
// and send `angebotstext` to the template. Events carry codes only.
import { MengenFehler, preiseMengen } from '../../../src/lib/configurator/pricing/mengen';
import { serviceArea } from '../../../src/lib/configurator/service-area';
import { klassifiziere, type ClaudeClient, type KiErgebnis } from '../claude/client';
import { pruefeAngebotstext, pruefeRueckfragen, saubereRueckfragen, type Verstoss } from '../claude/guards';
import { angebotstextInput, bewertenInput, kalkulationOf, typLabel, type FallKalkulation } from '../claude/input';
import { budgetErschoepft, verbuche } from '../claude/kosten';
import { toPricingMengen, type Angebotstext, type Bewertung } from '../claude/schemas';
import { vorlageAngebotstext } from '../claude/templates';
import { PermanentStepError, type StepContext, type StepDef } from '../jobs';
import type { Fall } from '../store';

export const BEWERTUNG = 'bewertung';

/** What the case stores in `faelle.bewertung` (7d reads it for the recommendation, §7.1). */
export interface BewertungRecord {
  v: 1;
  /** `ki`: Claude assessed the case; `ohne_ki`: no key or no budget (bewertung is null). */
  quelle: 'ki' | 'ohne_ki';
  grund: 'ki_deaktiviert' | 'ki_budget' | null;
  bewertung: Bewertung | null;
  /** How the rueckfragen passed the guards: as answered, after the retry, or filtered. */
  rueckfragen: 'ki' | 'ki_retry' | 'gefiltert' | null;
  /** §4.4: priced from Claude's quantities, missing, invalid, skipped (spam), or not needed. */
  mengen: 'nicht_noetig' | 'bepreist' | 'fehlen' | 'ungueltig' | 'uebersprungen';
  /** Model id of the answer used (a fallback model after a refusal), or null. */
  model: string | null;
  at: string;
}

/** What the case stores in `faelle.angebot`: the customer text and how it was produced. */
export interface AngebotRecord {
  v: 1;
  text: Angebotstext;
  pfad: 'ki' | 'ki_retry' | 'vorlage';
  /** Why the template: `verstoss`, `ki_deaktiviert`, `ki_budget` or the call's error code. */
  grund: string | null;
  /** Guard codes of the rejected answers (first and retry). */
  verstoesse: Verstoss[];
  model: string | null;
  at: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** Runs a Claude call and books its estimated cost, also for answers that fail (refusal, …). */
async function gemessen<T>(ctx: StepContext, f: () => Promise<KiErgebnis<T>>): Promise<KiErgebnis<T>> {
  try {
    const r = await f();
    await verbuche(ctx.store, r.usage, ctx.clock.now());
    return r;
  } catch (e) {
    const k = klassifiziere(e);
    if (k.usage) await verbuche(ctx.store, k.usage, ctx.clock.now());
    throw k;
  }
}

const budget = (ctx: StepContext): Promise<boolean> =>
  budgetErschoepft(ctx.store, ctx.config.claudeMonthlyLimitUsd, ctx.clock.now());

const event = (ctx: StepContext, kind: string, code: string | null = null): Promise<void> =>
  ctx.store.event(ctx.fall.id, kind, code, ctx.clock.now());

/** Phase 1: the assessment (or the no-AI marker) and the Mengen pricing, stored together. */
async function bewerten(ctx: StepContext, fall: Fall, claude: ClaudeClient | null): Promise<BewertungRecord> {
  const kalk = fall.kalkulation as FallKalkulation;
  const ohneKi = async (grund: 'ki_deaktiviert' | 'ki_budget'): Promise<BewertungRecord> => {
    const rec: BewertungRecord = {
      v: 1,
      quelle: 'ohne_ki',
      grund,
      bewertung: null,
      rueckfragen: null,
      mengen: kalk.kind === 'mengen-noetig' ? 'fehlen' : 'nicht_noetig',
      model: null,
      at: iso(ctx.clock.now()),
    };
    await ctx.store.update(fall.id, { bewertung: rec });
    await event(ctx, grund);
    return rec;
  };
  if (!claude) return ohneKi('ki_deaktiviert');
  if (await budget(ctx)) return ohneKi('ki_budget');

  const input = bewertenInput(fall, kalk);
  const r1 = await gemessen(ctx, () => claude.bewerten(input));
  let b = r1.output;
  let model = r1.model;
  let rueckfragen: BewertungRecord['rueckfragen'] = 'ki';
  const v1 = pruefeRueckfragen(b.rueckfragen);
  if (v1.length) {
    await event(ctx, 'rueckfragen_verstoss', v1.join(','));
    let r2: KiErgebnis<Bewertung> | null = null;
    if (await budget(ctx)) await event(ctx, 'ki_budget');
    else {
      try {
        r2 = await gemessen(ctx, () => claude.bewerten(input, { korrektur: v1 }));
      } catch (e) {
        await event(ctx, 'bewerten_retry_fehler', klassifiziere(e).code);
      }
    }
    if (r2 && !pruefeRueckfragen(r2.output.rueckfragen).length) {
      b = r2.output;
      model = r2.model;
      rueckfragen = 'ki_retry';
    } else {
      if (r2) {
        b = r2.output;
        model = r2.model;
      }
      b = { ...b, rueckfragen: saubereRueckfragen(b.rueckfragen) };
      rueckfragen = 'gefiltert';
    }
  }

  let neu: FallKalkulation = kalk;
  let mengen: BewertungRecord['mengen'] = 'nicht_noetig';
  if (kalk.kind === 'mengen-noetig') {
    if (b.spam) mengen = 'uebersprungen';
    else if (!b.mengen) {
      mengen = 'fehlen';
      await event(ctx, 'mengen_fehlen');
    } else {
      const plz = fall.payload.values['plz'];
      try {
        const k = preiseMengen(toPricingMengen(b.mengen), {
          tier: serviceArea(typeof plz === 'string' ? plz : '')?.tier ?? null,
        });
        neu = { kind: 'ki-mengen', kalkulation: k };
        mengen = 'bepreist';
        await event(ctx, 'preis_ki_mengen');
      } catch (e) {
        if (!(e instanceof MengenFehler)) throw e;
        mengen = 'ungueltig';
        await event(ctx, 'mengen_ungueltig');
      }
    }
  }

  const rec: BewertungRecord = {
    v: 1,
    quelle: 'ki',
    grund: null,
    bewertung: b,
    rueckfragen,
    mengen,
    model,
    at: iso(ctx.clock.now()),
  };
  await ctx.store.update(fall.id, { bewertung: rec, kalkulation: neu });
  await event(ctx, b.spam ? 'ki_spam' : 'ki_bewertet');
  return rec;
}

/** Phase 2: the Angebot text (Claude through the guards, or the template). */
async function angebot(ctx: StepContext, fall: Fall, rec: BewertungRecord, claude: ClaudeClient | null) {
  const k = kalkulationOf(fall.kalkulation);
  const save = async (a: Omit<AngebotRecord, 'v' | 'at'>): Promise<void> => {
    await ctx.store.update(fall.id, { angebot: { v: 1, ...a, at: iso(ctx.clock.now()) } satisfies AngebotRecord });
    await event(ctx, `angebot_${a.pfad}`, a.grund);
    ctx.log.info('angebot_text', { fall: fall.id, code: a.pfad });
  };
  const vorlage = (grund: string, verstoesse: Verstoss[] = [], model: string | null = null) =>
    save({
      text: vorlageAngebotstext(typLabel(fall.payload.values['typ']), k?.positionen),
      pfad: 'vorlage',
      grund,
      verstoesse,
      model,
    });

  if (!claude || rec.quelle === 'ohne_ki') return vorlage(rec.grund ?? 'ki_deaktiviert');
  if (await budget(ctx)) {
    await event(ctx, 'ki_budget');
    return vorlage('ki_budget');
  }
  const input = angebotstextInput(fall, fall.kalkulation, rec.bewertung);
  let r1: KiErgebnis<Angebotstext>;
  try {
    r1 = await gemessen(ctx, () => claude.angebotstext(input));
  } catch (e) {
    const f = klassifiziere(e);
    if (f.retryable) throw f;
    await event(ctx, 'angebotstext_fehler', f.code);
    return vorlage(f.code);
  }
  const v1 = pruefeAngebotstext(r1.output);
  if (!v1.length) return save({ text: r1.output, pfad: 'ki', grund: null, verstoesse: [], model: r1.model });

  await event(ctx, 'angebot_verstoss', v1.join(','));
  if (await budget(ctx)) {
    await event(ctx, 'ki_budget');
    return vorlage('ki_budget', v1, r1.model);
  }
  let r2: KiErgebnis<Angebotstext>;
  try {
    r2 = await gemessen(ctx, () => claude.angebotstext(input, { korrektur: v1 }));
  } catch (e) {
    await event(ctx, 'angebotstext_retry_fehler', klassifiziere(e).code);
    return vorlage('verstoss', v1, r1.model);
  }
  const v2 = pruefeAngebotstext(r2.output);
  if (!v2.length) return save({ text: r2.output, pfad: 'ki_retry', grund: null, verstoesse: v1, model: r2.model });
  await event(ctx, 'angebot_verstoss', v2.join(','));
  return vorlage('verstoss', [...new Set([...v1, ...v2])], r2.model);
}

export const bewertung: StepDef = {
  async run(ctx) {
    let fall = (await ctx.store.get(ctx.fall.id)) ?? ctx.fall;
    if (fall.kalkulation === null || fall.kalkulation === undefined) throw new PermanentStepError('keine_kalkulation');
    const claude = ctx.claude;
    let rec = fall.bewertung as BewertungRecord | null;
    if (!rec) {
      rec = await bewerten(ctx, fall, claude);
      fall = (await ctx.store.get(fall.id)) ?? fall;
    }
    if (fall.angebot !== null && fall.angebot !== undefined) return;
    if (rec.bewertung?.spam) return;
    await angebot(ctx, fall, rec, claude);
  },
};
