import { expect, test, type Page } from '@playwright/test';

// The base path contains a dot, so every navigation is relative to baseURL: goto(''), goto('kontakt/').
// Never use a leading slash, it would drop the base.

const STUB_PAGES = ['', 'leistungen/boeden/', 'kontakt/'];
const demo = process.env['PUBLIC_DEMO'] !== 'false';

interface CspWindow {
  __cspViolations?: string[];
}

/** Record `securitypolicyviolation` events from the first document script onwards. */
async function trackCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as CspWindow;
    w.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__cspViolations?.push(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'}`);
    });
  });
}

const cspViolations = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as CspWindow).__cspViolations ?? []);

test.describe('home', () => {
  test('returns 200 and is noindexed in demo mode', async ({ page }) => {
    const response = await page.goto('');
    expect(response?.status()).toBe(200);
    const robots = page.locator('meta[name="robots"]');
    if (demo) await expect(robots).toHaveAttribute('content', /noindex/);
    else await expect(robots).toHaveCount(0);
  });

  test('LCP image is visible', async ({ page }) => {
    await page.goto('');
    const lcp = page.locator('picture img').first();
    await expect(lcp).toBeVisible();
    await expect(lcp).toHaveCSS('opacity', '1');
    expect(await lcp.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  });
});

test.describe('CSP, third parties, storage', () => {
  for (const path of STUB_PAGES) {
    test(`no CSP violations on /${path} @cross-engine`, async ({ page }) => {
      await trackCspViolations(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await page.waitForLoadState('load');
      expect(await cspViolations(page)).toEqual([]);
    });
  }

  test('no CSP violations on the 404 page @cross-engine', async ({ page }) => {
    await trackCspViolations(page);
    await page.goto('gibt-es-nicht/');
    await page.waitForLoadState('load');
    expect(await cspViolations(page)).toEqual([]);
  });

  test('every request is same-origin, data: or blob:', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    for (const path of STUB_PAGES) await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(requests.length).toBeGreaterThan(0);
    const foreign = requests.filter((u) => !u.startsWith(`${origin}/`) && !/^(?:data|blob):/.test(u));
    expect(foreign).toEqual([]);
  });

  test('sets no cookies and stores nothing until the user acts', async ({ page, context }) => {
    for (const path of STUB_PAGES) {
      await page.goto(path);
      await page.waitForLoadState('load');
      expect(await context.cookies()).toEqual([]);
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
    }
  });
});

test.describe('fonts', () => {
  test('only base-prefixed woff2 files are requested @cross-engine', async ({ page, baseURL }) => {
    const base = new URL(baseURL ?? 'http://localhost:4173/').pathname;
    const fonts: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.resourceType() === 'font' || /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)) {
        fonts.push(url.pathname);
      }
    });
    await page.goto('');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    expect(fonts.length).toBeGreaterThan(0);
    for (const pathname of fonts) {
      expect(pathname, `${pathname} is woff2`).toMatch(/\.woff2$/);
      expect(pathname.startsWith(base), `${pathname} is under ${base}`).toBe(true);
    }

    // One preloaded latin file per family (Red Hat Display, Fraunces); nothing else is fetched.
    const preloaded = await page
      .locator('link[rel=preload][as=font]')
      .evaluateAll((links) => links.map((link) => new URL((link as HTMLLinkElement).href).pathname));
    expect(preloaded).toHaveLength(2);
    expect([...new Set(fonts)].sort()).toEqual([...preloaded].sort());
  });
});

test.describe('redirects and 404', () => {
  test('leistungen/boden/ ends at leistungen/boeden/', async ({ page, baseURL }) => {
    await page.goto('leistungen/boden/');
    await page.waitForURL(/leistungen\/boeden\/$/);
    expect(page.url()).toBe(new URL('leistungen/boeden/', baseURL).href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('unknown paths return 404 with the styled page', async ({ page }) => {
    const response = await page.goto('gibt-es-nicht/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hier fehlt ein Brett.');
  });

  test('deep unknown paths return 404 too', async ({ page }) => {
    const response = await page.goto('leistungen/gibt/es/nicht/');
    expect(response?.status()).toBe(404);
  });
});
