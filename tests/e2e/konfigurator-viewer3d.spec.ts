import { expect, test, type CDPSession, type Page } from '@playwright/test';
import sharp from 'sharp';

// The 3D viewer of the Möbel preview (docs/configurator.md §4.9–§4.12, §7 "viewer3d"), Chromium only:
// WebGL runs on SwiftShader there. Navigate relative to baseURL: the base path contains a dot.

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'The pixel, heap and context-loss checks need Chromium (SwiftShader); other engines are covered by konfigurator-viewer-fallback.',
);
test.skip(({ isMobile }) => isMobile, 'Desktop layout: the mobile project does not run the heavy WebGL checks.');

const PATH = 'konfigurator/moebel/';

// Below 64rem (1024 px) the desktop auto-load never arms, so every poster click below is deterministic.
// The auto-load itself is tested in its own describe block at 1280 px.
test.use({ viewport: { width: 1000, height: 800 } });

declare global {
  interface Window {
    __raf: number;
    __ctxs: WebGL2RenderingContext[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__raf = 0;
    window.__ctxs = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      window.__raf++;
      return raf(cb);
    };
    const get = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error: a thin recording wrapper around the overloaded native method
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      const ctx = (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
      if (type === 'webgl2' && ctx) window.__ctxs.push(ctx as WebGL2RenderingContext);
      return ctx;
    };
  });
});

