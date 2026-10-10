import { expect, test, type Page } from '@playwright/test';

// three.js stays out of every page that does not need it (docs/configurator.md §7 "isolation",
// §4.9 "Loading"). Relative URLs: the base path contains a dot.

const THREE = /\/_astro\/(three|viewer3d)\.[^/]*\.js/;
const ANY = /\/_astro\/(three|viewer3d|load3d)\.[^/]*\.js/;

function collect(page: Page, re: RegExp): string[] {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (re.test(r.url())) hits.push(r.url());
  });
  return hits;
}

for (const path of ['', 'leistungen/', 'leistungen/moebel/', 'referenzen/', 'kontakt/']) {
  test(`content page "${path || 'home'}" never requests three, viewer3d or load3d @cross-engine`, async ({ page }) => {
    const hits = collect(page, ANY);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.mouse.move(40, 40);
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
  });
}

test('konfigurator/moebel/ on a tablet: no three before the poster click', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'The poster click loads WebGL, which only Chromium has here (SwiftShader).');
  // Coarse pointer and a narrow viewport: the desktop auto-load must not arm.
  const context = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    isMobile: true,
    baseURL: test.info().project.use.baseURL ?? '',
  });
  const page = await context.newPage();
  const three = collect(page, THREE);
  try {
    await page.goto('konfigurator/moebel/');
    await page.locator('#anfrage input[name="moebel_art"][value="regal"]').check();
    const panel = page.locator('figure[data-preview]');
    await expect(panel).toHaveAttribute('data-preview-state', 'live');
    const poster = panel.locator('[data-action="load-3d"]');
    await expect(poster).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500); // idle callback + quiet period would have fired by now
    expect(three, 'three before the click').toEqual([]);
    await expect(panel.locator('[data-viewer]')).toBeHidden();

    await poster.click();
    await expect(panel.locator('[data-viewer]')).toHaveAttribute('data-viewer-state', /^(ready|failed|unsupported)$/, {
      timeout: 15_000,
    });
    expect(three.length, 'three after the click').toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test('non-Möbel branches request no load3d or three @cross-engine', async ({ page }) => {
  const hits = collect(page, ANY);
  await page.goto('konfigurator/boden/');
  await expect(page.locator('fieldset.branch[data-branch="boden"]').first()).toBeVisible();
  await expect(page.locator('figure[data-preview]')).toBeHidden();
  await page.waitForTimeout(1500);
  expect(hits).toEqual([]);

  // Walking through other branches by the wizard does not load them either.
  for (const typ of ['treppe', 'fenster']) {
    await page.goto(`konfigurator/?typ=${typ}`);
    await page.waitForTimeout(500);
  }
  expect(hits).toEqual([]);
});
