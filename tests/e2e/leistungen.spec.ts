import { expect, test, type Page } from '@playwright/test';

// /leistungen/ and the seven service pages. Navigate relative to baseURL (the base contains a dot).

const KEYS = ['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen'] as const;
const NNBSP = ' ';
const SHY = '­';

const h1Text = async (page: Page) => ((await page.locator('h1').textContent()) ?? '').replaceAll(SHY, '').trim();

test.describe('/leistungen/', () => {
  test('lists seven service cards that link to the seven pages', async ({ page }) => {
    await page.goto('leistungen/');
    await expect(page.locator('h1')).toHaveCount(1);
    const cards = page.locator('.service-card');
    await expect(cards).toHaveCount(7);
    const hrefs = await cards
      .locator('a.service-card__link')
      .evaluateAll((links) =>
        links.map((a) => new URL((a as HTMLAnchorElement).href).pathname.replace(/\/$/, '').split('/').pop()),
      );
    expect([...hrefs].sort()).toEqual([...KEYS].sort());
  });

  test('has the Ablauf, the sustainability teaser, the FAQ and the CTA band', async ({ page }) => {
    await page.goto('leistungen/');
    await expect(page.locator('.process__step')).toHaveCount(5);
    await expect(page.getByRole('heading', { level: 2, name: 'Holz mit Herkunft' })).toBeVisible();
    await expect(page.locator('.faq details').first()).toBeVisible();
    await expect(page.locator('.cta-band')).toBeVisible();
  });

  test('card to page navigation works without view-transition support', async ({ page }) => {
    await page.addInitScript(() => {
      // Same code path as a browser without the API.
      Reflect.deleteProperty(Document.prototype, 'startViewTransition');
    });
    await page.goto('leistungen/');
    await page.locator('.service-card').filter({ hasText: 'Böden' }).first().locator('a.service-card__link').click();
    await expect(page).toHaveURL(/leistungen\/boeden\/$/);
    await expect(page.locator('h1')).toBeVisible();
  });
});

for (const key of KEYS) {
  test.describe(`/leistungen/${key}/`, () => {
    test('has one h1, breadcrumbs and a visible hero image', async ({ page }) => {
      await page.goto(`leistungen/${key}/`);
      await expect(page.locator('h1')).toHaveCount(1);
      const title = await h1Text(page);
      const crumbs = page.getByRole('navigation', { name: 'Brotkrumen' });
      await expect(crumbs.getByRole('link', { name: 'Leistungen' })).toBeVisible();
      await expect(crumbs.locator('[aria-current="page"]')).toContainText(title.slice(0, 4));

      const hero = page.locator('.service-hero__media img');
      await expect(hero).toBeVisible();
      await expect(hero).toHaveCSS('opacity', '1');
      await expect(hero).toHaveAttribute('fetchpriority', 'high');
      await expect(hero).not.toHaveAttribute('loading', 'lazy');
      expect(await hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    });

    test('carries the view-transition name of its service card', async ({ page }) => {
      await page.goto(`leistungen/${key}/`);
      const vt = await page.locator('.service-hero__media').evaluate((el) => getComputedStyle(el).viewTransitionName);
      expect(vt).toBe(`hero-media-${key}`);
    });

    test('in-page navigation links to existing sections', async ({ page }) => {
      await page.goto(`leistungen/${key}/`);
      const hrefs = await page
        .locator('.inpage-nav a')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      expect(hrefs.length).toBeGreaterThanOrEqual(4);
      for (const href of hrefs) {
        expect(href).toMatch(/^#[a-z0-9-]+$/);
        await expect(page.locator(href ?? '#none')).toHaveCount(1);
      }
    });

    test('has Service and BreadcrumbList JSON-LD', async ({ page }) => {
      await page.goto(`leistungen/${key}/`);
      const blocks = await page
        .locator('script[type="application/ld+json"]')
        .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? 'null') as unknown));
      const types = blocks.flatMap((block) => {
        const doc = block as { '@graph'?: { '@type': string }[]; '@type'?: string };
        return doc['@graph']?.map((node) => node['@type']) ?? [doc['@type']];
      });
      expect(types).toContain('Service');
      expect(types).toContain('BreadcrumbList');
    });

    test('placeholder marks are hidden by default and shown in the review view', async ({ page }) => {
      await page.goto(`leistungen/${key}/`);
      const marks = page.locator('.service-section .review-mark[data-review="placeholder"]');
      const count = await marks.count();
      test.skip(count === 0, 'no placeholder markers in this service');
      await expect(page.locator('main')).not.toContainText('[[');
      await expect(marks.first()).toBeHidden();
      await page.goto(`leistungen/${key}/?pruefen`);
      await expect(marks.first()).toBeVisible();
    });
  });
}

test.describe('/leistungen/boeden/', () => {
  test('has six type cards with floor patterns and the plank label', async ({ page }) => {
    await page.goto('leistungen/boeden/');
    const cards = page.locator('.type-cards__card');
    await expect(cards).toHaveCount(6);
    await expect(cards.locator('svg')).toHaveCount(6);
    await expect(page.locator('.type-cards__size')).toHaveText(`bis 5${NNBSP}m × 60${NNBSP}cm`);
  });

  test('type cards form 3, 2 and 1 columns', async ({ page }) => {
    const columns = () =>
      page.locator('.type-cards__list').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('leistungen/boeden/');
    expect(await columns()).toBe(3);
    await page.setViewportSize({ width: 768, height: 900 });
    expect(await columns()).toBe(2);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await columns()).toBe(1);
  });

  test('lists the woods and three projects', async ({ page }) => {
    await page.goto('leistungen/boeden/');
    await expect(page.locator('.wood-list__item')).toHaveCount(2);
    await expect(page.locator('#referenzen .project-card')).toHaveCount(3);
    await expect(page.locator('#faq details')).toHaveCount(3);
  });
});

test.describe('no horizontal scroll', () => {
  for (const path of ['leistungen/', 'leistungen/boeden/', 'leistungen/fenster/', 'leistungen/moebel/']) {
    test(`${path} fits 320 to 1440 px`, async ({ page }) => {
      for (const width of [320, 360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});
