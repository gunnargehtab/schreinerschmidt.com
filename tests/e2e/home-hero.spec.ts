import { expect, test, type Page } from '@playwright/test';

// Home hero and StatCounter (docs/design-system.md §5, §6, §8). Navigate relative to the base.
// Engine-independent checks carry @cross-engine: Firefox is the "finished state" reference
// (no scroll-driven animations), Chromium the enhanced path.

const WIDTHS = [320, 360, 390, 768, 1024, 1280, 1440];

/**
 * The clip-path inset of the hero media in px, measured by hit-testing (the computed clip-path keeps
 * its `max()` expression): the first x at the media's vertical middle where the image is hit.
 * `null` when the media is not inside the viewport.
 */
async function heroInset(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const media = document.querySelector('.hero__media');
    const img = media?.querySelector('img');
    if (!media || !img) return null;
    const r = media.getBoundingClientRect();
    // Probe row: the media's middle, or the last visible row when it starts near the fold.
    const y = Math.min(r.top + r.height / 2, window.innerHeight - 2);
    if (y < 1 || y <= r.top + 1 || y >= r.bottom - 1) return null;
    for (let x = Math.ceil(r.left) + 1; x < r.left + r.width / 2; x += 2) {
      if (document.elementFromPoint(x, y) === img) return x - 1 - r.left;
    }
    return r.width / 2;
  });
}

/** Lines of Maßlinien that are actually rendered (the vertical one is display: none on narrow containers). */
const VISIBLE_LINES = '.hero__mass .mass__line';
const visibleLineState = (page: Page) =>
  page.evaluate((selector) => {
    return [...document.querySelectorAll(selector)]
      .filter((el) => el.checkVisibility())
      .map((el) => getComputedStyle(el).scale);
  }, VISIBLE_LINES);

test.describe('home hero @cross-engine', () => {
  test('the LCP image is eager, visible at load and never clipped away', async ({ page }) => {
    await page.goto('');
    const img = page.locator('.hero__media img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('fetchpriority', 'high');
    await expect(img).toHaveAttribute('loading', 'eager');
    await expect(img).toHaveCSS('opacity', '1');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    // The frame insets at most the margins outside the content column: most of the image shows.
    // (On small viewports the media starts below the fold; then the hit-test cannot run at load.)
    const [inset, box] = await Promise.all([heroInset(page), page.locator('.hero__media').boundingBox()]);
    expect(box).not.toBeNull();
    if (inset !== null) {
      expect(inset).toBeGreaterThanOrEqual(0);
      expect(inset * 2, 'visible width ≥ 60% of the media box').toBeLessThanOrEqual(box!.width * 0.4);
    }
  });

  test('one h1 with the accent word, the eyebrow and both CTAs', async ({ page }) => {
    await page.goto('');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Ihr Experte für');
    await expect(h1).toContainText('Holzhandwerk');
    await expect(h1.locator('em[data-review]')).toHaveCount(1);
    await expect(page.locator('.hero .eyebrow')).toContainText('seit 2010');
    await expect(page.getByRole('link', { name: /In 3.Minuten zum Angebot/ })).toHaveAttribute(
      'href',
      /konfigurator\/$/,
    );
    await expect(page.getByRole('link', { name: 'Referenzen ansehen' })).toHaveAttribute('href', /referenzen\/$/);
    const rating = page.locator('.rating-badge');
    await expect(rating).toContainText('5,0');
    await expect(rating).toContainText('115');
    await expect(rating).toContainText('30.09.2026');
    await expect(rating.locator('a')).toHaveCount(0); // profile URL is a placeholder
  });

  test('counters show their final figures as real text', async ({ page }) => {
    await page.goto('');
    const stats = page.locator('.stat');
    await expect(stats).toHaveCount(3);
    const nums = await page.locator('.stat__num').allTextContents();
    expect(nums[0]).toMatch(/^\d{2}$/); // years since 2010
    expect(nums[1]).toBe('115');
    expect(nums[2]).toBe('5,0');
    // Where scroll-driven animations are missing (Firefox) the number itself is the visible text.
    const supported = await page.evaluate(() => CSS.supports('animation-timeline: view()'));
    if (!supported) {
      const num = page.locator('.stat__num').nth(1);
      await expect(num).toHaveCSS('clip-path', 'none');
      await expect(page.locator('.stat__value').nth(1)).toHaveCSS('animation-name', 'none');
    }
  });

  test('reduced motion: framed hero, static counters, finished annotations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('');
    await expect(page.locator('.hero__media')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.stat__value').nth(1)).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.stat__num').nth(1)).toHaveCSS('clip-path', 'none');
    const lines = await visibleLineState(page);
    expect(lines.length).toBeGreaterThan(0);
    for (const scale of lines) expect(scale).toBe('none');
    // Scrolling never opens the frame: the media is still inset once it is in view.
    await page.locator('.hero__media').scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    const inset = await heroInset(page);
    expect(inset).not.toBeNull();
    expect(inset!).toBeGreaterThan(0);
  });

  for (const width of WIDTHS) {
    test(`no horizontal scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('');
      const overflow = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: document.documentElement.clientWidth,
      }));
      expect(overflow.sw).toBeLessThanOrEqual(overflow.iw);
      const box = await page.locator('.hero__media').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    });
  }
});

test.describe('home hero enhancements (chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'scroll-driven animations');

  test('the frame opens to full bleed over the first half viewport of scroll', async ({ page, isMobile }) => {
    test.skip(isMobile, 'on phones the media starts below the fold, so the framed state is not observable at load');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('');
    const framed = await heroInset(page);
    expect(framed).not.toBeNull();
    expect(framed!).toBeGreaterThan(0);
    const height = await page.evaluate(() => window.innerHeight);
    await page.evaluate((y) => window.scrollTo(0, y), height * 0.5);
    await page.waitForTimeout(150);
    const open = await heroInset(page);
    expect(open).not.toBeNull();
    expect(open!).toBeLessThanOrEqual(2);
  });

  test('annotations draw once after load and end at the finished line', async ({ page }) => {
    await page.goto('');
    expect((await visibleLineState(page)).length).toBeGreaterThan(0);
    await expect
      .poll(async () => (await visibleLineState(page)).every((s) => s === 'none' || s === '1' || s === '1 1'), {
        timeout: 6000,
      })
      .toBe(true);
  });

  test('the counter settles on the final figure', async ({ page }) => {
    await page.goto('');
    await page.locator('.stats').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // `--n` is the registered integer behind `counter(n)`; it must settle on `--to`.
    await expect
      .poll(() =>
        page.evaluate(() => getComputedStyle(document.querySelectorAll('.stat__value')[1]!).getPropertyValue('--n')),
      )
      .toBe('115');
    const content = await page.evaluate(
      () => getComputedStyle(document.querySelectorAll('.stat__value')[1]!, '::after').content,
    );
    expect(content).toContain('counter(n)');
  });
});

test.describe('home hero without JS', () => {
  test('renders the hero, image and counters with no script', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('');
    await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const img = page.locator('.hero__media img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.stat__num').nth(1)).toHaveText('115');
    await expect(page.locator('.schriftfeld')).toContainText('Projekt');
    await context.close();
  });
});
