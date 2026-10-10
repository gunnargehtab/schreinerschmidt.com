// Progressive enhancement for <FormShell> forms (docs/architecture.md §8, design-system §5 "Forms").
// Without JS the form validates natively: demo forms use method="dialog" (nothing is sent),
// production forms POST to the form endpoint. With JS:
// - `novalidate`; validation on submit with an error summary (role="alert", focused, linked to fields)
//   and inline errors wired through aria-describedby / aria-invalid;
// - honeypot or a submit < 3 s after the first interaction: fake success, nothing is sent;
// - demo: inline success, ZERO network; production: fetch() POST with Accept: application/json,
//   then the danke page on success, or the failure alert with the tel/mailto fallback.
// Never GET with personal data; never POST to Pages (it returns 405).
import { FILE_TOO_LARGE, MAX_FILE_BYTES } from './messages.de';

/** Minimum time between the first interaction and the submit (time-trap). */
export const MIN_FILL_MS = 3000;

/** True when the submit came too fast; no interaction at all counts as too fast. */
export const tooFast = (first: number | undefined, now: number, min = MIN_FILL_MS): boolean =>
  first === undefined || now - first < min;

/** Bot verdict: a filled honeypot or the time-trap. A bot gets a fake success, never an error. */
export const isSpam = (honeypot: string, first: number | undefined, now: number): boolean =>
  honeypot.trim() !== '' || tooFast(first, now);

/** True when any selected file exceeds the upload limit. */
export const fileTooBig = (files: ArrayLike<{ size: number }> | null | undefined, max = MAX_FILE_BYTES): boolean =>
  Array.from(files ?? []).some((f) => f.size > max);

/** Inputs, selects and textareas share every member used here; typed as input for brevity. */
type Control = HTMLInputElement;

export function enhance(form: HTMLFormElement): void {
  const $ = <T extends HTMLElement>(sel: string) => form.querySelector<T>(sel);
  const summary = $('[data-error-summary]');
  const list = $('[data-error-list]');
  const failed = $('[data-form-failed]');
  const status = $('[data-form-status] p');
  const hp = $<HTMLInputElement>('[data-hp] input');
  const button = $<HTMLButtonElement>('[type=submit]');
  const data = form.dataset;
  const live = data['mode'] === 'live';
  let first: number | undefined;
  if (!summary || !list || !status) return;
  form.noValidate = true;

  const say = (text = '', tone = 'success'): void => {
    status.textContent = text;
    status.dataset['tone'] = tone;
    status.hidden = !text;
  };

  const alert = (box: HTMLElement | null): void => {
    for (const el of [summary, failed]) if (el) el.hidden = el !== box;
    box?.focus();
  };

  /**
   * Validate one control and show or clear its inline error; radios report on their fieldset. The
   * message is the field's own build-time text (messages.de.ts), or the file-size message.
   * Controls outside a .field (buttons) never count as invalid.
   */
  const check = (el: Control): string => {
    if (el.type === 'file') el.setCustomValidity(fileTooBig(el.files) ? FILE_TOO_LARGE : '');
    const field = el.closest<HTMLElement>('.field');
    const err = field?.querySelector<HTMLElement>('.field__error');
    if (!field || !err) return '';
    const text = (err.dataset['msg'] ??= err.textContent ?? '');
    const msg = el.validity.valid ? '' : el.validity.customError ? el.validationMessage : text;
    if (msg) err.textContent = msg;
    field.classList.toggle('is-invalid', !!msg);
    // aria-invalid is not allowed on radios (ARIA 1.2); their fieldset carries the error text.
    if (el.type !== 'radio') el.ariaInvalid = msg ? 'true' : null;
    const target = el.type === 'radio' ? field : el;
    const ids = [field.querySelector('.field__hint')?.id, msg && err.id].filter(Boolean).join(' ');
    if (ids) target.setAttribute('aria-describedby', ids);
    else target.removeAttribute('aria-describedby');
    return msg;
  };

  const done = (): void => (live ? location.assign(data['next'] ?? '') : say(data['success']));

  form.addEventListener('focusin', () => (first ??= Date.now()));
  const recheck = (e: Event): void => {
    const el = e.target as Control;
    if (el.closest('.is-invalid') || el.type === 'file') check(el);
  };
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say();
    list.replaceChildren();
    const seen = new Set<string>();
    for (const el of form.elements as unknown as Iterable<Control>) {
      if (!el.willValidate || el.closest('[data-hp]') || seen.has(el.name)) continue;
      if (el.type === 'radio') seen.add(el.name);
      const msg = check(el);
      if (!msg) continue;
      const a = list.appendChild(document.createElement('li')).appendChild(document.createElement('a'));
      a.href = `#${el.id}`;
      a.textContent = `${el.closest<HTMLElement>('.field')?.dataset['label']}: ${msg}`;
      a.onclick = (ev) => {
        ev.preventDefault();
        el.focus();
      };
    }
    if (list.children.length) return alert(summary);
    alert(null);
    if (!live || isSpam(hp?.value ?? '', first, Date.now())) return done();

    const body = new FormData(form);
    if (hp) body.delete(hp.name);
    if (button) button.disabled = true;
    say(data['sending'], 'info');
    try {
      const res = await fetch(form.getAttribute('action') ?? '', {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok || !((await res.json()) as { success?: boolean }).success) throw 0;
      done();
    } catch {
      say();
      alert(failed);
    }
    if (button) button.disabled = false;
  });
}

/** Enhance every FormShell form on the page. */
export const init = (): void => document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(enhance);
