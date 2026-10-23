// Owner review routes (docs/angebot.md §2.1, §7.3, §7.4):
//   GET  /angebot/assets/review.css   the page's stylesheet
//   GET  /angebot/:id?t=…             review page (never changes state)
//   GET  /angebot/:id/vorschau.pdf?t=… PDF preview („Vorschau“ watermark; optional edited values)
//   POST /angebot/:id/pin             PIN → session cookie (only with OWNER_PIN)
//   POST /angebot/:id/freigeben       status bewertet: confirm step, then the Angebot to the customer
//   POST /angebot/:id/manuell         status manuell / bewertung_fehlgeschlagen: own range, same path
//   POST /angebot/:id/ablehnen        status bewertet / bewertung_fehlgeschlagen: manuell | kontakt | absage
//
// Every POST: Origin = PUBLIC_BASE_URL's origin (403; `Origin: null` only with Sec-Fetch-Site
// same-origin), application/x-www-form-urlencoded (415), body ≤ 64 KB (413), then the token from the
// body (404 wrong, 410 expired or abgelaufen), the PIN session when OWNER_PIN is set (401 PIN page),
// the status (409) and the per-case version (409, the current state, nothing sent).
//
// Never twice: before a customer mail goes out the case is claimed with a version-pinned write of
// `sperre` (a second click or a concurrent request with the same version fails that write and gets
// the current state). After the send, the status change carries the decision and clears `sperre`;
// a failed send clears it and nothing changes. A crash between send and status change leaves
// `sperre` set, and the page warns before anything is sent again.
//
// Referrer-Policy: the review responses use `same-origin`, not `no-referrer`. With `no-referrer`
// browsers send `Origin: null` on form POSTs (Fetch standard), which would defeat the Origin check;
// `same-origin` still never sends the tokened URL to another origin (and the page loads nothing
// from elsewhere).
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import type { AppDeps } from '../app';
import { fallDaten, vorbelegteAnnahmen } from '../fall-daten';
import { berlinJahr } from '../format';
import { errorCode } from '../log';
import { absageMail, angebotMail, erlaubteKontaktangaben, rueckfragenMail, type KundenmailArt } from '../mail/kunde';
import type { OutgoingMail } from '../mail/index';
import { angebotPdf } from '../pdf/index';
import { RateLimiter } from '../ratelimit';
import type { Fall, FallPatch, Status } from '../store';
import { PDF } from '../texte/kunde';
import { PIN, SEITE } from '../texte/inhaber';
import { SESSION_COOKIE, neueSitzung, pinPasst, sitzungGueltig, sitzungsCookie, tokenPasst } from '../token';
import { REVIEW_CSS } from './css';
import type { Aktion, Entscheidung, GesendeteMail } from './entscheidung';
import { eingabeAus, pruefeAblehnung, pruefeAngebot, type AngebotEingabe, type Eingabe } from './formular';
import {
  CSS_PATH,
  bestaetigenSeite,
  fallSeite,
  fehlerSeite,
  pinSeite,
  seitenLink,
  weiterSeite,
  type FallSeiteOptionen,
  type Kontext,
  type MailVorschau,
} from './seiten';

/** CSP of the review HTML (§7.3). */
export const REVIEW_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
/** The PDF gets no `default-src 'none'`: some built-in PDF viewers run inside the response's CSP. */
export const PDF_CSP = "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
export const ACTION_BODY_LIMIT = 64 * 1024;
export const PIN_LIMIT = { limit: 5, windowMs: 15 * 60_000 } as const;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = 86_400_000;

type Status4xx = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429 | 500 | 502;

