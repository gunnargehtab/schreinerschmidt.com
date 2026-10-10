import { expect, test, type Page, type Request } from '@playwright/test';

// Kontakt and the contact / configurator thank-you pages (docs/design-system.md §8, architecture §8).
// Navigate relative to the base: goto('kontakt/').

const demo = process.env['PUBLIC_DEMO'] !== 'false';

function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));
  return requests;
}

/** Let the lazy map image load, so later requests are the form's. */
async function settle(page: Page): Promise<void> {
  const map = page.locator('.static-map img');
  await map.scrollIntoViewIfNeeded();
  await expect.poll(() => map.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.waitForLoadState('networkidle');
  await page.locator('h1').scrollIntoViewIfNeeded();
}

test.describe('quick actions and address', () => {
  test('offers call, mail and route as links', async ({ page }) => {
    await page.goto('kontakt/');
    await expect(page.locator('h1')).toHaveCount(1);
    const actions = page.locator('section[aria-label="Schnellkontakt"] a');
    await expect(actions).toHaveCount(3);
    await expect(actions.nth(0)).toHaveAttribute('href', 'tel:+491799467822');
    await expect(actions.nth(1)).toHaveAttribute('href', 'mailto:info@schreinerschmidt.com');
    await expect(actions.nth(2)).toHaveAttribute('href', /^https:\/\/www\.openstreetmap\.org\/directions\?to=/);
  });

  test('prints the address from the settings, the hours and the static map', async ({ page }) => {
    await page.goto('kontakt/');
    const address = page.locator('main address');
    await expect(address).toContainText('Andreas-Hofer-Str. 33');
    await expect(address).toContainText('68259 Mannheim');
    await expect(address.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(address.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(page.locator('.kontakt__hours li')).toHaveCount(1);
    await expect(page.locator('.kontakt__hours')).toContainText('Mo–Fr');
    await expect(page.locator('.static-map')).toContainText('© OpenStreetMap-Mitwirkende');
    // The Google profile link is only rendered once the profile URL is confirmed.
    await expect(page.locator('a[href*="example.invalid"]')).toHaveCount(0);
  });

  test('mobile order is actions, form, address, map', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('kontakt/');
    const top = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const order = [
      await top('section[aria-label="Schnellkontakt"]'),
      await top('#kontakt-form'),
      await top('main address'),
      await top('.static-map'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test('desktop puts the form and the info column side by side', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('kontakt/');
    const form = await page.locator('.kontakt__form').boundingBox();
    const info = await page.locator('.kontakt__info').boundingBox();
    expect(form && info && form.x + form.width <= info.x + 1).toBe(true);
  });
});

test.describe('contact form', () => {
  test.skip(!demo, 'the live form posts to the form service');

  test('is a demo form: dialog method and the notice', async ({ page }) => {
    await page.goto('kontakt/');
    const form = page.locator('#kontakt-form');
    await expect(form).toHaveAttribute('method', 'dialog');
    await expect(form.locator('.form__notice')).toHaveText('Demo: Es werden keine Daten übertragen.');
    await expect(form.locator('.form__privacy a')).toHaveAttribute('href', /\/datenschutz\/$/);
    await expect(form.locator('label[for="kontakt-thema"]')).toHaveText('Interessiert an');
  });

  test('validates: required fields end up in the focused error summary', async ({ page }) => {
    await page.goto('kontakt/');
    await page.locator('#kontakt-form').getByRole('button', { name: 'Anfrage senden' }).click();
    const summary = page.locator('#kontakt-form-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).toHaveText([/^Name:/, /^E-Mail:/, /^Nachricht:/]);
    await page.locator('#kontakt-plz').fill('123');
    await page.locator('#kontakt-plz').blur();
    await expect(page.locator('#kontakt-plz-error')).toBeVisible();
  });

  test('a valid submit shows the demo success and sends nothing @cross-engine', async ({ page }) => {
    await page.clock.install();
    await page.goto('kontakt/');
    await settle(page);
    const requests = recordRequests(page);
    await page.locator('#kontakt-name').fill('Erika Mustermann');
    await page.locator('#kontakt-email').fill('erika@beispiel.de');
    await page.locator('#kontakt-thema').selectOption('angebot');
    await page.locator('#kontakt-nachricht').fill('Bitte um ein Angebot für einen Einbauschrank.');
    await page.clock.fastForward(4000);
    await page.locator('#kontakt-form').getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.locator('#kontakt-form-status')).toContainText('Demo – nichts übertragen');
    await page.waitForTimeout(300);
    expect(requests.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the form is method=dialog and all contact data is present', async ({ page }) => {
      await page.goto('kontakt/');
      await expect(page.locator('#kontakt-form')).toHaveAttribute('method', 'dialog');
      await expect(page.locator('main address')).toContainText('Mannheim');
    });
  });
});

test.describe('danke pages', () => {
  for (const [path, h1] of [
    ['kontakt/danke/', 'Danke für Ihre Anfrage'],
    ['konfigurator/danke/', 'Danke, Ihre Anfrage ist unterwegs'],
  ] as const) {
    test(`/${path} is noindexed, has one h1 and links onward`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(h1);
      await expect(page.locator('main a.btn')).toHaveCount(3);
    });
  }

  test('the configurator thank-you lists the next steps', async ({ page }) => {
    await page.goto('konfigurator/danke/');
    await expect(page.locator('main .prose ol li')).toHaveCount(3);
  });
});

test.describe('layout', () => {
  for (const path of ['kontakt/', 'kontakt/danke/', 'konfigurator/danke/']) {
    for (const width of [320, 768, 1440]) {
      test(`/${path} does not scroll horizontally at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await page.waitForLoadState('load');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});
