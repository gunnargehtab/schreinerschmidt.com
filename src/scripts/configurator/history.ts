// History of the wizard (docs/configurator.md §3 "Serialisation and history"): one pushState per
// step, popstate drives GOTO. Every entry of ours carries `{ ss: 1, step, i }`, where `i` counts our
// pushes before it; `own()` tells the reducer whether BACK may use history.back(). No Navigation
// API. Every call sits in try/catch: Safari throws after ~100 history calls per 30 s.
import type { StepId } from '../../lib/configurator/fields';

interface Entry {
  ss: 1;
  step: StepId;
  i: number;
}

export interface WizardHistory {
  push(step: StepId, url: string): void;
  replace(step: StepId, url: string): void;
  back(): void;
  /** True when the previous history entry is one of ours. */
  own(): boolean;
}

const entry = (s: unknown): Entry | null => ((s as Entry | null)?.ss === 1 ? (s as Entry) : null);

export function createHistory(onPop: (step: StepId) => void): WizardHistory {
  let i = entry(history.state)?.i ?? 0;
  const set = (mode: 'pushState' | 'replaceState', step: StepId, url: string) => {
    try {
      history[mode]({ ss: 1, step, i } satisfies Entry, '', url);
    } catch {
      // Throttled by the browser; the next change tries again.
    }
  };
  addEventListener('popstate', (e) => {
    const s = entry(e.state);
    if (!s) return;
    i = s.i;
    onPop(s.step);
  });
  return {
    push(step, url) {
      i++;
      set('pushState', step, url);
    },
    replace: (step, url) => set('replaceState', step, url),
    back: () => history.back(),
    own: () => i > 0,
  };
}
