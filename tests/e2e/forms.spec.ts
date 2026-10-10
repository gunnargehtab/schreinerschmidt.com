import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';

// Form infrastructure (docs/architecture.md §8) against the demo-only fixture
// src/pages/intern/formular/[...demo].astro: a demo-mode form with every field type and a live-mode
// form that posts to an unreachable test endpoint. Live tests bypass the demo CSP and fulfil the
// endpoint with page.route(), so nothing leaves the browser. Navigate relative to the base.

const PATH = 'intern/formular/';
const DANKE = /intern\/formular\/danke\/$/;
const ENDPOINT = 'https://formular.example.invalid/s/fixture';
const demo = process.env['PUBLIC_DEMO'] !== 'false';

test.skip(!demo, 'the fixture only exists in demo builds');

/** Open the fixture and let the page settle (lazy map image included), so later requests are the form's. */
async function open(page: Page): Promise<void> {
  await page.goto(PATH);
  const map = page.locator('.static-map img');
  await map.scrollIntoViewIfNeeded();
  await expect.poll(() => map.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.waitForLoadState('networkidle');
  await page.locator('h1').scrollIntoViewIfNeeded();
}

/** Record every request from now on. */
function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));
  return requests;
}

async function fillDemo(page: Page): Promise<void> {
  await page.locator('#demo-name').fill('Erika Mustermann');
  await page.locator('#demo-email').fill('erika@beispiel.de');
  await page.locator('#demo-plz').fill('68259');
  await page.locator('#demo-leistung').selectOption('moebel');
  await page.locator('#demo-kontaktweg-1').check();
  await page.locator('#demo-nachricht').fill('Bitte um Rückruf wegen eines Einbauschranks.');
}

const submitDemo = (page: Page) => page.locator('#demo-form').getByRole('button', { name: 'Testanfrage senden' });
const submitLive = (page: Page) => page.locator('#live-form').getByRole('button', { name: 'Live-Test senden' });

