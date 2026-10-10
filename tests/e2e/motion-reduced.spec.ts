import { expect, test, type Page } from '@playwright/test';

// Reduced motion is respected everywhere (docs/design-system.md §6 principle 5; docs/plan.md §9,
// Phase 5 definition of done), and Firefox, without scroll-driven animations or cross-document view
// transitions, shows every page in its finished state (§9 "Firefox is the finished-state reference").
// Navigate relative to baseURL; the base path contains a dot. The configurator entry is checked
// read-only, like every other page type.

/** One page of every type. */
const PAGES = [
  { path: '', name: 'Home' },
  { path: 'leistungen/', name: 'Leistungen' },
  { path: 'leistungen/boeden/', name: 'service page' },
  { path: 'referenzen/', name: 'Referenzen' },
  { path: 'referenzen/einbauschrankwand/', name: 'project detail' },
  { path: 'ueber-uns/', name: 'Über uns' },
  { path: 'karriere/', name: 'Karriere' },
  { path: 'karriere/bauschreiner/', name: 'job page' },
  { path: 'kontakt/', name: 'Kontakt' },
  { path: 'gibt-es-nicht/', name: '404' },
  { path: 'impressum/', name: 'legal page' },
  { path: 'konfigurator/', name: 'Konfigurator entry' },
] as const;

/** Longer than about one frame: anything above this is a real animation, not a 0 s transition. */
const ONE_FRAME_MS = 20;
/**
 * The allowed exception: fades. Colour and opacity transitions of UI feedback (link and chip colours,
 * the in-page nav's `:target-current` state, the popovers' opacity-only fade, docs/design-system.md
 * §6 "Popovers": reduce = opacity only) move nothing, so they stay on under reduced motion, capped at
 * --dur-2. `display` and `overlay` are the discrete companions that keep a fading popover rendered.
 */
const FADE_MS = 220;
const FADE_PROPERTIES =
  /^(?:opacity|display|overlay|color|background-color|border-(?:\w+-)?color|outline-color|text-decoration-color)$/;

interface RunningAnimation {
  name: string;
  target: string;
  duration: number;
}

/**
 * Time-based animations and transitions that are running right now, last longer than one frame and
 * are not an allowed fade. Scroll-driven animations (scroll/view timelines) are left out here because
 * they are "running" by definition; under reduced motion none exist at all, which `finishedState`
 * asserts through the computed `animation-name`.
 */
const runningAnimations = (page: Page): Promise<RunningAnimation[]> =>
  page.evaluate(
    ([min, fadeMs, fade]) => {
      const label = (t: Element | null | undefined, pseudo?: string | null) =>
        t ? `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : ''}.${[...t.classList].join('.')}${pseudo ?? ''}` : '?';
      const isFade = new RegExp(fade);
      return document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.timeline instanceof DocumentTimeline)
        .map((a) => {
          const effect = a.effect as KeyframeEffect | null;
          const timing = effect?.getComputedTiming();
          const duration = typeof timing?.duration === 'number' ? timing.duration : Number.NaN;
          const name =
            (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? a.id ?? 'animation';
          return { name, target: label(effect?.target as Element | null, effect?.pseudoElement), duration };
        })
        .filter((a) => !(a.duration <= min))
        .filter((a) => !(isFade.test(a.name) && a.duration <= fadeMs + 1));
    },
    [ONE_FRAME_MS, FADE_MS, FADE_PROPERTIES.source] as const,
  );

/** Scrolls through the whole page in viewport steps (instant, whatever `scroll-behavior` says) and back up. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    const bottom = () => document.documentElement.scrollHeight - window.innerHeight;
    for (let y = 0; y < bottom(); y += step) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    }
    window.scrollTo({ top: bottom(), behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  });
}

interface Finished {
  problems: string[];
  counts: Record<string, number>;
}

/**
 * - `reduce`: prefers-reduced-motion. No animation may be attached at all, and the counters' real
 *   figure is the visible text.
 * - `static`: an engine without scroll-driven animations (Firefox). Nothing scroll-bound may be
 *   attached; the time-based once-only draws (hero annotations, 404 shelf: `draw`, `mass-draw`) may,
 *   because they run everywhere and end in the finished state.
 * - `scrolled`: a full engine after a complete scroll. Only the finished values count.
 */
type Mode = 'reduce' | 'static' | 'scrolled';
const TIME_BASED = ['draw', 'mass-draw', 'mass-draw-v'];

