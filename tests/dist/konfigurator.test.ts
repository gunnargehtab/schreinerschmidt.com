// Markup of the quote wizard in dist/ (docs/configurator.md §2 "No-JS baseline", §7 "Markup"):
// the registry (fields.ts, conditions.ts) and the HTML must stay in lockstep, in both directions.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { HTMLElement } from 'node-html-parser';
import { expect, it } from 'vitest';
import { CONDITIONS, FORM_ID, PROJECT_TYPES } from '../../src/lib/configurator/conditions';
import { FIELDS, FIELD_NAMES, STEPS } from '../../src/lib/configurator/fields';
import { DIST, describeDist, getBase, isDemo, loadPages, type DistPage } from '../helpers/dist';

/** Names of the infrastructure controls: form service fields and JS-filled payload fields. */
const INFRASTRUCTURE = [
  '_subject',
  '_replyto',
  '_lang',
  '_next',
  'MAX_FILE_SIZE',
  'anfrage_id',
  'anfrage_json',
  'zusammenfassung',
];
const HTML_REQUIRED = ['typ', 'plz', 'name', 'email'];
/** Custom properties that may sit in a style attribute (CLAUDE.md "CSP"). */
const ALLOWED_STYLE_PROPS = ['--vt', '--pos', '--to', '--ar', '--digits', '--dominant', '--wordmark-mask', '--wordmark-ar', '--sketch-size'];

const pages = loadPages();
const index = pages.find((p) => p.rel === 'konfigurator/index.html');
const variants = PROJECT_TYPES.map((typ) => ({ typ, page: pages.find((p) => p.rel === `konfigurator/${typ}/index.html`) }));
const wizardPages: [string, DistPage][] = [
  ...(index ? ([['konfigurator/', index]] as [string, DistPage][]) : []),
  ...variants.flatMap(({ typ, page }) => (page ? ([[`konfigurator/${typ}/`, page]] as [string, DistPage][]) : [])),
];

const form = (page: DistPage): HTMLElement => {
  const el = page.root.querySelector(`form#${FORM_ID}`);
  if (!el) throw new Error(`${page.rel}: no form#${FORM_ID}`);
  return el;
};

/** Named controls of the wizard form, without the honeypot. */
function controls(page: DistPage): HTMLElement[] {
  return form(page)
    .querySelectorAll('input, select, textarea')
    .filter((el) => el.getAttribute('name') && !isInHoneypot(el));
}

function isInHoneypot(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentNode as HTMLElement | null) {
    if (n.getAttribute?.('data-hp') !== undefined) return true;
  }
  return false;
}

function ancestor(el: HTMLElement, test: (n: HTMLElement) => boolean): HTMLElement | null {
  for (let n = el.parentNode as HTMLElement | null; n; n = n.parentNode as HTMLElement | null) {
    if (test(n)) return n;
  }
  return null;
}

const fieldOf = (el: HTMLElement): HTMLElement | null =>
  el.getAttribute('data-field') ? el : ancestor(el, (n) => n.getAttribute('data-field') !== undefined);

