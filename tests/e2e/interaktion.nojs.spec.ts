import { expect, test } from '@playwright/test';

// Runs in the `no-js` project (javaScriptEnabled: false): the interactive components degrade to
// plain HTML and CSS.

const PATH = 'intern/interaktion/';

test('BeforeAfter: both photos sit side by side, labelled, without controls', async ({ page }) => {
  await page.goto(PATH);
  const ba = page.locator('[data-ba]');
  await expect(ba).not.toHaveAttribute('data-enhanced', '');
  const before = ba.locator('.ba__before');
  const after = ba.locator('.ba__after');
  await expect(before.locator('.ba__label')).toHaveText('Vorher');
  await expect(after.locator('.ba__label')).toHaveText('Nachher');
  const [b, a] = [(await before.boundingBox())!, (await after.boundingBox())!];
  expect(Math.abs(b.y - a.y)).toBeLessThan(2);
  expect(a.x).toBeGreaterThan(b.x + b.width - 2);
  await expect(ba.getByRole('slider')).toHaveCount(0);
  await expect(ba.getByRole('group')).toBeHidden();
});

test('Gallery: a thumbnail links to the full image', async ({ page }) => {
  await page.goto(PATH);
  const link = page.locator('[data-gallery] a[data-lightbox]').nth(1);
  const href = (await link.getAttribute('href'))!;
  expect(href).toContain('/schreinerschmidt.com/');
  const response = await page.goto(href);
  expect(response?.status()).toBe(200);
  expect(response?.headers()['content-type']).toMatch(/image\//);
});

test('FilterBar: the :has() rules filter the list, the status line is hidden', async ({ page }) => {
  await page.goto(PATH);
  await expect(page.getByRole('status')).toBeHidden();
  await expect(page.locator('[data-filter-list] .gallery__item:visible')).toHaveCount(15);
  await page.locator('.chip', { hasText: 'Treppen' }).click();
  await expect(page.locator('[data-filter-list] .gallery__item:visible')).toHaveCount(2);
  await page.locator('.chip', { hasText: 'Terrassen' }).click();
  await expect(page.locator('[data-filter-list] .gallery__item:visible')).toHaveCount(1);
  await page.locator('.chip', { hasText: 'Alle' }).click();
  await expect(page.locator('[data-filter-list] .gallery__item:visible')).toHaveCount(15);
});

test('FilterBar: ?kategorie= needs JS, so the full list stays visible', async ({ page }) => {
  await page.goto(`${PATH}?kategorie=boeden`);
  await expect(page.locator('[data-filter-list] .gallery__item:visible')).toHaveCount(15);
});
