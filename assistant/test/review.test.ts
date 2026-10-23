// Review page and owner actions (docs/angebot.md §7.3, §7.4, §11): access by token, GET never
// changes state, POST guards, every action path, the guards on edited text, the PIN session.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClaude } from '../src/claude/fake';
import { REVIEW_CSP } from '../src/review/routes';
import { SESSION_COOKIE } from '../src/token';
import { BODEN, REGAL, configuratorForm, newId } from './fixtures';
import { cleanupDirs, harness, type Harness } from './helpers';
import { BACKOFF_MS } from '../src/jobs';
import { BASE, aktion, bewerteterFall, formular, h1s, kundenmails, seite, tldrVon, tokenAus } from './review-helpers';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  cleanupDirs();
});

const DAY = 86_400_000;
const SECRET = 'x'.repeat(40);

/** The case row without volatile parts, for "nothing changed". */
const zustand = async (hh: Harness, id: string) => ({
  fall: await hh.deps.store.get(id),
  events: (await hh.deps.store.events(id)).length,
  mails: hh.ctl.sent.length,
});

describe('access', () => {
  it('serves the page for the right token with the security headers', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const res = await seite(h, fall.id, token);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(res.headers.get('content-security-policy')).toBe(REVIEW_CSP);
    expect(REVIEW_CSP).toBe(
      "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('same-origin');
    const html = await res.text();
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/);
    expect(html).toMatch(/<link rel="stylesheet" href="\/angebot\/assets\/review.css" \/>/);
    expect(html).not.toMatch(/<script|\sstyle="|\son\w+="/i);
  });

  it('answers a plain 404 without case data for a wrong token, an unknown or malformed id', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h);
    const wrong = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    for (const [id, t] of [
      [fall.id, wrong],
      [fall.id, ''],
      [fall.id, token.slice(0, 20)],
      ['3b241101-e2bb-4255-8caf-ffffffffffff', token],
      ['nicht-eine-uuid', token],
    ] as const) {
      const res = await seite(h, id, t);
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('Dieser Link ist ungültig.');
      expect(html).not.toContain(fall.kurz);
      expect(html).not.toContain('Erika');
    }
  });

  it('answers 410 once the link has expired, also for actions', async () => {
    h = harness({ timers: false });
    const { fall, token } = await bewerteterFall(h);
    h.clock.advance(14 * DAY);
    const res = await seite(h, fall.id, token);
    expect(res.status).toBe(410);
    const html = await res.text();
    expect(html).toContain('Link abgelaufen');
    expect(html).not.toContain(fall.kurz);
    const post = await aktion(h, fall.id, 'ablehnen', { t: token, v: String(fall.version), folge: 'manuell' });
    expect(post.status).toBe(410);
  });

  it('serves the stylesheet', async () => {
    h = harness();
    const res = await h.app.request('/angebot/assets/review.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/css/);
    expect(await res.text()).toContain(':focus-visible');
  });
});

describe('GET never changes state', () => {
  it('page, PDF preview, stylesheet and repeated loads leave the case as it was', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const before = await zustand(h, fall.id);
    await seite(h, fall.id, token);
    await seite(h, fall.id, token);
    await h.app.request(`/angebot/${fall.id}/vorschau.pdf?t=${token}`);
    await h.app.request(`/angebot/${fall.id}/vorschau.pdf?t=${token}&min=1&max=2&einleitung=x`);
    await h.app.request('/angebot/assets/review.css');
    // GET on an action path is not routed at all.
    expect((await h.app.request(`/angebot/${fall.id}/freigeben?t=${token}`)).status).toBe(404);
    expect(await zustand(h, fall.id)).toEqual(before);
  });
});

