import { expect, test } from '@playwright/test';

// Print styles (src/styles/print.css), checked with print media emulation. Chromium only: the
// rules are plain CSS and the layout checks need no other engine.
// Navigate relative to baseURL; the base path contains a dot.

test.skip(({ browserName }) => browserName !== 'chromium', 'print emulation checked in Chromium');

const PAGES = ['', 'leistungen/boeden/', 'referenzen/einbauschrankwand/', 'kontakt/'];

for (const path of PAGES) {
  test(`print: chrome is hidden, NAP stays (${path || 'home'})`, async ({ page }) => {
    await page.goto(path);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.site-header .nav')).toBeHidden();
    await expect(page.locator('.nav-sheet')).toBeHidden();
    await expect(page.locator('.menu-button')).toBeHidden();
    await expect(page.locator('.theme-toggle')).toBeHidden();
    await expect(page.locator('.lightbox')).toBeHidden();
    await expect(page.locator('.site-footer__nav')).toBeHidden();
    const nap = page.locator('.site-footer address');
    await expect(nap).toBeVisible();
    await expect(nap.locator('a[href^="tel:"]')).toBeVisible();
    await expect(nap.locator('a[href^="mailto:"]')).toBeVisible();
    // No URL after tel: / mailto: links.
    const after = await nap.locator('a[href^="tel:"]').evaluate((el) => getComputedStyle(el, '::after').content);
    expect(after).toMatch(/^(none|normal)$/);
    // The review legend never prints.
    await expect(page.locator('.review-legend')).toBeHidden();
  });
}

test('print: the filter bar is hidden on Referenzen', async ({ page }) => {
  await page.goto('referenzen/');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.refs__chips')).toBeHidden();
  await expect(page.locator('.gallery__item').first()).toBeVisible();
});

test('print: Home hero has no viewport-sized box and the first heading is on the first page', async ({ page }) => {
  await page.goto('');
  await page.emulateMedia({ media: 'print' });
  const body = await page.evaluate(() => getComputedStyle(document.body).minBlockSize);
  expect(body).toBe('0px');
  await expect(page.locator('h1')).toBeVisible();
  const top = await page.locator('h1').evaluate((el) => el.getBoundingClientRect().top + scrollY);
  expect(top).toBeLessThan(600);
});

test('print: BeforeAfter shows both photos side by side', async ({ page }) => {
  await page.goto('');
  await page.emulateMedia({ media: 'print' });
  const sides = page.locator('.ba').first().locator('.ba__side');
  await expect(sides).toHaveCount(2);
  const [a, b] = await Promise.all([sides.nth(0).boundingBox(), sides.nth(1).boundingBox()]);
  expect(a && b).toBeTruthy();
  expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThan(2);
  expect((b?.x ?? 0) - (a?.x ?? 0)).toBeGreaterThan(50);
  await expect(page.locator('.ba').first().locator('.ba__buttons')).toBeHidden();
});

test('print: finished state, nothing animated or hidden', async ({ page }) => {
  await page.goto('');
  await page.emulateMedia({ media: 'print' });
  const animated = await page.evaluate(
    () => [...document.querySelectorAll('main *')].filter((el) => getComputedStyle(el).animationName !== 'none').length,
  );
  expect(animated).toBe(0);
  const hidden = await page.evaluate(
    () => [...document.querySelectorAll('main h2')].filter((el) => getComputedStyle(el).opacity !== '1').length,
  );
  expect(hidden).toBe(0);
});

test('print: FAQ answers are expanded where ::details-content is supported', async ({ page }) => {
  await page.goto('leistungen/boeden/');
  await page.emulateMedia({ media: 'print' });
  const supported = await page.evaluate(() => CSS.supports('selector(::details-content)'));
  test.skip(!supported, '::details-content not supported');
  const closed = page.locator('details.faq__item:not([open]) .faq__answer').first();
  await expect(closed).toBeVisible();
});

test('print: gallery items do not break across pages', async ({ page }) => {
  await page.goto('referenzen/');
  await page.emulateMedia({ media: 'print' });
  const value = await page
    .locator('.gallery__item')
    .first()
    .evaluate((el) => getComputedStyle(el).breakInside);
  expect(value).toBe('avoid');
});
