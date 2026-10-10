import { expect, test, type Page } from '@playwright/test';

// /referenzen/ and /referenzen/<slug>/ (docs/design-system.md §8). Navigate relative to the base.
// Counts come from the content (15 projects, 8 with a detail page); the detail order is read from the
// overview, which uses the same sort as getAdjacentProjects.

const TOTAL = 15;
const DETAIL = 8;
const visibleItems = (page: Page) => page.locator('.refs .gallery__item:visible');

/** Slugs of the detail pages in overview order. */
async function detailSlugs(page: Page): Promise<string[]> {
  await page.goto('referenzen/');
  const hrefs = await page
    .locator('.refs a.project-card__link')
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
  return hrefs.map((h) => /referenzen\/([^/]+)\/$/.exec(h)?.[1] ?? '');
}

test.describe('Referenzen overview', () => {
  test('hero shows the project count and the list has every project', async ({ page }) => {
    await page.goto('referenzen/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('.refs-count')).toHaveText(`${TOTAL} Projekte`);
    await expect(page.locator('.refs .gallery__item')).toHaveCount(TOTAL);
  });

  test('each chip shows exactly its projects', async ({ page }) => {
    await page.goto('referenzen/');
    const chips = page.locator('.refs .chip');
    const n = await chips.count();
    expect(n).toBeGreaterThan(2);
    for (let i = 0; i < n; i++) {
      const chip = chips.nth(i);
      const expected = Number(await chip.locator('input').getAttribute('data-n'));
      await chip.click();
      await expect(visibleItems(page)).toHaveCount(expected);
      await expect(page.locator('.refs [data-status]')).toContainText(`${expected} Projekt`);
    }
  });

  test('?kategorie= preselects a chip', async ({ page }) => {
    await page.goto('referenzen/?kategorie=treppen');
    await expect(page.locator('.refs input[value="treppen"]')).toBeChecked();
    const expected = Number(await page.locator('.refs input[value="treppen"]').getAttribute('data-n'));
    await expect(visibleItems(page)).toHaveCount(expected);
  });

  test('detail cards link to pages that exist', async ({ page }) => {
    const slugs = await detailSlugs(page);
    expect(slugs).toHaveLength(DETAIL);
    for (const slug of slugs) {
      const response = await page.request.get(`referenzen/${slug}/`);
      expect(response.status(), slug).toBe(200);
    }
    await page.locator('.refs a.project-card__link').first().click();
    await expect(page).toHaveURL(new RegExp(`referenzen/${slugs[0]}/$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test('single-photo cards open the lightbox, card-only photos stay plain', async ({ page }) => {
    await page.goto('referenzen/');
    const links = page.locator('.refs a[data-lightbox]');
    expect(await links.count()).toBeGreaterThan(0);
    // Every card is either linked (detail or lightbox) or a plain card with a small photo.
    await expect(page.locator('.refs div.project-card__link')).toHaveCount(TOTAL - DETAIL - (await links.count()));
    await links.first().click();
    const dialog = page.locator('dialog#lightbox');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.lightbox__img')).toHaveAttribute('src', /\.webp$/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('Referenzen overview without JS', () => {
  test.use({ javaScriptEnabled: false });

  test('chips still filter', async ({ page }) => {
    await page.goto('referenzen/');
    const chips = page.locator('.refs .chip');
    const n = await chips.count();
    for (let i = 0; i < n; i++) {
      const chip = chips.nth(i);
      const expected = Number(await chip.locator('input').getAttribute('data-n'));
      await chip.click();
      await expect(visibleItems(page)).toHaveCount(expected);
    }
  });
});

test.describe('Project detail', () => {
  test('structure, hero and JSON-LD', async ({ page }) => {
    await page.goto('referenzen/einbauschrankwand/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Brotkrumen' })).toBeVisible();
    const hero = page.locator('img[data-hero]');
    await expect(hero).toBeVisible();
    await expect
      .poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0);
    expect(await hero.evaluate((img) => getComputedStyle(img).opacity)).toBe('1');
    await expect(page.locator('.fact-list')).toContainText('Möbel');

    const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
    const docs = raw.map((t) => JSON.parse(t) as { '@graph'?: { '@type': string }[]; '@type'?: string });
    const types = docs.flatMap((d) => (d['@graph'] ?? [d]).map((n) => n['@type']));
    expect(types).toContain('BreadcrumbList');
  });

  test('the gallery opens the lightbox', async ({ page }) => {
    await page.goto('referenzen/einbauschrankwand/');
    const link = page.locator('[data-gallery] a[data-lightbox]').first();
    await link.click();
    const dialog = page.locator('dialog#lightbox');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-count]')).toContainText('Bild 1 von');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('before/after on the Holzhaustür page', async ({ page }) => {
    await page.goto('referenzen/holzhaustuer-aufgearbeitet/');
    const ba = page.locator('figure[data-ba]');
    await expect(ba).toBeVisible();
    await expect(ba).toHaveAttribute('data-enhanced', /.*/);
    await ba.getByRole('button', { name: 'Nachher' }).click();
    await expect(ba.getByRole('button', { name: 'Nachher' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('previous/next follow the overview order; related excludes the current project', async ({ page }) => {
    const slugs = await detailSlugs(page);
    for (const [i, slug] of slugs.entries()) {
      await page.goto(`referenzen/${slug}/`);
      const prev = page.locator('.proj-nav a[rel="prev"]');
      const next = page.locator('.proj-nav a[rel="next"]');
      if (i === 0) await expect(prev).toHaveCount(0);
      else await expect(prev).toHaveAttribute('href', new RegExp(`/referenzen/${slugs[i - 1]}/$`));
      if (i === slugs.length - 1) await expect(next).toHaveCount(0);
      else await expect(next).toHaveAttribute('href', new RegExp(`/referenzen/${slugs[i + 1]}/$`));

      const more = page.locator('#proj-more ~ .project-grid .project-card');
      await expect(more).toHaveCount(3);
      const hrefs = await page
        .locator('#proj-more ~ .project-grid a.project-card__link')
        .evaluateAll((els) => els.map((el) => el.getAttribute('href')));
      expect(hrefs.join(' ')).not.toContain(`/referenzen/${slug}/`);
    }
  });

  test('prev/next navigation reaches the neighbour', async ({ page }) => {
    const slugs = await detailSlugs(page);
    await page.goto(`referenzen/${slugs[1]}/`);
    await page.locator('.proj-nav a[rel="next"]').click();
    await expect(page).toHaveURL(new RegExp(`/referenzen/${slugs[2]}/$`));
  });
});

test.describe('No horizontal scroll', () => {
  for (const path of ['referenzen/', 'referenzen/einbauschrankwand/', 'referenzen/holzhaustuer-aufgearbeitet/']) {
    test(`${path} at 320 to 1440 px`, async ({ page }) => {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});