/**
 * Every rendered element with a motion catalogue entry (§6) in its finished state: reveals opaque
 * and in place, sketches fully drawn, Maßlinien at full length, counters showing their final figure,
 * the hero framed and the header rule visible, the sketch→photo photo settled, the Jahresringe
 * milestones in the accent colour, popovers not displaced. Elements without a box (`display: none`,
 * e.g. the hero's vertical annotation on phones) are skipped: Chromium reports their animations at
 * the start value, and nobody can see them.
 */
const finishedState = (page: Page, mode: Mode): Promise<Finished> =>
  page.evaluate(
    ([mode, timeBased]) => {
      const problems: string[] = [];
      const counts: Record<string, number> = {};
      const all = (sel: string) => {
        const els = [...document.querySelectorAll<HTMLElement | SVGElement>(sel)].filter((el) => el.checkVisibility());
        counts[sel] = els.length;
        return els;
      };
      const css = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo);
      const check = (sel: string, ok: (s: CSSStyleDeclaration, el: Element) => string | null, pseudo?: string) => {
        for (const el of all(sel)) {
          const why = ok(css(el, pseudo), el);
          if (why) problems.push(`${sel}${pseudo ?? ''}: ${why}`);
        }
      };
      const unit = (v: string) => v === 'none' || v === '1' || v === '1 1' || v === '0px';
      /** An attached animation that the mode forbids. */
      const noAnim = (s: CSSStyleDeclaration) => {
        const names = s.animationName === 'none' ? [] : s.animationName.split(', ');
        const bad = names.filter((n) => mode === 'reduce' || (mode === 'static' && !timeBased.includes(n)));
        return bad.length > 0 ? `animation ${bad.join(', ')}` : null;
      };

      check('.reveal > *', (s) =>
        s.opacity !== '1' ? `opacity ${s.opacity}` : !unit(s.translate) ? `translate ${s.translate}` : noAnim(s),
      );
      check('svg.sketch path', (s) =>
        Number.parseFloat(s.strokeDashoffset) !== 0
          ? `dashoffset ${s.strokeDashoffset}`
          : mode === 'reduce' && s.strokeDasharray !== 'none'
            ? `dasharray ${s.strokeDasharray}`
            : noAnim(s),
      );
      check('.mass__line', (s) => (!unit(s.scale) ? `scale ${s.scale}` : noAnim(s)));
      check('.process__list', (s) => (!unit(s.scale) ? `scale ${s.scale}` : noAnim(s)), '::before');
      check('.stat__value:not(.stat__value--static)', (s, el) => {
        const to = s.getPropertyValue('--to').trim();
        const n = s.getPropertyValue('--n').trim();
        const anim = noAnim(s);
        if (anim) return anim;
        if (n !== to) return `--n ${n} (final ${to})`;
        const num = el.querySelector('.stat__num');
        if (mode !== 'scrolled' && num && css(num).clipPath !== 'none') return 'figure is visually hidden';
        if (num && !num.checkVisibility()) return 'figure not visible';
        return null;
      });
      check('.hero__media', (s) => noAnim(s));
      // Condensed (.85) is the finished state once scrolled; without the scroll timeline it stays at 1.
      check('.site-header .wordmark', (s) => (mode !== 'scrolled' && !unit(s.scale) ? `scale ${s.scale}` : noAnim(s)));
      check('.site-header', (s) => (s.borderBlockEndColor === 'rgba(0, 0, 0, 0)' ? 'rule transparent' : noAnim(s)));
      check('.sketch-photo__sketch', (s) => (s.opacity !== '0' ? `sketch layer shown (opacity ${s.opacity})` : null));
      check('.sketch-photo__img', (s) => (!unit(s.scale) ? `scale ${s.scale}` : noAnim(s)));
      check('.rings__ring--mark', (s) => noAnim(s));
      check('.nav-sheet, .nav__panel, .theme-toggle__panel', (s) =>
        !unit(s.translate) ? `translate ${s.translate}` : null,
      );
      return { problems, counts };
    },
    [mode, TIME_BASED] as const,
  );

/** Records, on every document, whether `pagereveal` came with a cross-document view transition. */
const recordPageReveal = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __reveal: { fired: boolean; vt: boolean } };
    w.__reveal = { fired: false, vt: false };
    addEventListener('pagereveal', (e) => {
      w.__reveal = { fired: true, vt: (e as Event & { viewTransition: unknown }).viewTransition != null };
    });
  });
/** `fired: false` also when the document never got the init script (not expected, but never a crash). */
const pageReveal = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __reveal?: { fired: boolean; vt: boolean } }).__reveal ?? { fired: false, vt: false },
  );

/** Counts `document.startViewTransition` calls (same-document transitions: theme switch, filter, lightbox). */
async function countSameDocumentTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: number };
    w.__vt = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = ((cb?: () => void) => {
        w.__vt++;
        return original(cb);
      }) as typeof document.startViewTransition;
    }
  });
  return () => page.evaluate(() => (window as unknown as { __vt: number }).__vt);
}

