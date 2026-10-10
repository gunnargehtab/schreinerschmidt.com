import { expect, test } from '@playwright/test';
import { sitePaths } from '../helpers/pages';

// Runs in the `no-js` project (javaScriptEnabled: false). Every page must render its content
// without JS, and base CSS must show the finished state: no opacity-0 or hidden start states
// outside JS- or motion-gated keyframes (CLAUDE.md "Motion").

const pages = [...sitePaths().map((path) => ({ path, label: `/${path}` })), { path: 'gibt-es-nicht/', label: '404' }];

test('dist/ has pages to check', () => {
  expect(sitePaths().length, 'run "npm run build" first').toBeGreaterThan(0);
});

for (const { path, label } of pages) {
  test(`${label} renders its h1 and main content without JS`, async ({ page }) => {
    // Base CSS (motion gates closed) must render the finished state. Scroll-driven reveals live only
    // inside `prefers-reduced-motion: no-preference` gates, so they are checked separately below.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await page.waitForLoadState('load');

    // The theme-init script did not run.
    await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveText(/^\s*$/);

    const main = page.locator('main');
    await expect(main).toHaveCount(1);
    await expect(main).toBeVisible();
    expect((await main.innerText()).trim().length, 'main has text').toBeGreaterThan(0);

    // Effective opacity (own × ancestors) and visibility of the h1, main, its direct children and images.
    const hidden = await page.evaluate(() => {
      const effectiveOpacity = (el: Element | null): number => {
        let opacity = 1;
        for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        return opacity;
      };
      const targets = [
        ...document.querySelectorAll('h1'),
        ...document.querySelectorAll('main'),
        ...document.querySelectorAll('main > *'),
        ...document.querySelectorAll('main img'),
      ];
      return targets
        .filter((el) => effectiveOpacity(el) < 1 || getComputedStyle(el).visibility === 'hidden')
        .map((el) => {
          const id = el.id ? `#${el.id}` : '';
          const cls =
            typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
          return `${el.tagName.toLowerCase()}${id}${cls} opacity=${effectiveOpacity(el)} visibility=${getComputedStyle(el).visibility}`;
        });
    });
    expect(hidden).toEqual([]);

    // With motion allowed, below-the-fold reveals may start hidden, but everything must reach full
    // opacity once it is scrolled into view (scroll-driven animations run without JS).
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const targets = page.locator('main > *, main img');
    const count = await targets.count();
    for (let i = 0; i < count; i++) {
      const target = targets.nth(i);
      // Decorative overlays (e.g. the sketch layer of SketchPhoto) are meant to fade out.
      if (!(await target.isVisible()) || (await target.getAttribute('data-decorative')) !== null) continue;
      // Centre it: tall elements would otherwise sit at the very start of their view timeline.
      const what = await target.evaluate((el) => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const cls = typeof el.className === 'string' ? el.className.trim().replace(/\s+/g, '.') : '';
        return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
      });
      await expect
        .poll(
          () =>
            target.evaluate((el) => {
              let opacity = 1;
              for (let node: Element | null = el; node; node = node.parentElement) {
                opacity *= Number(getComputedStyle(node).opacity);
              }
              return opacity;
            }),
          { message: `${what} reaches full opacity in view`, timeout: 3000 },
        )
        .toBeGreaterThan(0.99);
    }
  });
}

test('the LCP image is visible and loaded without JS', async ({ page }) => {
  await page.goto('');
  const lcp = page.locator('img[fetchpriority="high"]').first();
  test.skip((await lcp.count()) === 0, 'Home has no fetchpriority=high image');
  await expect(lcp).toBeVisible();
  await expect(lcp).toHaveCSS('opacity', '1');
  await expect.poll(() => lcp.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
