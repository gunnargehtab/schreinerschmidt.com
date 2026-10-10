import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Runs in the `a11y` project (chromium, reduced motion): axe with WCAG 2.2 AA on every step of the
// wizard, in the error state and on the success view, in both colour schemes
// (docs/configurator.md §7 "a11y"). The no-JS form is covered by tests/e2e/a11y.a11y.spec.ts.

const PATH = 'konfigurator/';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES = ['light', 'dark'] as const;

async function openInTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('ss-theme', t);
    } catch {
      // data-theme is set below anyway.
    }
  }, theme);
  await page.goto(PATH);
  await page.evaluate((t) => {
    document.documentElement.dataset['theme'] = t;
  }, theme);
  await page.evaluate(() => document.fonts.ready);
}

async function axe(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) =>
      `${label}: ${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n')}`,
  );
  expect(summary, summary.join('\n')).toEqual([]);
}

const check = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`).check();
const next = (page: Page) => page.locator('[data-action="next"]');
const current = (page: Page) => page.locator('#anfrage .step:not([hidden])');

for (const theme of THEMES) {
  test(`every step, the error state and the success view pass axe (${theme})`, async ({ page }) => {
    await openInTheme(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('[data-configurator]')).toHaveAttribute('data-enhanced', '');
    await axe(page, 'Schritt 1');

    // Error state: the summary with links and the inline error.
    await next(page).click();
    await expect(page.locator('[data-error-summary]')).toBeFocused();
    await axe(page, 'Schritt 1, Fehler');

    await check(page, 'typ', 'moebel');
    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'details');
    await check(page, 'moebel_art', 'regal');
    await expect(page.locator('figure[data-preview]')).toHaveAttribute('data-preview-state', 'live');
    await axe(page, 'Schritt 2');

    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'ausfuehrung');
    await axe(page, 'Schritt 3');

    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'rahmen');
    await next(page).click();
    await expect(page.locator('[data-error-summary]')).toBeFocused();
    await page.locator('#f-plz').fill('12');
    await expect(page.locator('#f-plz-fehler')).toBeVisible();
    await axe(page, 'Schritt 4, Fehler');
    await page.locator('#f-plz').fill('68161');
    await axe(page, 'Schritt 4');

    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'kontakt');
    await page.locator('#f-name').fill('Erika Mustermann');
    await page.locator('#f-email').fill('erika@example.com');
    await axe(page, 'Schritt 5');

    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'pruefen');
    await expect(page.locator('[data-review-list]')).toBeVisible();
    await axe(page, 'Schritt 6');

    await page.locator('[data-action="submit"]').click();
    await expect(page.locator('[data-success]')).toBeFocused();
    await axe(page, 'Erfolg');

    // The "already sent" prompt after Back.
    await page.goBack();
    await expect(page.locator('.already-sent')).toBeVisible();
    await axe(page, 'Bereits gesendet');
  });
}

test('keyboard: Tab reaches the progress buttons, the fields and Weiter; focus is visible', async ({ page }) => {
  await openInTheme(page, 'light');
  await check(page, 'typ', 'boden');
  await next(page).click();
  await expect(page.locator('#h-details')).toBeFocused();
  // From the heading, Tab lands inside the step on the first option of the branch.
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('name', 'boden_leistung');
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const target = el.closest('label') ?? el;
    const style = getComputedStyle(target);
    return {
      visible: el.matches(':focus-visible'),
      outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
    };
  });
  expect(info.visible).toBe(true);
  expect(info.outline).toBe(true);
  // Targets are at least 24 px.
  for (const sel of ['[data-action="next"]', 'nav.progress [data-goto="projekt"]', '[data-action="share"]']) {
    const box = await page.locator(sel).boundingBox();
    expect(box && box.width >= 24 && box.height >= 24, `${sel} target size`).toBe(true);
  }
});
