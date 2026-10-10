import { expect, test, type Page } from '@playwright/test';

// Runs in the `no-js` project (javaScriptEnabled: false): the wizard is one long native form whose
// branches and conditions are shown by the generated :has() rules (docs/configurator.md §2).
// The e2e server serves the demo build, so the form is method="dialog".

const PATH = 'konfigurator/';
const branch = (page: Page, typ: string) => page.locator(`#anfrage fieldset.branch[data-branch="${typ}"]`);
const radio = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`);

test('without a choice, no branch is visible and the generic titles show', async ({ page }) => {
  await page.goto(PATH);
  for (const typ of ['moebel', 'boden', 'treppe', 'fenster', 'tuer', 'terrasse', 'altbau', 'sonstiges']) {
    await expect(branch(page, typ).first()).toBeHidden();
  }
  await expect(page.locator('#h-details')).toContainText('Schritt 2: Ihr Vorhaben', { useInnerText: true });
  await expect(page.locator('#h-ausfuehrung')).toContainText('Schritt 3: Bestand & Fotos', { useInnerText: true });
  await expect(page.locator('#h-projekt')).toContainText('Schritt 1: Projekt', { useInnerText: true });
});

test('choosing a project type reveals its branch and hides the others', async ({ page }) => {
  await page.goto(PATH);
  await radio(page, 'typ', 'boden').check();
  await expect(branch(page, 'boden').first()).toBeVisible();
  await expect(page.locator('#f-boden_leistung-neu')).toBeVisible();
  await expect(branch(page, 'treppe').first()).toBeHidden();
  await expect(branch(page, 'moebel').first()).toBeHidden();
  await expect(page.locator('#h-details')).toContainText('Ihr Vorhaben', { useInnerText: true });

  await radio(page, 'typ', 'moebel').check();
  await expect(branch(page, 'boden').first()).toBeHidden();
  await expect(branch(page, 'moebel').first()).toBeVisible();
  await expect(page.locator('#h-details')).toContainText('Möbel & Maße', { useInnerText: true });
  await expect(page.locator('#h-ausfuehrung')).toContainText('Holz & Oberfläche', { useInnerText: true });
});

test('conditions inside a branch follow the chosen option', async ({ page }) => {
  await page.goto(PATH);
  await radio(page, 'typ', 'boden').check();
  const art = page.locator('fieldset[data-field="boden_art"]');
  await expect(art).toBeHidden();
  await radio(page, 'boden_leistung', 'neu').check();
  await expect(art).toBeVisible();
  await radio(page, 'boden_leistung', 'aufarbeiten').check();
  await expect(art).toBeHidden();
  await expect(page.locator('fieldset[data-field="boden_zustand"]')).toBeVisible();

  await radio(page, 'typ', 'moebel').check();
  await expect(page.locator('[data-field="moebel_breite"]')).toBeHidden();
  await radio(page, 'moebel_art', 'regal').check();
  await expect(page.locator('[data-field="moebel_breite"]')).toBeVisible();
  await expect(page.locator('[data-field="tisch_laenge"]')).toBeHidden();
  await radio(page, 'moebel_art', 'esstisch').check();
  await expect(page.locator('[data-field="tisch_laenge"]')).toBeVisible();
  await expect(page.locator('[data-field="moebel_breite"]')).toBeHidden();
});

test('option-level conditions hide the options a furniture type does not offer', async ({ page }) => {
  await page.goto(PATH);
  await radio(page, 'typ', 'moebel').check();
  await radio(page, 'moebel_art', 'sideboard').check();
  await expect(page.locator('label[data-when="moebel-sideboard"]', { hasText: 'Schubkästen' })).toBeVisible();
  await radio(page, 'moebel_art', 'regal').check();
  await expect(page.locator('label[data-when="moebel-sideboard"]', { hasText: 'Schubkästen' })).toBeHidden();
});

test('hidden branch fields never block the submission', async ({ page }) => {
  await page.goto(PATH);
  const form = page.locator('#anfrage');
  // Only typ, plz, name and email are required in the HTML.
  expect(await form.evaluate((f: HTMLFormElement) => f.checkValidity())).toBe(false);
  await radio(page, 'typ', 'terrasse').check();
  await page.locator('#f-plz').fill('68259');
  await page.locator('#f-name').fill('Erika Mustermann');
  await page.locator('#f-email').fill('erika@example.com');
  expect(await form.evaluate((f: HTMLFormElement) => f.checkValidity())).toBe(true);
  // The JS-required branch fields are not enforced without JS (data-required, not required).
  expect(
    await page
      .locator('[data-required]')
      .first()
      .evaluate((el: HTMLInputElement) => el.required),
  ).toBe(false);
  // An invalid PLZ does block.
  await page.locator('#f-plz').fill('123');
  expect(await form.evaluate((f: HTMLFormElement) => f.checkValidity())).toBe(false);
});

test('the demo form uses method="dialog" and says so', async ({ page }) => {
  await page.goto(PATH);
  await expect(page.locator('#anfrage')).toHaveAttribute('method', 'dialog');
  await expect(page.locator('#anfrage')).not.toHaveAttribute('action', /./);
  await expect(page.locator('[data-demo-note]')).toBeVisible();
  await expect(page.locator('[data-demo-note]')).toHaveText('Demo: Es werden keine Daten übertragen.');
  await expect(page.locator('[data-action="submit"]')).toHaveText('Anfrage abschließen (Demo)');
});

test('a path deep link preselects the project type', async ({ page }) => {
  await page.goto('konfigurator/boden/');
  await expect(radio(page, 'typ', 'boden')).toBeChecked();
  await expect(branch(page, 'boden').first()).toBeVisible();
  await expect(branch(page, 'moebel').first()).toBeHidden();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Boden', { useInnerText: true });
});

test('Möbel shows the build-time Beispielskizze', async ({ page }) => {
  await page.goto('konfigurator/moebel/');
  const figure = page.locator('figure[data-preview]');
  await expect(figure).toBeVisible();
  await expect(figure.locator('svg[role="img"]')).toBeVisible();
  await expect(figure.locator('figcaption')).toHaveText('Beispielskizze');
  await expect(figure.locator('[data-viewer]')).toBeHidden();
  const box = await figure.locator('[data-preview-drawing]').boundingBox();
  expect(box && box.height > 100).toBe(true);

  await page.goto('konfigurator/boden/');
  await expect(page.locator('figure[data-preview]')).toBeHidden();
});

test('range sliders, step navigation, progress and sidebar stay hidden', async ({ page }) => {
  await page.goto('konfigurator/moebel/');
  await expect(page.locator('input[type="range"]').first()).toBeHidden();
  await expect(page.locator('[data-action="next"]')).toBeHidden();
  await expect(page.locator('[data-action="back"]')).toBeHidden();
  await expect(page.locator('nav.progress')).toBeHidden();
  await expect(page.locator('aside[data-summary]')).toBeHidden();
  await expect(page.locator('[data-success]')).toBeHidden();
  await expect(page.locator('[data-error-summary]')).toBeHidden();
  await expect(page.locator('.configurator__nojs')).toBeVisible();
});

test('the submit button precedes the step nav in the DOM, so Enter submits', async ({ page }) => {
  await page.goto(PATH);
  const precedes = await page.evaluate(() => {
    const submit = document.querySelector('#anfrage [data-action="submit"]');
    const nav = document.querySelector('#anfrage [data-step-nav]');
    if (!submit || !nav) return false;
    return Boolean(submit.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(precedes).toBe(true);
  const firstSubmit = await page.evaluate(() => {
    const first = document.querySelector<HTMLButtonElement>('#anfrage button:not([type="button"])');
    return first?.dataset['action'];
  });
  expect(firstSubmit).toBe('submit');
});

test('popovers work without JS (DIN explainer)', async ({ page }) => {
  await page.goto('konfigurator/tuer/');
  await expect(page.locator('#din-erklaerung')).toBeHidden();
  await page.getByRole('button', { name: 'Was bedeutet DIN links oder rechts?' }).click();
  await expect(page.locator('#din-erklaerung')).toBeVisible();
});
