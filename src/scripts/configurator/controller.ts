// Controller of the quote wizard (docs/configurator.md §2 point 4, §3): the DOM is the store, the
// pure reducer (state.ts) decides, this module carries out the effects. It
// - promotes `data-required` to `required`, disables inactive branches and conditions, narrows the
//   number ranges per moebel_art and fills defaults when a branch activates;
// - validates a step with the Constraint Validation API + validate.ts (German messages) and shows
//   the GOV.UK error summary and inline errors;
// - shows one step at a time (steps.ts) inside a view transition (transitions.ts), focuses the
//   heading or the error summary and keeps document.title in sync;
// - mirrors the configuration into the URL (throttled replaceState), sessionStorage (debounced +
//   pagehide) and, opt-in, a localStorage draft; restores URL > session > draft; pushes one history
//   entry per step;
// - fills the summary sidebar, the review step and the share link (summary.ts);
// - mounts the Möbel preview chunk on demand, and the submission (submit.ts).
// Chunks loaded on request (core ≤ 11.25 KB gz): summary.ts (first change, or at start when a
// session with values is restored), validate.ts + messages.de.ts (prefetched at the first
// interaction, awaited at the first Weiter; at once when a restored step needs clamping), preview/
// (typ = moebel), submit.ts (SUBMIT; live mode adds payload.ts and, for Möbel, preview/info.ts),
// photos.ts (file selection). Core + validate + summary + submit + payload is the "full flow"
// (target 18 KB gz, scripts/check-budgets.mjs FLOW). A chunk that fails to load (offline, stale
// deployment) is reported: validation and photos announce it and retry on the next action, the
// submission shows the error panel (live) or announces it (demo) and „Erneut senden“ / the submit
// button retry; the preview announces once and keeps the sketch.
// INP rule (§4.13): event handlers only record state; the work runs in the next animation frame.
import { effectiveConditions, visible } from '../../lib/configurator/conditions';
import {
  FIELDS,
  STEPS,
  effectiveValues,
  fieldDefault,
  fieldRange,
  type ProjectType,
  type StepId,
  type Values,
} from '../../lib/configurator/fields';
import { createAnnouncer, type Announce } from './announce';
import { clearDraft, clearSession, draftDate, loadDraft, loadSession, saveDraft, saveSession } from './draft';
import { createHistory } from './history';
import { fromQuery, toQuery, toSnapshot } from './serialize';
import { MIN_FILL_MS, STATE_MSG, initialUi, reduce, type Action, type Effect, type WizardUi } from './state';
import { createSteps, fill, type Msg } from './steps';
import type { Submit } from './submit';
import type { Item } from './summary';
import { swapStep } from './transitions';

type Control = HTMLInputElement;
type PreviewModule = typeof import('./preview/index');
type ValidateModule = typeof import('./validate');
type SummaryModule = typeof import('./summary');

/** What submit.ts (and the other lazy modules) need from the controller. */
export interface Wizard {
  root: HTMLElement;
  form: HTMLFormElement;
  live: boolean;
  msg: Msg;
  announce: Announce;
  ui(): WizardUi;
  values(): Values;
  items(): Item[];
  /** Summary text per step, in priority order for the mail body. */
  sections(): string[];
  text(): string;
  /** Absolute shareable URL of the configuration. */
  configUrl(): string;
  /** Milliseconds since the first human interaction (or a restored session), or -1 (time-trap). */
  elapsed(): number;
  dispatch(a: Action): void;
  /** New request after a successful send. */
  reset(): void;
  /** Markup of the live drawing (Möbel) or ''. */
  drawing(): string;
}

/**
 * `konfigurator/` below the base path, built the way url() in src/lib/url.ts builds it (the base
 * contains a dot and is never hard-coded). The linker itself stays out of the core for its size.
 */
const PATH = `${import.meta.env.BASE_URL.replace(/\/*$/, '/')}konfigurator/`;
const idx = (s: StepId) => STEPS.indexOf(s);
/** Actions that validate (and therefore need the validation chunk). */
const VALIDATES = new Set(['NEXT', 'GOTO', 'SUBMIT']);

