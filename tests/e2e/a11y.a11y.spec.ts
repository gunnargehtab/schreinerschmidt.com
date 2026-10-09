import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { sitePaths } from '../helpers/pages';

// Runs in the `a11y` project (chromium, reduced motion). Pages come from dist/**/index.html
// (meta-refresh pages skipped) plus the 404 page. Navigate relative to the base: goto('kontakt/').

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES = ['light', 'dark'] as const;
const NOT_FOUND = 'gibt-es-nicht/';

const pages = [...sitePaths().map((path) => ({ path, label: `/${path}` })), { path: NOT_FOUND, label: '404' }];

/** Emulate the colour scheme and pin the theme the way the toggle would (`ss-theme`, `data-theme`). */
async function openInTheme(page: Page, path: string, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('ss-theme', t);
    } catch {
      // Storage may be blocked; data-theme is set below anyway.
    }
  }, theme);
  await page.goto(path);
  await page.evaluate((t) => {
    document.documentElement.dataset['theme'] = t;
  }, theme);
  await page.evaluate(() => document.fonts.ready);
}

test('dist/ has pages to check', () => {
  expect(sitePaths().length, 'run "npm run build" first').toBeGreaterThan(0);
});

for (const theme of THEMES) {
  test.describe(`axe, ${theme} theme`, () => {
    for (const { path, label } of pages) {
      test(`${label} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await openInTheme(page, path, theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const summary = violations.map(
          (v) =>
            `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')}`).join('\n')}`,
        );
        expect(summary, summary.join('\n')).toEqual([]);
      });
    }
  });
}

test.describe('keyboard', () => {
  test('the first Tab lands on a skip link to #main that is visible and works', async ({ page }) => {
    await page.goto('');
    await expect(page.locator('a[href="#main"]')).toHaveCount(1);

    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('href', '#main');
    await expect(focused).toBeVisible();
    const box = await focused.boundingBox();
    expect(box && box.width >= 24 && box.height >= 24, 'target at least 24 x 24 px').toBe(true);
    const viewport = page.viewportSize();
    expect(box && viewport && box.y >= 0 && box.y + box.height <= viewport.height, 'inside the viewport').toBe(true);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    const insideMain = await page.evaluate(() => {
      const main = document.getElementById('main');
      return (
        !!main &&
        (document.activeElement === main || main.contains(document.activeElement) || location.hash === '#main')
      );
    });
    expect(insideMain).toBe(true);
  });

  for (const { path, label } of pages) {
    test(`${label}: the first focusable element shows a visible focus indicator`, async ({ page }) => {
      await page.goto(path);
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const style = getComputedStyle(el);
        const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
        return {
          tag: el.tagName.toLowerCase(),
          focusVisible: el.matches(':focus-visible'),
          outline: style.outlineStyle !== 'none' && (outlineWidth > 0 || style.outlineStyle === 'auto'),
          shadow: style.boxShadow !== 'none',
        };
      });
      expect(info, 'Tab moves focus off <body>').not.toBeNull();
      expect(info?.focusVisible, `${info?.tag} matches :focus-visible`).toBe(true);
      expect(info?.outline || info?.shadow, `${info?.tag} has an outline or box-shadow when focused`).toBe(true);
    });
  }
});
