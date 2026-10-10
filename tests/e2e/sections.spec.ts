import { expect, test } from '@playwright/test';

// Shared section components on the demo route (src/pages/intern/komponenten). Demo builds only.
// Navigate relative to baseURL; the base path contains a dot.

const PAGE = 'intern/komponenten/';

test.describe('ServiceCard', () => {
  test('the whole card is the click target', async ({ page }) => {
    await page.goto(PAGE);
    const card = page.locator('.service-grid').first().locator('.service-card').first();
    const href = await card.locator('a.service-card__link').getAttribute('href');
    expect(href).toMatch(/leistungen\/[a-z]+\/$/);
    // Click in the card's top-left padding, far from the title text.
    await card.click({ position: { x: 6, y: 6 } });
    await expect(page).toHaveURL(new RegExp(`${href?.replace(/[./]/g, '\\$&')}$`));
  });

  test('keyboard focus draws one ring around the card, not around the link', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard focus is checked on desktop');
    await page.goto(PAGE);
    const card = page.locator('.service-card').first();
    const link = card.locator('a.service-card__link');
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      if (await link.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(link).toBeFocused();
    const ring = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: Number.parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  });
});

test.describe('FAQ', () => {
  test('opens and closes with the keyboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard interaction is checked on desktop');
    await page.goto(PAGE);
    const item = page.locator('.faq__item').first();
    const summary = item.locator('summary');
    await expect(item).not.toHaveAttribute('open', '');
    const box = await summary.boundingBox();
    expect(box?.height ?? 0, 'summary at least 44 px tall').toBeGreaterThanOrEqual(44);

    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('open', '');
    await page.keyboard.press('Space');
    await expect(item).not.toHaveAttribute('open', '');
  });

  test('questions are independent', async ({ page }) => {
    await page.goto(PAGE);
    const items = page.locator('.faq__item');
    await items.nth(0).locator('summary').click();
    await items.nth(1).locator('summary').click();
    await expect(items.nth(0)).toHaveAttribute('open', '');
    await expect(items.nth(1)).toHaveAttribute('open', '');
  });
});

test.describe('JobCard', () => {
  test('details name="jobs" are exclusive', async ({ page }) => {
    await page.goto(PAGE);
    const jobs = page.locator('details[name="jobs"]');
    expect(await jobs.count()).toBeGreaterThanOrEqual(2);
    await jobs.nth(0).locator('summary').click();
    await expect(jobs.nth(0)).toHaveAttribute('open', '');
    await jobs.nth(1).locator('summary').click();
    await expect(jobs.nth(1)).toHaveAttribute('open', '');
    await expect(jobs.nth(0)).not.toHaveAttribute('open', '');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('renders the finished state: nothing hidden, nothing animated', async ({ page }) => {
    await page.goto(PAGE);
    const state = await page.evaluate(() => {
      const names = (sel: string, pseudo?: string) =>
        [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el, pseudo).animationName);
      const opacity = [...document.querySelectorAll('.reveal > *')].map((el) => getComputedStyle(el).opacity);
      return {
        reveal: names('.reveal > *'),
        opacity,
        processLine: names('.process__list', '::before'),
        sketchPaths: names('.service-card .sketch path'),
        dash: [...document.querySelectorAll('.service-card .sketch path')].map(
          (el) => getComputedStyle(el).strokeDasharray,
        ),
      };
    });
    expect(state.reveal.length).toBeGreaterThan(0);
    for (const n of [...state.reveal, ...state.processLine, ...state.sketchPaths]) expect(n).toBe('none');
    for (const o of state.opacity) expect(o).toBe('1');
    for (const d of state.dash) expect(d).toBe('none');
  });
});

test.describe('review view', () => {
  test('is plain by default and highlighted with ?pruefen', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('html')).not.toHaveAttribute('data-pruefen', /.*/);
    await expect(page.locator('.review-legend')).toHaveCount(0);
    const mark = page.locator('.review-mark').first();
    const plain = await mark.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(plain).toBe('none');

    await page.goto(`${PAGE}?pruefen`);
    await expect(page.locator('html')).toHaveAttribute('data-pruefen', '');
    await expect(page.locator('.review-legend')).toHaveCount(1);
    expect(await mark.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  });
});

test.describe('layout', () => {
  for (const width of [320, 360, 768, 1024, 1280, 1440]) {
    test(`no horizontal scroll at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PAGE);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        return { scroll: root.scrollWidth, client: root.clientWidth };
      });
      expect(overflow.scroll, `scrollWidth ${overflow.scroll} > ${overflow.client}`).toBeLessThanOrEqual(
        overflow.client,
      );
    });
  }

  test('the page has exactly one h1', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
});