describe('the page', () => {
  it('has one h1, labels for every field, legends for the radio groups and escapes customer text', async () => {
    h = harness({ claude: new FakeClaude() });
    const evil = '<script>alert(1)</script> „Wünsche“ & <b>fett</b>';
    const { fall, token } = await bewerteterFall(h, {
      ...REGAL,
      moebel_wuensche: evil,
      nachricht: evil,
      name: '<i>Erika</i>',
    });
    const html = await (await seite(h, fall.id, token)).text();
    expect(h1s(html)).toHaveLength(1);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>fett</b>');
    expect(html).not.toContain('<i>Erika</i>');
    expect(html).toContain('&#60;script&#62;alert(1)&#60;/script&#62;');
    // Every input/textarea with an id has a label (hidden inputs excepted).
    const ids = [...html.matchAll(/<(?:input|textarea)(?![^>]*type="hidden")[^>]* id="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) expect(html).toContain(`<label for="${id}">`);
    // Radio groups sit in fieldsets with a legend.
    for (const m of html.matchAll(/<fieldset[^>]*>\s*<legend/g)) expect(m[0]).toContain('<legend');
    expect(html).toMatch(/<fieldset[^>]*>\s*<legend id="a-folge">Wie geht es weiter\?<\/legend>/);
    // Content: recommendation, customer data, internal positions, both forms, PDF link.
    expect(html).toContain('Empfehlung: Freigeben empfohlen');
    expect(html).toContain('erika@example.com');
    expect(html).toContain(`2${String.fromCharCode(0x202f)}000${String.fromCharCode(0x202f)}€ bis 5`);
    expect(html).not.toContain('2.000 bis 5.000');
    expect(html).toContain('Plattenmaterial Eiche');
    expect(html).toContain(`action="/angebot/${fall.id}/freigeben"`);
    expect(html).toContain(`action="/angebot/${fall.id}/ablehnen"`);
    expect(html).toContain(`href="/angebot/${fall.id}/vorschau.pdf?t=${token}"`);
    expect(html).toContain('Können Sie uns ein Foto der Einbausituation schicken?');
  });

  it('renders a spam case and a case without AI sensibly', async () => {
    const claude = new FakeClaude();
    claude.bewertenQueue.push((i) => ({
      spam: true,
      machbarkeit: 'unklar',
      gruende: [],
      risiken: [],
      fehlende_angaben: [],
      rueckfragen: [],
      passt_zum_betrieb: false,
      mengen: i.mengenNoetig ? null : null,
    }));
    h = harness({ claude });
    const spam = await bewerteterFall(h, BODEN);
    const html = await (await seite(h, spam.fall.id, spam.token)).text();
    expect(html).toContain('Empfehlung: Absage empfohlen');
    expect(html).toContain('Spam-Verdacht');
    // No Angebot text was written for spam: the form is pre-filled with the template.
    expect(formular(html, 'freigeben')['einleitung']).toContain('Vielen Dank für Ihre Anfrage');
    await h.close();

    h = harness();
    const ohne = await bewerteterFall(h, BODEN);
    const html2 = await (await seite(h, ohne.fall.id, ohne.token)).text();
    expect(html2).toContain('Für diesen Fall gibt es keine KI-Bewertung.');
    expect(html2).toContain('Ohne KI-Bewertung – bitte selbst prüfen');
  });
});

describe('POST guards', () => {
  it('checks Origin, content type, body size and the token before anything else', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h);
    const f = { t: token, v: String(fall.version), folge: 'manuell' };
    const before = await zustand(h, fall.id);
    expect((await aktion(h, fall.id, 'ablehnen', f, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await aktion(h, fall.id, 'ablehnen', f, { origin: null })).status).toBe(403);
    expect((await aktion(h, fall.id, 'ablehnen', f, { origin: 'null' })).status).toBe(403);
    expect((await aktion(h, fall.id, 'ablehnen', f, { origin: 'https://www.schreinerei.test' })).status).toBe(403);
    expect((await aktion(h, fall.id, 'ablehnen', f, { contentType: 'multipart/form-data; boundary=x' })).status).toBe(
      415,
    );
    expect((await aktion(h, fall.id, 'ablehnen', f, { contentType: 'application/json' })).status).toBe(415);
    expect((await aktion(h, fall.id, 'ablehnen', { ...f, rueckfragen: 'x'.repeat(70_000) })).status).toBe(413);
    expect((await aktion(h, fall.id, 'ablehnen', { ...f, t: 'A'.repeat(43) })).status).toBe(404);
    expect(await zustand(h, fall.id)).toEqual(before);
    // `Origin: null` (no-referrer policies) passes only with Sec-Fetch-Site same-origin.
    const ok = await aktion(h, fall.id, 'ablehnen', f, {
      origin: 'null',
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    expect(ok.status).toBe(200);
    expect((await h.deps.store.get(fall.id))?.status).toBe('manuell');
  });

  it('a stale version shows the current state and sends nothing', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h);
    const res = await aktion(h, fall.id, 'ablehnen', { t: token, v: String(fall.version - 1), folge: 'manuell' });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('Dieser Vorgang wurde inzwischen bearbeitet.');
    expect((await h.deps.store.get(fall.id))?.status).toBe('bewertet');
  });
});

/** Runs the two-step Freigeben with the page's own pre-filled values (+ overrides). */
async function freigeben(hh: Harness, id: string, token: string, extra: Record<string, string> = {}) {
  const page = await (await seite(hh, id, token)).text();
  const felder = { ...formular(page, 'freigeben'), ...extra };
  const confirm = await aktion(hh, id, 'freigeben', felder);
  const html = await confirm.text();
  return { confirm, html, felder };
}

describe('Freigeben', () => {
  it('confirm step, then the Angebot with its PDF to the customer, once', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const { confirm, html } = await freigeben(h, fall.id, token, { min: '2450', max: '3300' });
    expect(confirm.status).toBe(200);
    expect(h1s(html)).toHaveLength(1);
    expect(html).toContain('<h1 tabindex="-1">Jetzt an erika@example.com senden?</h1>');
    expect(html).toContain('2\u202f450\u202f€ bis 3\u202f300\u202f€ inkl. 19\u202f% MwSt., vorbehaltlich Aufmaß.');
    expect(kundenmails(h)).toHaveLength(0); // nothing sent yet
    expect((await h.deps.store.get(fall.id))?.status).toBe('bewertet');

    const senden = formular(html, 'freigeben');
    expect(senden['schritt']).toBeUndefined(); // the buttons carry it
    const res = await aktion(h, fall.id, 'freigeben', { ...senden, schritt: 'senden' });
    expect(res.status).toBe(200);
    const out = await res.text();
    expect(h1s(out)).toHaveLength(1);
    expect(out).toContain('Das Angebot wurde gesendet.');
    expect(out).toContain('A-2026-0001');
    const mails = kundenmails(h);
    expect(mails).toHaveLength(1);
    const m = mails[0]!;
    expect(m.to).toBe('erika@example.com');
    expect(m.bcc).toBe('inhaber@schreinerei.test');
    expect(m.replyTo).toBe('Schreinerei Schmidt <anfrage@schreinerei.test>');
    expect(m.subject).toMatch(/^Ihr unverbindliches Angebot: Regal aus Eiche – Schreinerei Schmidt \(#[0-9A-Z]{4}\)$/);
    expect(m.text.startsWith('Guten Tag Erika Mustermann,')).toBe(true);
    expect(m.text).toContain(
      'Ihr Preisrahmen: 2\u202f450\u202f€ bis 3\u202f300\u202f€ inkl. 19\u202f% MwSt., vorbehaltlich Aufmaß.',
    );
    expect(m.text).toContain('Dieses Angebot ist freibleibend und unverbindlich.');
    expect(m.text).not.toContain('Plattenmaterial'); // no positions to the customer
    expect(m.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      [`Angebot-${fall.kurz}.pdf`, 'application/pdf'],
    ]);
    expect(m.attachments?.[0]?.content.subarray(0, 5).toString()).toBe('%PDF-');

    const after = (await h.deps.store.get(fall.id))!;
    expect(after.status).toBe('gesendet');
    expect(after.decidedAt).not.toBeNull();
    expect(after.angebotsnummer).toBe('A-2026-0001');
    expect([after.preisMin, after.preisMax]).toEqual([2450, 3300]);
    expect(after.sperre).toBeNull();
    expect(after.entscheidung).toMatchObject({
      aktion: 'freigeben',
      preis: { min: 2450, max: 3300 },
      mail: { art: 'angebot', an: 'erika@example.com', text: m.text, umgeleitet: false },
    });

    // A second click on the same confirm form: the current state, no second mail.
    const again = await aktion(h, fall.id, 'freigeben', { ...senden, schritt: 'senden' });
    expect(again.status).toBe(409);
    expect(kundenmails(h)).toHaveLength(1);
    // The page now shows the outcome and no forms.
    const page = await (await seite(h, fall.id, token)).text();
    expect(page).toContain('Das Angebot wurde gesendet.');
    expect(page).not.toContain('action="/angebot/');
  });

  it('a double click (two concurrent POSTs) sends one mail', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const { html } = await freigeben(h, fall.id, token);
    const f = { ...formular(html, 'freigeben'), schritt: 'senden' };
    const [a, b] = await Promise.all([aktion(h, fall.id, 'freigeben', f), aktion(h, fall.id, 'freigeben', f)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(kundenmails(h)).toHaveLength(1);
  });

  it('validates the range server-side and re-renders the form with an error summary', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    for (const [min, max, msg] of [
      ['3300', '2450', '„Von“ darf nicht größer sein als „Bis“.'],
      ['0', '100', 'bei „Von“ einen ganzen Eurobetrag größer als 0'],
      ['abc', '100', 'bei „Von“ einen ganzen Eurobetrag'],
      ['100', '', 'bei „Bis“ einen ganzen Eurobetrag'],
      ['12,5', '100', 'bei „Von“ einen ganzen Eurobetrag'],
    ] as const) {
      const { confirm, html } = await freigeben(h, fall.id, token, { min, max });
      expect(confirm.status).toBe(422);
      expect(html).toContain('<div class="fehlerliste" role="alert"');
      expect(html).toContain(msg);
      expect(html).toMatch(/<title>Fehler: /);
      expect(h1s(html)).toHaveLength(1);
    }
    // Lenient input: „2.450 €“ is 2450.
    const ok = await freigeben(h, fall.id, token, { min: '2.450 €', max: '3 300' });
    expect(ok.confirm.status).toBe(200);
    expect(kundenmails(h)).toHaveLength(0);
  });

  it('refuses edited text that breaks the guards, naming the rule; allows the shop’s own address', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const cases: [string, string, string][] = [
      ['einleitung', 'Rufen Sie mich an: 0171 2345678.', 'eine Telefonnummer'],
      ['einleitung', 'Mehr auf www.example.de.', 'einen Link oder eine Webadresse'],
      ['naechster_schritt', 'Wir kommen am 12.11.2026 vorbei.', 'ein Datum oder einen Termin'],
      ['leistung', 'Rabatt 10 %\nNachhaltige Fertigung', 'eine Prozentangabe und eine pauschale Umweltaussage'],
      ['nicht_enthalten', 'Alles für 99 €', 'einen Betrag'],
      ['einleitung', '', '„Einleitung“ darf nicht leer sein.'],
    ];
    for (const [feld, wert, regel] of cases) {
      const { confirm, html } = await freigeben(h, fall.id, token, { [feld]: wert });
      expect(confirm.status, `${feld}: ${wert}`).toBe(422);
      expect(html).toContain(regel);
      expect(html).toContain(`href="#f-${feld}"`);
      expect(html).toContain(`id="f-${feld}"`);
    }
    const ok = await freigeben(h, fall.id, token, {
      naechster_schritt: 'Schreiben Sie uns gern an anfrage@schreinerei.test, dann vereinbaren wir das Aufmaß.',
    });
    expect(ok.confirm.status).toBe(200);
    expect(kundenmails(h)).toHaveLength(0);
  });

  it('a failing send changes nothing, clears the claim and can be retried', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const { html } = await freigeben(h, fall.id, token);
    const f = { ...formular(html, 'freigeben'), schritt: 'senden' };
    h.ctl.fail = 1;
    const res = await aktion(h, fall.id, 'freigeben', f);
    expect(res.status).toBe(502);
    const retry = await res.text();
    expect(retry).toContain('Die Mail konnte nicht gesendet werden.');
    const mid = (await h.deps.store.get(fall.id))!;
    expect(mid.status).toBe('bewertet');
    expect(mid.sperre).toBeNull();
    // The Angebotsnummer stays with this case; the retry uses the confirm page's new version.
    expect(mid.angebotsnummer).toBe('A-2026-0001');
    const ok = await aktion(h, fall.id, 'freigeben', { ...formular(retry, 'freigeben'), schritt: 'senden' });
    expect(ok.status).toBe(200);
    expect(kundenmails(h)).toHaveLength(1);
    expect((await h.deps.store.get(fall.id))?.angebotsnummer).toBe('A-2026-0001');
  });

  it('„Zurück zum Bearbeiten“ re-renders the form with the edited values', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h);
    const { html } = await freigeben(h, fall.id, token, { einleitung: 'Danke für Ihre Anfrage zu Ihrem Regal.' });
    const res = await aktion(h, fall.id, 'freigeben', { ...formular(html, 'freigeben'), schritt: 'bearbeiten' });
    expect(res.status).toBe(200);
    expect(formular(await res.text(), 'freigeben')['einleitung']).toBe('Danke für Ihre Anfrage zu Ihrem Regal.');
  });
});

