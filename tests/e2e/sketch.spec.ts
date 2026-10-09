import { expect, test } from '@playwright/test';

// The 404 shelf sketch (docs/design-system.md §3, §8 "404"). Navigate relative to the base.
const NOT_FOUND = 'gibt-es-nicht/';

test.describe('404 shelf sketch', () => {
  test('renders the shelf with four passes and the „? cm“ label as live text', async ({ page }) => {
    await page.goto(NOT_FOUND);
    const sketch = page.locator('svg.sketch[data-draw="load"]');
    await expect(sketch).toHaveCount(1);
    await expect(sketch).toHaveAttribute('aria-hidden', 'true');
    for (const pass of [1, 2, 3, 4]) {
      expect(await sketch.locator(`[data-pass="${pass}"] path`).count(), `pass ${pass}`).toBeGreaterThan(0);
    }
    await expect(page.locator('.mass__label')).toHaveText('? cm');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hier fehlt ein Brett.');
  });

  test('finishes drawn: every path ends at stroke-dashoffset 0 @cross-engine', async ({ page }) => {
    await page.goto(NOT_FOUND);
    // The time-based draw lasts about 1.8 s (two passes of --dur-4); wait for the last one.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll('svg.sketch path')].every((p) => {
              const s = getComputedStyle(p);
              return Number.parseFloat(s.strokeDashoffset) === 0 || s.strokeDasharray === 'none';
            }),
          ),
        { timeout: 6000 },
      )
      .toBe(true);
  });

  test('reduced motion shows the finished drawing immediately', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(NOT_FOUND);
    const state = await page.evaluate(() =>
      [...document.querySelectorAll('svg.sketch path')].map((p) => {
        const s = getComputedStyle(p);
        return { offset: Number.parseFloat(s.strokeDashoffset), dash: s.strokeDasharray, animation: s.animationName };
      }),
    );
    expect(state.length).toBeGreaterThan(0);
    for (const { offset, dash, animation } of state) {
      expect(offset).toBe(0);
      expect(dash).toBe('none');
      expect(animation).toBe('none');
    }
    const line = page.locator('.mass__line').first();
    await expect(line).toHaveCSS('scale', 'none');
  });

  test('renders without JS: build-time SVG, live label', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(NOT_FOUND);
    await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
    const sketch = page.locator('svg.sketch');
    await expect(sketch).toHaveCount(1);
    await expect(sketch).toBeVisible();
    expect(await sketch.locator('path').count()).toBeGreaterThan(10);
    await expect(page.locator('.mass__label')).toHaveText('? cm');
    await expect(page.locator('.mass__label')).toBeVisible();
    await context.close();
  });
});
