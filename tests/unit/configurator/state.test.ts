// Reducer transitions (docs/configurator.md §3 "State", §7 "Controller").
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MSG } from '../../../src/scripts/configurator/messages.de';
import {
  initialUi,
  reduce,
  type Action,
  type Context,
  type Effect,
  type FieldError,
  type StepId,
  type WizardUi,
} from '../../../src/scripts/configurator/state';

const STEPS: StepId[] = ['projekt', 'details', 'ausfuehrung', 'rahmen', 'kontakt', 'pruefen'];
const err = (name: string): FieldError => ({ name, message: `Fehler ${name}` });

/** A context whose listed steps are invalid. */
const ctx = (invalid: Partial<Record<StepId, FieldError[]>> = {}, extra: Partial<Context> = {}): Context => ({
  steps: STEPS,
  validate: (s) => invalid[s] ?? [],
  ...extra,
});

const ui = (step: StepId, patch: Partial<WizardUi> = {}): WizardUi => ({ ...initialUi(step), ...patch });
const kinds = (fx: Effect[]) => fx.map((e) => e.e);

describe('initialUi', () => {
  it('starts at projekt, editing, furthest = step index', () => {
    expect(initialUi()).toEqual({ step: 'projekt', furthest: 0, phase: 'editing', errors: [] });
    expect(initialUi('rahmen').furthest).toBe(3);
  });
});

describe('NEXT', () => {
  it('moves forward with show, push, heading focus and persist', () => {
    const [s, fx] = reduce(ui('projekt'), { t: 'NEXT' }, ctx());
    expect(s).toMatchObject({ step: 'details', furthest: 1, errors: [] });
    expect(fx).toEqual([
      { e: 'show', step: 'details', dir: 'fwd' },
      { e: 'history', mode: 'push' },
      { e: 'focus', target: 'heading' },
      { e: 'persist' },
    ]);
  });

  it('keeps furthest when stepping forward below it', () => {
    const [s] = reduce(ui('details', { furthest: 4 }), { t: 'NEXT' }, ctx());
    expect(s.furthest).toBe(4);
  });

  it('stays and reports errors when the step is invalid', () => {
    const list = [err('plz')];
    const [s, fx] = reduce(ui('rahmen'), { t: 'NEXT' }, ctx({ rahmen: list }));
    expect(s).toMatchObject({ step: 'rahmen', errors: list });
    expect(fx).toEqual([
      { e: 'errors', list },
      { e: 'focus', target: 'errors' },
    ]);
  });

  it('is a no-op on the last step and while busy', () => {
    expect(reduce(ui('pruefen'), { t: 'NEXT' }, ctx())).toEqual([ui('pruefen'), []]);
    const busy = ui('details', { phase: 'submitting' });
    expect(reduce(busy, { t: 'NEXT' }, ctx())).toEqual([busy, []]);
    const done = ui('details', { phase: 'done' });
    expect(reduce(done, { t: 'NEXT' }, ctx())).toEqual([done, []]);
  });
});

describe('BACK', () => {
  it('asks for history.back() when the previous entry is ours', () => {
    const [s, fx] = reduce(ui('details'), { t: 'BACK' }, ctx({}, { ownHistory: true }));
    expect(s.step).toBe('details');
    expect(fx).toEqual([{ e: 'history', mode: 'back' }]);
  });

  it('otherwise steps back and replaces the entry', () => {
    const [s, fx] = reduce(ui('ausfuehrung', { errors: [err('x')] }), { t: 'BACK' }, ctx());
    expect(s).toMatchObject({ step: 'details', errors: [] });
    expect(fx).toEqual([
      { e: 'show', step: 'details', dir: 'back' },
      { e: 'history', mode: 'replace' },
      { e: 'focus', target: 'heading' },
      { e: 'persist' },
    ]);
  });

  it('is a no-op on the first step', () => {
    expect(reduce(ui('projekt'), { t: 'BACK' }, ctx({}, { ownHistory: true }))).toEqual([ui('projekt'), []]);
  });
});

