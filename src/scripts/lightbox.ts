// Lightbox (docs/design-system.md §5). Upgrades `a[data-lightbox]` thumbnails to the #lightbox dialog.
// The image morphs between thumbnail and dialog with a same-document view transition when the
// browser supports it and motion is allowed; otherwise the dialog just opens (CSS fades it).
const dialog = document.querySelector<HTMLDialogElement>('#lightbox');
const img = dialog?.querySelector<HTMLImageElement>('.lightbox__img');
const caption = dialog?.querySelector<HTMLElement>('[data-caption]');
const count = dialog?.querySelector<HTMLElement>('[data-count]');

if (dialog && img && caption && count) {
  const NAME = 'lightbox-img';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let items: HTMLAnchorElement[] = [];
  let index = 0;

  const thumb = () => items[index]?.querySelector('img');
  const name = (el: HTMLElement | null | undefined, on: boolean) =>
    el?.style.setProperty('view-transition-name', on ? NAME : '');
  const morph = (update: () => void, from: HTMLElement | null | undefined, to: HTMLElement | null | undefined) => {
    if (!document.startViewTransition || reduce.matches || !from) return update();
    name(from, true);
    const run = document.startViewTransition(() => {
      name(from, false);
      name(to, true);
      update();
    });
    run.finished.finally(() => name(to, false));
  };

  /** Loads item `n` (wrapping) into the dialog. */
  const show = async (n: number) => {
    index = (n + items.length) % items.length;
    const a = items[index];
    if (!a) return;
    img.alt = thumb()?.alt ?? '';
    img.src = a.href;
    caption.textContent = a.dataset['caption'] ?? '';
    count.textContent = `Bild ${index + 1} von ${items.length}`;
    for (const b of dialog.querySelectorAll<HTMLElement>('[data-prev], [data-next]')) b.hidden = items.length < 2;
    await img.decode().catch(() => {});
  };

  const close = () => {
    if (!dialog.open) return;
    const t = thumb();
    t?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    // WebKit crashes (Playwright build) when a view transition removes a modal dialog: Apple engines close plainly.
    morph(() => dialog.close(), navigator.vendor.startsWith('Apple') ? null : img, t);
  };

  document.addEventListener('click', async (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-lightbox]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    // Same group only, and only rendered items: the Referenzen filter hides cards with display:none.
    items = [
      ...(a.closest('[data-gallery]') ?? document).querySelectorAll<HTMLAnchorElement>('a[data-lightbox]'),
    ].filter((l) => l === a || (l.checkVisibility?.() ?? l.offsetParent !== null));
    await show(items.indexOf(a));
    morph(() => dialog.showModal(), thumb(), img);
  });

  const step = (d: number) => show(index + d);
  const act = (c: string) => (c === '--prev' ? step(-1) : c === '--next' ? step(1) : c === 'close' && close());
  // Invoker commands; engines without them fall back to plain clicks.
  dialog.addEventListener('command', (e) => {
    e.preventDefault();
    act((e as Event & { command: string }).command);
  });
  if (!('CommandEvent' in self)) {
    dialog.addEventListener('click', (e) => {
      const c = (e.target as Element).closest('button[command]')?.getAttribute('command');
      if (c) act(c);
    });
  }
  // Esc and light dismiss: run the animated close instead of the instant one.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // Safari (no closedby): a click on the backdrop targets the dialog itself.
  dialog.addEventListener('click', (e) => e.target === dialog && close());
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
  dialog.addEventListener('close', () => items[index]?.focus());
}

export {};
