import { expect, test, type Page } from '@playwright/test';

// Motion and print of the quote wizard (docs/configurator.md §3 "View transitions between steps",
// §7 "motion-print"): with reduced motion no view transition starts; otherwise the step swap runs
// inside startViewTransition with the direction on <html>. Print media shows the success view's
// summary and the DIN drawing sheet (with its title block) and hides the form.

const PATH = 'konfigurator/';

/** Counts startViewTransition calls and records the data-nav-dir seen during them. */
async function trackTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: number; __dirs: string[] };
    w.__vt = 0;
    w.__dirs = [];
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = ((cb?: () => void) => {
        w.__vt++;
        w.__dirs.push(document.documentElement.dataset['navDir'] ?? '');
        return original(cb);
      }) as typeof document.startViewTransition;
    }
  });
  return () => page.evaluate(() => (window as unknown as { __vt: number; __dirs: string[] }).__dirs);
}

const check = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`).check();
const next = (page: Page) => page.locator('[data-action="next"]');
const back = (page: Page) => page.locator('[data-action="back"]');
const current = (page: Page) => page.locator('#anfrage .step:not([hidden])');

test('reduced motion: steps swap without startViewTransition @cross-engine', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dirs = await trackTransitions(page);
  await page.goto(PATH);
  await check(page, 'typ', 'boden');
  await next(page).click();
  await expect(current(page)).toHaveAttribute('data-step', 'details');
  await expect(page.locator('#h-details')).toBeFocused();
  await back(page).click();
  await expect(current(page)).toHaveAttribute('data-step', 'projekt');
  expect(await dirs()).toEqual([]);
  expect(await page.evaluate(() => 'navDir' in document.documentElement.dataset)).toBe(false);
});

test('with motion allowed, the swap runs in a view transition with the direction on <html>', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const dirs = await trackTransitions(page);
  await page.goto(PATH);
  const supported = await page.evaluate(() => typeof document.startViewTransition === 'function');
  test.skip(!supported, 'no same-document view transitions in this engine');
  await check(page, 'typ', 'boden');
  await next(page).click();
  await expect(current(page)).toHaveAttribute('data-step', 'details');
  await expect(page.locator('#h-details')).toBeFocused();
  await back(page).click();
  await expect(current(page)).toHaveAttribute('data-step', 'projekt');
  expect(await dirs()).toEqual(['fwd', 'back']);
  // The direction attribute is removed once the transition has finished.
  await expect.poll(() => page.evaluate(() => 'navDir' in document.documentElement.dataset)).toBe(false);
  // The visible step carries the view-transition name; hidden steps do not.
  await expect(current(page)).toHaveCSS('view-transition-name', 'wizard-step');
  await expect(page.locator('nav.progress')).toHaveCSS('view-transition-name', 'wizard-progress');
});

test('print media shows the summary and the DIN drawing sheet of the success view', async ({ page }) => {
  await page.goto(`${PATH}?typ=moebel&moebel_art=regal&schritt=details`);
  await expect(page.locator('figure[data-preview]')).toHaveAttribute('data-preview-state', 'live');
  await page.locator('nav.progress [data-goto="rahmen"]').click();
  await expect(current(page)).toHaveAttribute('data-step', 'rahmen');
  await page.locator('#f-plz').fill('68161');
  await next(page).click();
  await page.locator('#f-name').fill('Erika Mustermann');
  await page.locator('#f-email').fill('erika@example.com');
  await next(page).click();
  await expect(current(page)).toHaveAttribute('data-step', 'pruefen');
  await page.locator('[data-action="submit"]').click();
  const success = page.locator('[data-success]');
  await expect(success).toBeFocused();
  // The print sheet is prepared right after the success view shows (full renderer, on request).
  const sheet = success.locator('[data-print-drawing] svg[role="img"]');
  await expect(sheet).toHaveCount(1);
  await expect(sheet).toBeHidden(); // screen: the live drawing shows instead
  await expect(sheet.locator('title')).toContainText('Regal');
  expect(await sheet.evaluate((s) => s.textContent)).toContain('Schreinerei Schmidt');
  expect(await sheet.evaluate((s) => s.textContent)).toMatch(/M 1:\d+/);

  await page.emulateMedia({ media: 'print' });
  await expect(success.locator('[data-success-summary]')).toBeVisible();
  await expect(success.locator('[data-success-summary]')).toContainText('Welches Möbel: Regal');
  await expect(sheet).toBeVisible();
  await expect(success.locator('[data-success-drawing] > svg')).toBeHidden();
  await expect(page.locator('.configurator__layout')).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(success.locator('.success__actions')).toBeHidden();
  await expect(success.locator('.timeline')).toBeHidden();
  await expect(page.locator('#h-erfolg')).toBeVisible();
  await expect(success.locator('[data-anfrage-id]')).toBeVisible();
});
