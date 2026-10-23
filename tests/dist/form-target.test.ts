// Where the forms post, per build (decision D3, docs/assistant.md §0; docs/angebot.md §9;
// src/lib/form-target.mjs). The same file checks every build variant against its env:
// - demo (`npm run build`): no form posts, no assistant origin anywhere, today's timeline and
//   the demo Datenschutz text;
// - form.taxi fallback (`npm run build:audit`): the forms post to PUBLIC_FORM_ENDPOINT;
// - assistant (`npm run build:assistant`, env/assistant.env): every form posts multipart to
//   `${PUBLIC_ASSISTANT_ENDPOINT}/anfrage`, the live timeline and the „Anfragen und Preisrahmen“
//   section render, the form.taxi text does not.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { expect, it } from 'vitest';
import { FORM_ID, PROJECT_TYPES } from '../../src/lib/configurator/conditions';
import { ROOT, assistantOrigin, describeDist, isDemo, listFiles, loadPages, type DistPage } from '../helpers/dist';

const pages = loadPages();
const page = (rel: string): DistPage => {
  const p = pages.find((x) => x.rel === rel);
  if (!p) throw new Error(`${rel} is missing in the build`);
  return p;
};

const demo = isDemo();
const assistant = assistantOrigin();
const formTaxi = !demo && !assistant ? (process.env['PUBLIC_FORM_ENDPOINT'] ?? null) : null;
const service = demo ? 'demo' : assistant ? 'assistant' : 'formtaxi';
/** The action every live form must carry. */
const action = assistant ? `${assistant}/anfrage` : formTaxi;

/** The assistant origin of env/assistant.env: it must never leak into another build. */
const testAssistantOrigin = (): string => {
  const env = readFileSync(join(ROOT, 'env/assistant.env'), 'utf8');
  const raw = /^PUBLIC_ASSISTANT_ENDPOINT=(.+)$/m.exec(env)?.[1]?.trim();
  if (!raw) throw new Error('env/assistant.env has no PUBLIC_ASSISTANT_ENDPOINT');
  return new URL(raw).origin;
};

/** The forms that post: kontakt, karriere and every configurator page. */
const formPages: [string, string][] = [
  ['kontakt/index.html', 'form#kontakt-form'],
  ['karriere/index.html', 'form#bewerbung-form'],
  ['konfigurator/index.html', `form#${FORM_ID}`],
  ...PROJECT_TYPES.map((typ): [string, string] => [`konfigurator/${typ}/index.html`, `form#${FORM_ID}`]),
];

const copy = (id: string): Record<string, unknown> =>
  parseYaml(readFileSync(join(ROOT, 'src/content/pages', `${id}.yaml`), 'utf8')) as Record<string, unknown>;
const konfigurator = copy('konfigurator') as {
  success: { timeline: { items: { title: string }[] }; timelineLive: { items: { title: string }[] } };
};
const danke = copy('konfigurator-danke') as { nextLive: { steps: { title: string }[] } };

describeDist(`form target (${service} build)`, () => {
  it.each(formPages)('%s: the form follows the build’s form target', (rel, selector) => {
    const form = page(rel).root.querySelector(selector);
    expect(form, selector).not.toBeNull();
    if (demo) {
      expect(form?.getAttribute('method')).toBe('dialog');
      expect(form?.getAttribute('action')).toBeUndefined();
      return;
    }
    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe(action);
    // The assistant answers 415 to anything but multipart, also for a no-JS contact post.
    expect(form?.getAttribute('enctype')).toBe('multipart/form-data');
    // _next must be on the site origin: the backend only redirects there (docs/angebot.md §2.2).
    const next = form?.querySelector('input[name="_next"]')?.getAttribute('value') ?? '';
    const site = process.env['SITE'];
    if (site) expect(new URL(next).origin).toBe(new URL(site).origin);
    expect(form?.querySelector('input[name="homepage"]'), 'honeypot `homepage`').not.toBeNull();
  });

  it('only the assistant build carries an assistant origin', () => {
    const origin = assistant ?? testAssistantOrigin();
    const host = new URL(origin).host;
    const hits = listFiles('')
      .filter((f) => /\.(html|js|mjs|css|json|xml|txt|webmanifest|svg)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes(host));
    if (assistant) expect(hits.length).toBeGreaterThan(0);
    else expect(hits, `files mentioning ${host}`).toEqual([]);
  });

  it.each(['konfigurator/index.html', ...PROJECT_TYPES.map((t) => `konfigurator/${t}/index.html`)])(
    '%s: the success timeline is the live one only in the assistant build',
    (rel) => {
      const titles = page(rel)
        .root.querySelectorAll('[data-success] .timeline__item strong')
        .map((s) => s.text.trim());
      const expected = (assistant ? konfigurator.success.timelineLive : konfigurator.success.timeline).items;
      expect(titles).toEqual(expected.map((i) => i.title));
    },
  );

  it('konfigurator/danke/ lists the live steps only in the assistant build', () => {
    const live = page('konfigurator/danke/index.html').root.querySelector('[data-timeline="live"]');
    if (!assistant) {
      expect(live).toBeNull();
      return;
    }
    expect(live).not.toBeNull();
    const items = live?.querySelectorAll('li') ?? [];
    expect(items.map((li) => li.text.replace(/\s+/g, ' ').trim())).toEqual(
      danke.nextLive.steps.map((s) => expect.stringContaining(s.title) as unknown as string),
    );
  });

  it('datenschutz renders the section of the build’s form service', () => {
    const root = page('datenschutz/index.html').root;
    const h2 = root.querySelectorAll('h2').map((h) => h.text.trim());
    const text = root.querySelector('main')?.text ?? '';
    expect(h2.includes('Anfragen und Preisrahmen'), 'the assistant section').toBe(!!assistant);
    expect(text.includes('Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi'), 'form.taxi text').toBe(
      service === 'formtaxi',
    );
    expect(text.includes('Anfrage-Server'), 'assistant text').toBe(!!assistant);
    expect(text.includes('In dieser Vorabversion der Website werden keine Formulardaten übertragen')).toBe(demo);
    if (assistant) {
      // A person decides every reply; contact data never reaches the model (docs/angebot.md §9).
      expect(text).toContain('Art. 22 DSGVO');
      expect(text).toContain('Claude');
      expect(text).not.toContain('form.taxi');
    }
  });
});
