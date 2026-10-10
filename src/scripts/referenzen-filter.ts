// Referenzen filter (docs/design-system.md §6). The CSS `:has()` rules do the filtering; this adds the
// status text and, where view transitions exist, the choreography: revert the radio, mark the list
// `.is-filtering` (motion.css gives the items `match-element` names), then switch inside the transition.
const root = document.querySelector<HTMLElement>('[data-refs]');
const list = root?.querySelector<HTMLElement>('[data-filter-list]');
const status = root?.querySelector<HTMLElement>('[data-status]');

if (root && list && status) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const radios = () => root.querySelectorAll<HTMLInputElement>('input[name="kategorie"]');
  let current = [...radios()].find((r) => r.checked);
  let running: ViewTransition | undefined;

  const apply = (radio: HTMLInputElement) => {
    radio.checked = true;
    current = radio;
    const n = Number(radio.dataset['n']);
    status.textContent = `${n} ${n === 1 ? 'Projekt' : 'Projekte'}`;
  };

  root.addEventListener('change', (e) => {
    const next = e.target as HTMLInputElement;
    if (next.name !== 'kategorie') return;
    if (!document.startViewTransition || reduce.matches || !current) return apply(next);
    current.checked = true;
    running?.skipTransition();
    list.classList.add('is-filtering');
    const run = (running = document.startViewTransition(() => apply(next)));
    run.finished.finally(() => running === run && list.classList.remove('is-filtering'));
  });

  // The inline preselect script may have checked a chip from ?kategorie=.
  const start = [...radios()].find((r) => r.checked);
  if (start) apply(start);
}

export {};
