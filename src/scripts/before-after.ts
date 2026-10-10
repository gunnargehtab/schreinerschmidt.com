// Before/after comparison (docs/design-system.md §5). Enhances every [data-ba]: stacks the photos,
// wires the range input (drag, track click, keys) and the Vorher / Beide / Nachher buttons.
for (const ba of document.querySelectorAll<HTMLElement>('[data-ba]')) {
  const stage = ba.querySelector<HTMLElement>('.ba__stage');
  const range = ba.querySelector<HTMLInputElement>('.ba__range');
  const group = ba.querySelector<HTMLElement>('.ba__buttons');
  if (!stage || !range || !group) continue;
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
  const { before, after } = ba.dataset;
  const set = (value: number) => {
    range.value = String(value);
    stage.style.setProperty('--pos', `${value}%`);
    range.setAttribute('aria-valuetext', `${value} % ${before}, ${100 - value} % ${after}`);
    for (const b of buttons) b.setAttribute('aria-pressed', String(Number(b.dataset['pos']) === value));
  };
  range.addEventListener('input', () => set(range.valueAsNumber));
  group.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-pos]');
    if (b) set(Number(b.dataset['pos']));
  });
  ba.dataset['enhanced'] = '';
  range.hidden = group.hidden = false;
  set(50);
}

export {};
