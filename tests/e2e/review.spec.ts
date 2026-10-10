import { expect, test } from '@playwright/test';

// Owner review view (src/components/ui/ReviewView.astro): `?pruefen` switches it on for the session.
// Navigate relative to baseURL; the base path contains a dot.

const html = (page: import('@playwright/test').Page) => page.locator('html');
const legend = (page: import('@playwright/test').Page) => page.locator('.review-legend');

test('inactive by default: legend is out of the accessibility tree', async ({ page }) => {
  await page.goto('kontakt/');
  await expect(html(page)).not.toHaveAttribute('data-pruefen', /.*/);
  await expect(legend(page)).toBeHidden();
  await expect(page.getByRole('link', { name: 'Prüfansicht beenden' })).toHaveCount(0);
});

test('?pruefen switches it on, persists to the next page and ?pruefen=aus clears it', async ({ page }) => {
  await page.goto('kontakt/?pruefen');
  await expect(html(page)).toHaveAttribute('data-pruefen', '');
  const exit = legend(page).getByRole('link', { name: 'Prüfansicht beenden' });
  await expect(exit).toBeVisible();
  expect((await exit.boundingBox())?.height).toBeGreaterThanOrEqual(24);
  await expect(legend(page).getByRole('link', { name: 'Prüfliste' })).toHaveAttribute('href', /intern\/pruefliste\/$/);

  // The flag keeps it on without the query.
  await page.goto('ueber-uns/');
  await expect(html(page)).toHaveAttribute('data-pruefen', '');
  await expect(legend(page)).toBeVisible();

  // Keyboard reachable: the exit link takes focus.
  await exit.focus();
  await expect(exit).toBeFocused();

  // Exit link: back to this page with ?pruefen=aus.
  await exit.click();
  await expect(page).toHaveURL(/ueber-uns\/\?pruefen=aus$/);
  await expect(html(page)).not.toHaveAttribute('data-pruefen', /.*/);
  await expect(legend(page)).toBeHidden();
  await page.goto('kontakt/');
  await expect(html(page)).not.toHaveAttribute('data-pruefen', /.*/);
});

test('?schritt=pruefen (configurator share link) does not switch it on', async ({ page }) => {
  await page.goto('konfigurator/?schritt=pruefen');
  await expect(html(page)).not.toHaveAttribute('data-pruefen', /.*/);
  await expect(legend(page)).toBeHidden();
});
