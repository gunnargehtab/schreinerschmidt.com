// Step `tldr` (docs/angebot.md §7.2, §7.4): token, recommendation, the threaded TL;DR mail, status
// bewertet; the failed-case TL;DR; the case without AI.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClaude } from '../src/claude/fake';
import { istEmpfehlung } from '../src/empfehlung';
import { BACKOFF_MS } from '../src/jobs';
import { tldrBetreff } from '../src/mail/tldr';
import { MAIL_BACKOFF_MS } from '../src/steps/anfrage-mail';
import { BODEN, REGAL, SONSTIGES, configuratorForm, newId } from './fixtures';
import { cleanupDirs, harness, header, type Harness } from './helpers';
import { BASE, bewerteterFall, tldrVon, tokenAus } from './review-helpers';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  cleanupDirs();
});

const DAY = 86_400_000;
const NN = String.fromCharCode(0x202f);

describe('TL;DR step', () => {
  it('stores only the token hash, sends the threaded TL;DR and sets bewertet', async () => {
    h = harness({ claude: new FakeClaude() });
    const { fall, token, tldr } = await bewerteterFall(h, REGAL);
    const after = (await h.deps.store.get(fall.id))!;
    expect(after.status).toBe('bewertet');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(after.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(after)).not.toContain(token);
    expect(after.tokenExpiresAt).toBe(h.clock.now() + 14 * DAY);
    expect(after.tldrAt).toBe(h.clock.now());
    expect(after.tldrMessageId).toMatch(/^<.+>$/);
    expect(istEmpfehlung(after.empfehlung)).toBe(true);
    expect(after.preisMin).toBeGreaterThan(0);

    // Threading: a reply to the enquiry mail.
    expect(after.messageId).toMatch(/^<.+>$/);
    expect(tldr.to).toBe('inhaber@schreinerei.test');
    expect(tldr.inReplyTo).toBe(after.messageId);
    expect(tldr.references).toEqual([after.messageId]);
    const eml = h.outbox().find((e) => e.includes('Ansehen und entscheiden'))!;
    expect(header(eml, 'In-Reply-To')).toBe(after.messageId!);
    expect(header(eml, 'References')).toBe(after.messageId!);

    // Subject §7.2 and the link.
    // headerText() makes every space-like character a plain space in headers; the body keeps U+202F.
    expect(tldr.subject).toMatch(
      /^\[Angebot prüfen\] Regal 120×200×35 – 68161 Mannheim – [\d ]+–[\d ]+ € – #[0-9A-Z]{4}$/,
    );
    expect(tldr.text).toContain(`Ansehen und entscheiden: ${BASE}/angebot/${fall.id}?t=${token}`);
    expect(tldr.text).toContain('Empfehlung: Freigeben empfohlen');
    expect(tldr.text).toMatch(
      /Preisrahmen brutto: [\d\u202f]+\u202f€ bis [\d\u202f]+\u202f€ \(Regeln, ±\u202f15\u202f%\)/,
    );
    expect(tldr.text).toContain('Machbarkeit: machbar');
    expect(tldr.text).toContain('Kundenbudget: 2' + NN + '000' + NN + '€ bis 5' + NN + '000' + NN + '€');
    expect(tldr.text).toContain('Einzugsgebiet: Kerngebiet (68161 Mannheim)');
    expect(tldr.text).toContain('KI-gestützte Bewertung – nichts wurde an den Kunden gesendet.');
    expect(tldr.html).toContain(`href="${BASE}/angebot/${fall.id}?t=${token}"`);
    expect(tldr.text.split('Ansehen und entscheiden')[0]!.trim().split('\n').length).toBeLessThanOrEqual(15);
    expect(await h.deps.store.job(fall.id, 'tldr')).toMatchObject({ status: 'done' });
    expect((await h.deps.store.events(fall.id)).map((e) => e.kind)).toContain('tldr_gesendet');
  });

  it('sanitises customer text in the subject (no header injection) and escapes it in the HTML', async () => {
    h = harness();
    const ort = 'Mannheim\r\nBcc: evil@example.com <script>x</script>';
    const { tldr } = await bewerteterFall(h, { ...REGAL, ort });
    expect(tldr.subject).not.toMatch(/[\r\n]/);
    const eml = h.outbox().find((e) => e.includes('Ansehen und entscheiden'))!;
    expect(eml).not.toMatch(/^Bcc:/im);
    expect(tldr.html).not.toContain('<script>');
    expect(tldr.html).toContain('&#60;script&#62;');
  });

  it('without AI: Prüfen „Ohne KI-Bewertung“ and the matching footer', async () => {
    h = harness(); // claude null
    const { fall, tldr } = await bewerteterFall(h, BODEN);
    expect(tldr.subject.startsWith('[Bitte prüfen] Boden – 68159 Mannheim – ')).toBe(true);
    expect(tldr.text).toContain('Empfehlung: Prüfen');
    expect(tldr.text).toContain('- Ohne KI-Bewertung – bitte selbst prüfen');
    expect(tldr.text).toContain('Machbarkeit: nicht bewertet');
    expect(tldr.text).toContain('Ohne KI-Bewertung – nichts wurde an den Kunden gesendet.');
    expect((await h.deps.store.get(fall.id))?.status).toBe('bewertet');
  });

  it('without a price (Mengen missing): „kein Preis – selbst kalkulieren“', async () => {
    h = harness();
    const { tldr } = await bewerteterFall(h, SONSTIGES);
    expect(tldr.subject).toMatch(/^\[Bitte prüfen\] Etwas anderes – 10115 Berlin – kein Preis – #/);
    expect(tldr.text).toContain('Preisrahmen brutto: kein Preis – selbst kalkulieren');
  });

  it('a failed case still gets a TL;DR („Bewertung fehlgeschlagen“) and stays bewertung_fehlgeschlagen', async () => {
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
    const tldr = tldrVon(h, fall)!;
    expect(tldr).toBeDefined();
    expect(tldr.subject.startsWith('[Bitte prüfen] Regal 120×200×35')).toBe(true);
    expect(tldr.text).toContain('- Bewertung fehlgeschlagen – bitte selbst kalkulieren');
    expect(tldr.text).toContain('Bewertung fehlgeschlagen – nichts wurde an den Kunden gesendet.');
    expect(fall.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fall.tldrAt).not.toBeNull();
    // The page works for it: Ablehnen and the own range.
    const res = await h.app.request(`/angebot/${fall.id}?t=${tokenAus(tldr)}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`action="/angebot/${fall.id}/manuell"`);
    expect(html).toContain(`action="/angebot/${fall.id}/ablehnen"`);
    expect(html).not.toContain(`action="/angebot/${fall.id}/freigeben"`);
  });

  it('surfaces a lost enquiry mail and retries a failing TL;DR on the mail schedule, sending once', async () => {
    h = harness();
    h.ctl.fail = 99; // enquiry mail and TL;DR both fail for now
    const id = newId();
    await h.post(configuratorForm(REGAL, { id }));
    await h.deps.runner.runDue();
    const fall = (await h.deps.store.getByAnfrageId(id))!;
    expect(await h.deps.store.job(fall.id, 'tldr')).toMatchObject({ status: 'pending', attempts: 1 });
    for (const ms of MAIL_BACKOFF_MS.slice(0, 4)) {
      h.clock.advance(ms);
      await h.deps.runner.runDue();
    }
    // The enquiry mail is out of attempts after its sixth try; let the TL;DR through then.
    h.ctl.fail = 1;
    h.clock.advance(MAIL_BACKOFF_MS[4]!);
    await h.deps.runner.runDue();
    const after = (await h.deps.store.get(fall.id))!;
    const kinds = (await h.deps.store.events(fall.id)).map((e) => e.kind);
    expect(kinds).toContain('anfrage_mail_failed');
    expect(after.status).toBe('bewertet');
    const tldrs = h.ctl.sent.filter((m) => m.text.includes('/angebot/'));
    expect(tldrs).toHaveLength(1);
    expect(tldrs[0]!.text).toContain('Die Anfrage-Mail ist nicht angekommen');
    expect(tldrs[0]!.inReplyTo).toBeUndefined(); // nothing to thread to
  });

  it('a rerun after the send does not send a second TL;DR', async () => {
    h = harness();
    const { fall } = await bewerteterFall(h, REGAL);
    const n = h.ctl.sent.length;
    await h.deps.store.enqueue(fall.id, 'tldr', h.clock.now(), h.clock.now());
    await h.deps.runner.runDue();
    expect(h.ctl.sent.length).toBe(n);
  });

  it('subject: recommendation prefixes and a header-safe length', async () => {
    h = harness();
    const { fall } = await bewerteterFall(h, REGAL);
    const f = (await h.deps.store.get(fall.id))!;
    const e = { v: 1 as const, flags: [], empfehlung: 'absagen' as const };
    expect(tldrBetreff(f, e, null)).toMatch(/^\[Absage empfohlen\] Regal 120×200×35 – 68161 Mannheim – kein Preis – #/);
    const long = { ...f, payload: { ...f.payload, values: { ...f.payload.values, ort: 'x'.repeat(500) } } };
    expect(tldrBetreff(long, e, null).length).toBeLessThanOrEqual(200);
  });
});
