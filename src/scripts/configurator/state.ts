// Wizard state machine (docs/configurator.md §3 "State"). The DOM is the store; this reducer only
// tracks the step, the furthest step reached, the submit phase and the current errors, and returns
// the effects the controller carries out. Pure: no DOM, no timers.
import { STEPS, type ProjectType, type StepId } from '../../lib/configurator/fields';

export type { ProjectType, StepId };

/**
 * The texts the reducer announces. They live here (not in messages.de.ts, which re-exports them in
 * MSG) so the wizard core does not carry the validation messages: that module loads with the
 * validation chunk on the first "Weiter".
 */
export const STATE_MSG = {
  typeChanged: 'Projektart geändert. Ihre Angaben zu anderen Projektarten bleiben erhalten.',
  sendFailed: 'Ihre Anfrage konnte nicht gesendet werden. Ihre Eingaben bleiben erhalten.',
  sent: 'Ihre Anfrage wurde gesendet.',
} as const;
const MSG = STATE_MSG;

export interface FieldError {
  /** Control name; the controller resolves it to the element and its id. */
  name: string;
  message: string;
}

export type SubmitError = 'offline' | 'network' | 'timeout' | 'rejected' | 'server';

export interface WizardUi {
  step: StepId;
  /** Index of the furthest step the user has reached. */
  furthest: number;
  phase: 'editing' | 'submitting' | 'done' | 'failed';
  errors: FieldError[];
}

export type Action =
  | { t: 'NEXT' }
  | { t: 'BACK' }
  | { t: 'GOTO'; step: StepId; via: 'ui' | 'history' | 'summary' }
  | { t: 'TYPE'; typ: ProjectType }
  | { t: 'SUBMIT' }
  | { t: 'SENT'; id: string }
  | { t: 'FAILED'; reason: SubmitError };

export type Effect =
  | { e: 'show'; step: StepId; dir: 'fwd' | 'back' }
  | { e: 'focus'; target: 'heading' | 'errors' | 'result' }
  /** `back` asks the controller for history.back(); popstate then dispatches GOTO via 'history'. */
  | { e: 'history'; mode: 'push' | 'replace' | 'back' }
  | { e: 'errors'; list: FieldError[] }
  | { e: 'announce'; text: string; level?: 'polite' | 'assertive' }
  | { e: 'persist' }
  | { e: 'send' };

export interface Context {
  steps: readonly StepId[];
  validate(step: StepId): FieldError[];
  /** True when the previous history entry is one of ours, so BACK can use history.back(). */
  ownHistory?: boolean;
  /** The project type before a TYPE action; the announcement is only made on a real change. */
  typ?: ProjectType | null;
}

export const initialUi = (step: StepId = 'projekt'): WizardUi => ({
  step,
  furthest: Math.max(0, STEPS.indexOf(step)),
  phase: 'editing',
  errors: [],
});

const idx = (steps: readonly StepId[], s: StepId): number => steps.indexOf(s);

/**
 * Moves to `to` with the effects of a step change. `history` is null when the entry already exists
 * (popstate). With `errors`, the destination shows its error summary instead of focusing the heading.
 */
function go(
  s: WizardUi,
  to: StepId,
  dir: 'fwd' | 'back',
  history: 'push' | 'replace' | null,
  steps: readonly StepId[],
  errors: FieldError[] = [],
): [WizardUi, Effect[]] {
  const effects: Effect[] = [{ e: 'show', step: to, dir }];
  if (history) effects.push({ e: 'history', mode: history });
  if (errors.length) effects.push({ e: 'errors', list: errors }, { e: 'focus', target: 'errors' });
  else effects.push({ e: 'focus', target: 'heading' });
  effects.push({ e: 'persist' });
  return [{ ...s, step: to, furthest: Math.max(s.furthest, idx(steps, to)), errors }, effects];
}

const fail = (s: WizardUi, list: FieldError[]): [WizardUi, Effect[]] => [
  { ...s, errors: list },
  [
    { e: 'errors', list },
    { e: 'focus', target: 'errors' },
  ],
];

/**
 * Forward jumps stop at the first invalid step between the current one and the target; the first
 * step with errors becomes the destination (§3: "clamp forward jumps").
 */
function clampForward(s: WizardUi, target: number, ctx: Context): { to: number; errors: FieldError[] } {
  const from = idx(ctx.steps, s.step);
  for (let i = from; i < target; i++) {
    const errors = ctx.validate(ctx.steps[i] as StepId);
    if (errors.length) return { to: i, errors };
  }
  return { to: target, errors: [] };
}

export function reduce(s: WizardUi, a: Action, ctx: Context): [WizardUi, Effect[]] {
  const { steps } = ctx;
  const cur = idx(steps, s.step);
  const busy = s.phase === 'submitting' || s.phase === 'done';

  switch (a.t) {
    case 'NEXT': {
      if (busy || cur < 0 || cur >= steps.length - 1) return [s, []];
      const errors = ctx.validate(s.step);
      if (errors.length) return fail(s, errors);
      return go(s, steps[cur + 1] as StepId, 'fwd', 'push', steps);
    }
    case 'BACK': {
      if (busy || cur <= 0) return [s, []];
      if (ctx.ownHistory) return [s, [{ e: 'history', mode: 'back' }]];
      return go(s, steps[cur - 1] as StepId, 'back', 'replace', steps);
    }
    case 'GOTO': {
      const target = idx(steps, a.step);
      if (busy || target < 0 || target === cur) return [s, []];
      if (target < cur) return go(s, a.step, 'back', a.via === 'history' ? null : 'push', steps);
      const { to, errors } = clampForward(s, target, ctx);
      if (to === cur) {
        // The current step blocks the jump; a history move still needs its entry fixed.
        const [st, fx] = fail(s, errors);
        return [st, a.via === 'history' ? [{ e: 'history', mode: 'replace' }, ...fx] : fx];
      }
      const clamped = to !== target;
      const history = a.via === 'history' ? (clamped ? 'replace' : null) : 'push';
      return go(s, steps[to] as StepId, 'fwd', history, steps, errors);
    }
    case 'TYPE': {
      if (busy) return [s, []];
      const effects: Effect[] = [{ e: 'persist' }];
      if (ctx.typ && ctx.typ !== a.typ) effects.unshift({ e: 'announce', text: MSG.typeChanged });
      return [{ ...s, errors: [] }, effects];
    }
    case 'SUBMIT': {
      if (busy) return [s, []];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i] as StepId;
        const errors = ctx.validate(step);
        if (!errors.length) continue;
        if (i === cur) return fail(s, errors);
        return go(s, step, i < cur ? 'back' : 'fwd', 'push', steps, errors);
      }
      return [{ ...s, phase: 'submitting', errors: [] }, [{ e: 'send' }]];
    }
    case 'SENT':
      return [
        { ...s, phase: 'done', errors: [] },
        [
          { e: 'focus', target: 'result' },
          { e: 'announce', text: MSG.sent },
        ],
      ];
    case 'FAILED':
      return [
        { ...s, phase: 'failed' },
        [
          { e: 'announce', text: MSG.sendFailed, level: 'assertive' },
          { e: 'focus', target: 'result' },
        ],
      ];
  }
}
