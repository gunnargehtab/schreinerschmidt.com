// POST /anfrage contract (docs/assistant.md §2.2, §8; docs/angebot.md §2.1, §11).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BODEN, CONTACT, REGAL, SONSTIGES, configuratorForm, contactForm, exe, jpeg, newId, svg } from './fixtures';
import { NEXT, SITE, cleanupDirs, harness, header, type Harness } from './helpers';

let h: Harness;
afterEach(async () => {
  await h?.close();
  cleanupDirs();
});

const body = async (res: Response) => (await res.json()) as { success: boolean; error?: string; error_msg?: string };

describe('success paths', () => {
  it('stores a Möbel case, mails the owner and answers JSON with CORS for the site', async () => {
    h = harness();
    const id = newId();
    const res = await h.post(
      configuratorForm(REGAL, {
        id,
        files: [
          { name: 'fotos[]', file: jpeg() },
          { name: 'zeichnung', file: svg() },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ success: true });
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');

    const fall = await h.deps.store.getByAnfrageId(id);
    expect(fall?.status).toBe('eingegangen');
    expect(fall?.payload.values['moebel_art']).toBe('regal');
    expect(fall?.payload.anhaenge).toEqual(['Küche_Foto.jpg', 'zeichnung.svg']);
    expect(JSON.stringify(fall?.payload)).not.toContain('/9j/'); // no attachment content stored
    expect(fall?.messageId).toMatch(/^<.+@.+>$/);
    expect((await h.deps.store.job(fall!.id, 'anfrage_mail'))?.status).toBe('done');
    expect((await h.deps.store.job(fall!.id, 'preis'))?.status).toBe('pending');

    const [eml] = h.outbox();
    expect(h.outbox()).toHaveLength(1);
    expect(header(eml!, 'To')).toBe('inhaber@schreinerei.test');
    expect(header(eml!, 'Reply-To')).toBe('erika@example.com');
    expect(header(eml!, 'From')).toContain('anfrage@schreinerei.test');
    const mail = h.ctl.sent[0]!;
    expect(mail.text).toContain(`Vorgangsnummer: #${fall!.kurz}`);
    expect(mail.text).toContain(`Konfiguration: ${SITE}/konfigurator/?v=1&typ=moebel`);
    expect(mail.attachments?.map((a) => [a.filename, a.contentType])).toEqual([
      ['Küche_Foto.jpg', 'image/jpeg'],
      ['zeichnung.svg', 'image/svg+xml'],
    ]);
    expect(eml).toContain('Content-Type: image/svg+xml');
    expect(eml).toMatch(/Content-Disposition: attachment;\s+filename=zeichnung\.svg/);
    expect(eml).not.toMatch(/Content-Disposition: inline/);
  });

  it('redirects with 303 to _next without Accept: application/json', async () => {
    h = harness();
    const res = await h.post(configuratorForm(BODEN), { json: false });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(NEXT);
  });

  it.each([
    'https://evil.example/danke/',
    '//evil.example/danke/',
    'javascript:alert(1)',
    `${SITE}.evil.example/`,
    'https://user:pw@www.schreinerei.test/',
  ])('never redirects off the site (%s)', async (next) => {
    h = harness();
    const res = await h.post(configuratorForm(BODEN, { extra: { _next: next } }), { json: false });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${SITE}/`);
  });

  it('accepts a configurator post without JS (no anfrage_json) and writes a server summary', async () => {
    h = harness();
    const res = await h.post(configuratorForm(SONSTIGES, { id: null, extra: { homepage: '' } }), { json: false });
    expect(res.status).toBe(303);
    expect(h.count('faelle')).toBe(1);
    expect(h.ctl.sent[0]?.text).toContain('Projektart: Etwas anderes');
    expect(h.ctl.sent[0]?.subject).toMatch(/^Anfrage Konfigurator – #[0-9A-Z]{4}$/);
  });

  it('delivers a contact form post by mail only, without a case', async () => {
    h = harness();
    const res = await h.post(contactForm());
    expect(await body(res)).toEqual({ success: true });
    expect(h.count('faelle')).toBe(0);
    expect(h.count('jobs')).toBe(0);
    const [eml] = h.outbox();
    expect(h.outbox()).toHaveLength(1);
    expect(h.ctl.sent[0]?.subject).toBe(CONTACT['_subject']);
    expect(header(eml!, 'Subject')).toBe('=?UTF-8?Q?Kontaktanfrage_=C3=BCber_die_Website?=');
    expect(header(eml!, 'Reply-To')).toBe('erika@example.com');
    expect(h.ctl.sent[0]?.text).toContain('Ich hätte gern einen Termin.');
  });

  it('answers 502 (network) when a contact mail fails, as nothing was stored', async () => {
    h = harness();
    h.ctl.fail = 1;
    const res = await h.post(contactForm());
    expect(res.status).toBe(502);
    expect(await body(res)).toMatchObject({ success: false, error: 'network' });
  });
});

describe('guards', () => {
  it.each([['https://evil.example'], [null], ['null'], [`${SITE}:8443`]])(
    'rejects Origin %s with 403',
    async (origin) => {
      h = harness();
      const res = await h.post(configuratorForm(REGAL), { origin });
      expect(res.status).toBe(403);
      expect(await body(res)).toMatchObject({ success: false, error: 'rejected' });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(h.count('faelle')).toBe(0);
    },
  );

  it.each([
    ['application/x-www-form-urlencoded', 'name=a&email=b%40c.de'],
    ['application/json', '{"name":"a"}'],
    ['text/plain', 'hello'],
  ])('rejects %s with 415', async (type, payload) => {
    h = harness();
    const res = await h.post(payload, { headers: { 'Content-Type': type } });
    expect(res.status).toBe(415);
    expect(await body(res)).toMatchObject({ success: false, error: 'rejected' });
  });

  it('rejects an oversize body with 413 (streamed and by Content-Length)', async () => {
    h = harness({ bodyLimit: 4096 });
    const big = configuratorForm(REGAL, { files: [{ name: 'fotos[]', file: jpeg('a.jpg', 8000) }] });
    const res = await h.post(big);
    expect(res.status).toBe(413);
    const res2 = await h.post('x', {
      headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(10 ** 9) },
    });
    expect(res2.status).toBe(413);
    expect(h.count('faelle')).toBe(0);
  });

  it('rejects a photo over 10 MB with 413 and more than 6 photos with 422', async () => {
    h = harness();
    const one = await h.post(
      configuratorForm(REGAL, { files: [{ name: 'fotos[]', file: jpeg('a.jpg', 10 * 1024 * 1024 + 1) }] }),
    );
    expect(one.status).toBe(413);
    const files = Array.from({ length: 7 }, (_, i) => ({ name: 'fotos[]', file: jpeg(`f${i}.jpg`) }));
    const seven = await h.post(configuratorForm(REGAL, { files }));
    expect(seven.status).toBe(422);
    expect(h.count('faelle')).toBe(0);
  });

  it('drops a file whose bytes are not an allowed image, and says so in the mail', async () => {
    h = harness();
    const res = await h.post(
      configuratorForm(REGAL, {
        files: [
          { name: 'fotos[]', file: exe() },
          { name: 'fotos[]', file: jpeg() },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const mail = h.ctl.sent[0]!;
    expect(mail.text).toContain('1 Datei(en) mit nicht erlaubtem Dateityp');
    expect(mail.attachments?.map((a) => a.filename)).toEqual(['Küche_Foto.jpg']);
  });

  it('fakes success for a filled honeypot: nothing stored, nothing mailed, one log line', async () => {
    h = harness();
    const res = await h.post(configuratorForm(REGAL, { extra: { homepage: 'https://spam.example' } }));
    expect(await body(res)).toEqual({ success: true });
    expect(h.count('faelle')).toBe(0);
    expect(h.outbox()).toHaveLength(0);
    const lines = h.logs.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: 'anfrage', code: 'honeypot' });
    expect(h.logs[0]).not.toContain('spam.example');
  });

  it('answers the CORS preflight for the site only', async () => {
    h = harness();
    const ok = await h.app.request('/anfrage', { method: 'OPTIONS', headers: { Origin: SITE } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE);
    const bad = await h.app.request('/anfrage', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(bad.status).toBe(403);
  });

  it('serves /health as 204 without no-store, and 404 elsewhere', async () => {
    h = harness();
    const res = await h.app.request('/health');
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await h.app.request('/gibt-es-nicht')).status).toBe(404);
  });
});

describe('validation (reason keys, no echo)', () => {
  const reject = async (h_: Harness, fd: FormData, code: string) => {
    const before = h_.count('faelle');
    const res = await h_.post(fd);
    expect(res.status).toBe(422);
    const b = await body(res);
    expect(b.success).toBe(false);
    expect(b.error).toBe('rejected');
    const last = JSON.parse(h_.logs.at(-1)!) as { code: string };
    expect(last.code).toBe(code);
    expect(h_.count('faelle')).toBe(before);
    return b;
  };

  it('rejects an unknown field without echoing its name or value', async () => {
    h = harness();
    const b = await reject(h, configuratorForm(REGAL, { extra: { 'evil_<b>': 'x<script>' } }), 'unknown_field');
    expect(b.error_msg).not.toContain('evil');
    expect(b.error_msg).not.toContain('script');
  });

  it('rejects an enum value outside the list', async () => {
    h = harness();
    const b = await reject(h, configuratorForm({ ...REGAL, moebel_holz: 'plastik' }), 'bad_value');
    expect(b.error_msg).not.toContain('plastik');
  });

  it('rejects a number outside the per-type range (Regal breite ≤ 300 cm)', async () => {
    h = harness();
    await reject(h, configuratorForm({ ...REGAL, moebel_breite: '350' }), 'out_of_range');
  });

  it('rejects a non-number', async () => {
    h = harness();
    await reject(h, configuratorForm({ ...BODEN, boden_flaeche: '24 Quadratmeter' }), 'bad_format');
  });

  it('rejects a missing visible required field (js-required moebel_art)', async () => {
    h = harness();
    const { moebel_art: _drop, ...rest } = REGAL;
    await reject(h, configuratorForm(rest), 'missing_required');
  });

  it('rejects a missing html-required field (plz) and bad PLZ/Tel/E-Mail patterns', async () => {
    h = harness();
    const { plz: _p, ...rest } = BODEN;
    await reject(h, configuratorForm(rest), 'missing_required');
    await reject(h, configuratorForm({ ...BODEN, plz: '6816' }), 'bad_pattern');
    await reject(h, configuratorForm({ ...BODEN, telefon: 'call me' }), 'bad_pattern');
    await reject(h, configuratorForm({ ...BODEN, email: 'max(at)example.com' }), 'bad_pattern');
  });

  it('rejects too-short and too-long free text', async () => {
    h = harness();
    await reject(h, configuratorForm({ ...SONSTIGES, sonstiges_beschreibung: 'kurz' }), 'too_short');
    await reject(h, configuratorForm({ ...SONSTIGES, nachricht: 'x'.repeat(2001) }), 'too_long');
  });

  it('accepts a hidden required field left empty and drops hidden junk', async () => {
    h = harness();
    // Boden: moebel_art and bett_liegeflaeche are required only in the Möbel branch; a stale Möbel
    // value (even an invalid one) from the no-JS form is dropped, not validated.
    const id = newId();
    const res = await h.post(configuratorForm({ ...BODEN, moebel_holz: 'plastik', tisch_laenge: '9999' }, { id }));
    expect(res.status).toBe(200);
    const fall = await h.deps.store.getByAnfrageId(id);
    expect(fall?.payload.values['moebel_holz']).toBeUndefined();
    expect(fall?.payload.values['tisch_laenge']).toBeUndefined();
    expect(fall?.payload.values['boden_flaeche']).toBe('24,5');
  });

  it('drops a stale option of another moebel_art (effectiveValues), as the client does', async () => {
    h = harness();
    const id = newId();
    // moebel_staerke 40 exists only for the Regal; a Sideboard falls back to the default.
    const v = {
      ...REGAL,
      moebel_art: 'sideboard',
      moebel_breite: '180',
      moebel_hoehe: '80',
      moebel_tiefe: '45',
      moebel_staerke: '40',
    };
    const res = await h.post(configuratorForm(v, { id }));
    expect(res.status).toBe(200);
    expect((await h.deps.store.getByAnfrageId(id))?.payload.values['moebel_staerke']).toBeUndefined();
  });

  it('checks checkbox groups (multi values) and repeated single fields', async () => {
    h = harness();
    const fenster = {
      typ: 'fenster',
      fenster_leistung: ['neu', 'rolllaeden'],
      fenster_anzahl: '3',
      plz: '68161',
      name: 'A B',
      email: 'a@example.com',
    };
    expect((await h.post(configuratorForm(fenster))).status).toBe(200);
    await reject(h, configuratorForm({ ...fenster, fenster_leistung: ['neu', 'dach'] }), 'bad_value');
    const twice = configuratorForm(BODEN);
    twice.append('plz', '68159');
    await reject(h, twice, 'duplicate_field');
  });

  it('rejects a mismatching or broken anfrage_json', async () => {
    h = harness();
    await reject(h, configuratorForm(REGAL, { extra: { anfrage_json: '{nope' } }), 'bad_json');
    await reject(h, configuratorForm(REGAL, { extra: { anfrage_id: 'abc def ghi' } }), 'bad_id');
  });
});

describe('idempotency', () => {
  it('a repeated anfrage_id creates one case and one mail', async () => {
    h = harness();
    const id = newId();
    const a = await h.post(configuratorForm(REGAL, { id }));
    const b = await h.post(configuratorForm(REGAL, { id }));
    expect(await body(a)).toEqual({ success: true });
    expect(await body(b)).toEqual({ success: true });
    expect(h.count('faelle')).toBe(1);
    expect(h.outbox()).toHaveLength(1);
    const fall = await h.deps.store.getByAnfrageId(id);
    expect((await h.deps.store.events(fall!.id)).map((e) => e.kind)).toContain('duplicate');
  });

  it('a retry after a failed mail sends the owed mail with its attachments, once', async () => {
    h = harness();
    const id = newId();
    h.ctl.fail = 1;
    const a = await h.post(configuratorForm(REGAL, { id, files: [{ name: 'fotos[]', file: jpeg() }] }));
    expect(await body(a)).toEqual({ success: true }); // stored + retrying job → success
    expect(h.outbox()).toHaveLength(0);
    const fall = await h.deps.store.getByAnfrageId(id);
    expect(await h.deps.store.job(fall!.id, 'anfrage_mail')).toMatchObject({ status: 'pending', attempts: 1 });

    const b = await h.post(configuratorForm(REGAL, { id, files: [{ name: 'fotos[]', file: jpeg() }] }));
    expect(await body(b)).toEqual({ success: true });
    expect(h.outbox()).toHaveLength(1);
    expect(h.ctl.sent[0]?.attachments?.map((x) => x.filename)).toEqual(['Küche_Foto.jpg']);
    expect((await h.deps.store.job(fall!.id, 'anfrage_mail'))?.status).toBe('done');

    // The retry job finds the mail delivered and sends nothing more.
    h.clock.advance(60_000);
    await h.deps.runner.runDue();
    expect(h.outbox()).toHaveLength(1);
    expect(h.count('faelle')).toBe(1);
  });
});

describe('delivery first', () => {
  it('still mails the owner when the store fails, and answers success', async () => {
    h = harness();
    const create = vi
      .spyOn(h.deps.store, 'create')
      .mockRejectedValue(Object.assign(new Error('disk full'), { code: 'SQLITE_FULL' }));
    const res = await h.post(configuratorForm(REGAL, { files: [{ name: 'fotos[]', file: jpeg() }] }));
    expect(create).toHaveBeenCalledOnce();
    expect(await body(res)).toEqual({ success: true });
    expect(h.outbox()).toHaveLength(1);
    expect(h.ctl.sent[0]?.attachments).toHaveLength(1);
  });

  it('answers 500 (network, so the client retries) when the store and the mail both fail', async () => {
    h = harness();
    vi.spyOn(h.deps.store, 'create').mockRejectedValue(new Error('disk full'));
    h.ctl.fail = 1;
    const res = await h.post(configuratorForm(REGAL));
    expect(res.status).toBe(500);
    expect(await body(res)).toMatchObject({ success: false, error: 'network' });
  });
});
