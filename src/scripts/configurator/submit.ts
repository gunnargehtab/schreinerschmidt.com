// Submission of the wizard (docs/configurator.md §5). Demo: nothing is sent, the success view shows
// the summary, the drawing and the actions (mailto, copy, .txt, print, config link). Live: the
// payload chunk (payload.ts) builds the multipart body, fetch() posts it with Accept: application/json,
// a 20 s timeout and one retry after 1.5 s for network errors, timeouts and 5xx; the time-trap and
// the honeypot fake a success. The error panel (role=alert) offers retry, mail and copy; its German
// reason lines come from the markup, the service's English `error_msg` is never shown. After a
// successful send, Back shows the "Anfrage bereits gesendet" prompt. Once 3D was loaded, the success
// view also shows the 3D snapshot (§4.12) as an <img> via an object URL with a download link (demo)
// and the live payload attaches it as ansicht_3d.webp. Loaded by the controller on the first SUBMIT,
// so none of this counts against the initial core budget.
import { FIELDS, type ProjectType } from '../../lib/configurator/fields';
import { TYP_LABELS } from '../../lib/konfigurator-links';
import type { Wizard } from './controller';
import { clearDraft, clearSession } from './draft';
import { buildMailto } from './mailto';
import { MIN_FILL_MS, type SubmitError } from './state';
import { copyText, type Item } from './summary';

export { MIN_FILL_MS };

export interface Submit {
  send(): void;
  focusResult(): void;
  /** Back after a successful send: offers a new request; `skip` ignores the popstate of the cancel. */
  alreadySent(skip: () => void): void;
}

const TIMEOUT_MS = 20000;
const RETRY_MS = 1500;

const uuid = (): string =>
  crypto.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;

/** Four characters, A–Z/0–9, from a UUID („7F3K“); '' for junk. Pure. */
export function shortId(uuid: string): string {
  const n = Number.parseInt(uuid.replace(/-/g, '').slice(0, 10), 16);
  return Number.isFinite(n) ? n.toString(36).toUpperCase().slice(-4).padStart(4, '0') : '';
}

/**
 * Honeypot and time-trap (§5): a filled honeypot, or a submit less than MIN_FILL_MS after the first
 * human interaction (`elapsed` is -1 when none was recorded), gets a fake success. Pure.
 */
export const isBot = (honeypot: string, elapsed: number): boolean => honeypot.trim() !== '' || elapsed < MIN_FILL_MS;

/**
 * The failure reason for a form.taxi answer, or null on success (`res.ok && json.success`). 4xx and
 * `success: false` mean the request was rejected (no retry); 5xx counts as a network problem and is
 * retried once. `error_msg` is English and stays out of the UI: the reason keys select the German
 * lines of the markup (`[data-reason]`). Pure.
 */
export function reasonOf(status: number, json: { success?: boolean }): SubmitError | null {
  if (status >= 200 && status < 300 && json.success) return null;
  return status >= 500 ? 'network' : 'rejected';
}

/** „Anfrage Möbel: Regal 120×200×35 – 68161 Mannheim – #7F3K“ (§5): the short type name, else its label. Pure. */
export function subjectLine(items: Item[], short: string, typ = ''): string {
  const find = (name: string) => items.find((i) => i.name === name)?.value ?? '';
  const details = items.filter((i) => i.step === 'details');
  const kind = details.find((i) => FIELDS[i.name]?.kind === 'enum')?.value ?? '';
  const dims = details
    .filter((i) => FIELDS[i.name]?.unit === 'cm')
    .slice(0, 3)
    // The number before the U+202F + unit („120 cm“ → „120“).
    .map((i) => i.value.split(/\s/)[0])
    .join('×');
  const what = [kind, dims].filter(Boolean).join(' ');
  return [
    `Anfrage ${TYP_LABELS[typ as ProjectType] ?? find('typ')}${what ? `: ${what}` : ''}`,
    [find('plz'), find('ort')].filter(Boolean).join(' '),
    `#${short}`,
  ]
    .filter(Boolean)
    .join(' – ');
}

