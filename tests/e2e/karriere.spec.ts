import { expect, test, type Page, type Request } from '@playwright/test';

// Karriere overview, job pages and the application form (docs/design-system.md §8, architecture §7/§8).
// Navigate relative to the base: goto('karriere/'). Demo-only checks are skipped in production builds.

const demo = process.env['PUBLIC_DEMO'] !== 'false';
const JOB_PAGES = ['karriere/bauschreiner/', 'karriere/parkettleger/'];

const jsonLdTypes = async (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => {
      const doc = JSON.parse(s.textContent ?? '{}') as { '@type'?: string; '@graph'?: { '@type': string }[] };
      return doc['@graph'] ? doc['@graph'].map((n) => n['@type']) : doc['@type'] ? [doc['@type']] : [];
    }),
  );

function recordRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));
  return requests;
}

test.describe('Karriere overview', () => {
  test('has one h1, the #bewerbung anchor, benefits and active jobs as details name=jobs', async ({ page }) => {
    await page.goto('karriere/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Arbeiten bei der Schreinerei Schmidt');
    await expect(page.locator('section#bewerbung')).toHaveCount(1);
    await expect(page.locator('.benefits li')).toHaveCount(4);
    const cards = page.locator('details.job-card[name="jobs"]');
    await expect(cards).toHaveCount(2);
    await cards.nth(0).locator('summary').click();
    await expect(cards.nth(0)).toHaveJSProperty('open', true);
    await cards.nth(1).locator('summary').click();
    await expect(cards.nth(1)).toHaveJSProperty('open', true);
    await expect(cards.nth(0)).toHaveJSProperty('open', false);
  });

  test('links each job to its own page and carries no JobPosting JSON-LD', async ({ page }) => {
    await page.goto('karriere/');
    for (const path of JOB_PAGES) {
      await expect(page.locator(`main a[href$="/${path}"]`)).toHaveCount(1);
    }
    expect(await jsonLdTypes(page)).not.toContain('JobPosting');
  });

  test('the legacy anchor scrolls to the form', async ({ page }) => {
    await page.goto('karriere/#bewerbung');
    await expect(page.locator('#bewerbung-title')).toBeInViewport();
  });

  test('FAQ answers open natively', async ({ page }) => {
    await page.goto('karriere/');
    const first = page.locator('.faq details').first();
    await first.locator('summary').click();
    await expect(first).toHaveJSProperty('open', true);
  });
});

test.describe('job pages', () => {
  for (const path of JOB_PAGES) {
    test(`${path} has an h1, a CTA to the form and exactly one JobPosting`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toContainText('(m/w/d)');
      await expect(page.locator('main a.btn--primary')).toHaveAttribute('href', /\/karriere\/#bewerbung$/);
      const types = await jsonLdTypes(page);
      expect(types).toContain('BreadcrumbList');
      // Production emits a JobPosting only once the owner confirmed the address (see the page header).
      expect(types.filter((t) => t === 'JobPosting')).toHaveLength(demo ? 1 : types.includes('JobPosting') ? 1 : 0);
    });

    test(`${path} never puts the unconfirmed salary into the JSON-LD`, async ({ page }) => {
      await page.goto(path);
      const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(ld.join('')).not.toContain('baseSalary');
    });
  }

  test('inactive or unknown slugs do not exist', async ({ page }) => {
    const response = await page.goto('karriere/gibt-es-nicht/');
    expect(response?.status()).toBe(404);
  });
});

test.describe('application form', () => {
  test.skip(!demo, 'the live form posts to the form service');

  test('is a demo form with the notice, the position select and no upload', async ({ page }) => {
    await page.goto('karriere/');
    const form = page.locator('#bewerbung-form');
    await expect(form).toHaveAttribute('method', 'dialog');
    await expect(form.locator('.form__notice')).toHaveText('Demo: Es werden keine Daten übertragen.');
    await expect(form.locator('input[type="file"]')).toHaveCount(0);
    await expect(form.locator('#bewerbung-stelle option')).toHaveText([
      'Bitte wählen',
      'Schreiner:in',
      'Parkettleger:in',
      'Initiativbewerbung',
    ]);
    await expect(form.locator('.form__privacy a')).toHaveAttribute('href', /\/datenschutz\/$/);
  });

  test('empty submit shows the focused error summary', async ({ page }) => {
    await page.goto('karriere/');
    await page.locator('#bewerbung-form').getByRole('button', { name: 'Bewerbung senden' }).click();
    const summary = page.locator('#bewerbung-form-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).toHaveCount(3);
  });

  test('a valid submit shows the demo success and sends nothing @cross-engine', async ({ page }) => {
    await page.clock.install();
    await page.goto('karriere/');
    await page.waitForLoadState('networkidle');
    const requests = recordRequests(page);
    await page.locator('#bewerbung-name').fill('Erika Mustermann');
    await page.locator('#bewerbung-email').fill('erika@beispiel.de');
    await page.locator('#bewerbung-stelle').selectOption('initiativ');
    await page.clock.fastForward(4000);
    await page.locator('#bewerbung-form').getByRole('button', { name: 'Bewerbung senden' }).click();
    await expect(page.locator('#bewerbung-form-status')).toContainText('Demo – nichts übertragen');
    await page.waitForTimeout(300);
    expect(requests.map((r) => `${r.method()} ${r.url()}`)).toEqual([]);
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the form is method=dialog and the page is complete', async ({ page }) => {
      await page.goto('karriere/');
      await expect(page.locator('#bewerbung-form')).toHaveAttribute('method', 'dialog');
      await expect(page.locator('details.job-card')).toHaveCount(2);
    });
  });
});

test.describe('danke page', () => {
  test('is noindexed, has one h1 and links onward', async ({ page }) => {
    await page.goto('karriere/danke/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('h1')).toHaveText('Danke für Deine Bewerbung');
    await expect(page.locator('main a.btn')).toHaveCount(3);
  });
});

test.describe('layout', () => {
  for (const path of ['karriere/', ...JOB_PAGES, 'karriere/danke/']) {
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
