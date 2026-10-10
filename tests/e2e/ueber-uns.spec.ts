import { expect, test } from '@playwright/test';

// /ueber-uns/ (docs/design-system.md §8). Navigate relative to baseURL.
// The audit build (PUBLIC_DEMO=false) must not show photos of people without recorded consent.

const demo = process.env['PUBLIC_DEMO'] !== 'false';
const MILESTONES = 7; // entries in src/content/pages/ueber-uns.yaml `milestones`

test.describe('/ueber-uns/', () => {
  test('has one h1 and the four values with sketches', async ({ page }) => {
    await page.goto('ueber-uns/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('Ulf Schmidt');
    const values = page.locator('.values__item');
    await expect(values).toHaveCount(4);
    for (const value of await values.all()) {
      await expect(value.locator('h3')).toBeVisible();
      await expect(value.locator('svg')).toHaveCount(1);
    }
  });

  test('the Jahresringe list the milestones as <time> elements', async ({ page }) => {
    await page.goto('ueber-uns/');
    await expect(page.locator('.jahresringe__item')).toHaveCount(MILESTONES);
    await expect(page.locator('.jahresringe__item time[datetime]')).toHaveCount(MILESTONES);
    // Placeholders and unconfirmed dates are flagged.
    expect(await page.locator('.jahresringe__item[data-review]').count()).toBeGreaterThan(0);
  });

  test('shows the stats, the careers teaser and the CTA band', async ({ page }) => {
    await page.goto('ueber-uns/');
    await expect(page.locator('.stat')).toHaveCount(3);
    await expect(page.locator('section[aria-labelledby="karriere-title"] a.btn')).toHaveAttribute(
      'href',
      /karriere\/$/,
    );
    await expect(page.locator('.cta-band')).toBeVisible();
  });

  test(
    demo ? 'demo: photos of people carry a visible consent mark' : 'audit: no photo of people without consent',
    async ({ page }) => {
      await page.goto('ueber-uns/');
      const photo = page.locator('[data-team-photo]');
      const portrait = page.locator('.about-lead__portrait');
      if (demo) {
        await expect(photo).toHaveCount(1);
        await expect(photo).toHaveAttribute('data-review', 'needs-review');
        await expect(photo).toContainText('Einwilligung ausstehend');
        await expect(portrait).toContainText('Einwilligung ausstehend');
      } else {
        await expect(photo).toHaveCount(0);
        await expect(portrait).toHaveCount(0);
      }
    },
  );

  for (const width of [320, 360, 768, 1280, 1440]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('ueber-uns/');
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