describe('GOTO', () => {
  it('jumps back via ui with a push, via history without a history effect', () => {
    const [, fx] = reduce(ui('rahmen'), { t: 'GOTO', step: 'details', via: 'summary' }, ctx());
    expect(kinds(fx)).toEqual(['show', 'history', 'focus', 'persist']);
    const [s, fx2] = reduce(ui('rahmen'), { t: 'GOTO', step: 'details', via: 'history' }, ctx());
    expect(s.step).toBe('details');
    expect(kinds(fx2)).toEqual(['show', 'focus', 'persist']);
  });

  it('jumps forward when every step in between is valid', () => {
    const [s, fx] = reduce(ui('projekt'), { t: 'GOTO', step: 'rahmen', via: 'ui' }, ctx());
    expect(s).toMatchObject({ step: 'rahmen', furthest: 3 });
    expect(fx[0]).toEqual({ e: 'show', step: 'rahmen', dir: 'fwd' });
    expect(fx[1]).toEqual({ e: 'history', mode: 'push' });
  });

  it('clamps a forward jump to the first invalid step and shows its errors', () => {
    const list = [err('moebel_art')];
    const [s, fx] = reduce(ui('projekt'), { t: 'GOTO', step: 'kontakt', via: 'summary' }, ctx({ details: list }));
    expect(s).toMatchObject({ step: 'details', furthest: 1, errors: list });
    expect(fx).toEqual([
      { e: 'show', step: 'details', dir: 'fwd' },
      { e: 'history', mode: 'push' },
      { e: 'errors', list },
      { e: 'focus', target: 'errors' },
      { e: 'persist' },
    ]);
  });

  it('reports errors in place when the current step blocks the jump', () => {
    const list = [err('typ')];
    const [s, fx] = reduce(ui('projekt'), { t: 'GOTO', step: 'details', via: 'ui' }, ctx({ projekt: list }));
    expect(s).toMatchObject({ step: 'projekt', errors: list });
    expect(kinds(fx)).toEqual(['errors', 'focus']);
    const [, fx2] = reduce(ui('projekt'), { t: 'GOTO', step: 'details', via: 'history' }, ctx({ projekt: list }));
    expect(fx2[0]).toEqual({ e: 'history', mode: 'replace' });
  });

  it('replaces the history entry when a history move was clamped', () => {
    const [s, fx] = reduce(
      ui('projekt'),
      { t: 'GOTO', step: 'kontakt', via: 'history' },
      ctx({ ausfuehrung: [err('a')] }),
    );
    expect(s.step).toBe('ausfuehrung');
    expect(fx[1]).toEqual({ e: 'history', mode: 'replace' });
  });

  it('ignores the current step, unknown steps and busy phases', () => {
    expect(reduce(ui('details'), { t: 'GOTO', step: 'details', via: 'ui' }, ctx())).toEqual([ui('details'), []]);
    expect(reduce(ui('details'), { t: 'GOTO', step: 'nope' as StepId, via: 'ui' }, ctx())).toEqual([ui('details'), []]);
    const busy = ui('details', { phase: 'submitting' });
    expect(reduce(busy, { t: 'GOTO', step: 'projekt', via: 'ui' }, ctx())).toEqual([busy, []]);
  });
});

describe('TYPE', () => {
  it('announces that the other branch keeps its values, and persists', () => {
    const [s, fx] = reduce(
      ui('projekt', { errors: [err('typ')] }),
      { t: 'TYPE', typ: 'boden' },
      ctx({}, { typ: 'moebel' }),
    );
    expect(s.errors).toEqual([]);
    expect(fx).toEqual([{ e: 'announce', text: MSG.typeChanged }, { e: 'persist' }]);
  });

  it('does not announce on the first choice or a repeated one', () => {
    expect(reduce(ui('projekt'), { t: 'TYPE', typ: 'boden' }, ctx({}, { typ: null }))[1]).toEqual([{ e: 'persist' }]);
    expect(reduce(ui('projekt'), { t: 'TYPE', typ: 'boden' }, ctx({}, { typ: 'boden' }))[1]).toEqual([
      { e: 'persist' },
    ]);
    const busy = ui('projekt', { phase: 'done' });
    expect(reduce(busy, { t: 'TYPE', typ: 'boden' }, ctx())).toEqual([busy, []]);
  });
});

