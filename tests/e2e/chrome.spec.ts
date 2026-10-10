import { expect, test, type Locator, type Page } from '@playwright/test';

// Site chrome: header navigation, Leistungen disclosure, mobile sheet, theme toggle.
// Navigate relative to baseURL (goto('kontakt/')); the base path contains a dot.

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const SERVICE_KEYS = ['moebel', 'boeden', 'treppen', 'fenster', 'tueren', 'altbau', 'terrassen'];
const NAV_PAGES = ['leistungen/', 'referenzen/', 'ueber-uns/', 'karriere/', 'kontakt/'];

/**
 * Waits until no time-based animation runs on the page: popover open/close transitions
 * (`display`/`overlay` with allow-discrete keep a closing popover rendered for --dur-2) and
 * same-document view transitions (whose pseudo-elements intercept pointer events). Scroll-driven
 * animations are always "running" and are ignored. Clicking into a popover while it still moves, or
 * during a view transition, makes Playwright retry its actionability checks; under CI load those
 * retries added up to the 30 s test timeout.
 */
const settled = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === 'running' && a.timeline instanceof DocumentTimeline)
              .length,
        ),
      { message: 'time-based animations have finished' },
    )
    .toBe(0);

/** The popover state itself (`:popover-open`), independent of the exit transition that keeps it rendered. */
const popoverOpen = (popover: Locator) => popover.evaluate((el) => el.matches(':popover-open'));

