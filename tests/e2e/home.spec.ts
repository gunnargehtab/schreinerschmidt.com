import { expect, test } from '@playwright/test';

// Home page composition (docs/design-system.md §8 "Home"). Navigate relative to baseURL.

const SERVICE_KEYS = ['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen'];
const SHY = '­';
const clean = (text: string | null) => (text ?? '').replaceAll(SHY, '').replace(/\s+/g, ' ').trim();

// Heading of each section 2-12, in page order.
const H2_ORDER = [
  'Die Schreinerei Schmidt in Zahlen',
  'Was wir für Sie bauen',
  'Vom Entwurf zum Werkstück',
  'Ablauf',
  'Ausgewählte Referenzen',
  'Holz mit Herkunft',
  'Was Kunden sagen',
  'In 3 Minuten zu Ihrem individuellen Angebot',
  'Arbeiten bei der Schreinerei Schmidt',
  'Lassen Sie uns über Ihr Projekt sprechen',
];

test.describe('home sections', () => {
  test('has one h1 and all sections in order', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('h1')).toHaveCount(1);
    const h2s = (await page.locator('main h2').allTextContents()).map(clean);
    expect(h2s).toEqual(H2_ORDER);
  });

  test('service cards link to the seven service pages', async ({ page }) => {
    await page.goto('');
    const links = page.locator('.service-card a.service-card__link');
    await expect(links).toHaveCount(7);
    const keys = await links.evaluateAll((as) =>
      as.map((a) => new URL((a as HTMLAnchorElement).href).pathname.replace(/\/$/, '').split('/').pop()),
    );
    expect([...keys].sort()).toEqual([...SERVICE_KEYS].sort());
    await links.first().click();
    await expect(page).toHaveURL(/leistungen\/[a-z]+\/$/);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('the Ablauf has five steps', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('.process__step')).toHaveCount(5);
  });

  test('featured projects link to existing pages', async ({ page, request }) => {
    await page.goto('');
    const cards = page.locator('.project-card a.project-card__link');
    await expect(cards).toHaveCount(3);
    const hrefs = await cards.evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const href of hrefs) {
      const response = await request.get(href);
      expect(response.status(), href).toBe(200);
    }
  });

  test('the front-door before/after works', async ({ page }) => {
    await page.goto('');
    const ba = page.locator('[data-ba]');
    await expect(ba).toHaveCount(1);
    await expect(ba).toHaveAttribute('data-enhanced', '');
    await ba.scrollIntoViewIfNeeded();
    const group = ba.getByRole('group', { name: 'Ansicht wählen' });
    await group.getByRole('button', { name: 'Vorher' }).click();
    await expect(ba.locator('.ba__stage')).toHaveCSS('--pos', '100%');
    await group.getByRole('button', { name: 'Nachher' }).click();
    await expect(ba.locator('.ba__stage')).toHaveCSS('--pos', '0%');
  });

  test('configurator and Karriere teasers resolve', async ({ page }) => {
    await page.goto('');
    const configurator = page.locator('section[aria-labelledby="konfigurator-title"] a.btn');
    await expect(configurator).toHaveAttribute('href', /konfigurator\/$/);
    const karriere = page.locator('section[aria-labelledby="karriere-title"] a.btn');
    await expect(karriere).toHaveAttribute('href', /karriere\/$/);
    await karriere.click();
    await expect(page).toHaveURL(/karriere\/$/);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('the Herkunft claims carry data-review', async ({ page }) => {
    await page.goto('');
    const claims = page.locator('.claims__item');
    await expect(claims).toHaveCount(4);
    for (const claim of await claims.all()) {
      await expect(claim.locator('[data-review]')).toHaveCount(1);
    }
  });

  test('testimonials show the rating line and quotes', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('.testimonials__rating')).toBeVisible();
    expect(await page.locator('.testimonials__figure').count()).toBeGreaterThan(0);
  });
});

test.describe('home, reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('everything is in its finished state', async ({ page }) => {
    await page.goto('');
    for (const selector of ['.reveal > *', '.service-card', '.process__step', '.claims__item']) {
      const items = await page.locator(selector).all();
      expect(items.length, selector).toBeGreaterThan(0);
      for (const item of items) await expect(item).toHaveCSS('opacity', '1');
    }
    // The sketch layer of the sketch→photo reveal is not displayed at all.
    await expect(page.locator('.sketch-photo__sketch')).toBeHidden();
    await expect(page.locator('.sketch-photo__img')).toHaveCSS('opacity', '1');
  });
});

test.describe('home, layout', () => {
  for (const width of [320, 360, 768, 1024, 1280, 1440]) {
    test(`no horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('');
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