test.describe('demo form with JS', () => {
  test('required errors: the summary is focused and links to the fields @cross-engine', async ({ page }) => {
    await open(page);
    const form = page.locator('#demo-form');
    await expect(form).toHaveAttribute('method', 'dialog');
    await expect(form).toHaveAttribute('novalidate', '');
    await expect(form.locator('.form__notice')).toHaveText('Demo: Es werden keine Daten übertragen.');

    await submitDemo(page).click();
    const summary = page.locator('#demo-form-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary).toHaveAttribute('role', 'alert');
    const links = summary.getByRole('link');
    await expect(links).toHaveText([
      'Name: Bitte füllen Sie dieses Feld aus.',
      'E-Mail: Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
      'PLZ: Bitte geben Sie eine fünfstellige Postleitzahl ein.',
      'Leistung: Bitte wählen Sie eine Option.',
      'Bevorzugter Kontaktweg: Bitte wählen Sie eine Option.',
      'Nachricht: Bitte geben Sie mindestens 10 Zeichen ein.',
    ]);

    const name = page.locator('#demo-name');
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAttribute('aria-describedby', 'demo-name-error');
    await expect(page.locator('#demo-name-error')).toBeVisible();
    // Radios: the fieldset carries the error, no aria-invalid on the radios.
    await expect(page.locator('fieldset:has(#demo-kontaktweg-0)')).toHaveAttribute(
      'aria-describedby',
      'demo-kontaktweg-error',
    );
    await expect(page.locator('#demo-kontaktweg-0')).not.toHaveAttribute('aria-invalid');
    // Optional fields stay valid and keep their hint.
    await expect(page.locator('#demo-tel')).toHaveAttribute('aria-describedby', 'demo-tel-hint');
    await expect(page.locator('#demo-tel')).not.toHaveAttribute('aria-invalid');

    await summary.getByRole('link', { name: /^E-Mail:/ }).click();
    const email = page.locator('#demo-email');
    await expect(email).toBeFocused();
    await email.fill('erika@beispiel.de');
    await expect(email).not.toHaveAttribute('aria-invalid');
    await expect(email).not.toHaveAttribute('aria-describedby');
    await expect(page.locator('#demo-email-error')).toBeHidden();
  });

  test(':user-invalid shows the error once the user leaves a wrong value', async ({ page }) => {
    await open(page);
    const plz = page.locator('#demo-plz');
    const error = page.locator('#demo-plz-error');
    await expect(error).toBeHidden();
    await plz.fill('123');
    await plz.blur();
    await expect(error).toBeVisible();
    await expect(plz).toHaveJSProperty('validity.patternMismatch', true);
    // CSS only: the script has not flagged the field.
    await expect(plz).not.toHaveAttribute('aria-invalid');
    const errorColour = await error.evaluate((el) => getComputedStyle(el).color);
    await expect(plz).toHaveCSS('border-top-color', errorColour);
    await plz.fill('68259');
    await plz.blur();
    await expect(error).toBeHidden();
  });

  test('a valid submit shows the inline success and makes zero network requests @cross-engine', async ({ page }) => {
    await page.clock.install();
    await open(page);
    const requests = recordRequests(page);
    await fillDemo(page);
    await page.clock.fastForward(4000);
    await submitDemo(page).click();

    await expect(page.locator('#demo-form-status')).toContainText('Demo – nichts übertragen');
    await expect(page.locator('#demo-form-summary')).toBeHidden();
    await expect(page).toHaveURL(/intern\/formular\/$/);
    await page.waitForTimeout(500);
    expect(requests.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  });

  test('a submit faster than the time-trap also shows success without any request', async ({ page }) => {
    await open(page);
    const requests = recordRequests(page);
    await fillDemo(page);
    await submitDemo(page).click();
    await expect(page.locator('#demo-form-status')).toContainText('Demo – nichts übertragen');
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
  });

  test('keyboard only: submit with Enter, follow a summary link, fix the field, succeed', async ({ page }) => {
    await page.clock.install();
    await open(page);
    const requests = recordRequests(page);
    await page.locator('#demo-name').focus();
    await page.keyboard.type('Erika Mustermann');
    await page.keyboard.press('Enter');

    const summary = page.locator('#demo-form-summary');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText(/^E-Mail:/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#demo-email')).toBeFocused();
    await page.keyboard.type('erika@beispiel.de');
    await expect(page.locator('#demo-email')).not.toHaveAttribute('aria-invalid');

    await page.keyboard.press('Tab'); // Telefon
    await page.keyboard.press('Tab'); // PLZ
    await page.keyboard.type('68259');
    await page.keyboard.press('Tab'); // Ort
    await page.keyboard.press('Tab'); // Leistung
    await expect(page.locator('#demo-leistung')).toBeFocused();
    // A closed classic select changes its value on ArrowDown; a base-select opens its picker on the
    // placeholder instead, where ArrowDown + Enter picks the next option.
    await page.keyboard.press('ArrowDown');
    const pickerOpen = await page.locator('#demo-leistung').evaluate((el) => {
      try {
        return el.matches(':open');
      } catch {
        return false;
      }
    });
    if (pickerOpen) {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('#demo-leistung')).toHaveValue('moebel');
    await expect(page.locator('#demo-leistung')).toBeFocused();
    await page.keyboard.press('Tab'); // first radio
    await page.keyboard.press('Space');
    await expect(page.locator('#demo-kontaktweg-0')).toBeChecked();
    await page.keyboard.press('Tab'); // checkbox 1
    await page.keyboard.press('Tab'); // checkbox 2
    await page.keyboard.press('Tab'); // Nachricht
    await expect(page.locator('#demo-nachricht')).toBeFocused();
    await page.keyboard.type('Bitte um Rückruf.');
    await page.clock.fastForward(4000);
    // Tab past the privacy link to the submit button.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(submitDemo(page)).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('#demo-form-status')).toContainText('Demo – nichts übertragen');
    await expect(summary).toBeHidden();
    expect(requests).toEqual([]);
  });
});

test.describe('demo form without JS', () => {
  test.use({ javaScriptEnabled: false });

  test('method="dialog" validates natively and then does nothing', async ({ page }) => {
    await page.goto(PATH);
    await page.waitForLoadState('networkidle');
    const form = page.locator('#demo-form');
    await expect(form).toHaveAttribute('method', 'dialog');
    await expect(form).not.toHaveAttribute('novalidate');
    await expect(form.locator('.form__notice')).toBeVisible();
    const requests = recordRequests(page);

    await submitDemo(page).click();
    await expect(page.locator('#demo-name')).toBeFocused();
    await expect(page.locator('#demo-name')).toHaveJSProperty('validity.valueMissing', true);
    await expect(page.locator('#demo-form-summary')).toBeHidden();

    await fillDemo(page);
    await submitDemo(page).click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/intern\/formular\/$/);
    await expect(page.locator('#demo-name')).toHaveValue('Erika Mustermann');
    await expect(page.locator('#demo-form-status')).toHaveText('');
    expect(requests.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  });
});

test.describe('live form against the test endpoint', () => {
  // The demo CSP blocks the endpoint origin (as it should); bypass it so page.route() can answer.
  test.use({ bypassCSP: true });

  /** Answer the endpoint without any network; returns the captured requests. */
  async function endpoint(page: Page, status = 200, body: object = { success: true }): Promise<Request[]> {
    const posts: Request[] = [];
    await page.route(ENDPOINT, async (route) => {
      posts.push(route.request());
      await route.fulfill({ status, json: body });
    });
    return posts;
  }

  async function fillLive(page: Page): Promise<void> {
    await page.locator('#live-name').fill('Erika Mustermann');
    await page.locator('#live-email').fill('erika@beispiel.de');
  }

  test('renders a POST form with the form-service fields', async ({ page }) => {
    await page.goto(PATH);
    const form = page.locator('#live-form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', ENDPOINT);
    await expect(form).toHaveAttribute('enctype', 'multipart/form-data');
    await expect(form.locator('input[name="_lang"]')).toHaveValue('de');
    await expect(form.locator('input[name="_subject"]')).toHaveValue('Testanfrage');
    await expect(form.locator('input[name="_next"]')).toHaveValue(/^https?:\/\/[^/]+\/.*intern\/formular\/danke\/$/);
    const cv = page.locator('#live-cv');
    await expect(cv).toHaveAttribute('type', 'file');
    await expect(cv).toHaveAttribute('accept', '.pdf,.doc,.docx,image/*');
    await expect(page.locator('#live-cv-hint')).toHaveText('PDF, Word oder Bild, höchstens 10 MB.');
    const hp = form.locator('[data-hp]');
    await expect(hp).toHaveAttribute('aria-hidden', 'true');
    await expect(hp.locator('input')).toHaveAttribute('tabindex', '-1');
    await expect(hp.locator('input')).toHaveAttribute('autocomplete', 'off');
  });

  test('a valid submit POSTs FormData as JSON request and opens the danke page', async ({ page }) => {
    const posts = await endpoint(page);
    await page.clock.install();
    await page.goto(PATH);
    await fillLive(page);
    await page.clock.fastForward(4000);
    await submitLive(page).click();

    await expect(page).toHaveURL(DANKE);
    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post?.method()).toBe('POST');
    expect(post?.headers()['accept']).toBe('application/json');
    const body = post?.postData() ?? '';
    for (const field of ['name', 'email', '_next', '_lang', '_subject']) expect(body).toContain(`name="${field}"`);
    expect(body).toContain('erika@beispiel.de');
    expect(body, 'the honeypot is not sent').not.toContain('name="homepage"');
  });

  test('a submit inside the time-trap gets a fake success and sends nothing', async ({ page }) => {
    const posts = await endpoint(page);
    await page.goto(PATH);
    await fillLive(page);
    await submitLive(page).click();
    await expect(page).toHaveURL(DANKE);
    expect(posts).toEqual([]);
  });

  test('a filled honeypot gets a fake success and sends nothing', async ({ page }) => {
    const posts = await endpoint(page);
    await page.clock.install();
    await page.goto(PATH);
    await fillLive(page);
    await page.locator('#live-form-hp').fill('https://spam.example', { force: true });
    await page.clock.fastForward(4000);
    await submitLive(page).click();
    await expect(page).toHaveURL(DANKE);
    expect(posts).toEqual([]);
  });

  test('a failed send shows the alert with the tel/mailto fallback', async ({ page }) => {
    const posts = await endpoint(page, 422, { success: false, error: 'invalid', error_msg: 'Invalid request' });
    await page.clock.install();
    await page.goto(PATH);
    await fillLive(page);
    await page.clock.fastForward(4000);
    await submitLive(page).click();

    const failed = page.locator('#live-form-failed');
    await expect(failed).toBeVisible();
    await expect(failed).toBeFocused();
    await expect(failed).toHaveAttribute('role', 'alert');
    await expect(failed.locator('a[href^="tel:+49"]')).toHaveCount(1);
    await expect(failed.locator('a[href^="mailto:"]')).toHaveCount(1);
    await expect(page).toHaveURL(/intern\/formular\/$/);
    await expect(submitLive(page)).toBeEnabled();
    expect(posts).toHaveLength(1);
  });

  test('a file over 10 MB is rejected before anything is sent', async ({ page }) => {
    const posts = await endpoint(page);
    await page.clock.install();
    await page.goto(PATH);
    await fillLive(page);
    const cv = page.locator('#live-cv');
    await cv.setInputFiles({
      name: 'lebenslauf.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    const tooLarge = 'Die Datei ist größer als 10 MB. Bitte wählen Sie eine kleinere Datei.';
    await expect(page.locator('#live-cv-error')).toHaveText(tooLarge);
    await expect(cv).toHaveAttribute('aria-invalid', 'true');
    await page.clock.fastForward(4000);
    await submitLive(page).click();
    await expect(page.locator('#live-form-summary').getByRole('link')).toHaveText([`Lebenslauf: ${tooLarge}`]);
    expect(posts).toEqual([]);

    await cv.setInputFiles({ name: 'lebenslauf.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
    await expect(cv).not.toHaveAttribute('aria-invalid');
    await submitLive(page).click();
    await expect(page).toHaveURL(DANKE);
    expect(posts).toHaveLength(1);
  });
});

test.describe('accessibility of the error states', () => {
  // The a11y sweep (a11y.a11y.spec.ts) only sees the initial page; these states appear after a submit.
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  test.use({ bypassCSP: true });

  test('axe is clean with the error summary, inline errors and the failure alert shown', async ({ page }) => {
    await page.route(ENDPOINT, (route) => route.fulfill({ status: 500, json: { success: false } }));
    await page.clock.install();
    await page.goto(PATH);
    await submitDemo(page).click();
    await expect(page.locator('#demo-form-summary')).toBeVisible();
    await page.locator('#live-name').fill('Erika Mustermann');
    await page.locator('#live-email').fill('erika@beispiel.de');
    await page.clock.fastForward(4000);
    await submitLive(page).click();
    await expect(page.locator('#live-form-failed')).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});

test.describe('static map', () => {
  test('shows the self-hosted image, the OSM attribution and the route link', async ({ page }) => {
    await page.goto(PATH);
    const map = page.locator('.static-map');
    const img = map.locator('img');
    await expect(img).toHaveAttribute('alt', /Andreas-Hofer-Str\. 33, 68259 Mannheim/);
    const src = await img.getAttribute('src');
    expect(src && !/^https?:/.test(src), 'the image is same-origin').toBe(true);
    await expect(map.getByRole('link', { name: '© OpenStreetMap-Mitwirkende' })).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    );
    await expect(map.getByRole('link', { name: 'Route planen' })).toHaveAttribute(
      'href',
      /^https:\/\/www\.openstreetmap\.org\/directions\?to=/,
    );
  });
});
