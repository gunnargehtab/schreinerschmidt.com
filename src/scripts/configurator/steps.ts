// Step DOM of the wizard (docs/configurator.md §3 "Focus, live regions, progress"): shows one
// <section class="step"> at a time, writes the "Schritt n von 6" prefix into the headings and the
// document title, drives the progress line (aria-current, done text, "2/6") and the Weiter/Zurück
// buttons, and switches the Möbel/other titles of steps 2 and 3. All German text comes from the DOM
// (data-msg-* templates on the root, the titles inside the headings).
import { STEPS, type ProjectType, type StepId } from '../../lib/configurator/fields';

/** Reads a `data-msg-<key>` template of the root. */
export type Msg = (key: string) => string;

export interface StepsUi {
  /** Reveals `step` (and hides the others), updates heading, title, progress and nav. */
  show(step: StepId): void;
  section(step: StepId): HTMLElement;
  heading(step: StepId): HTMLElement | null;
  /** The visible title of a step ("Möbel & Maße" or "Ihr Vorhaben"). */
  title(step: StepId): string;
  /** Switches the Möbel/other title spans of steps 2 and 3 (headings and progress line). */
  setTyp(typ: ProjectType | null | undefined): void;
}

/** Fills `{n}`, `{total}`, `{title}` … in a template. */
export const fill = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export function createSteps(root: HTMLElement, form: HTMLFormElement, msg: Msg): StepsUi {
  const total = STEPS.length;
  const sections = Object.fromEntries(
    STEPS.map((id) => [id, form.querySelector<HTMLElement>(`.step[data-step="${id}"]`)!]),
  ) as Record<StepId, HTMLElement>;
  const progress = root.querySelector<HTMLElement>('[data-progress]');
  const compact = root.querySelector<HTMLElement>('[data-progress-compact]');
  const nav = form.querySelector<HTMLElement>('[data-step-nav]');
  const back = nav?.querySelector<HTMLElement>('[data-action="back"]');
  const next = nav?.querySelector<HTMLElement>('[data-action="next"]');
  const baseTitle = document.title;
  const prefixTpl = msg('step-heading').split('{title}')[0]?.trim() ?? '';
  let moebel = false;

  const title = (step: StepId): string =>
    sections[step]
      .querySelector(`h2 [data-title${moebel ? '-moebel' : '-other'}], h2 [data-title]`)
      ?.textContent?.trim() ?? '';

  // Headings read "Schritt n von 6:" from now on (the no-JS prefix was "Schritt n:").
  STEPS.forEach((id, i) => {
    const prefix = sections[id].querySelector('[data-step-prefix]');
    if (prefix) prefix.textContent = fill(prefixTpl, { n: i + 1, total });
  });
  if (progress) progress.hidden = false;
  if (nav) nav.hidden = false;

  return {
    section: (step) => sections[step],
    heading: (step) => sections[step].querySelector('h2'),
    title,
    setTyp(typ) {
      moebel = typ === 'moebel';
      for (const el of root.querySelectorAll<HTMLElement>('[data-title-moebel]')) el.hidden = !moebel;
      for (const el of root.querySelectorAll<HTMLElement>('[data-title-other]')) el.hidden = moebel;
    },
    show(step) {
      const cur = STEPS.indexOf(step);
      STEPS.forEach((id, i) => {
        sections[id].hidden = i !== cur;
        const li = progress?.querySelector<HTMLElement>(`[data-step-link="${id}"]`);
        const button = li?.querySelector<HTMLButtonElement>('[data-goto]');
        const done = li?.querySelector<HTMLElement>('[data-done]');
        // Every step stays a button: the reducer clamps forward jumps at the first invalid step.
        if (button) {
          if (i === cur) button.setAttribute('aria-current', 'step');
          else button.removeAttribute('aria-current');
        }
        if (done) done.hidden = i >= cur;
      });
      if (compact) compact.textContent = fill(msg('compact'), { n: cur + 1, total });
      if (back) back.hidden = cur === 0;
      if (next) next.hidden = cur === total - 1;
      document.title = `${fill(msg('step-heading'), { n: cur + 1, total, title: title(step) })} – ${baseTitle}`;
    },
  };
}
