import { expect, test, type Page } from '@playwright/test';

// Every branch of the quote wizard (docs/configurator.md §1) reaches the demo success view: the
// JS-required must-haves block "Weiter" with a German message until they are filled. The live-mode
// payload is covered by tests/unit/configurator/payload.test.ts (the e2e server is the demo build).

const PATH = 'konfigurator/';

interface Branch {
  typ: string;
  /** Visible label of the project type (step 1 card). */
  label: string;
  /** The error links shown when "Weiter" is pressed on step 2 without the must-haves. */
  error: string[];
  /** Fills the must-haves of step 2. */
  details(page: Page): Promise<void>;
  /** Fills the must-haves of step 3, if any. */
  ausfuehrung?(page: Page): Promise<void>;
  /** A line of the success summary. */
  summary: string;
}

const check = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`).check();

const BRANCHES: Branch[] = [
  {
    typ: 'moebel',
    label: 'Möbel nach Maß',
    error: ['Welches Möbel?: Bitte wählen Sie eine Option bei „Welches Möbel“.'],
    details: async (page) => {
      await check(page, 'moebel_art', 'bett');
      await check(page, 'bett_liegeflaeche', '140x200');
    },
    summary: 'Liegefläche: 140 × 200 cm',
  },
  {
    typ: 'boden',
    label: 'Boden',
    error: [
      'Was ist geplant?: Bitte wählen Sie eine Option bei „Was ist geplant“.',
      'Fläche ca. in m²: Bitte geben Sie „Fläche ca. in m²“ an.',
    ],
    details: async (page) => {
      await check(page, 'boden_leistung', 'aufarbeiten');
      await page.locator('#f-boden_flaeche').fill('42,5');
    },
    summary: 'Fläche ca. in m²: 42,5 m²',
  },
  {
    typ: 'treppe',
    label: 'Treppe',
    error: ['Was ist geplant?: Bitte wählen Sie eine Option bei „Was ist geplant“.'],
    details: (page) => check(page, 'treppe_leistung', 'renovieren'),
    summary: 'Was ist geplant: Treppe renovieren',
  },
  {
    typ: 'fenster',
    label: 'Fenster',
    error: ['Was ist geplant?: Bitte wählen Sie mindestens eine Option bei „Was ist geplant“.'],
    details: async (page) => {
      await check(page, 'fenster_leistung', 'neu');
      await check(page, 'fenster_leistung', 'rolllaeden');
    },
    summary: 'Was ist geplant: Neue Holzfenster, Rollläden',
  },
  {
    typ: 'tuer',
    label: 'Türen',
    error: ['Welche Tür?: Bitte wählen Sie eine Option bei „Welche Tür“.'],
    details: (page) => check(page, 'tuer_art', 'innentuer'),
    summary: 'Welche Tür: Innentür',
  },
  {
    typ: 'terrasse',
    label: 'Terrasse & Zaun',
    error: ['Was ist geplant?: Bitte wählen Sie eine Option bei „Was ist geplant“.'],
    details: async (page) => {
      await check(page, 'terrasse_was', 'zaun');
      await page.locator('#f-zaun_hoehe').fill('180');
    },
    summary: 'Zaunhöhe in cm: 180 cm',
  },
  {
    typ: 'altbau',
    label: 'Altbausanierung',
    error: ['Welche Bereiche?: Bitte wählen Sie mindestens eine Option bei „Welche Bereiche“.'],
    details: (page) => check(page, 'altbau_bereiche', 'dielen'),
    ausfuehrung: (page) => page.locator('#f-altbau_beschreibung').fill('Dielen im Flur aufarbeiten.'),
    summary: 'Welche Bereiche: Dielen',
  },
  {
    typ: 'sonstiges',
    label: 'Etwas anderes',
    error: ['Beschreiben Sie Ihr Vorhaben: Bitte geben Sie „Beschreiben Sie Ihr Vorhaben“ an.'],
    details: (page) => page.locator('#f-sonstiges_beschreibung').fill('Ein Gartenhaus aus Lärche.'),
    summary: 'Beschreiben Sie Ihr Vorhaben: Ein Gartenhaus aus Lärche.',
  },
];

const next = (page: Page) => page.locator('[data-action="next"]');
const summaryBox = (page: Page) => page.locator('[data-error-summary]');
const current = (page: Page) => page.locator('#anfrage .step:not([hidden])');

for (const b of BRANCHES) {
  test(`${b.typ}: must-haves block, then the branch reaches the success view`, async ({ page }) => {
    await page.goto(PATH);
    await check(page, 'typ', b.typ);
    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'details');
    await expect(page.locator(`fieldset.branch[data-branch="${b.typ}"]`).first()).toBeVisible();
    // Only this branch's fields take part: the other branches' fieldsets are disabled.
    const foreign = page.locator(`fieldset.branch:not([data-branch="${b.typ}"])`).first();
    await expect(foreign).toHaveAttribute('disabled', '');
    await expect(foreign.locator('input').first()).toBeDisabled();

    await next(page).click();
    await expect(summaryBox(page)).toBeFocused();
    await expect(summaryBox(page).getByRole('link')).toHaveText(b.error);
    await expect(current(page)).toHaveAttribute('data-step', 'details');

    await b.details(page);
    await expect(summaryBox(page)).toBeHidden();
    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'ausfuehrung');
    if (b.ausfuehrung) {
      await next(page).click();
      await expect(summaryBox(page)).toBeFocused();
      await expect(current(page)).toHaveAttribute('data-step', 'ausfuehrung');
      await b.ausfuehrung(page);
    }
    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'rahmen');
    await page.locator('#f-plz').fill('69117');
    await expect(page.locator('#einzugsgebiet')).toHaveText('Rhein-Neckar – Anfahrt nach Absprache.');
    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'kontakt');
    await page.locator('#f-name').fill('Max Mustermann');
    await page.locator('#f-email').fill('max@example.com');
    await next(page).click();
    await expect(current(page)).toHaveAttribute('data-step', 'pruefen');
    // The review <dl> holds label and value in dt/dd (+ „Ändern“); the success text joins them as "label: value".
    const [label, value] = b.summary.split(': ') as [string, string];
    const row = page.locator('[data-review-list] dt').filter({ hasText: new RegExp(`^${label}$`) });
    await expect(row).toHaveCount(1);
    await expect(row.locator('+ dd')).toContainText(value);

    await page.locator('[data-action="submit"]').click();
    const success = page.locator('[data-success]');
    await expect(success).toBeVisible();
    await expect(success).toBeFocused();
    await expect(success.locator('[data-success-summary]')).toContainText(`Projektart: ${b.label}`);
    await expect(success.locator('[data-success-summary]')).toContainText(b.summary);
    const href = (await success.locator('[data-action="mail"]').getAttribute('data-href')) ?? '';
    expect(href.length).toBeLessThanOrEqual(1800);
    expect(decodeURIComponent(href)).toContain(`Anfrage ${b.label}`);
    // No drawing: Bett has no generator, the other branches have no preview at all.
    await expect(success.locator('[data-success-drawing] svg')).toHaveCount(0);
  });
}

test('the SUBMIT action jumps to the first invalid step', async ({ page }) => {
  await page.goto(`${PATH}?typ=tuer&tuer_art=haustuer&schritt=details`);
  await expect(current(page)).toHaveAttribute('data-step', 'details');
  // Jump ahead through the progress line is clamped at the first invalid step (rahmen: PLZ).
  await page.locator('nav.progress [data-goto="pruefen"]').click();
  await expect(current(page)).toHaveAttribute('data-step', 'rahmen');
  await expect(summaryBox(page)).toBeFocused();
  await page.locator('#f-plz').fill('10115');
  await expect(page.locator('#einzugsgebiet')).toHaveText(
    'Außerhalb unseres üblichen Gebiets – fragen Sie gern trotzdem.',
  );
  await page.locator('nav.progress [data-goto="pruefen"]').click();
  await expect(current(page)).toHaveAttribute('data-step', 'kontakt');
  await page.locator('#f-name').fill('Max Mustermann');
  await page.locator('#f-email').fill('nicht-gueltig');
  await next(page).click();
  await expect(summaryBox(page).getByRole('link')).toHaveText([
    'E-Mail: Bitte geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de.',
  ]);
  await page.locator('#f-email').fill('max@example.com');
  await next(page).click();
  await expect(current(page)).toHaveAttribute('data-step', 'pruefen');
  // Break an earlier step through „Ändern“, then submit: the wizard returns to it.
  await page.locator('[data-review-list]').getByRole('button', { name: 'Ändern: Name' }).click();
  await page.locator('#f-name').fill('');
  await page.locator('nav.progress [data-goto="pruefen"]').click();
  await expect(current(page)).toHaveAttribute('data-step', 'kontakt');
  await expect(summaryBox(page).getByRole('link')).toHaveText(['Name: Bitte geben Sie „Name“ an.']);
});
