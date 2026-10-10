import { expect, test, type Page } from '@playwright/test';

// Clean fallbacks of the 3D viewer (docs/configurator.md §4.9–§4.10, §7 "fallback"): no WebGL2, the
// `?3d=aus` switch and the engines without a software GL. Relative URLs: the base path contains a dot.

const THREE = /\/_astro\/(three|viewer3d)\.[^/]*\.js/;

const radio = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`);
const panel = (page: Page) => page.locator('figure[data-preview]');

function watch(page: Page) {
  const three: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => {
    if (THREE.test(r.url())) three.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return { three, errors };
}

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`konfigurator/moebel/${query}`);
  await radio(page, 'moebel_art', 'regal').check();
  await expect(panel(page)).toHaveAttribute('data-preview-state', 'live');
}

test('no WebGL2: unsupported, the drawing stays, nothing from three is requested @cross-engine', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error: stub that refuses webgl2 and forwards everything else
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    };
  });
  const { three, errors } = watch(page);
  await open(page);

  const poster = panel(page).locator('[data-action="load-3d"]');
  await expect(poster).toBeVisible();
  await poster.click();
  await expect(panel(page).locator('[data-viewer]')).toHaveAttribute('data-viewer-state', 'unsupported');
  await expect(panel(page).locator('[data-preview-drawing] svg').first()).toBeVisible();
  await expect(panel(page).locator('canvas')).toHaveCount(0);
  await expect(poster).toBeHidden();
  await page.waitForTimeout(500);
  expect(three, 'three/viewer3d requests').toEqual([]);
  expect(errors).toEqual([]);
});

test('no WebGL2 by keyboard: unsupported and focus moves to the preview figure @cross-engine', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error: stub that refuses webgl2 and forwards everything else
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
      return (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    };
  });
  await open(page);
  const poster = panel(page).locator('[data-action="load-3d"]');
  await expect(poster).toBeVisible(); // the loader probes only on the click, so the poster is shown
  await poster.focus();
  await expect(poster).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel(page).locator('[data-viewer]')).toHaveAttribute('data-viewer-state', 'unsupported');
  await expect(poster).toBeHidden();
  await expect(panel(page)).toHaveAttribute('tabindex', '-1');
  await expect(panel(page)).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.matches('figure[data-preview]'))).toBe(true);
});

test('?3d=aus keeps the tools hidden and requests no three @cross-engine', async ({ page }) => {
  const { three, errors } = watch(page);
  await open(page, '?3d=aus');
  await expect(panel(page).locator('[data-viewer-tools]')).toBeHidden();
  await expect(panel(page).locator('[data-action="load-3d"]')).toBeHidden();
  await expect(panel(page).locator('[data-preview-drawing] svg').first()).toBeVisible();
  await page.waitForTimeout(1500); // longer than the auto-load quiet period
  expect(three).toEqual([]);
  expect(errors).toEqual([]);
});

test('without stubbing: either ready or a clean SVG fallback, never a page error @cross-engine', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The phone projects run the isolation spec; no click-driven WebGL here.');
  test.setTimeout(60_000);
  const { errors } = watch(page);
  await open(page);

  const poster = panel(page).locator('[data-action="load-3d"]');
  const stateEl = panel(page).locator('[data-viewer]');
  // Either the auto-load already started, or the poster is there to click.
  if (await poster.isVisible()) await poster.click().catch(() => undefined);
  await expect
    .poll(async () => stateEl.getAttribute('data-viewer-state'), { timeout: 20_000 })
    .toMatch(/^(ready|unsupported|failed|lost)$/);

  const state = await stateEl.getAttribute('data-viewer-state');
  test.info().annotations.push({ type: 'viewer-state', description: String(state) });
  // The drawing stays in the DOM beneath the canvas; in a fallback it is visible.
  if (state !== 'ready') await expect(panel(page).locator('[data-preview-drawing] svg').first()).toBeVisible();
  else await expect(panel(page).locator('canvas')).toBeVisible();
  await expect(panel(page)).toBeVisible();
  expect(errors).toEqual([]);
});