/**
 * Values of every known control, disabled ones included (the branch may be about to activate).
 * A checked option that the chosen moebel_art does not offer (Sideboard „hängend“ after a switch
 * to Regal) is dropped, so fillDefaults() checks the default and every consumer agrees.
 */
export function readValues(form: HTMLFormElement): Values {
  const v: Values = {};
  for (const el of form.elements as unknown as Iterable<Control>) {
    const { name, type } = el;
    if (!name || !FIELDS[name] || type === 'file') continue;
    if (type === 'checkbox' && FIELDS[name]!.multi) {
      const list = (v[name] ??= []) as string[];
      if (el.checked) list.push(el.value);
    } else if (type === 'checkbox' || type === 'radio') {
      if (el.checked) v[name] = el.value;
    } else v[name] = el.value;
  }
  return effectiveValues(v);
}

export function writeValues(form: HTMLFormElement, v: Values): void {
  for (const el of form.elements as unknown as Iterable<Control>) {
    const x = v[el.name];
    if (x === undefined || el.type === 'file') continue;
    if (el.type === 'checkbox' || el.type === 'radio')
      el.checked = Array.isArray(x) ? x.includes(el.value) : x === el.value;
    else if (!Array.isArray(x)) el.value = x;
  }
}

export function init(root: HTMLElement): void {
  const found = root.querySelector<HTMLFormElement>('form.wizard');
  if (!found) return;
  const form: HTMLFormElement = found;
  const $ = <T extends HTMLElement>(sel: string, from: ParentNode = root) => from.querySelector<T>(sel);
  const $$ = <T extends HTMLElement>(sel: string, from: ParentNode = form) => [...from.querySelectorAll<T>(sel)];
  const msg: Msg = (key) =>
    root.dataset[`msg${key.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`] ?? '';
  const live = root.dataset['mode'] === 'live';
  const announce = createAnnouncer($('[data-live="polite"]'), $('[data-live="assertive"]'));
  const steps = createSteps(root, form, msg);
  const errorUi = {
    form,
    summary: $<HTMLElement>('[data-error-summary]', form),
    list: $<HTMLElement>('[data-error-list]', form),
  };
  const aside = $<HTMLElement>('[data-summary]');
  const draftToggle = $<HTMLInputElement>('[data-draft-toggle]');
  const draftDelete = $<HTMLElement>('[data-action="draft-delete"]');
  const banner = $<HTMLElement>('[data-draft-banner]');
  const shareUrl = $<HTMLInputElement>('[data-share-url]');
  const serviceOut = $<HTMLElement>('[data-service-area]', form);
  const reviewBox = $<HTMLElement>('[data-review-summary]', form);
  const reviewList = $<HTMLElement>('[data-review-list]', form);
  const panel = $<HTMLElement>('[data-preview]', form);

  let ui = initialUi();
  let v = readValues(form);
  let items: Item[] = [];
  let typ: ProjectType | null = null;
  let first = -1;
  let raf = 0;
  let urlTimer = 0;
  let sessionTimer = 0;
  let lastUrl = location.pathname + location.search;
  let preview: ReturnType<PreviewModule['mountPreview']> | null = null;
  let previewMod: PreviewModule | null = null;
  let previewLoad: Promise<PreviewModule> | null = null;
  let val: ValidateModule | null = null;
  let sum: SummaryModule | null = null;
  let sumInit: Promise<unknown> | null = null;
  let submit: Submit | null = null;
  let skipPop = false;

  const query = (): string => {
    const q = toQuery(v, ui.step);
    return PATH + (q ? `?${q}` : '');
  };
  const configUrl = (): string => new URL(query(), location.href).href;
  const slider = (n: Control) => $<Control>(`[data-range-for="${n.name}"]`, form);
  const noop = () => {};
  /** Assertive feedback for a chunk that could not be loaded; the caller's next attempt retries. */
  const loadFailed = () => announce(STATE_MSG.loadFailed, 'assertive');
  /** A chunk loaded on request; after a failed load the next call tries again. */
  function lazy<T>(load: () => Promise<T>): () => Promise<T> {
    let p: Promise<T> | null = null;
    return () =>
      (p ??= load().catch((e: unknown) => {
        p = null;
        throw e;
      }));
  }
  const loadValidate = lazy(() => import('./validate').then((m) => (val = m)));
  const loadSummary = lazy(() => import('./summary').then((m) => (sum = m)));
  const loadSubmit = lazy(() => import('./submit').then((m) => (submit = m.createSubmit(wizard))));
  /** Starts the time-trap clock at the first human interaction (and prefetches the validation). */
  const touch = () => {
    if (first < 0) {
      first = Date.now();
      loadValidate().catch(noop);
    }
  };
  /** Announces a template with the project type's visible label. */
  const sayTyp = (key: string, t: string) =>
    void loadSummary().then((m) => announce(fill(msg(key), { typ: m.optionLabel(form, 'typ', t) })), noop);
  /** The service-area hint; its data sits in the validation chunk, which the first interaction prefetches. */
  const serviceHint = (plz: string) => {
    if (!serviceOut) return;
    if (!plz) serviceOut.textContent = '';
    else void loadValidate().then((m) => (serviceOut.textContent = m.serviceArea(plz)?.message ?? ''), noop);
  };

  // ---- conditions, required, ranges, defaults ------------------------------------------------
  function applyConditions(): void {
    const active = new Set(effectiveConditions(v));
    for (const fs of $$<HTMLFieldSetElement>('fieldset[data-branch]')) fs.disabled = fs.dataset['branch'] !== v['typ'];
    for (const el of $$('[data-when]')) {
      const on = active.has(el.dataset['when']!);
      if (el instanceof HTMLFieldSetElement || el instanceof HTMLInputElement) el.disabled = !on;
      else for (const c of $$<Control>('input,select,textarea', el)) c.disabled = !on;
    }
    for (const el of $$<Control>('[data-required]')) if (el.dataset['required'] !== 'group') el.required = true;
    for (const n of $$<Control>('input[type="number"][name]')) {
      const r = n.name === 'moebel_faecher' ? previewMod?.faecherRange(v) : fieldRange(n.name, v);
      if (!r) continue;
      const s = slider(n);
      n.min = String(r[0]);
      n.max = String(r[1]);
      if (s) {
        s.min = n.min;
        s.max = n.max;
        if (n.value) s.value = n.value;
      }
    }
    steps.setTyp(v['typ'] as ProjectType);
  }

  /** Defaults go only into EMPTY fields of the active configuration (§2 point 5). */
  function fillDefaults(): void {
    for (const name of Object.keys(FIELDS)) {
      const x = v[name];
      if ((x !== undefined && x !== '' && !(Array.isArray(x) && !x.length)) || !visible(name, v)) continue;
      const d = fieldDefault(name, v);
      if (!d) continue;
      const radio = $<Control>(`input[type="radio"][name="${name}"][value="${d}"]`, form);
      const other = $<Control>(`[name="${name}"]:not([type="radio"])`, form);
      if (radio) radio.checked = true;
      else if (other) other.value = d;
      else continue;
      v[name] = d;
    }
  }

  // ---- summary, review, share ----------------------------------------------------------------
  function updateSummary(): void {
    if (shareUrl) shareUrl.value = configUrl();
    if (!sum) {
      // Quiet when it fails: the review step or the submission reports the missing chunk.
      sumInit ??= loadSummary().then(updateSummary, () => (sumInit = null));
      return;
    }
    items = sum.collect(form, v);
    const list = $<HTMLElement>('[data-summary-list]');
    if (list) sum.renderList(list, items);
    const count = $('[data-summary-count]');
    if (count) count.textContent = String(items.length);
    const empty = $('[data-summary-empty]');
    if (empty) empty.hidden = items.length > 0;
    if (ui.step === 'pruefen' && reviewList) {
      sum.renderList(reviewList, items, {
        label: msg('edit'),
        go: (step) => dispatch({ t: 'GOTO', step, via: 'summary' }),
      });
      if (reviewBox) reviewBox.hidden = !items.length;
    }
  }

  const sections = () => (sum ? sum.toSections(items, steps.title) : []);

  // ---- persistence ---------------------------------------------------------------------------
  const snapshot = () => toSnapshot(v, ui.step, ui.furthest);

  function persist(): void {
    if (!urlTimer) {
      urlTimer = window.setTimeout(() => {
        urlTimer = 0;
        const next = query();
        if (next !== lastUrl) {
          lastUrl = next;
          hist.replace(ui.step, next);
        }
      }, 350);
    }
    clearTimeout(sessionTimer);
    sessionTimer = window.setTimeout(store, 300);
  }

  function store(): void {
    clearTimeout(sessionTimer);
    if (ui.phase === 'done') return;
    saveSession(snapshot());
    if (draftToggle?.checked) saveDraft(snapshot());
  }

  // ---- preview (Möbel chunk) -----------------------------------------------------------------
  function syncPreview(): void {
    const moebel = v['typ'] === 'moebel' && !!panel;
    if (moebel && !preview) {
      // Announced once; the build-time sketch stays and a reload retries (no retry per keystroke).
      (previewLoad ??= import('./preview/index').catch((e: unknown) => (loadFailed(), Promise.reject(e)))).then((m) => {
        previewMod = m;
        if (v['typ'] === 'moebel' && !preview) {
          preview = m.mountPreview(form, panel!, announce);
          applyConditions();
        }
      }, noop);
    } else if (!moebel && preview) {
      preview.dispose();
      preview = null;
    }
    preview?.update();
  }

  // ---- the reducer and its effects -----------------------------------------------------------
  function dispatch(a: Action): void {
    if (!val && VALIDATES.has(a.t)) {
      void loadValidate().then(() => dispatch(a), loadFailed);
      return;
    }
    const [next, effects] = reduce(ui, a, {
      steps: STEPS,
      validate: (step) => val!.validateStep(form, steps.section(step), step, v),
      prevStep: hist.prev(),
      typ: a.t === 'TYPE' ? a.typ : typ,
    });
    ui = next;
    run(effects);
  }

  function run(effects: Effect[]): void {
    let shown: Promise<void> = Promise.resolve();
    for (const e of effects) {
      switch (e.e) {
        case 'show':
          val?.clearErrors(errorUi);
          shown = swapStep(() => {
            steps.show(e.step);
            if (e.step === 'pruefen') updateSummary();
          }, e.dir);
          break;
        case 'history':
          if (e.mode === 'back') hist.back();
          else hist[e.mode](ui.step, (lastUrl = query()));
          break;
        case 'errors':
          val?.showErrors(errorUi, e.list);
          break;
        case 'focus':
          void shown.then(() => focus(e.target));
          break;
        case 'announce':
          announce(e.text, e.level);
          break;
        case 'persist':
          persist();
          break;
        case 'send':
          // The submission (success view, live send, mailto) loads on request.
          void loadSubmit().then((s) => s.send(), sendUnavailable);
          break;
      }
    }
  }

  /**
   * The submit chunk could not load: the error panel (live) shows the network line, FAILED announces
   * it (demo too); „Erneut senden“ (handled below while the chunk is missing) and the submit button retry.
   */
  function sendUnavailable(): void {
    const p = $<HTMLElement>('[data-submit-error]', form);
    if (p) {
      for (const r of $$('[data-reason]', p)) r.hidden = r.dataset['reason'] !== 'network';
      p.hidden = false;
      p.tabIndex = -1;
    }
    dispatch({ t: 'FAILED', reason: 'network' });
  }

  function focus(target: 'heading' | 'errors' | 'result'): void {
    if (target === 'result') return submit ? submit.focusResult() : $('[data-submit-error]', form)?.focus();
    const el = target === 'errors' ? errorUi.summary : steps.heading(ui.step);
    el?.focus({ preventScroll: true });
    (target === 'errors' ? el : steps.section(ui.step))?.scrollIntoView({ block: 'start' });
  }

  // ---- events --------------------------------------------------------------------------------
  /** Work after a change, coalesced per animation frame. */
  function sync(): void {
    raf = 0;
    v = readValues(form);
    applyConditions();
    syncPreview();
    updateSummary();
    // Shown errors re-validate on input (§3 "Validation").
    if (val && $('.field.is-invalid', form))
      val.showErrors(errorUi, val.validateStep(form, steps.section(ui.step), ui.step, v));
    persist();
  }
  const schedule = () => {
    raf ||= requestAnimationFrame(sync);
  };

  form.addEventListener('pointerdown', touch);
  form.addEventListener('keydown', touch);
  form.addEventListener('input', (e) => {
    const el = e.target as Control;
    touch();
    if (el.dataset['rangeFor']) {
      const n = $<Control>(`[name="${el.dataset['rangeFor']}"]`, form);
      if (n) n.value = el.value;
    } else if (el.type === 'number') {
      const s = slider(el);
      if (s && el.value) s.value = el.value;
    }
    if (el.name === 'plz') serviceHint(el.value);
    schedule();
  });

  form.addEventListener('change', (e) => {
    const el = e.target as Control;
    if (el.name === 'typ') {
      v = readValues(form);
      const prev = typ;
      typ = el.value as ProjectType;
      fillDefaults();
      dispatch({ t: 'TYPE', typ });
      if (prev && prev !== typ) sayTyp('type-switched', typ);
    } else if (el.name === 'moebel_art') {
      v = readValues(form);
      fillDefaults();
    } else if (el.type === 'file') {
      const list = el.closest('.field')?.querySelector<HTMLElement>('[data-photo-list]') ?? null;
      // The files stay in the input; the next selection retries the chunk.
      void import('./photos').then((m) => m.handlePhotos(el, list, msg('photo-remove'), schedule), loadFailed);
    }
    schedule();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    dispatch({ t: ui.step === 'pruefen' ? 'SUBMIT' : 'NEXT' });
  });

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-goto]');
    if (!b) return;
    const goto = b.dataset['goto'] as StepId | undefined;
    if (goto) return dispatch({ t: 'GOTO', step: goto, via: 'ui' });
    switch (b.dataset['action']) {
      case 'next':
        return dispatch({ t: 'NEXT' });
      case 'back':
        return dispatch({ t: 'BACK' });
      case 'retry':
        // submit.ts handles the panel once it is loaded; this is the retry while it is missing.
        return submit ? undefined : dispatch({ t: 'SUBMIT' });
      case 'copy-link':
        return void loadSummary()
          .then((m) => m.copyText(configUrl()))
          .then((ok) => ok && announce(msg('link-copied')), loadFailed);
      case 'draft-delete':
        if (draftToggle) draftToggle.checked = false;
        return dropDraft();
      case 'draft-resume':
        if (draft) {
          restore(draft.values, draft.step, draft.furthest, true);
          if (draftToggle) draftToggle.checked = true;
          if (draftDelete) draftDelete.hidden = false;
        }
        return hideBanner();
      case 'draft-discard':
        dropDraft();
        return hideBanner();
    }
  });

  function dropDraft(): void {
    clearDraft();
    if (draftDelete) draftDelete.hidden = true;
    announce(msg('draft-deleted'));
  }
  function hideBanner(): void {
    if (banner) banner.hidden = true;
  }

  if (draftToggle) {
    draftToggle.addEventListener('change', () => {
      if (draftToggle.checked) {
        if (saveDraft(snapshot())) announce(msg('draft-saved'));
        if (draftDelete) draftDelete.hidden = false;
      } else dropDraft();
    });
  }

  addEventListener('pagehide', store);

  const hist = createHistory((step) => {
    if (skipPop) {
      skipPop = false;
      return;
    }
    if (ui.phase === 'done') return submit?.alreadySent(() => (skipPop = true));
    dispatch({ t: 'GOTO', step, via: 'history' });
  });

  // ---- restore and start ---------------------------------------------------------------------
  /** `stored`: the values come from this device's session or draft, which proves a human filled them (time-trap). */
  function restore(values: Values, step: StepId, furthest: number, stored = false): void {
    writeValues(form, values);
    v = readValues(form);
    typ = (v['typ'] as ProjectType) || null;
    ui = { ...initialUi(step), furthest: Math.max(furthest, idx(step)) };
    if (stored && first < 0) first = Date.now() - MIN_FILL_MS;
    if (typ) fillDefaults();
    applyConditions();
    syncPreview();
    serviceHint($<Control>('[name="plz"]', form)?.value ?? '');
    show(ui.step);
    // The empty sidebar text is in the HTML; the summary module loads once there is something to show.
    if (typ || sum) updateSummary();
    // A shared link or a stale session may point past an incomplete step: fall back silently, like GOTO.
    if (idx(step) > 0) void loadValidate().then(clampRestored, noop);
  }

  function show(step: StepId): void {
    steps.show(step);
    hist.replace(step, (lastUrl = query()));
    store();
  }

  function clampRestored(): void {
    for (let i = 0; i < idx(ui.step); i++) {
      const s = STEPS[i]!;
      if (!val!.validateStep(form, steps.section(s), s, v).length) continue;
      ui = { ...ui, step: s };
      show(s);
      return;
    }
  }

  const wizard: Wizard = {
    root,
    form,
    live,
    msg,
    announce,
    ui: () => ui,
    values: () => v,
    items: () => items,
    sections: () => sections().map((s) => [s.title, ...s.lines].join('\n')),
    text: () => (sum ? sum.toText(sections()) : ''),
    configUrl,
    elapsed: () => (first < 0 ? -1 : Date.now() - first),
    dispatch,
    // Only a live drawing counts; Bett/andere keep the build-time example sketch in the panel.
    drawing: () =>
      v['typ'] === 'moebel' && panel?.dataset['previewState'] === 'live'
        ? ($('[data-preview-drawing]', panel)?.innerHTML ?? '')
        : '',
    reset() {
      form.reset();
      clearSession();
      clearDraft();
      first = -1;
      restore({}, 'projekt', 0);
      focus('heading');
    },
  };

  root.dataset['enhanced'] = '';
  form.noValidate = true;
  for (const s of $$('[data-range-for]')) s.hidden = false;
  const termin = $<Control>('[name="termin"]', form);
  if (termin) termin.min = new Date().toLocaleDateString('sv');
  if (aside) aside.hidden = false;

  // Path variant konfigurator/<typ>/ → konfigurator/?typ=<typ> (§1 "Deep links").
  const q = new URLSearchParams(location.search);
  const preset = $<Control>('input[name="typ"]:checked', form)?.value;
  if (preset && location.pathname !== PATH) {
    q.set('typ', preset);
    hist.replace('projekt', `${PATH}?${q}`);
  }
  const fromUrl = fromQuery(q);
  const session = loadSession();
  const draft = session || fromUrl.values['typ'] ? null : loadDraft();
  let values: Values = session?.values ?? {};
  let step: StepId = session?.step ?? 'projekt';
  let preselected = '';
  if (fromUrl.values['typ']) {
    values = { ...values, ...fromUrl.values };
    if (fromUrl.step) step = fromUrl.step;
    else if (session?.values['typ'] !== fromUrl.values['typ']) {
      step = 'details';
      preselected = fromUrl.values['typ'] as string;
    }
  }
  restore(values, step, session?.furthest ?? 0, !!session);
  if (preselected) sayTyp('type-preselected', preselected);
  if (draft && banner) {
    const date = $('[data-draft-date]', banner);
    if (date) date.textContent = draftDate(draft);
    banner.hidden = false;
  }
}
