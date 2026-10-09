import { expect, test } from '@playwright/test';

// Runs in the `no-js` project (javaScriptEnabled: false). The chrome must stay usable:
// popovers open through popovertarget, the theme toggle is hidden, every nav link is reachable.

test.describe('mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the theme toggle is hidden, the menu button opens the sheet natively', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
    await expect(page.getByRole('button', { name: 'Farbschema' })).toBeHidden();

    const sheet = page.locator('#site-menu');
    await expect(sheet).toBeHidden();
    await page.locator('.menu-button').click();
    await expect(sheet).toBeVisible();
    for (const name of ['Leistungen', 'Referenzen', 'Über uns', 'Karriere', 'Kontakt']) {
      await expect(sheet.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await sheet.getByRole('link', { name: 'Kontakt', exact: true }).click();
    await expect(page).toHaveURL(/kontakt\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kontakt');
  });

  test('the skip link works', async ({ page }) => {
    await page.goto('');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('href', '#main');
  });
});

test.describe('desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the Leistungen disclosure opens without JS', async ({ page }) => {
    await page.goto('');
    await expect(page.getByRole('button', { name: 'Farbschema' })).toBeHidden();
    await page.getByRole('button', { name: 'Leistungen' }).click();
    await expect(page.locator('#menu-leistungen')).toBeVisible();
    await expect(page.locator('#menu-leistungen').getByRole('link', { name: 'Böden' })).toBeVisible();
  });
});
