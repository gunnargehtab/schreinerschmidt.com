// History of the wizard (docs/configurator.md §3 "Serialisation and history"): one pushState per
// step, popstate drives GOTO. Every entry of ours carries `{ ss: 1, step, prev }`, where `prev` is
// the step of the entry before it (null when that one is not ours); `prev()` tells the reducer
// where history.back() would land, so BACK only uses it when that is the previous wizard step. The
// entries survive a reload. No Navigation API. Every call sits in try/catch: Safari throws after
// ~100 history calls per 30 s.
import type { StepId } from '../../lib/configurator/fields';

interface Entry {
  ss: 1;
  step: StepId;
  prev: StepId | null;
}

export interface WizardHistory {
  push(step: StepId, url: string): void;
  replace(step: StepId, url: string): void;
  back(): void;
  /** Step of the previous history entry when it is one of ours, else null. */
  prev(): StepId | null;
}

const entry = (s: unknown): Entry | null => ((s as Entry | null)?.ss === 1 ? (s as Entry) : null);

export function createHistory(onPop: (step: StepId) => void): WizardHistory {
  let cur = entry(history.state);
  const set = (mode: 'pushState' | 'replaceState', step: StepId, prev: StepId | null, url: string) => {
    const e: Entry = { ss: 1, step, prev };
    try {
      history[mode](e, '', url);
      cur = e;
    } catch {
      // Throttled by the browser; the next change tries again.
    }
  };
  addEventListener('popstate', (e) => {
    const s = entry(e.state);
    if (!s) return;
    cur = s;
    onPop(s.step);
  });
  return {
    push: (step, url) => set('pushState', step, cur?.step ?? null, url),
    replace: (step, url) => set('replaceState', step, cur?.prev ?? null, url),
    back: () => history.back(),
    prev: () => cur?.prev ?? null,
  };
}