describe('SUBMIT / SENT / FAILED', () => {
  it('sends when every step is valid', () => {
    const [s, fx] = reduce(ui('pruefen', { errors: [err('x')] }), { t: 'SUBMIT' }, ctx());
    expect(s).toMatchObject({ phase: 'submitting', errors: [] });
    expect(fx).toEqual([{ e: 'send' }]);
  });

  it('jumps to the first invalid step with its errors', () => {
    const list = [err('email')];
    const [s, fx] = reduce(ui('pruefen'), { t: 'SUBMIT' }, ctx({ kontakt: list, pruefen: [err('p')] }));
    expect(s).toMatchObject({ step: 'kontakt', phase: 'editing', errors: list });
    expect(fx).toEqual([
      { e: 'show', step: 'kontakt', dir: 'back' },
      { e: 'history', mode: 'push' },
      { e: 'errors', list },
      { e: 'focus', target: 'errors' },
      { e: 'persist' },
    ]);
  });

  it('reports in place when the current step is the first invalid one', () => {
    const list = [err('plz')];
    const [s, fx] = reduce(ui('rahmen'), { t: 'SUBMIT' }, ctx({ rahmen: list, kontakt: [err('k')] }));
    expect(s.step).toBe('rahmen');
    expect(kinds(fx)).toEqual(['errors', 'focus']);
  });

  it('SENT completes, FAILED keeps the inputs and allows a retry', () => {
    const [sent, fx] = reduce(ui('pruefen', { phase: 'submitting' }), { t: 'SENT', id: 'abc' }, ctx());
    expect(sent.phase).toBe('done');
    expect(fx).toEqual([
      { e: 'focus', target: 'result' },
      { e: 'announce', text: MSG.sent },
    ]);
    const [failed, fx2] = reduce(ui('pruefen', { phase: 'submitting' }), { t: 'FAILED', reason: 'network' }, ctx());
    expect(failed.phase).toBe('failed');
    expect(fx2).toEqual([
      { e: 'announce', text: MSG.sendFailed, level: 'assertive' },
      { e: 'focus', target: 'result' },
    ]);
    expect(reduce(failed, { t: 'SUBMIT' }, ctx())[1]).toEqual([{ e: 'send' }]);
    expect(reduce(failed, { t: 'BACK' }, ctx())[0].step).toBe('kontakt');
  });

  it('ignores a second SUBMIT while sending or after success', () => {
    const busy = ui('pruefen', { phase: 'submitting' });
    expect(reduce(busy, { t: 'SUBMIT' }, ctx())).toEqual([busy, []]);
    const done = ui('pruefen', { phase: 'done' });
    expect(reduce(done, { t: 'SUBMIT' }, ctx())).toEqual([done, []]);
  });
});

describe('invariants', () => {
  const action: fc.Arbitrary<Action> = fc.oneof(
    fc.constant<Action>({ t: 'NEXT' }),
    fc.constant<Action>({ t: 'BACK' }),
    fc.record({
      t: fc.constant('GOTO' as const),
      step: fc.constantFrom(...STEPS),
      via: fc.constantFrom('ui', 'history', 'summary'),
    }),
    fc.record({ t: fc.constant('TYPE' as const), typ: fc.constantFrom('moebel', 'boden') }),
    fc.constant<Action>({ t: 'SUBMIT' }),
    fc.constant<Action>({ t: 'SENT', id: 'x' }),
    fc.constant<Action>({ t: 'FAILED', reason: 'timeout' }),
  );
  const invalidSteps = fc.uniqueArray(fc.constantFrom(...STEPS), { maxLength: 3 });

  it('keeps the step valid, furthest monotonic and never submits with errors', () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), invalidSteps, fc.boolean(), (actions, invalid, own) => {
        const c = ctx(Object.fromEntries(invalid.map((s) => [s, [err(s)]])), { ownHistory: own, typ: 'moebel' });
        let s = initialUi();
        for (const a of actions) {
          const [next, fx] = reduce(s, a, c);
          expect(STEPS).toContain(next.step);
          expect(next.furthest).toBeGreaterThanOrEqual(s.furthest);
          expect(next.furthest).toBeGreaterThanOrEqual(STEPS.indexOf(next.step));
          if (fx.some((e) => e.e === 'send')) {
            expect(next.phase).toBe('submitting');
            expect(invalid).toEqual([]);
          }
          for (const e of fx) if (e.e === 'show') expect(e.step).toBe(next.step);
          if (next.step !== s.step) expect(fx.some((e) => e.e === 'show')).toBe(true);
          s = next;
        }
      }),
    );
  });
});
