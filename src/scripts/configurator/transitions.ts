// Same-document view transition between two steps (docs/configurator.md §3 "View transitions
// between steps"). The slide direction travels as `data-nav-dir` on <html> (view-transition types
// are not reliable in every engine); the names `wizard-step` / `wizard-progress` come from
// src/lib/vt.ts and are applied by src/styles/components/configurator-js.css. With reduced motion,
// or without the API, the update runs at once and nothing animates.
export function swapStep(update: () => void, dir: 'fwd' | 'back'): Promise<void> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) {
    update();
    return Promise.resolve();
  }
  const html = document.documentElement;
  html.dataset['navDir'] = dir;
  const vt = document.startViewTransition(update);
  vt.finished.finally(() => delete html.dataset['navDir']);
  return vt.updateCallbackDone;
}