test.describe('desktop header', () => {
  test.use({ viewport: DESKTOP });
  test.skip(({ isMobile }) => isMobile, 'desktop layout is checked in the desktop project');

  test('nav links resolve and mark the current page', async ({ page }) => {
    await page.goto('');
    const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
    await expect(nav).toBeVisible();
    await expect(page.locator('.menu-button')).toBeHidden();
    for (const target of ['Referenzen', 'Über uns', 'Karriere', 'Kontakt']) {
      await page.goto('');
      await nav.getByRole('link', { name: target, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: target }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  test('every nav target page exists with one h1', async ({ page }) => {
    for (const path of [...NAV_PAGES, 'konfigurator/', 'impressum/', 'datenschutz/']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    }
  });

  test('the Leistungen disclosure opens, closes with a click and with Escape', async ({ page }) => {
    await page.goto('');
    const trigger = page.getByRole('button', { name: 'Leistungen' });
    const panel = page.locator('#menu-leistungen');
    await expect(panel).toBeHidden();

    await trigger.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link')).toHaveCount(SERVICE_KEYS.length + 1);

    await trigger.click();
    await expect(panel).toBeHidden();

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });

  test('the Leistungen panel links to the service pages', async ({ page }) => {
    await page.goto('');
    await page.getByRole('button', { name: 'Leistungen' }).click();
    await page.locator('#menu-leistungen').getByRole('link', { name: 'Böden' }).click();
    await expect(page).toHaveURL(/leistungen\/boeden\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Böden' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Brotkrumen' }).locator('[aria-current="page"]')).toHaveText(
      'Böden',
    );
  });

  test('keyboard: Tab moves from the trigger into the open panel', async ({ page }) => {
    await page.goto('');
    const trigger = page.getByRole('button', { name: 'Leistungen' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu-leistungen')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Böden');
  });

  test('footer shows NAP and hours', async ({ page }) => {
    await page.goto('');
    const footer = page.locator('footer');
    await expect(footer.locator('address')).toContainText('Andreas-Hofer-Str. 33');
    await expect(footer.locator('address')).toContainText('68259 Mannheim');
    await expect(footer.locator('dl')).toContainText('Mo–Fr');
    await expect(footer.locator('dl')).toContainText('7–17');
    await expect(footer.getByRole('link', { name: 'Impressum' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Datenschutz' })).toBeVisible();
  });
});

test.describe('mobile sheet', () => {
  test.use({ viewport: MOBILE });

  /** Opens the sheet and waits for its drop-in to finish, so the next click inside is immediately actionable. */
  const openSheet = async (page: Page) => {
    const sheet = page.locator('#site-menu');
    await page.locator('.menu-button').click();
    await expect.poll(() => popoverOpen(sheet)).toBe(true);
    await settled(page);
    await expect(sheet).toBeVisible();
    return sheet;
  };

  test('opens below the button and lists all links incl. Kontakt', async ({ page }) => {
    await page.goto('');
    const button = page.locator('.menu-button');
    const sheet = page.locator('#site-menu');
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeHidden();
    await expect(sheet).toBeHidden();

    await openSheet(page);
    const menu = sheet.getByRole('navigation', { name: 'Hauptmenü' });
    for (const name of ['Leistungen', 'Referenzen', 'Über uns', 'Karriere', 'Kontakt']) {
      await expect(menu.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(sheet.getByRole('link', { name: 'Angebot konfigurieren' })).toBeVisible();
    // The menu button stays reachable above the sheet (measured once the drop-in has settled).
    const [b, s] = await Promise.all([button.boundingBox(), sheet.boundingBox()]);
    expect(b && s && b.y + b.height <= s.y + 1, 'sheet starts below the button').toBe(true);
  });

  test('closes with the close button and reopens', async ({ page }) => {
    await page.goto('');
    const sheet = await openSheet(page);
    await sheet.getByRole('button', { name: 'Menü schließen' }).click();
    // The popover state flips at once; the exit transition keeps the sheet rendered for --dur-2.
    await expect.poll(() => popoverOpen(sheet)).toBe(false);
    await expect(sheet).toBeHidden();
    // Focus returns to the menu button, which opens the sheet again.
    await expect(page.locator('.menu-button')).toBeFocused();
    await openSheet(page);
  });

  test('closes with Escape', async ({ page }) => {
    await page.goto('');
    const sheet = await openSheet(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => popoverOpen(sheet)).toBe(false);
    await expect(sheet).toBeHidden();
  });

  test('closes when focus leaves the sheet and the button', async ({ page }) => {
    await page.goto('');
    await page.locator('.menu-button').click();
    await expect(page.locator('#site-menu')).toBeVisible();
    // Shift+Tab from the button goes to the previous focusable element, outside sheet and button.
    await page.locator('.menu-button').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#site-menu')).toBeHidden();
  });

  test('closes when the viewport reaches desktop width', async ({ page }) => {
    await page.goto('');
    await page.locator('.menu-button').click();
    await expect(page.locator('#site-menu')).toBeVisible();
    await page.setViewportSize(DESKTOP);
    await expect(page.locator('#site-menu')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
  });

  test('the phone link is a 44 px target with an accessible name from 400 px up', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 844 });
    await page.goto('');
    const phone = page.locator('.site-header .phone');
    const box = await phone.boundingBox();
    expect(box && box.width >= 43.9 && box.height >= 43.9).toBe(true);
    await expect(phone).toHaveAttribute('href', /^tel:\+49/);
    await expect(phone).toHaveAccessibleName(/\+49/);
  });

  test('below 400 px the phone icon is hidden and the sheet keeps an Anrufen link', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('.site-header .phone')).toBeHidden();
    await page.locator('.menu-button').click();
    await expect(page.locator('#site-menu').getByRole('link', { name: /Anrufen/ })).toHaveAttribute(
      'href',
      /^tel:\+49/,
    );
  });
});

test.describe('header reflow (WCAG 1.4.10) @cross-engine', () => {
  for (const width of [320, 360, 390, 768]) {
    for (const path of ['', 'kontakt/']) {
      test(`no horizontal overflow at ${width} px on /${path}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const overflow = () =>
          page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        const closed = await overflow();
        expect(closed.sw, 'closed').toBeLessThanOrEqual(closed.iw);

        const button = page.locator('.menu-button');
        const inside = async () => {
          const b = await button.boundingBox();
          expect(b && b.x >= 0 && b.x + b.width <= width, 'menu button inside viewport').toBe(true);
          expect(b && b.width >= 43.9 && b.height >= 43.9, `menu button >= 44 px: ${JSON.stringify(b)}`).toBe(true);
        };
        await inside();
        const logo = await page.locator('.site-header__home').boundingBox();
        expect(logo && logo.width >= 119.9 && logo.height >= 43.9, 'wordmark link legible and 44 px tall').toBe(true);

        await button.click();
        await expect(page.locator('#site-menu')).toBeVisible();
        const open = await overflow();
        expect(open.sw, 'sheet open').toBeLessThanOrEqual(open.iw);
        await inside();
      });
    }
  }
});

test.describe('theme toggle', () => {
  /** Opens the picker and waits for its drop-in, so the radios are immediately actionable. */
  const openPicker = async (page: Page) => {
    await page.getByRole('button', { name: 'Farbschema' }).click();
    await expect.poll(() => popoverOpen(page.locator('#theme-menu'))).toBe(true);
    await settled(page);
  };

  test('flips data-theme, persists after reload, and storage is empty before a click', async ({ page }) => {
    await page.goto('');
    expect(await page.evaluate(() => localStorage.getItem('ss-theme'))).toBeNull();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);

    await openPicker(page);
    await page.getByLabel('Werkstatt bei Nacht').check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('ss-theme'))).toBe('dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openPicker(page);
    await expect(page.getByLabel('Werkstatt bei Nacht')).toBeChecked();

    // Each pick runs inside a view transition whose pseudo-elements intercept pointer events: let it finish.
    await page.getByLabel('Hell', { exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await settled(page);

    await page.getByLabel('Wie System').check();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    expect(await page.evaluate(() => localStorage.getItem('ss-theme'))).toBeNull();
  });
});
