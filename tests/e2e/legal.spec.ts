import { expect, test, type Page } from '@playwright/test';

// Legal pages and the 404 section links (docs/architecture.md §9, docs/design-system.md §8).
// Navigate relative to the base: goto('impressum/').

const demo = process.env['PUBLIC_DEMO'] !== 'false';

/** Visible text and markup must hold no template leftovers. */
async function expectNoTemplateLeftovers(page: Page): Promise<void> {
  const main = page.locator('main');
  const text = await main.innerText();
  expect(text).not.toContain('{{');
  expect(text).not.toContain('}}');
  expect(text).not.toContain('<!--');
  expect(text).not.toContain('-->');
  expect(await main.innerHTML()).not.toContain('{{');
}

test.describe('Impressum', () => {
  test('shows the owner and the address from the settings', async ({ page }) => {
    await page.goto('impressum/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Impressum');
    const body = page.locator('.legal__body');
    await expect(body).toContainText('Inhaber: Ulf Schmidt');
    await expect(body).toContainText('Andreas-Hofer-Str. 33');
    await expect(body).toContainText('68259 Mannheim');
    await expect(body.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(body.locator('a[href^="tel:"]')).toHaveCount(1);
    await expectNoTemplateLeftovers(page);
  });

  test('shows the Stand date in German format', async ({ page }) => {
    await page.goto('impressum/');
    await expect(page.locator('.legal__meta time')).toHaveText('10. Oktober 2026');
    await expect(page.locator('.legal__meta time')).toHaveAttribute('datetime', '2026-10-10');
  });

  test('marks unconfirmed legal facts and the pending legal review in the demo', async ({ page }) => {
    test.skip(!demo, 'demo build only');
    await page.goto('impressum/');
    await expect(page.locator('.legal__pending')).toHaveText('Rechtliche Prüfung ausstehend');
    await expect(page.locator('.legal__body .review-mark[data-review="placeholder"]').first()).toBeVisible();
  });

  test('the review view highlights the marks', async ({ page }) => {
    test.skip(!demo, 'demo build only');
    await page.goto('impressum/?pruefen');
    await expect(page.locator('html')).toHaveAttribute('data-pruefen', '');
    const mark = page.locator('.legal__body .review-mark').first();
    await expect(mark).toHaveCSS('outline-style', /dashed|solid/);
  });
});

test.describe('Datenschutz', () => {
  test('renders the demo blocks only (demo builds)', async ({ page }) => {
    test.skip(!demo, 'demo build only');
    await page.goto('datenschutz/');
    await expect(page.locator('h1')).toHaveCount(1);
    const body = page.locator('.legal__body');
    await expect(body).toContainText('In dieser Vorabversion der Website werden keine Formulardaten übertragen');
    await expect(body).not.toContainText('Zur Übermittlung der Formulare nutzen wir den Dienst form.taxi');
    await expectNoTemplateLeftovers(page);
  });

  test('the table of contents links resolve to heading ids', async ({ page }) => {
    await page.goto('datenschutz/');
    const links = page.locator('nav.inpage-nav a');
    const count = await links.count();
    expect(count).toBeGreaterThan(8);
    const headings = await page.locator('.legal__body h2').count();
    expect(count).toBe(headings);
    for (let i = 0; i < count; i++) {
      const href = (await links.nth(i).getAttribute('href')) ?? '';
      expect(href).toMatch(/^#./);
      const id = decodeURIComponent(href.slice(1));
      await expect(page.locator(`.legal__body h2[id="${id}"]`)).toHaveCount(1);
    }
  });

  test('clicking a TOC entry scrolls to its heading', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('datenschutz/');
    const link = page.locator('nav.inpage-nav a').filter({ hasText: 'Ihre Rechte' });
    await link.click();
    await expect(page.locator('.legal__body h2', { hasText: 'Ihre Rechte' })).toBeInViewport();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the table of contents and the text are complete', async ({ page }) => {
      await page.goto('datenschutz/');
      await expect(page.locator('nav.inpage-nav a').first()).toBeVisible();
      await expect(page.locator('.legal__body h2').first()).toBeVisible();
    });
  });
});

test.describe('404', () => {
  test('has four working section links', async ({ page }) => {
    const response = await page.goto('gibt-es-nicht/');
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Hier fehlt ein Brett.');
    const links = page.locator('.not-found__text a.btn--secondary');
    await expect(links).toHaveText(['Leistungen', 'Referenzen', 'Über uns', 'Kontakt']);
    for (const [i, path] of ['leistungen/', 'referenzen/', 'ueber-uns/', 'kontakt/'].entries()) {
      await expect(links.nth(i)).toHaveAttribute('href', new RegExp(`/${path}$`));
    }
    await links.nth(3).click();
    await expect(page).toHaveURL(/\/kontakt\/$/);
    await expect(page.locator('h1')).toHaveText('Kontakt');
  });
});

test.describe('layout', () => {
  for (const path of ['impressum/', 'datenschutz/', 'gibt-es-nicht/']) {
    for (const width of [320, 768, 1440]) {
      test(`/${path} does not scroll horizontally at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForLoadState('load');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
