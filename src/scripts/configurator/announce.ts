// Live regions of the wizard (docs/configurator.md §3 "Focus, live regions, progress"): one polite
// region, debounced 1000 ms so a burst of changes (slider drag, derived hints, service area) yields
// one announcement, and one assertive region that only submit failures use.
export type Announce = (text: string, level?: 'polite' | 'assertive') => void;

export const POLITE_DELAY = 1000;

export function createAnnouncer(polite: HTMLElement | null, assertive: HTMLElement | null): Announce {
  let timer = 0;
  let queue: string[] = [];
  return (text, level = 'polite') => {
    if (!text) return;
    if (level === 'assertive') {
      if (assertive) assertive.textContent = text;
      return;
    }
    queue.push(text);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (polite) polite.textContent = queue.join(' ');
      queue = [];
    }, POLITE_DELAY);
  };
}
