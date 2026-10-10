import { expect, test, type Page } from '@playwright/test';

// The quote wizard with JS (docs/configurator.md §3, §5) against the demo build: the full Möbel flow
// with focus management and live regions, validation, Weiter/Zurück, history, reload, deep links,
// the share URL, no PII in the URL, and the demo success view. Navigate relative to baseURL
// (`konfigurator/`): the base path contains a dot.

const PATH = 'konfigurator/';
const NAME = 'Erika Mustermann';
const EMAIL = 'erika@example.com';
const PLZ = '68161';
/** Personal data that must never reach the URL. */
const PII = [NAME, 'Erika', EMAIL, 'erika', PLZ, 'Mannheim', '0621'];

const radio = (page: Page, name: string, value: string) =>
  page.locator(`#anfrage input[name="${name}"][value="${value}"]`);
const step = (page: Page, id: string) => page.locator(`#anfrage .step[data-step="${id}"]`);
const heading = (page: Page, id: string) => page.locator(`#h-${id}`);
const next = (page: Page) => page.locator('[data-action="next"]');
const back = (page: Page) => page.locator('[data-action="back"]');
const live = (page: Page) => page.locator('[data-live="polite"]');
const summary = (page: Page) => page.locator('[data-error-summary]');
const sidebar = (page: Page) => page.locator('aside[data-summary]');

const STEPS = ['projekt', 'details', 'ausfuehrung', 'rahmen', 'kontakt', 'pruefen'];

/** The step is the only visible one, its heading has focus and reads "Schritt n von 6: …". */
async function expectStep(page: Page, id: string, title: string, focused = true): Promise<void> {
  const n = STEPS.indexOf(id) + 1;
  await expect(step(page, id)).toBeVisible();
  for (const other of STEPS) if (other !== id) await expect(step(page, other)).toBeHidden();
  await expect(heading(page, id)).toHaveText(`Schritt ${n} von 6: ${title}`, { useInnerText: true });
  if (focused) await expect(heading(page, id)).toBeFocused();
  await expect(page).toHaveTitle(new RegExp(`^Schritt ${n} von 6: `));
  await expect(page.locator('nav.progress [aria-current="step"]')).toHaveAttribute('data-goto', id);
  await expect(page).toHaveURL(id === 'projekt' ? /konfigurator\/(\?.*)?$/ : new RegExp(`schritt=${id}`));
}

function expectNoPii(page: Page): void {
  const url = decodeURIComponent(page.url());
  for (const s of PII) expect(url, `URL must not contain "${s}"`).not.toContain(s);
}

