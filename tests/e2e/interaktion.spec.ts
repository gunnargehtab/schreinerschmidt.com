import { expect, test, type Page } from '@playwright/test';

// BeforeAfter, Gallery + Lightbox and the Referenzen FilterBar on the demo route.
// Navigate relative to baseURL; the base path contains a dot.

const PATH = 'intern/interaktion/';
const NNBSP = ' ';

/** Counts startViewTransition calls so tests can assert on motion without reading pixels. */
async function countTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: number };
    w.__vt = 0;
    const original = document.startViewTransition?.bind(document);
    if (original) {
      document.startViewTransition = ((cb?: () => void) => {
        w.__vt++;
        return original(cb);
      }) as typeof document.startViewTransition;
    }
  });
  return () => page.evaluate(() => (window as unknown as { __vt: number }).__vt);
}

test.describe('BeforeAfter', () => {
  test('enhances to a slider with keyboard, buttons, track click and aria-valuetext @cross-engine', async ({
    page,
  }) => {
    await page.goto(PATH);
    const ba = page.locator('[data-ba]');
    await expect(ba).toHaveAttribute('data-enhanced', '');
    const range = ba.getByRole('slider', { name: 'Vorher-Nachher-Vergleich, Anteil Vorher-Bild' });
    await expect(range).toHaveValue('50');
    await expect(range).toHaveAttribute('aria-valuetext', `50${NNBSP}% Vorher, 50${NNBSP}% Nachher`);

    // Keyboard.
    await range.focus();
    await page.keyboard.press('ArrowRight');
    await expect(range).toHaveValue('51');
    await page.keyboard.press('Home');
    await expect(range).toHaveValue('0');
    await expect(range).toHaveAttribute('aria-valuetext', `0${NNBSP}% Vorher, 100${NNBSP}% Nachher`);
    await page.keyboard.press('End');
    await expect(range).toHaveValue('100');

    // Buttons.
    const group = ba.getByRole('group', { name: 'Ansicht wählen' });
    await expect(group).toBeVisible();
    await group.getByRole('button', { name: 'Nachher' }).click();
    await expect(range).toHaveValue('0');
    await expect(group.getByRole('button', { name: 'Nachher' })).toHaveAttribute('aria-pressed', 'true');
    await group.getByRole('button', { name: 'Vorher' }).click();
    await expect(range).toHaveValue('100');
    await group.getByRole('button', { name: 'Beide' }).click();
    await expect(range).toHaveValue('50');
    await expect(ba.locator('.ba__stage')).toHaveCSS('--pos', '50%');

    // Track click jumps the divider (WCAG 2.5.7).
    await ba.locator('.ba__stage').scrollIntoViewIfNeeded();
    const stage = (await ba.locator('.ba__stage').boundingBox())!;
    await page.mouse.click(stage.x + stage.width * 0.3, stage.y + stage.height / 2);
    const value = Number(await range.inputValue());
    expect(value).toBeGreaterThan(26);
    expect(value).toBeLessThan(34);
    await expect(ba.locator('.ba__stage')).toHaveCSS('--pos', `${value}%`);
  });

  test('the before photo is clipped to the divider (30 %)', async ({ page }) => {
    await page.goto(PATH);
    const ba = page.locator('[data-ba]');
    await ba.getByRole('slider').focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
    const before = ba.locator('.ba__before');
    await expect(before).toHaveCSS('clip-path', 'inset(0px 70% 0px 0px)');
  });

  test('the slider target is at least 44 px tall and the range covers the stage', async ({ page }) => {
    await page.goto(PATH);
    const ba = page.locator('[data-ba]');
    await ba.locator('.ba__stage').scrollIntoViewIfNeeded();
    const stage = (await ba.locator('.ba__stage').boundingBox())!;
    const range = (await ba.getByRole('slider').boundingBox())!;
    expect(range.height).toBeGreaterThanOrEqual(44);
    expect(range.width).toBeGreaterThanOrEqual(stage.width);
    for (const button of await ba.locator('.ba__buttons button').all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('Gallery and Lightbox', () => {
  test('opens, shows the counter, steps with buttons and arrow keys, closes and returns focus @cross-engine', async ({
    page,
  }) => {
    await page.goto(PATH);
    const links = page.locator('[data-gallery] a[data-lightbox]');
    const total = await links.count();
    expect(total).toBeGreaterThan(1);
    const dialog = page.locator('#lightbox');
    await expect(dialog).toBeHidden();

    await links.nth(1).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-count]')).toHaveText(`Bild 2 von ${total}`);
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeFocused();
    const href = (await links.nth(1).getAttribute('href'))!;
    expect(await dialog.locator('.lightbox__img').evaluate((img: HTMLImageElement) => img.src)).toBe(
      new URL(href, page.url()).href,
    );
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');

    await dialog.getByRole('button', { name: 'Nächstes Bild' }).click();
    await expect(dialog.locator('[data-count]')).toHaveText(`Bild 3 von ${total}`);
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('[data-count]')).toHaveText(`Bild 1 von ${total}`);
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('[data-count]')).toHaveText(`Bild ${total} von ${total}`);
    await dialog.getByRole('button', { name: 'Vorheriges Bild' }).click();
    await expect(dialog.locator('[data-count]')).toHaveText(`Bild ${total - 1} von ${total}`);
    await expect(dialog.locator('.lightbox__img')).toHaveAttribute('alt', /.+/);

    await dialog.getByRole('button', { name: 'Schließen' }).click();
    await expect(dialog).toBeHidden();
    await expect(links.nth(total - 2)).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
  });

  test('Escape and a backdrop click close the dialog', async ({ page }) => {
    await page.goto(PATH);
    const links = page.locator('[data-gallery] a[data-lightbox]');
    const dialog = page.locator('#lightbox');
    await links.first().click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(links.first()).toBeFocused();

    await links.first().click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
  });

  test('keyboard: Enter on a thumbnail opens the dialog', async ({ page }) => {
    await page.goto(PATH);
    const first = page.locator('[data-gallery] a[data-lightbox]').first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#lightbox')).toBeVisible();
  });

  test('no view transitions with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const transitions = await countTransitions(page);
    await page.goto(PATH);
    await page.locator('[data-gallery] a[data-lightbox]').first().click();
    await expect(page.locator('#lightbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#lightbox')).toBeHidden();
    expect(await transitions()).toBe(0);
  });

  test('morphs through view transitions when motion is allowed', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'asserted in Chromium only');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const transitions = await countTransitions(page);
    await page.goto(PATH);
    await page.locator('[data-gallery] a[data-lightbox]').first().click();
    await expect(page.locator('#lightbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#lightbox')).toBeHidden();
    expect(await transitions()).toBe(2);
  });
});