describe('Ablehnen', () => {
  const basis = async (hh: Harness) => {
    const r = await bewerteterFall(hh);
    return { ...r, f: { t: r.token, v: String(r.fall.version) } };
  };

  it('selbst kalkulieren: nothing sent, status manuell; later the own range goes out (manuell → gesendet)', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token, f } = await basis(h);
    const res = await aktion(h, fall.id, 'ablehnen', { ...f, folge: 'manuell' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Vermerkt: Sie kalkulieren selbst. Es wurde nichts gesendet.');
    expect(kundenmails(h)).toHaveLength(0);
    const m = (await h.deps.store.get(fall.id))!;
    expect(m.status).toBe('manuell');
    expect(m.tokenExpiresAt).toBe(h.clock.now() + 14 * DAY);

    const page = await (await seite(h, fall.id, token)).text();
    expect(page).toContain('Eigener Preisrahmen');
    expect(page).not.toContain(`action="/angebot/${fall.id}/freigeben"`);
    const felder = { ...formular(page, 'manuell'), min: '4000', max: '5200' };
    const confirm = await aktion(h, fall.id, 'manuell', felder);
    expect(confirm.status).toBe(200);
    const sent = await aktion(h, fall.id, 'manuell', {
      ...formular(await confirm.text(), 'manuell'),
      schritt: 'senden',
    });
    expect(sent.status).toBe(200);
    expect(kundenmails(h)).toHaveLength(1);
    expect(kundenmails(h)[0]!.text).toContain('4\u202f000\u202f€ bis 5\u202f200\u202f€');
    const after = (await h.deps.store.get(fall.id))!;
    expect(after.status).toBe('gesendet');
    expect(after.entscheidung).toMatchObject({ aktion: 'eigener_preis', preis: { min: 4000, max: 5200 } });
  });

  it('Kunden kontaktieren – „Ich rufe selbst an“: nothing sent, status kontakt', async () => {
    h = harness();
    const { fall, f } = await basis(h);
    const res = await aktion(h, fall.id, 'ablehnen', { ...f, folge: 'kontakt', kontakt_art: 'anruf' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Sie rufen den Kunden selbst an');
    expect(kundenmails(h)).toHaveLength(0);
    expect((await h.deps.store.get(fall.id))?.status).toBe('kontakt');
  });

  it('Kunden kontaktieren – Rückfragen per E-Mail: confirm, then the edited questions', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, f } = await basis(h);
    const fragen = 'Wie hoch ist die Decke?\n- Gibt es eine Steckdose in der Nische?';
    const confirm = await aktion(h, fall.id, 'ablehnen', {
      ...f,
      folge: 'kontakt',
      kontakt_art: 'mail',
      rueckfragen: fragen,
    });
    expect(confirm.status).toBe(200);
    const html = await confirm.text();
    expect(html).toContain('Jetzt an erika@example.com senden?');
    expect(kundenmails(h)).toHaveLength(0);
    const res = await aktion(h, fall.id, 'ablehnen', { ...formular(html, 'ablehnen'), schritt: 'senden' });
    expect(res.status).toBe(200);
    const [m] = kundenmails(h);
    expect(m!.subject).toMatch(/^Rückfragen zu Ihrer Anfrage \(#[0-9A-Z]{4}\)$/);
    expect(m!.text).toContain('- Wie hoch ist die Decke?\n- Gibt es eine Steckdose in der Nische?');
    expect(m!.text).toContain('Antworten Sie einfach auf diese E-Mail.');
    expect(m!.attachments).toEqual([]);
    expect((await h.deps.store.get(fall.id))?.status).toBe('kontakt');
    expect(await res.text()).toContain('Die Rückfragen wurden gesendet.');
  });

  it('Rückfragen: empty or breaking the guards → error summary', async () => {
    h = harness();
    const { fall, f } = await basis(h);
    const leer = await aktion(h, fall.id, 'ablehnen', {
      ...f,
      folge: 'kontakt',
      kontakt_art: 'mail',
      rueckfragen: ' ',
    });
    expect(leer.status).toBe(422);
    expect(await leer.text()).toContain('Bitte geben Sie mindestens eine Rückfrage ein.');
    const bad = await aktion(h, fall.id, 'ablehnen', {
      ...f,
      folge: 'kontakt',
      kontakt_art: 'mail',
      rueckfragen: 'Passt Ihnen der 3. Mai?',
    });
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain('ein Datum oder einen Termin');
    const ohne = await aktion(h, fall.id, 'ablehnen', { ...f, folge: 'kontakt' });
    expect(ohne.status).toBe(422);
    const nix = await aktion(h, fall.id, 'ablehnen', { ...f });
    expect(nix.status).toBe(422);
    expect(await nix.text()).toContain('Bitte wählen Sie, wie es weitergehen soll.');
    expect(kundenmails(h)).toHaveLength(0);
  });

  it('Absagen: template + personal line, the internal reason is stored and never sent', async () => {
    h = harness();
    const { fall, f } = await basis(h);
    const noGrund = await aktion(h, fall.id, 'ablehnen', { ...f, folge: 'absage' });
    expect(noGrund.status).toBe(422);
    expect(await noGrund.text()).toContain('Bitte wählen Sie einen internen Grund.');
    const confirm = await aktion(h, fall.id, 'ablehnen', {
      ...f,
      folge: 'absage',
      grund: 'keine_kapazitaet',
      persoenlich: 'Für Ihr Regal fehlt uns derzeit leider die Werkstattzeit.',
    });
    const html = await confirm.text();
    expect(confirm.status).toBe(200);
    const res = await aktion(h, fall.id, 'ablehnen', { ...formular(html, 'ablehnen'), schritt: 'senden' });
    expect(res.status).toBe(200);
    const [m] = kundenmails(h);
    expect(m!.subject).toMatch(/^Ihre Anfrage bei der Schreinerei Schmidt \(#[0-9A-Z]{4}\)$/);
    expect(m!.text).toContain('Leider können wir Ihr Vorhaben nicht übernehmen.');
    expect(m!.text).toContain('Für Ihr Regal fehlt uns derzeit leider die Werkstattzeit.');
    expect(m!.text).not.toMatch(/Kapazität|keine_kapazitaet/);
    expect(m!.text).not.toContain('Innung');
    const after = (await h.deps.store.get(fall.id))!;
    expect(after.status).toBe('abgesagt');
    expect(after.entscheidung).toMatchObject({ aktion: 'absage', grund: 'keine_kapazitaet' });
    expect(await res.text()).toContain('Die Absage wurde gesendet.');
  });

  it('the Innung pointer only with INNUNG_HINWEIS', async () => {
    h = harness({ env: { INNUNG_HINWEIS: '1' } });
    const { fall, f } = await basis(h);
    const confirm = await aktion(h, fall.id, 'ablehnen', { ...f, folge: 'absage', grund: 'sonstiges' });
    await aktion(h, fall.id, 'ablehnen', { ...formular(await confirm.text(), 'ablehnen'), schritt: 'senden' });
    expect(kundenmails(h)[0]!.text).toContain('Betriebssuche der Schreiner-Innung');
  });

  it('a failed case can be sent with an own range (bewertung_fehlgeschlagen → gesendet)', async () => {
    const claude = new FakeClaude();
    for (let i = 0; i < 3; i++) claude.bewertenQueue.push(Object.assign(new Error('down'), { status: 503 }));
    h = harness({ claude });
    const id = newId();
    await h.post(configuratorForm(REGAL, { id }));
    await h.deps.runner.runDue();
    for (const ms of BACKOFF_MS) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    expect(fall.status).toBe('bewertung_fehlgeschlagen');
    const token = tokenAus(tldrVon(h, fall)!);
    const page = await (await seite(h, fall.id, token)).text();
    const felder = formular(page, 'manuell');
    // The rule-based price exists (only Claude failed): the range is pre-filled.
    expect(Number(felder['min'])).toBeGreaterThan(0);
    // Freigeben is not allowed in this status.
    expect((await aktion(h, fall.id, 'freigeben', felder)).status).toBe(409);
    const confirm = await aktion(h, fall.id, 'manuell', felder);
    const res = await aktion(h, fall.id, 'manuell', {
      ...formular(await confirm.text(), 'manuell'),
      schritt: 'senden',
    });
    expect(res.status).toBe(200);
    expect((await h.deps.store.get(fall.id))?.status).toBe('gesendet');
    expect(kundenmails(h)).toHaveLength(1);
  });

  it('final states accept no further action', async () => {
    h = harness();
    const { fall, token, f } = await basis(h);
    await aktion(h, fall.id, 'ablehnen', { ...f, folge: 'kontakt', kontakt_art: 'anruf' });
    const cur = (await h.deps.store.get(fall.id))!;
    const res = await aktion(h, fall.id, 'ablehnen', { t: token, v: String(cur.version), folge: 'manuell' });
    expect(res.status).toBe(409);
    expect(await res.text()).toContain('Diese Aktion ist im aktuellen Status nicht möglich.');
    expect((await h.deps.store.get(fall.id))?.status).toBe('kontakt');
  });
});

describe('PIN (OWNER_PIN)', () => {
  const env = { OWNER_PIN: '4711', SESSION_SECRET: SECRET };
  const cookieAus = (res: Response): string => (res.headers.get('set-cookie') ?? '').split(';')[0]!;

  it('needs SESSION_SECRET', async () => {
    const { loadConfig, ConfigError } = await import('../src/config');
    expect(() => loadConfig({ OWNER_PIN: '4711' })).toThrow(ConfigError);
    expect(() => loadConfig({ OWNER_PIN: '4711', SESSION_SECRET: 'kurz' })).toThrow(ConfigError);
    expect(loadConfig(env).sessionSecret).toBe(SECRET);
  });

  it('hop, PIN form, cookie flags, then the page; actions need the session', async () => {
    h = harness({ env });
    const { fall, token } = await bewerteterFall(h);
    // A mail link (cross-site, no cookie): one same-site hop by meta refresh, no case data.
    const hop = await seite(h, fall.id, token);
    expect(hop.status).toBe(200);
    const hopHtml = await hop.text();
    expect(hopHtml).toContain(`<meta http-equiv="refresh" content="0;url=/angebot/${fall.id}?t=${token}&#38;r=1" />`);
    expect(hopHtml).not.toContain('Erika');
    const form = await h.app.request(`/angebot/${fall.id}?t=${token}&r=1`);
    const formHtml = await form.text();
    expect(formHtml).toContain('<label for="pin">PIN</label>');
    expect(formHtml).not.toContain('Erika');

    // Actions without a session: the PIN page, nothing happens.
    const f = { t: token, v: String(fall.version), folge: 'manuell' };
    expect((await aktion(h, fall.id, 'ablehnen', f)).status).toBe(401);
    expect((await h.app.request(`/angebot/${fall.id}/vorschau.pdf?t=${token}`)).status).toBe(401);

    const wrong = await aktion(h, fall.id, 'pin', { t: token, pin: '0000' });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain('Die PIN ist nicht richtig.');
    const ok = await aktion(h, fall.id, 'pin', { t: token, pin: '4711' });
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`/angebot/${fall.id}?t=${token}`);
    const setCookie = ok.headers.get('set-cookie')!;
    expect(setCookie.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
    for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Max-Age=43200'])
      expect(setCookie).toContain(flag);
    expect(setCookie).not.toMatch(/Domain=/i);
    const cookie = cookieAus(ok);

    const page = await seite(h, fall.id, token, { Cookie: cookie });
    expect(await page.text()).toContain('Empfehlung:');
    expect((await aktion(h, fall.id, 'ablehnen', f, { cookie })).status).toBe(200);

    // A tampered cookie or one past 12 h does not count.
    const [name, value] = cookie.split('=') as [string, string];
    const tampered = `${name}=${value.replace(/^\d/, (d) => String((Number(d) + 1) % 10))}`;
    expect(await (await seite(h, fall.id, token, { Cookie: tampered })).text()).toContain('http-equiv="refresh"');
    h.clock.advance(12 * 3_600_000);
    expect(await (await seite(h, fall.id, token, { Cookie: cookie })).text()).toContain('http-equiv="refresh"');
  });

  it('rate-limits PIN attempts: 5 per 15 minutes per case and client', async () => {
    h = harness({ env });
    const { fall, token } = await bewerteterFall(h);
    for (let i = 0; i < 5; i++)
      expect((await aktion(h, fall.id, 'pin', { t: token, pin: `000${i}` })).status).toBe(401);
    const blocked = await aktion(h, fall.id, 'pin', { t: token, pin: '4711' });
    expect(blocked.status).toBe(429);
    expect(await blocked.text()).toContain('Zu viele Versuche.');
    h.clock.advance(15 * 60_000 + 1);
    expect((await aktion(h, fall.id, 'pin', { t: token, pin: '4711' })).status).toBe(303);
  });

  it('the PIN route does not exist without OWNER_PIN', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h);
    expect((await aktion(h, fall.id, 'pin', { t: token, pin: '4711' })).status).toBe(404);
    expect(BASE).toBe(h.config.publicBaseUrl);
  });
});