test('the full Möbel flow: focus, live region, errors, history, reload, demo success @cross-engine', async ({
  page,
  browserName,
}) => {
  await page.goto(PATH);
  const root = page.locator('[data-configurator]');
  await expect(root).toHaveAttribute('data-enhanced', '');
  await expect(page.locator('#anfrage')).toHaveAttribute('novalidate', '');
  await expect(page.locator('nav.progress')).toBeVisible();
  await expect(sidebar(page)).toBeVisible();
  await expect(page.locator('.configurator__nojs')).toBeHidden();
  await expectStep(page, 'projekt', 'Projekt', false);

  // Weiter without a project type: the error summary is focused and links to the field.
  await next(page).click();
  await expect(summary(page)).toBeVisible();
  await expect(summary(page)).toBeFocused();
  const link = summary(page).getByRole('link');
  await expect(link).toHaveText(['Projektart: Bitte wählen Sie eine Option bei „Projektart“.']);
  await expect(link).toHaveAttribute('href', '#f-typ-moebel');
  await expect(page.locator('#f-typ-fehler')).toBeVisible();
  await expect(page.locator('fieldset[data-field="typ"]')).toHaveAttribute('aria-describedby', /f-typ-fehler/);
  await expectStep(page, 'projekt', 'Projekt', false);

  // Choosing a type re-validates and clears the error.
  await radio(page, 'typ', 'moebel').check();
  await expect(summary(page)).toBeHidden();
  await expect(page.locator('#f-typ-fehler')).toBeHidden();
  // The sidebar lists the choice and the defaults the branch activation filled in (step 3).
  await expect(sidebar(page).locator('[data-summary-list] dd')).toHaveText(['Möbel nach Maß', 'Eiche', 'Natur geölt']);
  await expect(sidebar(page).locator('[data-summary-count]')).toHaveText('3');

  // Step 2: Möbel titles, the live preview, defaults, sliders, derived hint in the live region.
  await next(page).click();
  await expectStep(page, 'details', 'Möbel & Maße');
  await expect(page).toHaveURL(/typ=moebel/);
  await expect(page.locator('figure[data-preview]')).toBeVisible();
  await radio(page, 'moebel_art', 'regal').check();
  await expect(page.locator('#f-moebel_breite')).toHaveValue('120');
  await expect(page.locator('#f-moebel_hoehe')).toHaveValue('200');
  await expect(page.locator('#f-moebel_tiefe')).toHaveValue('35');
  await expect(radio(page, 'moebel_staerke', '19')).toBeChecked();
  const slider = page.locator('[data-range-for="moebel_breite"]');
  await expect(slider).toBeVisible();
  await expect(slider).toHaveValue('120');
  await expect(slider).toHaveAttribute('max', '300');
  await expect(page.locator('figure[data-preview]')).toHaveAttribute('data-preview-state', 'live');
  await expect(page.locator('figure[data-preview] figcaption')).toContainText('Vorschau: Regal aus Eiche');
  // A 300 cm oak shelf gets a Mittelwand; the hint reaches the polite region (debounced).
  await page.locator('#f-moebel_breite').fill('300');
  await expect(slider).toHaveValue('300');
  await expect(live(page)).toContainText(/Mittelw(and|ände) ergänzt/, { timeout: 5000 });
  await expect(sidebar(page).locator('[data-summary-list] dt').first()).toHaveText('Projektart');
  await expect(sidebar(page).locator('[data-summary-list]')).toContainText('Regal');
  await expect(sidebar(page).locator('[data-summary-list]')).toContainText('300 cm');
  await expect(page).toHaveURL(/moebel_breite=300/);
  await expect(page).not.toHaveURL(/moebel_staerke=/); // defaults stay out of the URL

  // Step 3, then step 4 with the PLZ rules and the service area.
  await next(page).click();
  await expectStep(page, 'ausfuehrung', 'Holz & Oberfläche');
  await expect(radio(page, 'moebel_holz', 'eiche')).toBeChecked();
  await next(page).click();
  await expectStep(page, 'rahmen', 'Zeitraum, Budget & Ort');
  await next(page).click();
  await expect(summary(page)).toBeFocused();
  await expect(summary(page).getByRole('link')).toHaveText([
    'Postleitzahl des Objekts: Bitte geben Sie „Postleitzahl des Objekts“ an.',
  ]);
  await expect(page.locator('#f-plz')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#f-plz').fill('123');
  await expect(page.locator('#f-plz-fehler')).toHaveText('Die Postleitzahl hat 5 Ziffern.');
  await page.locator('#f-plz').fill(PLZ);
  await expect(page.locator('#f-plz-fehler')).toBeHidden();
  await expect(page.locator('#f-plz')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(summary(page)).toBeHidden();
  await expect(page.locator('#einzugsgebiet')).toHaveText('Die Adresse liegt in unserem Einzugsgebiet.');
  await page.locator('#f-ort').fill('Mannheim');
  expectNoPii(page);

  // Step 5: Enter in a text field acts like Weiter.
  await next(page).click();
  await expectStep(page, 'kontakt', 'Kontakt');
  await page.locator('#f-name').fill(NAME);
  await page.locator('#f-email').fill(EMAIL);
  await page.locator('#f-email').press('Enter');
  await expectStep(page, 'pruefen', 'Prüfen & senden');
  expectNoPii(page);

  // Review list with „Ändern“, progress buttons, Zurück via history, Back/Forward.
  const review = page.locator('[data-review-list]');
  await expect(review).toBeVisible();
  await expect(review).toContainText(NAME);
  await review.getByRole('button', { name: 'Ändern: Postleitzahl des Objekts' }).click();
  await expectStep(page, 'rahmen', 'Zeitraum, Budget & Ort');
  await page.locator('nav.progress [data-goto="pruefen"]').click();
  await expectStep(page, 'pruefen', 'Prüfen & senden');
  const done = page.locator('nav.progress [data-goto="projekt"] [data-done]');
  await expect(done).toBeVisible(); // visually hidden text, un-hidden for done steps
  await expect(done).toHaveText('abgeschlossen');
  await expect(page.locator('nav.progress [data-goto="pruefen"] [data-done]')).toBeHidden();
  await back(page).click();
  await expectStep(page, 'rahmen', 'Zeitraum, Budget & Ort');
  await page.goForward();
  await expectStep(page, 'pruefen', 'Prüfen & senden');
  await page.goBack();
  await expectStep(page, 'rahmen', 'Zeitraum, Budget & Ort');
  await page.goBack();
  await expectStep(page, 'pruefen', 'Prüfen & senden');

  // Reload restores values (session) and the step (URL).
  await page.reload();
  await expectStep(page, 'pruefen', 'Prüfen & senden', false);
  await expect(page.locator('#f-name')).toHaveValue(NAME);
  await expect(page.locator('#f-plz')).toHaveValue(PLZ);
  await expect(page.locator('#f-moebel_breite')).toHaveValue('300');
  await expect(page.locator('[data-review-list]')).toContainText(EMAIL);
  expectNoPii(page);

  // Demo submission: nothing is sent, the success view shows summary, drawing and actions.
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') requests.push(r.url());
  });
  await page.locator('[data-action="submit"]').click();
  const success = page.locator('[data-success]');
  await expect(success).toBeVisible();
  await expect(success).toBeFocused();
  await expect(page.locator('.configurator__layout')).toBeHidden();
  await expect(success.locator('[data-anfrage-id]')).toHaveText(/^[A-Z0-9]{4}$/);
  await expect(success.locator('[data-success-summary]')).toContainText('Welches Möbel: Regal');
  await expect(success.locator('[data-success-summary]')).toContainText(`E-Mail: ${EMAIL}`);
  await expect(success.locator('[data-success-drawing] svg[role="img"]').first()).toBeVisible();
  const mail = success.locator('[data-action="mail"]');
  await expect(mail).toBeVisible();
  const href = (await mail.getAttribute('data-href')) ?? '';
  expect(href.startsWith('mailto:')).toBe(true);
  expect(href.length).toBeLessThanOrEqual(1800);
  expect(href).toContain('subject=Anfrage%20M%C3%B6bel');
  expect(href).toContain('Konfigurationslink');
  expect(href).not.toMatch(/[\r\n]/);
  await expect(success.locator('[data-action="copy"]')).toBeVisible();
  await expect(success.locator('[data-action="print"]')).toBeVisible();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('ss-konfigurator-v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('ss-konfigurator-entwurf-v1'))).toBeNull();

  // Back after a successful send: the prompt, then a new request.
  await page.goBack();
  const prompt = success.locator('.already-sent');
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('Anfrage bereits gesendet');
  await prompt.getByRole('button', { name: 'Neue Anfrage starten' }).click();
  await expect(success).toBeHidden();
  await expect(page.locator('.configurator__layout')).toBeVisible();
  await expectStep(page, 'projekt', 'Projekt');
  await expect(radio(page, 'typ', 'moebel')).not.toBeChecked();
  // WebKit keeps the old URL until the next replaceState settles; the step itself is what matters.
  if (browserName !== 'webkit') await expect(page).not.toHaveURL(/schritt=/);
});

test('?typ= deep link preselects, opens step 2 and announces it', async ({ page }) => {
  await page.goto(`${PATH}?typ=boden`);
  await expect(radio(page, 'typ', 'boden')).toBeChecked();
  await expectStep(page, 'details', 'Ihr Vorhaben', false);
  await expect(page.locator('fieldset.branch[data-branch="boden"]').first()).toBeVisible();
  await expect(page.locator('fieldset.branch[data-branch="moebel"]').first()).toBeHidden();
  await expect(live(page)).toHaveText('Projektart Boden vorausgewählt', { timeout: 5000 });
  await expect(page).toHaveURL(/typ=boden/);
});

test('a path variant is replaced by the query form of the deep link', async ({ page }) => {
  await page.goto('konfigurator/treppe/');
  await expect(radio(page, 'typ', 'treppe')).toBeChecked();
  await expect(page).toHaveURL(/konfigurator\/\?.*typ=treppe/);
  await expectStep(page, 'details', 'Ihr Vorhaben', false);
  await expect(live(page)).toHaveText('Projektart Treppe vorausgewählt', { timeout: 5000 });
});

test('a share URL restores the configuration, and the share popover offers it', async ({ page }) => {
  await page.goto(
    `${PATH}?v=1&typ=moebel&moebel_art=sideboard&moebel_breite=200&moebel_front=schubkaesten&schritt=details`,
  );
  await expectStep(page, 'details', 'Möbel & Maße', false);
  await expect(radio(page, 'moebel_art', 'sideboard')).toBeChecked();
  await expect(page.locator('#f-moebel_breite')).toHaveValue('200');
  await expect(page.locator('#f-moebel_hoehe')).toHaveValue('80'); // sideboard default
  await expect(radio(page, 'moebel_front', 'schubkaesten')).toBeChecked();
  await expect(page.locator('figure[data-preview] figcaption')).toContainText('Sideboard');
  const share = page.locator('[data-share-url]');
  await page.locator('[data-action="share"]').click();
  await expect(share).toBeVisible();
  const url = await share.inputValue();
  expect(url).toMatch(/^https?:\/\/.+\/konfigurator\/\?v=1&/);
  expect(url).toContain('typ=moebel');
  expect(url).toContain('moebel_art=sideboard');
  expect(url).toContain('moebel_breite=200');
  expect(url).not.toContain('moebel_hoehe'); // a default
  // Only project fields, never PII keys.
  for (const key of ['name', 'email', 'plz', 'telefon', 'nachricht', 'ort'])
    expect(url).not.toMatch(new RegExp(`[?&]${key}=`));
});

test('switching the project type keeps the other branch and announces it', async ({ page }) => {
  await page.goto(PATH);
  await radio(page, 'typ', 'boden').check();
  await next(page).click();
  await expectStep(page, 'details', 'Ihr Vorhaben');
  await page.locator('#f-boden_flaeche').fill('42,5');
  await page.locator('nav.progress [data-goto="projekt"]').click();
  await radio(page, 'typ', 'fenster').check();
  await expect(live(page)).toContainText('Projektart Fenster gewählt', { timeout: 5000 });
  await expect(page.locator('#f-boden_flaeche')).toBeDisabled();
  await expect(page.locator('#f-boden_flaeche')).toHaveValue('42,5');
  await expect(page).not.toHaveURL(/boden_flaeche/);
  await radio(page, 'typ', 'boden').check();
  await expect(page.locator('#f-boden_flaeche')).toBeEnabled();
  await expect(page).toHaveURL(/boden_flaeche=42\.5/);
});

test('the opt-in draft is saved, offered after the session ends and resumed', async ({ page, context }) => {
  await page.goto(PATH);
  await radio(page, 'typ', 'terrasse').check();
  await next(page).click();
  await expectStep(page, 'details', 'Ihr Vorhaben');
  await radio(page, 'terrasse_was', 'zaun').check();
  await page.locator('#f-zaun_hoehe').fill('180');
  await page.locator('[data-draft-toggle]').check();
  await expect(live(page)).toContainText('Entwurf gespeichert', { timeout: 5000 });
  await expect(page.locator('[data-action="draft-delete"]')).toBeVisible();
  const draft = JSON.parse((await page.evaluate(() => localStorage.getItem('ss-konfigurator-entwurf-v1'))) ?? 'null');
  expect(draft).toMatchObject({
    v: 1,
    step: 'details',
    values: { typ: 'terrasse', terrasse_was: 'zaun', zaun_hoehe: '180' },
  });
  expect(typeof draft.savedAt).toBe('string');

  // A new tab has its own (empty) sessionStorage but shares localStorage: the banner offers the draft.
  await page.close();
  const page2 = await context.newPage();
  await page2.goto(PATH);
  page = page2;
  const banner = page.locator('[data-draft-banner]');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Gespeicherter Entwurf vom \d{2}\.\d{2}\.\d{4}/);
  await expect(radio(page, 'typ', 'terrasse')).not.toBeChecked();
  await banner.getByRole('button', { name: 'Fortsetzen' }).click();
  await expect(banner).toBeHidden();
  await expect(radio(page, 'typ', 'terrasse')).toBeChecked();
  await expect(radio(page, 'terrasse_was', 'zaun')).toBeChecked();
  await expect(page.locator('#f-zaun_hoehe')).toHaveValue('180');
  await expectStep(page, 'details', 'Ihr Vorhaben', false);

  // Unticking deletes the draft.
  await page.locator('[data-draft-toggle]').uncheck();
  await expect(live(page)).toContainText('Entwurf gelöscht', { timeout: 5000 });
  expect(await page.evaluate(() => localStorage.getItem('ss-konfigurator-entwurf-v1'))).toBeNull();
});