test.describe('reduced motion @cross-engine', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const { path, name } of PAGES) {
    test(`${name} (/${path}): nothing animates and everything is finished`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);

      const atLoad = await finishedState(page, 'reduce');
      expect(atLoad.problems, 'finished state at load').toEqual([]);
      expect(await runningAnimations(page), 'running animations at load').toEqual([]);

      await scrollThrough(page);
      const afterScroll = await finishedState(page, 'reduce');
      expect(afterScroll.problems, 'finished state after a full scroll').toEqual([]);
      expect(await runningAnimations(page), 'running animations after a full scroll').toEqual([]);
    });
  }

  test('Home carries every catalogue element the check looks for', async ({ page }) => {
    await page.goto('');
    const { counts } = await finishedState(page, 'reduce');
    for (const sel of [
      '.reveal > *',
      'svg.sketch path',
      '.mass__line',
      '.stat__value:not(.stat__value--static)',
      '.hero__media',
    ]) {
      expect(counts[sel], sel).toBeGreaterThan(0);
    }
    await page.goto('ueber-uns/');
    expect((await finishedState(page, 'reduce')).counts['.rings__ring--mark']).toBeGreaterThan(0);
  });

  test('navigating between pages starts no view transition', async ({ page }) => {
    await recordPageReveal(page);
    await page.goto('');
    await page.getByRole('link', { name: 'Referenzen ansehen' }).click();
    await expect(page).toHaveURL(/referenzen\/$/);
    const reveal = await pageReveal(page);
    // Engines without `pagereveal` (Firefox) cannot run a cross-document transition in the first place.
    if (reveal.fired) expect(reveal.vt, 'pagereveal.viewTransition').toBe(false);
    await page.locator('.refs a.project-card__link').first().click();
    await expect(page).toHaveURL(/referenzen\/[a-z0-9-]+\/$/);
    const detail = await pageReveal(page);
    if (detail.fired) expect(detail.vt, 'pagereveal.viewTransition on the detail page').toBe(false);
    expect((await finishedState(page, 'reduce')).problems).toEqual([]);
  });

  test('the theme switch and the Referenzen filter run without a view transition', async ({ page }) => {
    const transitions = await countSameDocumentTransitions(page);
    await page.goto('referenzen/');
    await page.getByRole('button', { name: 'Farbschema' }).click();
    await page.getByLabel('Werkstatt bei Nacht').check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.refs .chip', { hasText: 'Möbel' }).click();
    await expect(page.locator('.refs [data-status]')).toContainText('6 Projekte');
    expect(await transitions()).toBe(0);
    expect(await runningAnimations(page)).toEqual([]);
  });

  test('popovers keep an opacity fade only, never a translate', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('');
    await page.locator('.menu-button').click();
    const sheet = page.locator('#site-menu');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCSS('translate', 'none');
    // `display` and `overlay` are the discrete transitions that keep the fading sheet rendered.
    const running = await runningAnimations(page);
    for (const a of running)
      expect(['opacity', 'display', 'overlay'], `${a.target} animates ${a.name}`).toContain(a.name);
  });
});

test.describe('cross-document view transitions run when motion is allowed', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'the control for the reduced-motion check, Chromium only');

  test('a link click reveals the next page inside a view transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await recordPageReveal(page);
    await page.goto('');
    await page.getByRole('link', { name: 'Referenzen ansehen' }).click();
    await expect(page).toHaveURL(/referenzen\/$/);
    await expect.poll(() => pageReveal(page)).toEqual({ fired: true, vt: true });
  });
});

test.describe('finished state without scroll-driven animations @cross-engine', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const { path, name } of PAGES) {
    test(`${name} (/${path}) shows all content`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      const scrollDriven = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
      // Time-based draw-ons (hero annotations, the 404 shelf) run everywhere and take about 2 s.
      await expect.poll(() => runningAnimations(page), { timeout: 8000 }).toEqual([]);
      if (!scrollDriven) {
        // Firefox: nothing hides, nothing waits for a scroll.
        expect((await finishedState(page, 'static')).problems, 'finished state at load').toEqual([]);
      }
      await scrollThrough(page);
      await expect.poll(() => runningAnimations(page), { timeout: 8000 }).toEqual([]);
      // In every engine, a full scroll leaves nothing half drawn or half faded.
      const mode = scrollDriven ? 'scrolled' : 'static';
      expect((await finishedState(page, mode)).problems, 'finished state after a full scroll').toEqual([]);
    });
  }
});
