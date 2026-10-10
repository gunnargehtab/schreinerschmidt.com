import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The no-JS long form under axe with WCAG 2.2 AA, both colour schemes (docs/configurator.md §2, §7
// "a11y"). axe-core needs script execution, which the `no-js` project disables, so this spec runs in
// the `a11y` project and blocks the wizard's own script instead: the page then shows exactly the
// no-JS DOM (one long form, branches and conditions revealed by the generated :has() rules, step nav,
// progress and sidebar hidden). The JS wizard is covered by konfigurator.a11y.spec.ts.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES = ['light', 'dark'] as const;

const radio = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`);

/** States of the form to check: no choice, a path variant (branch + Beispielskizze), conditions revealed. */
const STATES: { label: string; path: string; setup?(page: Page): Promise<void> }[] = [
  { label: 'konfigurator/ (keine Projektart)', path: 'konfigurator/' },
  {
    label: 'konfigurator/moebel/ (Möbel-Zweig mit Beispielskizze, Regal gewählt)',
    path: 'konfigurator/moebel/',
    setup: async (page) => {
      await radio(page, 'moebel_art', 'regal').check();
      await expect(page.locator('[data-field="moebel_breite"]')).toBeVisible();
    },
  },
  {
    label: 'konfigurator/ mit Boden und „neu“ (Bedingungen sichtbar)',
    path: 'konfigurator/',
    setup: async (page) => {
      await radio(page, 'typ', 'boden').check();
      await radio(page, 'boden_leistung', 'neu').check();
      await expect(page.locator('fieldset[data-field="boden_art"]')).toBeVisible();
    },
  },
];

async function openWithoutWizardScript(page: Page, path: string, theme: (typeof THEMES)[number]): Promise<void> {
  // The wizard entry is the page's only external module (Wizard.astro); the site's inline scripts stay.
  await page.route('**/_astro/Wizard.astro*.js', (route) => route.abort());
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('ss-theme', t);
    } catch {
      // data-theme is set below anyway.
    }
  }, theme);
  await page.goto(path);
  await page.evaluate((t) => {
    document.documentElement.dataset['theme'] = t;
  }, theme);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-configurator]')).not.toHaveAttribute('data-enhanced');
  await expect(page.locator('nav.progress')).toBeHidden();
  await expect(page.locator('[data-step-nav]')).toBeHidden();
}

for (const theme of THEMES) {
  test.describe(`axe on the no-JS form, ${theme} theme`, () => {
    for (const s of STATES) {
      test(`${s.label} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await openWithoutWizardScript(page, s.path, theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await s.setup?.(page);
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