test.describe('FilterBar', () => {
  const COUNTS: Record<string, number> = {
    alle: 15,
    moebel: 6,
    boeden: 3,
    treppen: 2,
    'fenster-tueren': 4,
    altbau: 3,
    terrassen: 1,
  };
  const chip = (page: Page, label: string) => page.locator('.chip', { hasText: label }).click();
  const visible = (page: Page) => page.locator('[data-filter-list] .gallery__item:visible').count();

  test('chips show their counts; choosing one filters the list and updates the status @cross-engine', async ({
    page,
  }) => {
    await page.goto(PATH);
    const status = page.getByRole('status');
    await expect(status).toHaveText('15 Projekte');
    for (const [value, n] of Object.entries(COUNTS)) {
      const chip = page.locator('.chip', { has: page.locator(`input[value="${value}"]`) });
      await expect(chip.locator('.chip__n')).toHaveText(`(${n})`);
      await chip.click();
      await expect(page.locator(`input[value="${value}"]`)).toBeChecked();
      await expect(status).toHaveText(n === 1 ? '1 Projekt' : `${n} Projekte`);
      await expect.poll(() => visible(page)).toBe(n);
    }
  });

  test('every visible item belongs to the chosen category', async ({ page }) => {
    await page.goto(PATH);
    await chip(page, 'Fenster und Türen');
    await expect.poll(() => visible(page)).toBe(4);
    for (const item of await page.locator('[data-filter-list] .gallery__item:visible').all()) {
      await expect(item).toHaveAttribute('data-cat', /\bfenster-tueren\b/);
    }
  });

  test('?kategorie=boeden preselects the chip and filters on first paint @cross-engine', async ({ page }) => {
    await page.goto(`${PATH}?kategorie=boeden`);
    await expect(page.locator('input[value="boeden"]')).toBeChecked();
    await expect(page.getByRole('status')).toHaveText('3 Projekte');
    expect(await visible(page)).toBe(3);
    await page.goto(`${PATH}?kategorie=gibt-es-nicht`);
    await expect(page.locator('input[value="alle"]')).toBeChecked();
    expect(await visible(page)).toBe(15);
  });

  test('arrow keys move between chips and filter', async ({ page }) => {
    await page.goto(PATH);
    await page.locator('input[value="alle"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('input[value="moebel"]')).toBeChecked();
    await expect(page.getByRole('status')).toHaveText('6 Projekte');
  });

  test('uses a view transition with .is-filtering, none with reduced motion', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'asserted in Chromium only');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const transitions = await countTransitions(page);
    await page.goto(PATH);
    await chip(page, 'Möbel');
    await expect(page.getByRole('status')).toHaveText('6 Projekte');
    expect(await transitions()).toBe(1);
    await expect(page.locator('[data-filter-list]')).not.toHaveClass(/is-filtering/);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await chip(page, 'Böden');
    await expect(page.getByRole('status')).toHaveText('3 Projekte');
    expect(await transitions()).toBe(1);
  });
});