export function createSubmit(w: Wizard): Submit {
  const { root, form, msg, announce } = w;
  const $ = <T extends HTMLElement>(sel: string, from: ParentNode = root) => from.querySelector<T>(sel);
  const success = $<HTMLElement>('[data-success]');
  const snapFig = $<HTMLElement>('[data-success-snapshot]', success ?? root);
  const layout = $<HTMLElement>('.configurator__layout');
  const panel = $<HTMLElement>('[data-submit-error]', form);
  const button = $<HTMLButtonElement>('[data-action="submit"]', form);
  let id = '';
  let short = '';
  let svg = '';
  let prompt: HTMLElement | null = null;
  let printReady: Promise<void> | null = null;
  /** The preview chunk (loaded while typ = moebel): drawing at a width, print sheet. One import site. */
  const preview = () => import('./preview/index');

  /** Recipient from the page (the settings e-mail is already in the DOM). */
  const recipient = (): string =>
    decodeURIComponent(
      document.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')?.href.slice(7).split('?')[0] ?? '',
    );
  const subject = () => subjectLine(w.items(), short, String(w.values()['typ'] ?? ''));
  const mailto = () =>
    buildMailto({ to: recipient(), subject: subject(), sections: w.sections(), configUrl: w.configUrl() });
  const fullText = () =>
    `${w.text()}\n\n${$('.success__id', success ?? root)?.textContent?.trim() ?? short}\n${w.configUrl()}`;

  function done(): void {
    // Own id prefix: the live drawing stays in the (hidden) form, and ids must be unique on the page.
    svg = w.drawing().replace(/\bvorschau-/g, 'erfolg-');
    if (button) button.disabled = false;
    if (panel) panel.hidden = true;
    if (layout) layout.hidden = true;
    if (success) {
      const idEl = $('[data-anfrage-id]', success);
      if (idEl) idEl.textContent = short;
      const text = $('[data-success-summary]', success);
      if (text) text.textContent = w.text();
      const drawing = $('[data-success-drawing]', success);
      if (drawing) drawing.innerHTML = svg;
      for (const b of success.querySelectorAll<HTMLElement>('[data-action]')) b.hidden = false;
      const mail = $('[data-action="mail"]', success);
      if (mail) mail.dataset['href'] = mailto().href;
      success.hidden = false;
      if (svg && drawing) void refit(drawing).then(preparePrint);
      if (svg && snapFig) void showSnapshot(snapFig);
    }
    clearSession();
    clearDraft();
    const toggle = $<HTMLInputElement>('[data-draft-toggle]');
    if (toggle) toggle.checked = false;
    const del = $('[data-action="draft-delete"]');
    if (del) del.hidden = true;
    w.dispatch({ t: 'SENT', id });
  }

  function fail(reason: SubmitError): void {
    if (button) button.disabled = false;
    if (panel) {
      for (const p of panel.querySelectorAll<HTMLElement>('[data-reason]')) p.hidden = p.dataset['reason'] !== reason;
      panel.hidden = false;
      panel.tabIndex = -1;
    }
    w.dispatch({ t: 'FAILED', reason });
  }

  async function sendLive(): Promise<void> {
    if (!navigator.onLine) {
      // The FAILED effect announces assertively; the alert panel shows the offline line.
      addEventListener('online', () => panel && (panel.hidden = true), { once: true });
      return fail('offline');
    }
    // Bots get a fake success, never an error (nothing is sent).
    if (isBot($<HTMLInputElement>('[data-hp] input', form)?.value ?? '', w.elapsed())) return done();
    if (button) button.disabled = true;
    let reason: SubmitError = 'network';
    try {
      const { buildPayload } = await import('./payload');
      const drawing = w.drawing();
      const body = await buildPayload(form, {
        id,
        short,
        mode: 'live',
        page: location.href,
        configUrl: w.configUrl(),
        values: w.values(),
        items: w.items(),
        text: w.text(),
        subject: subject(),
        svg: drawing,
        // The 3D snapshot (§4.12) once 3D was loaded (Möbel only). Its demo download/preview is
        // deferred: it does not fit the flow budget (docs/configurator.md §3).
        snapshot: drawing ? await (await preview()).snapshot3d() : null,
      });
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(form.action, {
            method: 'POST',
            body,
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const r = reasonOf(res.status, (await res.json().catch(() => ({}))) as { success?: boolean });
          if (!r) return done();
          reason = r;
          if (r === 'rejected') break;
        } catch (e) {
          reason = (e as Error).name === 'TimeoutError' ? 'timeout' : 'network';
        }
        if (!attempt) await new Promise((r) => setTimeout(r, RETRY_MS));
      }
    } catch {
      // Chunk failed to load: reported as a network problem.
    }
    fail(reason);
  }

  /**
   * The preview rendered its SVG for the panel's width (12 px labels there); the success column is
   * narrower, so the drawing is rendered again for the measured width (the preview chunk is loaded).
   */
  const refit = (host: HTMLElement): Promise<void> =>
    preview()
      .then((m) => m.screenDrawing(w.values(), Math.round(host.getBoundingClientRect().width) || 400, 'erfolg'))
      .then((s) => {
        if (s) host.innerHTML = s;
      })
      .catch(() => {
        // The panel-sized drawing stays.
      });

  /** The DIN print sheet of the Möbel drawing (full renderer, loaded on request via the preview chunk). */
  const preparePrint = (): Promise<void> =>
    (printReady ??= !svg
      ? Promise.resolve()
      : preview()
          .then((m) => m.printSheet(w.values(), new Date().toLocaleDateString('de-DE')))
          .then((sheet) => {
            const host = $('[data-success-drawing]', success ?? root);
            if (!sheet || !host) return;
            let box = $('[data-print-drawing]', host);
            if (!box) {
              box = host.appendChild(document.createElement('div'));
              box.className = 'success__print';
              box.dataset['printDrawing'] = '';
            }
            box.innerHTML = sheet;
          })
          .catch(() => {
            printReady = null;
          }));
  addEventListener('beforeprint', () => void preparePrint());

  /**
   * The 3D snapshot (§4.12) as an <img> with a download link, only once 3D was loaded (the preview
   * chunk's snapshot3d() resolves null otherwise). The object URL is revoked in reset().
   */
  async function showSnapshot(fig: HTMLElement): Promise<void> {
    const m = await preview();
    const blob = await m.snapshot3d();
    if (!blob) return;
    const build = await m.buildFor(w.values());
    const url = URL.createObjectURL(blob);
    const link = $<HTMLAnchorElement>('[data-snapshot-link]', fig);
    if (link) {
      link.href = url;
      link.download = blob.type === 'image/png' ? 'ansicht_3d.png' : 'ansicht_3d.webp';
    }
    const img = fig.insertBefore(new Image(), fig.firstChild);
    img.src = url;
    img.alt = msg('snapshot-alt').replace('{text}', build ? m.describe(build) : '');
    fig.hidden = false;
  }

  /** The summary as a .txt download (a data: URL: a few KB at most, nothing to revoke). */
  function download(): void {
    const a = document.body.appendChild(document.createElement('a'));
    a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(fullText())}`;
    a.download = `anfrage-${short}.txt`;
    a.click();
    a.remove();
  }

  function reset(): void {
    const img = snapFig?.querySelector('img');
    if (img) {
      URL.revokeObjectURL(img.src);
      img.remove();
    }
    if (snapFig) snapFig.hidden = true;
    id = short = svg = '';
    printReady = null;
    if (prompt) prompt.hidden = true;
    if (success) success.hidden = true;
    if (layout) layout.hidden = false;
    w.reset();
  }

  const act = (e: Event): void => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    switch (b?.dataset['action']) {
      case 'mail':
        location.href = mailto().href;
        break;
      case 'copy':
        void copyText(fullText()).then((ok) => ok && announce(msg('summary-copied')));
        break;
      case 'save':
        download();
        break;
      case 'print':
        void preparePrint().then(() => print());
        break;
      case 'link':
        void copyText(w.configUrl()).then((ok) => ok && announce(msg('link-copied')));
        break;
      case 'retry':
        w.dispatch({ t: 'SUBMIT' });
        break;
      case 'restart':
        reset();
        break;
      case 'cancel':
        if (prompt) prompt.hidden = true;
        skipNext?.();
        history.forward();
        break;
    }
  };
  success?.addEventListener('click', act);
  panel?.addEventListener('click', act);
  let skipNext: (() => void) | undefined;

  return {
    send() {
      id ||= uuid();
      short = shortId(id);
      if (w.live) void sendLive();
      else done();
    },
    focusResult() {
      (panel && !panel.hidden ? panel : success)?.focus();
    },
    alreadySent(skip) {
      if (!success) return;
      skipNext = skip;
      if (!prompt) {
        // The texts are the page's own data-msg-* copy; escaped anyway. No inline handlers (CSP).
        const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
        const button = (action: string, cls: string, text: string) =>
          `<button type="button" class="btn btn--small${cls}" data-action="${action}">${esc(text)}</button>`;
        prompt = success.insertBefore(document.createElement('div'), success.firstChild);
        prompt.className = 'already-sent';
        prompt.setAttribute('role', 'alert');
        prompt.tabIndex = -1;
        prompt.innerHTML =
          `<p>${esc(msg('already-sent'))}</p><div class="cluster">` +
          button('restart', '', msg('already-sent-confirm')) +
          button('cancel', ' btn--secondary', msg('already-sent-cancel')) +
          '</div>';
      }
      prompt.hidden = false;
      prompt.focus();
    },
  };
}
