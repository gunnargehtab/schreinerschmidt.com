// Mobile nav sheet: close when focus leaves sheet + button (WCAG 2.4.11) or the viewport turns desktop.
const sheet = document.getElementById('site-menu');
const button = document.querySelector('.menu-button');

if (sheet) {
  const close = () => sheet.matches(':popover-open') && sheet.hidePopover();
  const leave = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && !sheet.contains(to) && to !== button) close();
  };
  sheet.addEventListener('focusout', leave);
  button?.addEventListener('focusout', leave as EventListener);
  matchMedia('(width >= 74rem)').addEventListener('change', (e) => e.matches && close());
}
