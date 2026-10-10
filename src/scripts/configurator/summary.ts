// Summary of the wizard (docs/configurator.md §3 "Summary sidebar", §5): ONE source for the sidebar
// <dl>, the review step, the success view, the mail text, the .txt download and the live payload.
// `collect()` reads the DOM (labels, option texts, units); everything after it is pure and covered
// by tests/unit/configurator/summary.test.ts.
import { visible } from '../../lib/configurator/conditions';
import { FIELDS, STEPS, effectiveValues, type StepId, type Values } from '../../lib/configurator/fields';

/** A label as it reads in a summary line: trailing question mark or colon dropped (as messages.de.ts bare()). */
const bare = (label: string): string => label.replace(/\s*[?:]\s*$/, '');

export interface Item {
  name: string;
  label: string;
  value: string;
  step: StepId;
}

export interface Section {
  step: StepId;
  title: string;
  lines: string[];
}

/** U+202F between number and unit (CLAUDE.md). */
const NNBSP = ' ';

/**
 * The `.field` of a control whose controls are enabled (photos exist once per branch; only the
 * active branch's copy counts).
 */
export function fieldEl(form: HTMLFormElement, name: string): HTMLElement | null {
  for (const f of form.querySelectorAll<HTMLElement>(`.field[data-field="${name}"]`)) {
    const c = f.querySelector<HTMLInputElement>('input,select,textarea');
    if (!c || !c.matches(':disabled')) return f;
  }
  return null;
}

/** The visible text of an option (`#f-<name>-<value>` → its label). */
export function optionLabel(form: HTMLFormElement, name: string, value: string): string {
  const input = form.querySelector(`#f-${name}-${CSS.escape(value)}`);
  return input?.closest('label')?.querySelector('.choice__label')?.textContent?.trim() || value;
}

/**
 * Visible, filled fields in registry order; the values as the user reads them. A stale option of
 * another moebel_art (hidden by its label[data-when]) is left out, like in the payload and the URL.
 */
export function collect(form: HTMLFormElement, raw: Values): Item[] {
  const items: Item[] = [];
  const values = effectiveValues(raw);
  for (const [name, f] of Object.entries(FIELDS)) {
    if (f.kind === 'file' || name === 'tisch_brett' || !visible(name, values)) continue;
    const raw = values[name];
    const list = (Array.isArray(raw) ? raw : [raw ?? '']).filter((s) => s.trim() !== '');
    const field = list.length ? fieldEl(form, name) : null;
    if (!field) continue;
    let value: string;
    if (f.kind === 'enum') value = list.map((v) => optionLabel(form, name, v)).join(', ');
    else if (f.kind === 'bool') value = 'Ja';
    else if (f.kind === 'date') value = list[0]!.split('-').reverse().join('.');
    else value = list.join(', ') + (f.unit ? NNBSP + f.unit : '');
    items.push({ name, label: bare(field.dataset['label'] ?? name), value, step: f.step });
  }
  return items;
}

/** Items grouped by step, in step order; empty steps are left out. */
export function toSections(items: Item[], title: (step: StepId) => string): Section[] {
  return STEPS.map((step) => ({
    step,
    title: title(step),
    lines: items.filter((i) => i.step === step).map((i) => `${i.label}: ${i.value}`),
  })).filter((s) => s.lines.length);
}

/** German plain text: one block per step, a blank line between them. */
export const toText = (sections: Section[]): string =>
  sections.map((s) => [s.title, ...s.lines].join('\n')).join('\n\n');

/** Clipboard API with the execCommand fallback (share link, summary copy). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.body.appendChild(document.createElement('textarea'));
    ta.value = text;
    ta.className = 'visually-hidden';
    ta.select();
    let ok = false;
    try {
      // execCommand is deprecated, but it is the only copy path where the Clipboard API is missing
      // or denied (insecure context, some embedded browsers); the structural type hides lib.dom's
      // deprecation marker from `astro check`.
      ok = (document as unknown as { execCommand(command: string): boolean }).execCommand('copy');
    } catch {
      // Not available either.
    }
    ta.remove();
    return ok;
  }
}

/** Fills a <dl> with the items; with `edit`, every row ends in an „Ändern“ button for its step. */
export function renderList(dl: HTMLElement, items: Item[], edit?: { label: string; go(step: StepId): void }): void {
  dl.replaceChildren(
    ...items.flatMap((i) => {
      const dt = document.createElement('dt');
      dt.textContent = i.label;
      const dd = document.createElement('dd');
      dd.textContent = i.value;
      if (edit) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--ghost btn--small review__edit';
        b.textContent = edit.label;
        b.setAttribute('aria-label', `${edit.label}: ${i.label}`);
        b.onclick = () => edit.go(i.step);
        dd.append(' ', b);
      }
      return [dt, dd];
    }),
  );
}
