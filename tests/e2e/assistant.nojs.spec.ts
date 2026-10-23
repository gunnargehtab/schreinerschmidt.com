import { expect, test, type Page, type Request } from '@playwright/test';

// The no-JS posts against the assistant backend (decision D3, docs/assistant.md §0; docs/angebot.md
// §9). Runs in the `no-js` project on the assistant build only (`npm run test:assistant`); skipped
// against the demo build. The backend accepts multipart only (415 otherwise) and answers a post
// without `Accept: application/json` with a 303 to `_next`; page.route() plays that part, so
// nothing leaves the browser.

const RAW = process.env['PUBLIC_ASSISTANT_ENDPOINT'];
const LIVE = !!RAW && process.env['PUBLIC_DEMO'] === 'false';
const ENDPOINT = `${LIVE ? new URL(RAW).origin : 'https://assistant.invalid'}/anfrage`;

test.skip(!LIVE, 'needs the assistant build (npm run test:assistant)');

/** Answers the native form post like the backend: 303 to the posted `_next`. */
async function backend(page: Page): Promise<Request[]> {
  const posts: Request[] = [];
  await page.route(ENDPOINT, async (route) => {
    const request = route.request();
    posts.push(request);
    const body = request.postDataBuffer()?.toString('utf8') ?? '';
    const next = /name="_next"\r\n\r\n([^\r\n]*)/.exec(body)?.[1] ?? '';
    await route.fulfill({ status: 303, headers: { Location: next } });
  });
  return posts;
}

function expectMultipart(post: Request | undefined): string {
  expect(post?.method()).toBe('POST');
  expect(post?.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  expect(post?.headers()['accept'] ?? '').not.toContain('application/json');
  return post?.postDataBuffer()?.toString('utf8') ?? '';
}

test('kontakt without JS: a multipart post (no file input) ends on the danke page', async ({ page }) => {
  const posts = await backend(page);
  await page.goto('kontakt/');
  await page.locator('#kontakt-name').fill('Erika Mustermann');
  await page.locator('#kontakt-email').fill('erika@beispiel.de');
  await page.locator('#kontakt-nachricht').fill('Ich hätte gern einen Termin.');
  await page
    .locator('#kontakt-form')
    .getByRole('button', { name: /senden/i })
    .click();

  await expect(page).toHaveURL(/kontakt\/danke\/$/);
  expect(posts).toHaveLength(1);
  const body = expectMultipart(posts[0]);
  for (const name of ['name', 'email', 'nachricht', 'homepage', '_next', '_lang', '_subject']) {
    expect(body).toContain(`name="${name}"`);
  }
});

test('konfigurator without JS: the wizard posts multipart and the danke page lists the live steps', async ({
  page,
}) => {
  const posts = await backend(page);
  await page.goto('konfigurator/');
  await page.locator('#anfrage input[name="typ"][value="sonstiges"]').check();
  await page.locator('#f-sonstiges_beschreibung').fill('Ein Gartenhaus aus Lärche.');
  await page.locator('#f-plz').fill('68161');
  await page.locator('#f-name').fill('Max Mustermann');
  await page.locator('#f-email').fill('max@example.com');
  await page.locator('#anfrage [data-action="submit"]').click();

  await expect(page).toHaveURL(/konfigurator\/danke\/$/);
  expect(posts).toHaveLength(1);
  const body = expectMultipart(posts[0]);
  expect(body).toContain('name="typ"\r\n\r\nsonstiges');
  await expect(page.locator('[data-timeline="live"]')).toBeVisible();
  await expect(page.locator('[data-timeline="live"] li')).toHaveCount(6);
});
