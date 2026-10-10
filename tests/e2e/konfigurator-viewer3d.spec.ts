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
  const { differ, stdev } = await pixelStats(page);
  console.log(`pixels differing: ${(differ * 100).toFixed(1)} %, luma stdev ${stdev.toFixed(1)}`);
  expect(differ).toBeGreaterThanOrEqual(0.05);
  expect(stdev).toBeGreaterThan(5);
});

/** Share of canvas pixels that differ from the background (top-left pixel) and the luma stdev. */
async function pixelStats(page: Page): Promise<{ differ: number; stdev: number }> {
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
  return { differ: differ / px, stdev: Math.sqrt(Math.max(0, sumSq / px - mean * mean)) };
}

/** The settled pose the viewer writes to `data-viewer-pose` ("open,explode" in whole percent). */
const pose = (page: Page) => viewer(page).getAttribute('data-viewer-pose');
const openToggle = (page: Page) => panel(page).locator('[data-toggle="open"]');
const explodeToggle = (page: Page) => panel(page).locator('[data-toggle="explode"]');
const overlayDims = (page: Page) => viewer(page).locator('svg.preview__overlay g');

test.describe('Esstisch in 3D (§4.1, §4.4 live edge)', () => {
  test('loads with a straight edge and a Baumkante, renders pixels and follows the board seed', async ({ page }) => {
    await open(page);
    await radio(page, 'moebel_art', 'esstisch').check();
    await expect(panel(page)).toHaveAttribute('data-preview-state', 'live');
    await load(page);
    await expect(canvas(page)).toHaveAttribute('aria-label', /^3D-Vorschau: Esstisch aus /);
    await expect(canvas(page)).not.toHaveAttribute('aria-label', /Baumkante/);
    await expect(panel(page).locator('[data-view="oben"]')).toBeVisible();
    // A table has no fronts: only „Aufbau zeigen“ is offered.
    await expect(openToggle(page)).toBeHidden();
    await expect(explodeToggle(page)).toBeVisible();
    await page.waitForTimeout(800);
    const straight = await pixelStats(page);
    expect(straight.differ).toBeGreaterThanOrEqual(0.05);
    expect(straight.stdev).toBeGreaterThan(5);

    // Baumkante (the default 40 mm top allows it): the extruded top replaces the box.
    await radio(page, 'tisch_kante', 'baumkante').check();
    await expect(canvas(page)).toHaveAttribute('aria-label', /mit Baumkante/, { timeout: 5000 });
    await expect(viewer(page)).toHaveAttribute('data-viewer-state', 'ready');
    await page.waitForTimeout(400);
    const live = await pixelStats(page);
    expect(live.differ).toBeGreaterThanOrEqual(0.05);
    expect(live.stdev).toBeGreaterThan(5);

    // Another board (tisch_brett is a hidden input): a new slab is generated and rendered.
    await expectIdle(page);
    const before = await frames(page);
    await page.evaluate(() => {
      const seed = document.querySelector<HTMLInputElement>('#anfrage input[name="tisch_brett"]')!;
      seed.value = String(Number(seed.value || 0) + 1);
      seed.form!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
    await expect(canvas(page)).toHaveAttribute('aria-label', /mit Baumkante/);
    await expectIdle(page);

    // 25 mm top: the live edge is refused with a hint and the straight top returns.
    await radio(page, 'tisch_platte', '25').check();
    await expect(canvas(page)).not.toHaveAttribute('aria-label', /Baumkante/, { timeout: 5000 });
  });

  test('switching to Bett disposes the table viewer', async ({ page }) => {
    await open(page);
    await radio(page, 'moebel_art', 'esstisch').check();
    await load(page);
    await radio(page, 'tisch_kante', 'baumkante').check();
    await expect(canvas(page)).toHaveAttribute('aria-label', /mit Baumkante/, { timeout: 5000 });
    await radio(page, 'moebel_art', 'bett').check();
    await expect(canvas(page)).toHaveCount(0);
    await expect(viewer(page)).toBeHidden();
    const live = await page.evaluate(() => window.__ctxs.filter((c) => !c.isContextLost()).length);
    expect(live).toBe(0);
  });
});

test.describe('toggles: „Türen öffnen“ and „Aufbau zeigen“ (§4.6 Phase C)', () => {
  test('aria-pressed, visibility by fronts, hidden dimensions, reset on a kind switch and on dispose', async ({
    page,
  }) => {
    test.setTimeout(120_000); // two viewer loads and several 600 ms animations on SwiftShader
    await open(page);
    await load(page);
    // Open Regal: no fronts, so the door toggle is hidden; the explode toggle is a native pressed button.
    await expect(openToggle(page)).toBeHidden();
    await expect(explodeToggle(page)).toBeVisible();
    await expect(explodeToggle(page)).toHaveAttribute('aria-pressed', 'false');
    const box = await explodeToggle(page).boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(overlayDims(page)).not.toHaveCount(0);
    await expect(viewer(page)).toHaveAttribute('data-viewer-pose', '0,0');

    await explodeToggle(page).click();
    await expect(explodeToggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(overlayDims(page)).toHaveCount(0); // dimensions hide while a toggle is on
    await expect.poll(pose.bind(null, page), { timeout: 5000 }).toBe('0,100');
    await expectIdle(page); // 0 rAF once the 600 ms animation settled

    await explodeToggle(page).click();
    await expect(explodeToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(pose.bind(null, page), { timeout: 5000 }).toBe('0,0');
    await expect(overlayDims(page)).not.toHaveCount(0);

    // Sideboard (default front: Türen): the door toggle appears, labelled by the fronts.
    await radio(page, 'moebel_art', 'sideboard').check();
    await expect(canvas(page)).toHaveAttribute('aria-label', /Sideboard/, { timeout: 5000 });
    await expect(openToggle(page)).toBeVisible();
    await expect(openToggle(page)).toHaveText('Türen öffnen');
    await expect(openToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await radio(page, 'moebel_front', 'gemischt').check();
    await expect(openToggle(page)).toHaveText('Türen und Schubkästen öffnen');
    await radio(page, 'moebel_front', 'schubkaesten').check();
    await expect(openToggle(page)).toHaveText('Schubkästen öffnen');

    await openToggle(page).focus();
    await page.keyboard.press('Enter');
    await expect(openToggle(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(overlayDims(page)).toHaveCount(0);
    await expect.poll(pose.bind(null, page), { timeout: 5000 }).toBe('100,0');
    await explodeToggle(page).click();
    await expect.poll(pose.bind(null, page), { timeout: 5000 }).toBe('100,100');
    await expectIdle(page);

    // Kind switch: both toggles go off.
    await radio(page, 'moebel_art', 'regal').check();
    await expect(canvas(page)).toHaveAttribute('aria-label', /Regal/, { timeout: 5000 });
    await expect(openToggle(page)).toBeHidden();
    await expect(openToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(explodeToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(pose.bind(null, page), { timeout: 5000 }).toBe('0,0');
    await expect(overlayDims(page)).not.toHaveCount(0);

    // A pressed toggle does not survive a dispose: the next viewer starts off.
    await explodeToggle(page).click();
    await expect(explodeToggle(page)).toHaveAttribute('aria-pressed', 'true');
    await radio(page, 'moebel_art', 'bett').check();
    await expect(canvas(page)).toHaveCount(0);
    await radio(page, 'moebel_art', 'regal').check();
    await load(page);
    await expect(explodeToggle(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(viewer(page)).toHaveAttribute('data-viewer-pose', '0,0');
  });

  test('the motion runs frames for 600 ms, then the loop goes idle', async ({ page }) => {
    await open(page);
    await load(page);
    await expectIdle(page);
    const before = await frames(page);
    const t0 = Date.now();
    await explodeToggle(page).click();
    await expect.poll(pose.bind(null, page), { timeout: 5000 }).toBe('0,100');
    const elapsed = Date.now() - t0;
    const ran = (await frames(page)) - before;
    console.log(`explode animation: ${ran} frames in ${elapsed} ms`);
    expect(elapsed).toBeGreaterThanOrEqual(600);
    expect(ran).toBeGreaterThanOrEqual(4);
    await expectIdle(page);
  });

  test('reduced motion applies a toggle instantly (one frame, no animation)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await load(page);
    await expectIdle(page);
    const before = await frames(page);
    await explodeToggle(page).click();
    await expect.poll(pose.bind(null, page), { timeout: 2000 }).toBe('0,100');
    const ran = (await frames(page)) - before;
    console.log(`explode under reduced motion: ${ran} frame(s)`);
    expect(ran).toBeLessThanOrEqual(2);
    await expect(overlayDims(page)).toHaveCount(0);
    await expectIdle(page);
    await explodeToggle(page).click();
    await expect.poll(pose.bind(null, page), { timeout: 2000 }).toBe('0,0');
    await expectIdle(page);
  });
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

/** The settled camera azimuth (whole degrees) the viewer writes to `data-viewer-az` (viewer3d/index.ts). */
const azimuth = (page: Page) =>
  viewer(page)
    .getAttribute('data-viewer-az')
    .then((v) => (v === null ? NaN : Number(v)));

/** Waits until the azimuth attribute stays unchanged for 400 ms (the tween or damping ended). */
async function settledAzimuth(page: Page): Promise<number> {
  let last = await azimuth(page);
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(400);
        const now = await azimuth(page);
        const settled = Number.isFinite(now) && now === last;
        last = now;
        return settled;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return last;
}

test('the orbit limit follows the furniture kind: ±120° Regal, ±60° Einbauschrank, free for the Esstisch', async ({
  page,
}) => {
  test.setTimeout(90_000); // ~14 s alone; three viewer kinds and ~30 settled rotations on SwiftShader under suite load
  await open(page);
  await load(page);
  expect(await settledAzimuth(page)).toBe(35); // the 3/4 preset

  // 8 × 15° to the right: the Regal stops at +120°.
  const right = panel(page).locator('[data-rotate="1"]');
  for (let i = 0; i < 8; i++) {
    await right.click();
    await page.waitForTimeout(450);
  }
  expect(Math.abs((await settledAzimuth(page)) - 120)).toBeLessThanOrEqual(2);

  // Einbauschrank: the camera is clamped to the niche's ±60° at once.
  await radio(page, 'moebel_art', 'einbauschrank').check();
  await expect(canvas(page)).toHaveAttribute('aria-label', /Einbauschrank/, { timeout: 5000 });
  expect(Math.abs(await settledAzimuth(page))).toBeLessThanOrEqual(60);
  await right.click();
  expect(Math.abs(await settledAzimuth(page))).toBeLessThanOrEqual(60);

  // Esstisch: free orbit, so rotating on passes 120°.
  await radio(page, 'moebel_art', 'esstisch').check();
  await expect(canvas(page)).toHaveAttribute('aria-label', /Esstisch/, { timeout: 5000 });
  for (let i = 0; i < 6; i++) {
    await right.click();
    await page.waitForTimeout(450);
  }
  expect(Math.abs(await settledAzimuth(page))).toBeGreaterThan(120);
});

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

// The demo success view's 3D snapshot (docs/configurator.md §4.12, §5). The flow helpers of
// konfigurator-flow.spec.ts are not exported, so the minimum is repeated here.
const next = (page: Page) => page.locator('[data-action="next"]');
const snapFigure = (page: Page) => page.locator('figure[data-success-snapshot]');
const snapLink = (page: Page) => page.locator('a[data-snapshot-link]');

/** From the open Regal step to the demo submit (the PLZ and contact fields are the required ones). */
async function submitDemo(page: Page): Promise<void> {
  await next(page).click(); // Holz & Oberfläche
  await next(page).click(); // Zeitraum, Budget & Ort
  await page.locator('#f-plz').fill('68161');
  await next(page).click();
  await page.locator('#f-name').fill('Erika Mustermann');
  await page.locator('#f-email').fill('erika@example.com');
  await next(page).click();
  await page.locator('[data-action="submit"]').click();
  await expect(page.locator('[data-success]')).toBeVisible();
}

test.describe('demo success view: 3D snapshot', () => {
  test('with 3D loaded the figure shows the image and a working download link', async ({ page }) => {
    await open(page);
    await load(page);
    await submitDemo(page);

    const fig = snapFigure(page);
    await expect(fig).toBeVisible();
    const img = fig.locator('img');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('alt', /^3D-Ansicht: Regal/);
    await expect.poll(() => img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    const src = await img.getAttribute('src');
    expect(src).toMatch(/^blob:/);
    const link = snapLink(page);
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/3D-Ansicht speichern/);
    await expect(link).toHaveAttribute('href', src!);
    await expect(link).toHaveAttribute('download', /^ansicht_3d\.(webp|png)$/);

    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    expect(download.suggestedFilename()).toMatch(/^ansicht_3d\.(webp|png)$/);
  });

  test('without 3D loaded the figure stays hidden', async ({ page }) => {
    await open(page);
    await submitDemo(page);
    await expect(snapFigure(page)).toBeHidden();
    await expect(snapFigure(page)).toHaveAttribute('hidden', '');
    await expect(snapFigure(page).locator('img')).toHaveCount(0);
  });

  test('print hides the figure', async ({ page }) => {
    await open(page);
    await load(page);
    await submitDemo(page);
    await expect(snapFigure(page)).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(snapFigure(page)).toBeHidden();
  });
});
