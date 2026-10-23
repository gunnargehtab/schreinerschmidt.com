import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Request, type Route } from '@playwright/test';
import { parse as parseYaml } from 'yaml';

// The forms against the assistant backend (decision D3, docs/assistant.md §0; docs/angebot.md §9),
// with JS. Runs only on the assistant build (`npm run test:assistant`, env/assistant.env); skipped
// against the demo build. The endpoint is a reserved .invalid name: page.route() answers it like the
// backend does (assistant/src/anfrage.ts), so nothing leaves the browser. The CSP is NOT bypassed:
// connect-src must allow the assistant origin for the route to see the request at all.

const RAW = process.env['PUBLIC_ASSISTANT_ENDPOINT'];
const LIVE = !!RAW && process.env['PUBLIC_DEMO'] === 'false';
const ORIGIN = LIVE ? new URL(RAW).origin : 'https://assistant.invalid';
const ENDPOINT = `${ORIGIN}/anfrage`;

test.skip(!LIVE, 'needs the assistant build (npm run test:assistant)');

interface Copy {
  success: { timelineLive: { items: { title: string }[] } };
}
const copy = parseYaml(readFileSync('src/content/pages/konfigurator.yaml', 'utf8')) as Copy;

/** Answers /anfrage like the backend: JSON with CORS for the site origin. Returns the captured posts. */
async function backend(page: Page, status = 200, body: object = { success: true }): Promise<Request[]> {
  const posts: Request[] = [];
  const site = new URL(test.info().project.use.baseURL ?? '').origin;
  await page.route(ENDPOINT, async (route: Route) => {
    posts.push(route.request());
    await route.fulfill({
      status,
      json: body,
      headers: { 'Access-Control-Allow-Origin': site, Vary: 'Origin', 'Cache-Control': 'no-store' },
    });
  });
  return posts;
}

/** The request is what the backend accepts: a multipart POST from the site, JSON wanted, no cookie. */
async function expectBackendRequest(post: Request | undefined, site: string): Promise<void> {
  expect(post?.method()).toBe('POST');
  const headers = (await post?.allHeaders()) ?? {};
  expect(headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  expect(headers['accept']).toBe('application/json');
  expect(headers['origin']).toBe(site);
  // fetch() keeps the default credentials mode: the cookie of the backend origin is never sent.
  expect(headers['cookie']).toBeUndefined();
}

test.beforeEach(async ({ context, baseURL }) => {
  // A cross-site cookie on the backend origin: a `credentials: 'include'` fetch would send it.
  await context.addCookies([{ name: 'probe', value: '1', url: ORIGIN, sameSite: 'None', secure: true }]);
  // No 3D auto-load (as in konfigurator-flow.spec.ts).
  await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
  expect(baseURL).toBeTruthy();
});

test('kontakt: the JS path posts multipart to the assistant and opens the danke page', async ({ page, baseURL }) => {
  const site = new URL(baseURL ?? '').origin;
  const posts = await backend(page);
  await page.clock.install();
  await page.goto('kontakt/');
  const form = page.locator('#kontakt-form');
  await expect(form).toHaveAttribute('action', ENDPOINT);
  await expect(form).toHaveAttribute('enctype', 'multipart/form-data');
  await page.locator('#kontakt-name').fill('Erika Mustermann');
  await page.locator('#kontakt-email').fill('erika@beispiel.de');
  await page.locator('#kontakt-nachricht').fill('Ich hätte gern einen Termin.');
  await page.clock.fastForward(4000);
  await form.getByRole('button', { name: /senden/i }).click();

  await expect(page).toHaveURL(/kontakt\/danke\/$/);
  expect(posts).toHaveLength(1);
  await expectBackendRequest(posts[0], site);
  const body = posts[0]?.postData() ?? '';
  for (const name of ['name', 'email', 'nachricht', '_next', '_lang', '_subject']) {
    expect(body).toContain(`name="${name}"`);
  }
  expect(body, 'the honeypot is not sent').not.toContain('name="homepage"');
});

/** Fills the shortest Tür enquiry and stands on the Prüfen step. */
async function fillWizard(page: Page): Promise<void> {
  await page.goto('konfigurator/?typ=tuer&tuer_art=haustuer&schritt=details');
  await expect(page.locator('[data-configurator]')).toHaveAttribute('data-enhanced', '');
  await page.locator('nav.progress [data-goto="pruefen"]').click();
  await page.locator('#f-plz').fill('68161');
  await page.locator('nav.progress [data-goto="pruefen"]').click();
  await page.locator('#f-name').fill('Max Mustermann');
  await page.locator('#f-email').fill('max@example.com');
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('#anfrage .step:not([hidden])')).toHaveAttribute('data-step', 'pruefen');
}

test('konfigurator: a successful send shows the live timeline „Was passiert jetzt?“', async ({ page, baseURL }) => {
  const site = new URL(baseURL ?? '').origin;
  const posts = await backend(page);
  await page.clock.install();
  await fillWizard(page);
  await page.clock.fastForward(6000);
  await page.locator('[data-action="submit"]').click();

  const success = page.locator('[data-success]');
  await expect(success).toBeVisible();
  await expect(success.locator('.timeline__item strong')).toHaveText(
    copy.success.timelineLive.items.map((i) => i.title),
  );
  await expect(success.locator('[data-anfrage-id]')).toHaveText(/^[0-9A-Z]{4}$/);
  expect(posts).toHaveLength(1);
  await expectBackendRequest(posts[0], site);
  const body = posts[0]?.postDataBuffer()?.toString('utf8') ?? '';
  expect(body).toContain('name="anfrage_json"');
  expect(body).toContain('ss-anfrage@1');
  expect(body).toContain('name="typ"');
});

test('konfigurator: {success:false, error:"network"} shows the error panel after one retry', async ({ page }) => {
  const posts = await backend(page, 502, {
    success: false,
    error: 'network',
    error_msg: 'The message could not be delivered.',
  });
  await page.clock.install();
  await fillWizard(page);
  await page.clock.fastForward(6000);
  await page.locator('[data-action="submit"]').click();

  const panel = page.locator('[data-submit-error]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-reason="network"]')).toBeVisible();
  await expect(panel.locator('[data-reason="rejected"]')).toBeHidden();
  await expect(panel).not.toContainText('could not be delivered');
  await expect(page.locator('[data-success]')).toBeHidden();
  expect(posts).toHaveLength(2);
});

test('konfigurator: a 422 is rejected without a retry', async ({ page }) => {
  const posts = await backend(page, 422, { success: false, error: 'rejected', error_msg: 'A field is too long.' });
  await page.clock.install();
  await fillWizard(page);
  await page.clock.fastForward(6000);
  await page.locator('[data-action="submit"]').click();

  const panel = page.locator('[data-submit-error]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-reason="rejected"]')).toBeVisible();
  await expect(panel.locator('[data-reason="network"]')).toBeHidden();
  expect(posts).toHaveLength(1);
});