describeDist('konfigurator: pages', () => {
  it('has the index and the 8 typ variants', () => {
    expect(index, 'konfigurator/index.html').toBeDefined();
    expect(variants.filter((v) => !v.page).map((v) => v.typ)).toEqual([]);
  });

  it.each(wizardPages)('%s: one h1, the wizard form and the generated stylesheet', (_p, page) => {
    expect(page.root.querySelectorAll('h1')).toHaveLength(1);
    expect(page.root.querySelectorAll(`form#${FORM_ID}`)).toHaveLength(1);
    const link = page.root
      .querySelectorAll('link[rel="stylesheet"]')
      .find((l) => (l.getAttribute('href') ?? '').endsWith('konfigurator/bedingungen.css'));
    expect(link, 'link to konfigurator/bedingungen.css').toBeDefined();
    expect(link?.getAttribute('href')).toBe(`${getBase()}konfigurator/bedingungen.css`);
    expect(existsSync(join(DIST, 'konfigurator', 'bedingungen.css'))).toBe(true);
  });

  // The demo build is noindex and carries no canonical (tests/dist/pages.test.ts); the audit build does.
  it.each(wizardPages)('%s: canonical points to konfigurator/ (not in the noindex demo)', (_p, page) => {
    const href = page.root.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (isDemo()) expect(href).toBeUndefined();
    else expect(href).toMatch(/\/konfigurator\/$/);
  });

  it.each(variants.filter((v) => v.page).map((v) => [v.typ, v.page as DistPage] as const))(
    'variant %s: exactly one typ is checked, and it is the variant',
    (typ, page) => {
      const checked = form(page).querySelectorAll('input[name="typ"]').filter((r) => r.getAttribute('checked') !== undefined);
      expect(checked.map((r) => r.getAttribute('value'))).toEqual([typ]);
    },
  );

  it('the index has no typ checked', () => {
    const checked = form(index as DistPage)
      .querySelectorAll('input[name="typ"]')
      .filter((r) => r.getAttribute('checked') !== undefined);
    expect(checked).toEqual([]);
  });

  it('titles of the variants are distinct', () => {
    const titles = wizardPages.map(([, p]) => p.root.querySelector('title')?.text.trim());
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describeDist('konfigurator: registry and markup in lockstep', () => {
  const demo = isDemo();

  it.each(wizardPages)('%s: every named control is in FIELDS, and every field has a control', (_p, page) => {
    const names = new Set(controls(page).map((el) => el.getAttribute('name') as string));
    for (const n of INFRASTRUCTURE) names.delete(n);
    const expected = new Set(FIELD_NAMES);
    // Demo mode has no file input (docs/configurator.md photo policy).
    if (demo) expected.delete('fotos[]');
    expect([...names].filter((n) => !expected.has(n)).sort(), 'controls without a field').toEqual([]);
    expect([...expected].filter((n) => !names.has(n)).sort(), 'fields without a control').toEqual([]);
  });

  it.each(wizardPages)('%s: infrastructure fields exist in live mode only', (_p, page) => {
    const names = controls(page).map((el) => el.getAttribute('name') as string);
    for (const n of INFRASTRUCTURE) expect(names.includes(n), n).toBe(!demo);
  });

  it.each(wizardPages)('%s: `required` only on typ, plz, name and email', (_p, page) => {
    const required = controls(page).filter((el) => el.getAttribute('required') !== undefined);
    const names = new Set(required.map((el) => el.getAttribute('name')));
    expect([...names].sort()).toEqual([...HTML_REQUIRED].sort());
    // …and those four are required wherever they appear.
    for (const name of HTML_REQUIRED) {
      for (const el of controls(page).filter((c) => c.getAttribute('name') === name)) {
        expect(el.getAttribute('required'), name).not.toBeUndefined();
      }
    }
  });

  it.each(wizardPages)('%s: every [data-required] maps to a required:"js" field, and back', (_p, page) => {
    const marked = new Set<string>();
    for (const el of form(page).querySelectorAll('[data-required]')) {
      const field = fieldOf(el);
      const name = field?.getAttribute('data-field') ?? '';
      expect(FIELDS[name]?.required, `${name} (${el.tagName})`).toBe('js');
      marked.add(name);
    }
    const expected = FIELD_NAMES.filter((n) => FIELDS[n]?.required === 'js');
    expect([...marked].sort()).toEqual(expected.sort());
  });

  it.each(wizardPages)('%s: data-branch and data-when ids are valid and used', (_p, page) => {
    const branches = form(page).querySelectorAll('[data-branch]').map((el) => el.getAttribute('data-branch') as string);
    expect(branches.filter((b) => !(PROJECT_TYPES as readonly string[]).includes(b))).toEqual([]);
    expect(new Set(branches)).toEqual(new Set(PROJECT_TYPES));
    const ids = CONDITIONS.map((c) => c.id);
    const whens = form(page).querySelectorAll('[data-when]').map((el) => el.getAttribute('data-when') as string);
    expect(whens.filter((w) => !ids.includes(w))).toEqual([]);
    expect(ids.filter((id) => !whens.includes(id))).toEqual([]);
  });

  it.each(wizardPages)('%s: each field sits in its step, branch and condition', (_p, page) => {
    for (const el of controls(page)) {
      const name = el.getAttribute('name') as string;
      const f = FIELDS[name];
      if (!f) continue; // infrastructure
      const step = ancestor(el, (n) => n.getAttribute('data-step') !== undefined);
      expect(step?.getAttribute('data-step'), `${name}: step`).toBe(f.step);
      if (f.branch) {
        const b = ancestor(el, (n) => n.getAttribute('data-branch') !== undefined);
        expect(b?.getAttribute('data-branch'), `${name}: branch`).toBe(f.branch);
      }
      if (f.when) {
        // The field wrapper carries the field's own condition; option labels may carry their own.
        expect(fieldOf(el)?.getAttribute('data-when'), `${name}: when`).toBe(f.when);
      }
    }
  });

  it.each(wizardPages)('%s: every .field has a label, a hidden error slot and data-field', (_p, page) => {
    for (const field of form(page).querySelectorAll('.field')) {
      const name = field.getAttribute('data-field') ?? '';
      expect(name, 'data-field').not.toBe('');
      // Demo mode shows the e-mail hint instead of a file input: nothing to report errors for.
      if (name === 'fotos[]' && demo) continue;
      expect(field.getAttribute('data-label'), `${name}: data-label`).toBeTruthy();
      const slot = field.querySelectorAll('.field__error');
      expect(slot, `${name}: error slot`).toHaveLength(1);
      expect(slot[0]?.getAttribute('id'), name).toMatch(/-fehler$/);
      expect(slot[0]?.getAttribute('hidden'), name).not.toBeUndefined();
    }
  });

  it.each(wizardPages)('%s: clean no-JS submission (no preselected branch values)', (_p, page) => {
    for (const el of controls(page)) {
      const name = el.getAttribute('name') as string;
      const type = el.getAttribute('type');
      if (type === 'radio' || type === 'checkbox') {
        if (name !== 'typ') expect(el.getAttribute('checked'), name).toBeUndefined();
      } else if (type === 'number') {
        expect(el.getAttribute('value'), name).toBeUndefined();
      }
      if (name in FIELDS && type !== 'radio' && type !== 'checkbox' && type !== 'hidden' && type !== 'file') {
        expect(el.getAttribute('autocomplete'), name).toBeTruthy();
      }
      if (type === 'checkbox' && !FIELDS[name]?.multi) expect(el.getAttribute('value'), name).toBe('1');
    }
  });

  it.each(wizardPages)('%s: range sliders are hidden, unnamed and labelled', (_p, page) => {
    const ranges = form(page).querySelectorAll('input[type="range"]');
    expect(ranges.length).toBeGreaterThan(0);
    for (const r of ranges) {
      const name = r.getAttribute('data-range-for') ?? '';
      expect(r.getAttribute('name')).toBeUndefined();
      expect(r.getAttribute('hidden')).not.toBeUndefined();
      expect(r.getAttribute('aria-label')).toMatch(/\(Schieberegler\)$/);
      expect(form(page).querySelectorAll(`input[type="number"][name="${name}"]`)).toHaveLength(1);
    }
  });
});

describeDist('konfigurator: DOM contract', () => {
  const demo = isDemo();

  it.each(wizardPages)('%s: six steps with focusable headings', (_p, page) => {
    const steps = form(page).querySelectorAll('section.step');
    expect(steps.map((s) => s.getAttribute('data-step'))).toEqual([...STEPS]);
    for (const s of steps) {
      const id = s.getAttribute('data-step');
      const h = s.querySelector(`h2#h-${id}`);
      expect(s.getAttribute('aria-labelledby')).toBe(`h-${id}`);
      expect(h?.getAttribute('tabindex')).toBe('-1');
      expect(h?.querySelector('[data-step-prefix]')?.text).toMatch(/^Schritt \d:$/);
    }
  });

  it.each(wizardPages)('%s: form attributes follow the mode', (_p, page) => {
    const f = form(page);
    expect(f.getAttribute('autocomplete')).toBe('off');
    if (demo) {
      expect(f.getAttribute('method')).toBe('dialog');
      expect(f.getAttribute('action')).toBeUndefined();
      expect(page.root.querySelector('[data-demo-note]')?.text).toContain('Demo: Es werden keine Daten übertragen.');
    } else {
      expect(f.getAttribute('method')).toBe('post');
      expect(f.getAttribute('enctype')).toBe('multipart/form-data');
      expect(f.getAttribute('action')).toMatch(/^https:\/\//);
      const next = f.querySelector('input[name="_next"]')?.getAttribute('value') ?? '';
      expect(next).toMatch(/^https:\/\/.+\/konfigurator\/danke\/$/);
      expect(f.querySelector('input[name="_lang"]')?.getAttribute('value')).toBe('de');
    }
  });

  it.each(wizardPages)('%s: submit precedes the step nav; nav, progress and sidebar are hidden', (_p, page) => {
    const html = page.html;
    const submit = html.indexOf('data-action="submit"');
    const nav = html.indexOf('data-step-nav');
    expect(submit).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(submit);
    const f = form(page);
    expect(f.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(f.querySelector('[data-step-nav]')?.getAttribute('hidden')).not.toBeUndefined();
    expect(f.querySelectorAll('[data-step-nav] button').map((b) => b.getAttribute('data-action'))).toEqual(['back', 'next']);
    expect(page.root.querySelector('nav.progress')?.getAttribute('hidden')).not.toBeUndefined();
    expect(page.root.querySelectorAll('nav.progress li[data-step-link]').map((li) => li.getAttribute('data-step-link'))).toEqual([...STEPS]);
    const aside = page.root.querySelector('aside[data-summary]');
    expect(aside?.getAttribute('aria-labelledby')).toBe('h-auswahl');
    expect(aside?.getAttribute('hidden')).not.toBeUndefined();
    expect(f.querySelector('aside, [data-draft-toggle], [data-summary]'), 'sidebar stays outside the form').toBeNull();
  });

  it.each(wizardPages)('%s: error summary, live regions, service area, preview, success view', (_p, page) => {
    const summary = page.root.querySelector('[data-error-summary]');
    expect(summary?.getAttribute('tabindex')).toBe('-1');
    expect(summary?.getAttribute('hidden')).not.toBeUndefined();
    expect(summary?.querySelectorAll('ul')).toHaveLength(1);
    expect(page.root.querySelector('[data-live="polite"]')?.getAttribute('aria-live')).toBe('polite');
    expect(page.root.querySelector('[data-live="assertive"]')?.getAttribute('aria-live')).toBe('assertive');
    const out = page.root.querySelector('output#einzugsgebiet');
    expect(out?.getAttribute('aria-live')).toBe('polite');
    expect(page.root.querySelector(`#${out?.getAttribute('for')}`)?.getAttribute('name')).toBe('plz');
    const success = page.root.querySelector('section[data-success]');
    expect(success?.getAttribute('hidden')).not.toBeUndefined();
    expect(success?.getAttribute('tabindex')).toBe('-1');
    expect(success?.querySelector('[data-anfrage-id]')).not.toBeNull();
    expect(success?.querySelectorAll('[data-action]').map((b) => b.getAttribute('data-action')).sort()).toEqual(
      ['copy', 'link', 'mail', 'print', 'save'],
    );
    for (const b of success?.querySelectorAll('[data-action]') ?? []) expect(b.getAttribute('hidden')).not.toBeUndefined();
    expect(success?.querySelectorAll('.timeline__item')).toHaveLength(6);
    // The 3D snapshot (§4.12): hidden until JS has a snapshot; the link gets href + download from JS.
    const snap = success?.querySelector('figure[data-success-snapshot]');
    expect(snap?.getAttribute('hidden')).not.toBeUndefined();
    expect(snap?.querySelector('a[data-snapshot-link]')?.getAttribute('href')).toBeUndefined();
    const fig = page.root.querySelector('figure[data-preview]');
    expect(fig?.getAttribute('data-branch')).toBe('moebel');
    expect(fig?.querySelector('[data-preview-drawing] svg[role="img"] title')).not.toBeNull();
    expect(fig?.querySelector('figcaption')?.text).toBe('Beispielskizze');
    expect(fig?.querySelector('[data-viewer]')?.getAttribute('hidden')).not.toBeUndefined();
  });

  it.each(wizardPages)('%s: photos once per branch with unique ids, honeypot present', (_p, page) => {
    const photos = form(page).querySelectorAll('fieldset[data-field="fotos[]"]');
    expect(photos.map((p) => p.getAttribute('data-branch')).sort()).toEqual([...PROJECT_TYPES].sort());
    expect(form(page).querySelectorAll('[data-hp] input')).toHaveLength(1);
    const ids = page.root.querySelectorAll('[id]').map((el) => el.getAttribute('id'));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    if (!demo) expect(form(page).querySelectorAll('input[type="file"]')).toHaveLength(PROJECT_TYPES.length);
  });

  it.each(wizardPages)('%s: only allowed custom properties in style attributes; no inline <style>', (_p, page) => {
    for (const el of page.root.querySelectorAll('[style]')) {
      const props = (el.getAttribute('style') ?? '')
        .split(';')
        .map((d) => d.trim().split(':')[0]?.trim() ?? '')
        .filter(Boolean);
      for (const p of props) expect(ALLOWED_STYLE_PROPS, `style="${el.getAttribute('style')}"`).toContain(p);
    }
    expect(page.root.querySelectorAll('[define\\:vars]')).toHaveLength(0);
  });

  it.each(wizardPages)('%s: only phrasing content inside <label>', (_p, page) => {
    for (const label of page.root.querySelectorAll('label')) {
      expect(label.querySelectorAll('div, p, ul, ol, fieldset, h1, h2, h3, h4, h5, h6, section'), label.text.trim()).toHaveLength(0);
    }
  });

  it.each(wizardPages)('%s: Möbel and other titles for steps 2 and 3, German typography', (_p, page) => {
    for (const id of ['details', 'ausfuehrung']) {
      const h = page.root.querySelector(`h2#h-${id}`);
      expect(h?.querySelector('[data-title-moebel]')).not.toBeNull();
      expect(h?.querySelector('[data-title-other]')).not.toBeNull();
    }
    const text = form(page).text;
    expect(text).not.toMatch(/\d (cm|mm|m²|lfm)\b/);
  });
});