const radio = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`);
const panel = (page: Page) => page.locator('figure[data-preview]');
const viewer = (page: Page) => panel(page).locator('[data-viewer]');
const poster = (page: Page) => panel(page).locator('[data-action="load-3d"]');
const reload = (page: Page) => panel(page).locator('[data-action="reload-3d"]');
const canvas = (page: Page) => viewer(page).locator('canvas');

/** Opens the Möbel branch with a Regal. The `?3d=` switch is not set, so the tools are revealed. */
async function open(page: Page): Promise<void> {
  await page.goto(PATH);
  await radio(page, 'moebel_art', 'regal').check();
  await expect(panel(page)).toHaveAttribute('data-preview-state', 'live');
  await expect(poster(page)).toBeVisible();
}

/** Clicks the poster and waits for `ready`; returns the elapsed milliseconds. */
async function load(page: Page): Promise<number> {
  const t0 = Date.now();
  await poster(page).click();
  await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'ready', { timeout: 10_000 });
  return Date.now() - t0;
}

const frames = (page: Page) => page.evaluate(() => window.__raf);

/** Expects no requestAnimationFrame call for 1.5 s. */
async function expectIdle(page: Page): Promise<void> {
  await page.waitForTimeout(300); // let a trailing frame finish
  const before = await frames(page);
  await page.waitForTimeout(1500);
  expect(await frames(page), 'rAF calls while idle').toBe(before);
}

const loseContext = (page: Page) =>
  canvas(page).evaluate((c) => {
    const gl = (c as HTMLCanvasElement).getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });

test('poster click loads the viewer, renders pixels and labels the canvas', async ({ page }) => {
  await open(page);
  const ms = await load(page);
  test.info().annotations.push({ type: 'click-to-ready-ms', description: String(ms) });
  console.log(`click -> ready: ${ms} ms`);
  expect(ms).toBeLessThan(10_000);

  await expect(canvas(page)).toBeVisible();
  await expect(canvas(page)).toHaveAttribute('role', 'img');
  await expect(canvas(page)).toHaveAttribute('aria-label', /^3D-Vorschau: /);
  await expect(viewer(page).locator('svg.preview__overlay')).toHaveAttribute('aria-hidden', 'true');
  await expect(panel(page).locator('[data-view-controls]')).toBeVisible();
  await expect(poster(page)).toBeHidden();
  await expect(page.locator('[data-view="oben"]')).toBeHidden(); // Regal: no top view

  // Pixel check: the shelf differs from the paper background on a decent share of the canvas.
  await page.waitForTimeout(800); // textures stream in
  const png = await canvas(page).screenshot();
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const bg = [data[0]!, data[1]!, data[2]!];
  let differ = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < px; i++) {
    const r = data[i * 3]!;
    const g = data[i * 3 + 1]!;
    const b = data[i * 3 + 2]!;
    if (Math.max(Math.abs(r - bg[0]!), Math.abs(g - bg[1]!), Math.abs(b - bg[2]!)) > 12) differ++;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l;
    sumSq += l * l;
  }
  const mean = sum / px;
  const stdev = Math.sqrt(Math.max(0, sumSq / px - mean * mean));
  console.log(`pixels differing: ${((differ / px) * 100).toFixed(1)} %, luma stdev ${stdev.toFixed(1)}`);
  expect(differ / px).toBeGreaterThanOrEqual(0.05);
  expect(stdev).toBeGreaterThan(5);
});

test.describe('auto-load on a desktop viewport', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('reaches ready without a click, and not before the input gate', async ({ page }) => {
    const hits: { url: string; t: number }[] = [];
    const t0 = Date.now();
    page.on('request', (r) => {
      if (/\/_astro\/(three|viewer3d)\.[^/]*\.js/.test(r.url())) hits.push({ url: r.url(), t: Date.now() - t0 });
    });
    await page.goto(PATH);
    await radio(page, 'moebel_art', 'regal').check(); // a pointer event: the 1 s quiet period starts
    await expect(panel(page)).toHaveAttribute('data-preview-state', 'live');
    const tInput = Date.now() - t0;
    await page.waitForTimeout(500);
    expect(
      hits.filter((h) => h.t < tInput + 500),
      'three requested while input was recent',
    ).toEqual([]);
    await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'ready', { timeout: 20_000 });
    expect(hits.length).toBeGreaterThan(0);
    await expect(canvas(page)).toBeVisible();
  });
});

test('the aria-label follows the dimensions (debounced)', async ({ page }) => {
  await open(page);
  await load(page);
  const before = await canvas(page).getAttribute('aria-label');
  await page.locator('#f-moebel_breite').fill('200');
  await expect.poll(() => canvas(page).getAttribute('aria-label'), { timeout: 5000 }).not.toBe(before);
  await expect(canvas(page)).toHaveAttribute('aria-label', /^3D-Vorschau: /);
  await expect(canvas(page)).toHaveAttribute('aria-label', /200/);
});

test('renders on demand: 0 rAF while idle, also after a view tween settles', async ({ page }) => {
  await open(page);
  await load(page);
  await expectIdle(page);

  const before = await frames(page);
  await panel(page).locator('[data-view="seite"]').click();
  await expect.poll(() => frames(page)).toBeGreaterThan(before); // the tween runs frames
  await page.waitForTimeout(800); // 350 ms tween + damping
  await expectIdle(page);
});

test('view buttons are at least 44 px and work by keyboard', async ({ page }) => {
  await open(page);
  await load(page);
  const buttons = panel(page).locator('[data-view-controls] button:visible');
  expect(await buttons.count()).toBeGreaterThanOrEqual(8); // 3 views, 2 rotate, 2 zoom, reset
  for (const b of await buttons.all()) {
    const box = await b.boundingBox();
    expect(box, await b.innerHTML()).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  const seite = panel(page).locator('[data-view="seite"]');
  await seite.focus();
  await expect(seite).toBeFocused();
  const before = await frames(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => frames(page)).toBeGreaterThan(before);
  const rotate = panel(page).locator('[data-rotate="1"]');
  await rotate.focus();
  const mid = await frames(page);
  await page.keyboard.press('Space');
  await expect.poll(() => frames(page)).toBeGreaterThan(mid);
  await expect(rotate).toBeFocused();
});

test('the top view is offered for the Esstisch only', async ({ page }) => {
  await open(page);
  await radio(page, 'moebel_art', 'esstisch').check();
  await load(page);
  await expect(panel(page).locator('[data-view="oben"]')).toBeVisible();
});

test('context loss falls back to the drawing; reload works once, the second loss ends it', async ({ page }) => {
  await open(page);
  await load(page);

  await loseContext(page);
  await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'lost');
  await expect(panel(page).locator('[data-preview-drawing] svg').first()).toBeVisible();
  await expect(canvas(page)).toHaveCount(0);
  await expect(reload(page)).toBeVisible();
  await expect(poster(page)).toBeHidden();

  await reload(page).click();
  await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'ready', { timeout: 10_000 });
  await expect(canvas(page)).toBeVisible();

  await loseContext(page);
  await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'lost');
  await expect(reload(page)).toBeHidden();
  await expect(poster(page)).toBeHidden();
  await expect(panel(page).locator('[data-preview-drawing] svg').first()).toBeVisible();
});

test('Enter on „3D neu laden“ ends in ready with focus on the first view button', async ({ page }) => {
  await open(page);
  await load(page);
  await loseContext(page);
  await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'lost');
  await reload(page).focus();
  await expect(reload(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'ready', { timeout: 10_000 });
  await expect(panel(page).locator('[data-view-controls] button').first()).toBeFocused();
});

// Not covered: the azimuth clamp after Regal -> Einbauschrank (docs/configurator.md §4.6). The camera
// has no test hook (no data attribute, no global), and tests may not add one.

test('leaving Möbel for Bett disposes the viewer and hides the tools', async ({ page }) => {
  await open(page);
  await load(page);
  await radio(page, 'moebel_art', 'bett').check();
  await expect(canvas(page)).toHaveCount(0);
  await expect(viewer(page)).toBeHidden();
  await expect(poster(page)).toBeHidden();
  await expect(panel(page).locator('[data-view-controls]')).toBeHidden();
  await expect(panel(page).locator('[data-preview-drawing]')).toBeVisible();
});

test('10 load/dispose cycles leak neither heap nor WebGL contexts', async ({ page }) => {
  test.setTimeout(180_000);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const heap = async (): Promise<number> => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
    return usedSize;
  };

  await open(page);
  // Warm-up cycle: module evaluation and caches are not leaks.
  await load(page);
  await radio(page, 'moebel_art', 'bett').check();
  await expect(canvas(page)).toHaveCount(0);
  await radio(page, 'moebel_art', 'regal').check();
  await expect(poster(page)).toBeVisible();
  const start = await heap();

  for (let i = 0; i < 10; i++) {
    await load(page);
    await radio(page, 'moebel_art', 'bett').check();
    await expect(canvas(page)).toHaveCount(0);
    await radio(page, 'moebel_art', 'regal').check();
    await expect(poster(page)).toBeVisible();
  }

  const end = await heap();
  const deltaMb = (end - start) / 1024 / 1024;
  const stats = await page.evaluate(() => ({
    created: window.__ctxs.length,
    live: window.__ctxs.filter((c) => !c.isContextLost()).length,
    canvases: document.querySelectorAll('canvas').length,
  }));
  console.log(`heap delta over 10 cycles: ${deltaMb.toFixed(2)} MB; contexts: ${JSON.stringify(stats)}`);
  test.info().annotations.push({ type: 'heap-delta-mb', description: deltaMb.toFixed(2) });
  test.info().annotations.push({ type: 'webgl-contexts', description: JSON.stringify(stats) });

  expect(deltaMb).toBeLessThan(5);
  expect(stats.created).toBeGreaterThanOrEqual(11);
  expect(stats.live).toBe(0); // every viewer was disposed; no context is left alive
  expect(stats.canvases).toBe(0);
});