export function reviewRoutes(app: Hono, d: AppDeps, clientIp: (c: Context) => string): void {
  const { config, store, clock, log, mailer } = d;
  const pinLimiter = new RateLimiter(clock, PIN_LIMIT);

  const antwort = (c: Context, status: Status4xx | 200, body: string, code: string, fall?: string): Response => {
    log.info('angebot', { route: c.req.routePath, method: c.req.method, status, code, ...(fall ? { fall } : {}) });
    return c.html(body, status);
  };
  const fehler = (c: Context, status: 403 | 404 | 410 | 413 | 415 | 429 | 500, code: string): Response =>
    antwort(c, status, fehlerSeite(status), code);

  app.use('/angebot/*', async (c, next) => {
    await next();
    const h = c.res.headers;
    if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', REVIEW_CSP);
    h.set('X-Robots-Tag', 'noindex, nofollow');
    h.set('Referrer-Policy', 'same-origin');
    h.set('Cache-Control', 'no-store');
  });

  app.get(CSS_PATH, (c) => c.body(REVIEW_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' }));

  // --- access -------------------------------------------------------------------------------
  type Zugang = { ok: true; fall: Fall; token: string } | { ok: false; res: Response };
  const zugang = async (c: Context, token: string | null | undefined): Promise<Zugang> => {
    const id = c.req.param('id') ?? '';
    if (!ID.test(id)) return { ok: false, res: fehler(c, 404, 'bad_id') };
    const fall = await store.get(id);
    if (!fall || !tokenPasst(fall.tokenHash, token)) return { ok: false, res: fehler(c, 404, 'bad_token') };
    if (fall.status === 'abgelaufen' || fall.tokenExpiresAt === null || fall.tokenExpiresAt <= clock.now()) {
      return { ok: false, res: fehler(c, 410, 'expired') };
    }
    return { ok: true, fall, token: token! };
  };
  const sitzungOk = (c: Context): boolean =>
    !config.ownerPin ||
    (!!config.sessionSecret && sitzungGueltig(config.sessionSecret, getCookie(c, SESSION_COOKIE), clock.now()));
  const kontext = (fall: Fall, token: string): Kontext => ({ fall, token, modus: mailer.mode, now: clock.now() });

  // --- POST guards ----------------------------------------------------------------------------
  const origin: MiddlewareHandler = async (c, next) => {
    const o = c.req.header('origin');
    const sameOrigin = o === 'null' && c.req.header('sec-fetch-site') === 'same-origin';
    if (o !== config.publicBaseUrl && !sameOrigin) return fehler(c, 403, 'origin');
    return next();
  };
  const formType: MiddlewareHandler = async (c, next) => {
    if (!/^application\/x-www-form-urlencoded\s*(?:;|$)/i.test(c.req.header('content-type') ?? '')) {
      return fehler(c, 415, 'content_type');
    }
    return next();
  };
  const size = bodyLimit({ maxSize: ACTION_BODY_LIMIT, onError: (c) => fehler(c, 413, 'body_too_large') });
  const formular = async (c: Context): Promise<URLSearchParams> => new URLSearchParams(await c.req.text());

  // --- GET --------------------------------------------------------------------------------------
  app.get('/angebot/:id', async (c) => {
    const z = await zugang(c, c.req.query('t'));
    if (!z.ok) return z.res;
    if (!sitzungOk(c)) {
      // A link from a mail is a cross-site navigation, so the SameSite=Strict cookie is missing;
      // one same-site hop (meta refresh, no JS) brings it along. Without a cookie: the PIN form.
      if (c.req.query('r') === '1') return antwort(c, 200, pinSeite(z.fall.id, z.token, null), 'pin', z.fall.id);
      return antwort(c, 200, weiterSeite(`${seitenLink(z.fall.id, z.token)}&r=1`), 'pin_hop', z.fall.id);
    }
    return antwort(c, 200, fallSeite(kontext(z.fall, z.token)), 'ok', z.fall.id);
  });

  app.get('/angebot/:id/vorschau.pdf', async (c) => {
    const z = await zugang(c, c.req.query('t'));
    if (!z.ok) return z.res;
    if (!sitzungOk(c)) return antwort(c, 401, pinSeite(z.fall.id, z.token, null), 'pin', z.fall.id);
    const fall = z.fall;
    if (fall.bereinigtAt !== null) return fehler(c, 410, 'bereinigt');
    const daten = fallDaten(fall);
    let text = daten.text;
    let min = fall.preisMin;
    let max = fall.preisMax;
    let annahmen = vorbelegteAnnahmen(fall);
    const q = new URL(c.req.url).searchParams;
    if (q.has('einleitung') || q.has('min')) {
      const r = pruefeAngebot(eingabeAus(q), erlaubteKontaktangaben(config));
      if (r.ok) ({ text, min, max, annahmen } = r.wert);
    }
    try {
      const pdf = await angebotPdf(config, {
        fall,
        text,
        annahmen,
        min,
        max,
        nummer: null,
        datum: clock.now(),
        vorschau: true,
      });
      log.info('angebot', { route: c.req.routePath, method: 'GET', status: 200, code: 'pdf', fall: fall.id });
      return c.body(new Uint8Array(pdf), 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Vorschau-${PDF.dateiname(fall.kurz)}"`,
        'Content-Security-Policy': PDF_CSP,
      });
    } catch (e) {
      log.error('pdf_failed', { fall: fall.id, code: errorCode(e) });
      return fehler(c, 500, 'pdf_failed');
    }
  });

  // --- PIN --------------------------------------------------------------------------------------
  app.post('/angebot/:id/pin', origin, formType, size, async (c) => {
    const p = await formular(c);
    const z = await zugang(c, p.get('t'));
    if (!z.ok) return z.res;
    if (!config.ownerPin || !config.sessionSecret) return fehler(c, 404, 'no_pin');
    if (!pinLimiter.hit(`${z.fall.id}|${clientIp(c)}`)) {
      return antwort(c, 429, pinSeite(z.fall.id, z.token, PIN.gesperrt), 'pin_rate_limited', z.fall.id);
    }
    if (!pinPasst(config.ownerPin, p.get('pin') ?? '')) {
      return antwort(c, 401, pinSeite(z.fall.id, z.token, PIN.falsch), 'pin_wrong', z.fall.id);
    }
    log.info('angebot', { route: c.req.routePath, method: 'POST', status: 303, code: 'pin_ok', fall: z.fall.id });
    c.header('Set-Cookie', sitzungsCookie(neueSitzung(config.sessionSecret, clock.now())));
    return c.redirect(seitenLink(z.fall.id, z.token), 303);
  });

  // --- actions ----------------------------------------------------------------------------------
  interface Aufruf {
    c: Context;
    fall: Fall;
    token: string;
    p: URLSearchParams;
    e: Eingabe;
    schritt: string;
  }

  /** Token, session, status and version; null: proceed. */
  const vorpruefung = async (
    c: Context,
    erlaubt: readonly Status[],
  ): Promise<{ ok: true; a: Aufruf } | { ok: false; res: Response }> => {
    const p = await formular(c);
    const z = await zugang(c, p.get('t'));
    if (!z.ok) return z;
    const { fall, token } = z;
    if (!sitzungOk(c)) return { ok: false, res: antwort(c, 401, pinSeite(fall.id, token, null), 'pin', fall.id) };
    const version = Number(p.get('v'));
    const seite = (text: string) => fallSeite(kontext(fall, token), { hinweis: { text, art: 'warn' } });
    if (version !== fall.version) return { ok: false, res: antwort(c, 409, seite(SEITE.veraltet), 'stale', fall.id) };
    if (!erlaubt.includes(fall.status)) {
      return { ok: false, res: antwort(c, 409, seite(SEITE.nichtErlaubt), 'illegal', fall.id) };
    }
    return { ok: true, a: { c, fall, token, p, e: eingabeAus(p), schritt: p.get('schritt') ?? 'pruefen' } };
  };

  const seite = (a: Aufruf, fall: Fall, o: FallSeiteOptionen) => fallSeite(kontext(fall, a.token), o);

  /** What the customer would get: the redirect is visible on the confirm page. */
  const vorschau = (m: OutgoingMail, art: MailVorschau['art'], anhang: string | null): MailVorschau => ({
    art,
    an: m.to,
    betreff: m.subject,
    text: m.text,
    anhang,
    umgeleitet: mailer.mode === 'allowlist' && !config.sendAllowlist.includes(m.to.trim().toLowerCase()),
  });

  /**
   * Status change after a sent mail (or for a decision without mail). Retries a stale version as
   * long as the case is still ours (same status, our `sperre`), e.g. after a reminder's write.
   */
  const abschliessen = async (fall: Fall, to: Status, patch: FallPatch, sperreAt: number | null): Promise<Fall> => {
    let cur = fall;
    for (let i = 0; i < 4; i++) {
      const r = await store.transition(cur.id, cur.status, to, cur.version, clock.now(), patch);
      if (r.ok) return r.fall;
      const neu = r.fall;
      const unsere =
        neu &&
        neu.status === fall.status &&
        sperreAt !== null &&
        (neu.sperre as { at?: unknown } | null)?.at === sperreAt;
      if (r.reason !== 'stale' || !unsere) {
        log.error('bookkeeping_failed', { fall: fall.id, code: `transition_${r.reason}` });
        return neu ?? cur;
      }
      cur = neu;
    }
    return cur;
  };

  /**
   * Claim (version-pinned `sperre`), build and send the customer mail, then the status change.
   * `bauen` may assign the Angebotsnummer and render the PDF; it runs after the claim.
   */
  const senden = async (
    a: Aufruf,
    art: Aktion,
    to: Status,
    bauen: (fall: Fall) => Promise<{
      mail: OutgoingMail;
      mailArt: KundenmailArt;
      anhang: string | null;
      extra: Partial<Entscheidung>;
    }>,
    nochmal: (fall: Fall, hinweis: string) => string,
    patch: FallPatch = {},
  ): Promise<Response> => {
    const { c } = a;
    const at = clock.now();
    const claimed = await store.update(a.fall.id, { sperre: { art, at } }, a.fall.version);
    if (!claimed) {
      const cur = (await store.get(a.fall.id)) ?? a.fall;
      return antwort(c, 409, seite(a, cur, { hinweis: { text: SEITE.veraltet, art: 'warn' } }), 'stale', a.fall.id);
    }
    // The link may have expired between the access check and the claim: release, send nothing.
    if (claimed.tokenExpiresAt === null || claimed.tokenExpiresAt <= clock.now()) {
      await store.update(a.fall.id, { sperre: null });
      return fehler(c, 410, 'expired_at_claim');
    }
    let gebaut: Awaited<ReturnType<typeof bauen>>;
    let sent;
    try {
      gebaut = await bauen(claimed);
      sent = await mailer.send(gebaut.mail);
    } catch (e) {
      log.warn('mail_failed', { fall: a.fall.id, kind: 'customer', mode: mailer.mode, code: errorCode(e) });
      const back = (await store.update(a.fall.id, { sperre: null })) ?? claimed;
      return antwort(c, 502, nochmal(back, SEITE.sendenFehlgeschlagen), 'mail_failed', a.fall.id);
    }
    log.info('mail_sent', {
      fall: a.fall.id,
      kind: 'customer',
      mode: mailer.mode,
      redirected: sent.redirected,
      code: art,
    });
    const mail: GesendeteMail = {
      art: gebaut.mailArt,
      an: gebaut.mail.to,
      betreff: gebaut.mail.subject,
      text: gebaut.mail.text,
      at: clock.now(),
      umgeleitet: sent.redirected,
      anhang: gebaut.anhang,
    };
    const entscheidung: Entscheidung = { v: 1, aktion: art, at, ...gebaut.extra, mail };
    let fall = claimed;
    try {
      fall = await abschliessen(claimed, to, { ...patch, sperre: null, entscheidung }, at);
      await store.event(a.fall.id, `entscheidung_${art}`, sent.redirected ? 'umgeleitet' : null, clock.now());
    } catch (e) {
      log.error('bookkeeping_failed', { fall: a.fall.id, code: errorCode(e) });
    }
    return antwort(c, 200, seite(a, fall, { ergebnis: entscheidung }), `sent_${art}`, a.fall.id);
  };

  /** A decision without a mail (manuell, „Ich rufe selbst an“). */
  const entscheiden = async (
    a: Aufruf,
    art: Aktion,
    to: Status,
    extra: Partial<Entscheidung>,
    patch: FallPatch = {},
  ) => {
    const entscheidung: Entscheidung = { v: 1, aktion: art, at: clock.now(), ...extra };
    const r = await store.transition(a.fall.id, a.fall.status, to, a.fall.version, clock.now(), {
      ...patch,
      sperre: null,
      entscheidung,
    });
    if (!r.ok) {
      const cur = r.fall ?? a.fall;
      return antwort(a.c, 409, seite(a, cur, { hinweis: { text: SEITE.veraltet, art: 'warn' } }), 'stale', a.fall.id);
    }
    await store.event(a.fall.id, `entscheidung_${art}`, null, clock.now());
    return antwort(a.c, 200, seite(a, r.fall, { ergebnis: entscheidung }), `decided_${art}`, a.fall.id);
  };

  const angebotFelder = (w: AngebotEingabe): Record<string, string> => ({
    min: String(w.min),
    max: String(w.max),
    einleitung: w.text.einleitung,
    leistung: w.text.leistung.join('\n'),
    nicht_enthalten: w.text.nicht_enthalten.join('\n'),
    naechster_schritt: w.text.naechster_schritt,
    annahmen: w.annahmen.join('\n'),
  });

  /** Freigeben (bewertet) and the own range (manuell, bewertung_fehlgeschlagen): one path. */
  const angebotAktion = (aktion: 'freigeben' | 'manuell', erlaubt: readonly Status[]) => async (c: Context) => {
    const v = await vorpruefung(c, erlaubt);
    if (!v.ok) return v.res;
    const a = v.a;
    if (a.schritt === 'bearbeiten') {
      return antwort(c, 200, seite(a, a.fall, { formular: aktion, eingabe: a.e }), 'edit', a.fall.id);
    }
    const r = pruefeAngebot(a.e, erlaubteKontaktangaben(config));
    if (!r.ok) {
      return antwort(
        c,
        422,
        seite(a, a.fall, { formular: aktion, eingabe: a.e, fehler: r.fehler }),
        'invalid',
        a.fall.id,
      );
    }
    const w = r.wert;
    const anhang = PDF.dateiname(a.fall.kurz);
    const bestaetigen = (fall: Fall, hinweis?: string) =>
      bestaetigenSeite(
        kontext(fall, a.token),
        aktion,
        vorschau(angebotMail(config, fall, w, null), 'angebot', anhang),
        angebotFelder(w),
        {
          pdf: true,
          ...(hinweis ? { hinweis: { text: hinweis, art: 'warn' as const } } : {}),
        },
      );
    if (a.schritt !== 'senden') return antwort(c, 200, bestaetigen(a.fall), 'confirm', a.fall.id);
    const art: Aktion = aktion === 'freigeben' ? 'freigeben' : 'eigener_preis';
    return senden(
      a,
      art,
      'gesendet',
      async (fall) => {
        const now = clock.now();
        const nummer = await store.angebotsnummer(fall.id, berlinJahr(now));
        const pdf = await angebotPdf(config, {
          fall,
          text: w.text,
          annahmen: w.annahmen,
          min: w.min,
          max: w.max,
          nummer,
          datum: now,
          vorschau: false,
        });
        return {
          mail: angebotMail(config, fall, w, pdf),
          mailArt: 'angebot',
          anhang,
          extra: { preis: { min: w.min, max: w.max }, angebotsnummer: nummer, text: w.text, annahmen: w.annahmen },
        };
      },
      (fall, hinweis) => bestaetigen(fall, hinweis),
      { preisMin: w.min, preisMax: w.max },
    );
  };

  app.post('/angebot/:id/freigeben', origin, formType, size, angebotAktion('freigeben', ['bewertet']));
  app.post(
    '/angebot/:id/manuell',
    origin,
    formType,
    size,
    angebotAktion('manuell', ['manuell', 'bewertung_fehlgeschlagen']),
  );

  app.post('/angebot/:id/ablehnen', origin, formType, size, async (c) => {
    const v = await vorpruefung(c, ['bewertet', 'bewertung_fehlgeschlagen']);
    if (!v.ok) return v.res;
    const a = v.a;
    if (a.schritt === 'bearbeiten') {
      return antwort(c, 200, seite(a, a.fall, { formular: 'ablehnen', eingabe: a.e }), 'edit', a.fall.id);
    }
    const r = pruefeAblehnung(a.e, erlaubteKontaktangaben(config));
    if (!r.ok) {
      return antwort(
        c,
        422,
        seite(a, a.fall, { formular: 'ablehnen', eingabe: a.e, fehler: r.fehler }),
        'invalid',
        a.fall.id,
      );
    }
    const w = r.wert;
    if (w.folge === 'manuell') {
      // The owner calculates himself: the link stays usable for another TOKEN_TTL_DAYS from now.
      const verlaengert = Math.max(a.fall.tokenExpiresAt ?? 0, clock.now() + config.tokenTtlDays * DAY);
      return entscheiden(a, 'manuell', 'manuell', {}, { tokenExpiresAt: verlaengert });
    }
    if (w.folge === 'kontakt' && w.art === 'anruf')
      return entscheiden(a, 'kontakt', 'kontakt', { kontaktArt: 'anruf' });

    const mailFuer = (fall: Fall): OutgoingMail =>
      w.folge === 'kontakt' ? rueckfragenMail(config, fall, w.fragen) : absageMail(config, fall, w.persoenlich);
    const felder: Record<string, string> =
      w.folge === 'kontakt'
        ? { folge: 'kontakt', kontakt_art: 'mail', rueckfragen: w.fragen.join('\n') }
        : { folge: 'absage', grund: w.grund, persoenlich: w.persoenlich ?? '' };
    const art = w.folge === 'kontakt' ? 'rueckfragen' : 'absage';
    const bestaetigen = (fall: Fall, hinweis?: string) =>
      bestaetigenSeite(kontext(fall, a.token), 'ablehnen', vorschau(mailFuer(fall), art, null), felder, {
        ...(hinweis ? { hinweis: { text: hinweis, art: 'warn' as const } } : {}),
      });
    if (a.schritt !== 'senden') return antwort(c, 200, bestaetigen(a.fall), 'confirm', a.fall.id);
    if (w.folge === 'kontakt') {
      return senden(
        a,
        'kontakt',
        'kontakt',
        async (fall) => ({ mail: mailFuer(fall), mailArt: 'rueckfragen', anhang: null, extra: { kontaktArt: 'mail' } }),
        bestaetigen,
      );
    }
    return senden(
      a,
      'absage',
      'abgesagt',
      async (fall) => ({ mail: mailFuer(fall), mailArt: 'absage', anhang: null, extra: { grund: w.grund } }),
      bestaetigen,
    );
  });
}
