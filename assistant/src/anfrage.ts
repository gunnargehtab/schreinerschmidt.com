// POST /anfrage (docs/angebot.md §2.1, docs/assistant.md §2.2 and §8): form.taxi-compatible.
// Guards, in order: Origin = SITE_ORIGIN (403), multipart/form-data (415), rate limit (429), body
// limit (413); then the honeypot (fake success, nothing stored or mailed) and validation (422).
//
// Configurator posts (`typ` or `anfrage_json` present) follow the fixed order of §0 "delivery
// first": validate → store the case (status `eingegangen`; the values, the kept anfrage_json, no
// attachments) together with its jobs → send the enquiry mail inline → respond → run the jobs.
// If the inline mail fails, the response is still a success: the case is stored and its
// `anfrage_mail` job retries the mail (+30 s … +6 h, MAIL_BACKOFF_MS) from the stored payload. A repeated
// `anfrage_id` (the client retries once with the same id) never creates a second case or mail; if
// the first mail has not gone out yet, the retry's attachments are used to send it now. If the
// store itself fails, the mail is still sent (success without a case), and only when that fails
// too does the client get a 5xx.
//
// Contact and application posts (no `typ`, no `anfrage_json`) get the mail only, no case; as
// nothing is stored, a failed mail answers 502 so the client retries or shows its fallback.
//
// Responses: `Accept: application/json` → `{success: true}` / `{success: false, error, error_msg}`
// with `error` one of the site's reason keys (`rejected` for 4xx, `network` for 5xx; submit.ts
// reasonOf()) and an English `error_msg` that never echoes input. Otherwise `303` to `_next` when
// it is on SITE_ORIGIN (else SITE_ORIGIN + SITE_BASE), or a small German error page.
import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import type { AppDeps } from './app';
import { readAttachments, type Attachment } from './attachments';
import { errorCode, type LogFields } from './log';
import { configuratorMail, contactMail, enquirySubject } from './mail/enquiry';
import { bodyText } from './sanitize';
import { ANFRAGE_MAIL, sendEnquiryInline } from './steps/anfrage-mail';
import type { Fall } from './store';
import { serverSummary } from './summary';
import type { Payload } from './types';
import {
  CONFIGURATOR_FILES,
  CONTACT_FILES,
  HONEYPOT,
  REASON_MSG,
  isConfiguratorPost,
  parseAnfrage,
  shortId,
  validateConfigurator,
  validateContact,
  type Invalid,
  type TextFields,
} from './validate';

/** The site's reason keys (StepPruefen.astro `[data-reason]`, submit.ts reasonOf()). */
export type SiteReason = 'rejected' | 'network';

/** The inline enquiry mail may take this long before the response goes out (client timeout: 20 s). */
export const INLINE_MAIL_MS = 12_000;

const ERROR_MSG = {
  origin: 'Origin not allowed.',
  content_type: 'Only multipart/form-data is accepted.',
  body_too_large: 'The request is too large.',
  file_too_large: 'A file is too large.',
  too_many_files: 'Too many files.',
  rate_limited: 'Too many requests. Please try again later.',
  bad_body: 'The request body could not be read.',
  mail_failed: 'The message could not be delivered. Please try again.',
  internal: 'Internal error.',
} as const;

const wantsJson = (c: Context): boolean => (c.req.header('accept') ?? '').toLowerCase().includes('application/json');

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** `_next` when it is an http(s) URL on SITE_ORIGIN; otherwise the site's base URL (no open redirect). */
export function resolveNext(next: string | undefined, siteOrigin: string, siteBase: string): string {
  const fallback = `${siteOrigin}${siteBase}`;
  if (!next) return fallback;
  try {
    const u = new URL(next);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === siteOrigin && !u.username && !u.password
      ? u.href
      : fallback;
  } catch {
    return fallback;
  }
}

/** A config link for the owner's mail, only when it points at the site. */
const onSite = (url: string | undefined, siteOrigin: string): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.origin === siteOrigin ? u.href : null;
  } catch {
    return null;
  }
};

/** Allowed-origin CORS headers: the site reads the JSON answer of a cross-origin fetch. */
export function cors(c: Context, siteOrigin: string): void {
  c.header('Access-Control-Allow-Origin', siteOrigin);
  c.header('Vary', 'Origin');
}

/**
 * The no-JS error page. German copy, `needs-review` (copywriter, 7e): it names no contact facts on
 * purpose; the site's own pages carry them.
 */
function errorPage(home: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Anfrage nicht gesendet</title>
</head>
<body>
<main>
<h1>Ihre Anfrage konnte nicht gesendet werden</h1>
<p>Bitte gehen Sie zurück und versuchen Sie es erneut.</p>
<p><a href="${escapeHtml(home)}">Zur Website</a></p>
</main>
</body>
</html>
`;
}

export function createResponder(c: Context, d: AppDeps) {
  const t0 = d.clock.now();
  const home = `${d.config.siteOrigin}${d.config.siteBase}`;
  const log = (status: number, code: string, extra: LogFields = {}) =>
    d.log.info('anfrage', { route: '/anfrage', status, code, ms: d.clock.now() - t0, ...extra });
  return {
    success(next: string | undefined, code: string, extra: LogFields = {}): Response {
      log(wantsJson(c) ? 200 : 303, code, extra);
      if (wantsJson(c)) return c.json({ success: true }, 200);
      return c.redirect(resolveNext(next, d.config.siteOrigin, d.config.siteBase), 303);
    },
    failure(
      status: 400 | 403 | 413 | 415 | 422 | 429 | 500 | 502,
      code: string,
      message: string,
      extra: LogFields = {},
    ): Response {
      log(status, code, extra);
      const error: SiteReason = status >= 500 ? 'network' : 'rejected';
      if (wantsJson(c)) return c.json({ success: false, error, error_msg: message }, status);
      return c.html(errorPage(home), status);
    },
  };
}

type Responder = ReturnType<typeof createResponder>;

const invalidResponse = (r: Responder, e: Invalid): Response =>
  r.failure(422, e.code, e.field ? `${REASON_MSG[e.code]} (${e.field})` : REASON_MSG[e.code]);

/** Splits a multipart body into text fields and files, in order. */
function split(fd: FormData): { fields: Map<string, string[]>; files: Map<string, File[]> } {
  const fields = new Map<string, string[]>();
  const files = new Map<string, File[]>();
  for (const [name, value] of fd.entries()) {
    if (typeof value === 'string') fields.set(name, [...(fields.get(name) ?? []), value]);
    else files.set(name, [...(files.get(name) ?? []), value]);
  }
  return { fields, files };
}

const first = (fields: TextFields, name: string): string | undefined => fields.get(name)?.[0];

/** The guarded handler (Origin + CORS, content type, rate limit and body limit ran as middleware, app.ts). */
export async function handleAnfrage(c: Context, d: AppDeps): Promise<Response> {
  const r = createResponder(c, d);
  let fd: FormData;
  try {
    fd = await c.req.raw.formData();
  } catch {
    return r.failure(400, 'bad_body', ERROR_MSG.bad_body);
  }
  const { fields, files } = split(fd);

  // Bots get a fake success: nothing is stored or mailed, one content-free log line.
  if ((first(fields, HONEYPOT) ?? '').trim() !== '') return r.success(first(fields, '_next'), 'honeypot');

  return isConfiguratorPost(fields) ? configurator(d, r, fields, files) : contact(d, r, fields, files);
}

async function configurator(
  d: AppDeps,
  r: Responder,
  fields: TextFields,
  files: ReadonlyMap<string, readonly File[]>,
): Promise<Response> {
  const v = validateConfigurator(fields);
  if (!v.ok) return invalidResponse(r, v);
  const { values, meta } = v.value;
  const a = parseAnfrage(meta);
  if (!a.ok) return invalidResponse(r, a);
  const att = await readAttachments(files, CONFIGURATOR_FILES);
  if (!att.ok) return attachmentFailure(r, att.code);

  // A post without JS has no anfrage_id (and so no idempotency): the server makes one.
  const anfrageId = a.value.id ?? randomUUID();
  const kurz = shortId(anfrageId) || '0000';
  const zusammenfassung = (meta['zusammenfassung'] ?? '').trim();
  const payload: Payload = {
    values,
    anfrage: a.value.json,
    zusammenfassung: zusammenfassung ? bodyText(zusammenfassung) : serverSummary(values),
    subject: enquirySubject(meta['_subject'], `Anfrage Konfigurator – #${kurz}`),
    // `email` is required and validated; `_replyto` (a copy of it) is never trusted.
    replyTo: typeof values['email'] === 'string' ? values['email'] : null,
    configUrl: onSite(a.value.json?.source?.configUrl, d.config.siteOrigin),
    anhaenge: att.attachments.map((x) => x.filename),
  };

  const now = d.clock.now();
  let created;
  try {
    created = await d.store.create(
      { anfrageId, kurz, payload },
      [{ step: ANFRAGE_MAIL, status: 'running', nextAt: now }, ...d.runner.firstJobs(now)],
      now,
    );
  } catch (e) {
    // Delivery first: without a case there is no pipeline, but the owner still gets the enquiry.
    d.log.error('store_failed', { kurz, code: errorCode(e) });
    try {
      await d.mailer.send(
        configuratorMail(d.config, payload, kurz, { attachments: att.attachments, dropped: att.dropped }),
      );
    } catch (e2) {
      d.log.warn('mail_failed', { kurz, kind: 'owner', code: errorCode(e2) });
      return r.failure(500, 'store_failed', ERROR_MSG.internal, { kurz });
    }
    return r.success(meta['_next'], 'ok_without_case', { kurz });
  }
  const fall = created.fall;
  if (!created.created) return duplicate(d, r, fall, meta['_next'], att.attachments, att.dropped);

  await note(d, fall.id, 'eingegangen', null);
  if (att.dropped) await note(d, fall.id, 'attachment_dropped', String(att.dropped));
  const sent = await deliver(d, fall, att.attachments, att.dropped);
  d.runner.kick();
  return r.success(meta['_next'], sent ? 'ok' : 'mail_deferred', { fall: fall.id, kurz });
}

/** A content-free event; never fails the request (the event log is not critical). */
async function note(d: AppDeps, fallId: string, kind: string, code: string | null): Promise<void> {
  try {
    await d.store.event(fallId, kind, code, d.clock.now());
  } catch (e) {
    d.log.warn('event_failed', { fall: fallId, code: errorCode(e) });
  }
}

/**
 * The inline enquiry mail, bounded so the response beats the client's 20 s timeout. A send that
 * outlives the deadline keeps running; when it settles (a late failure writes a retry), the runner
 * is kicked so the retry is scheduled without waiting for another request.
 */
async function deliver(d: AppDeps, fall: Fall, attachments: readonly Attachment[], dropped: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), d.inlineMailMs ?? INLINE_MAIL_MS);
    timer.unref();
  });
  const inflight = sendEnquiryInline(d, fall, attachments, dropped);
  void inflight.finally(() => d.runner.kick());
  try {
    return await Promise.race([inflight, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** A client retry with the same anfrage_id: no second case; send the mail now if it is still owed. */
async function duplicate(
  d: AppDeps,
  r: Responder,
  fall: Fall,
  next: string | undefined,
  attachments: readonly Attachment[],
  dropped: number,
): Promise<Response> {
  await note(d, fall.id, 'duplicate', null);
  if (!fall.messageId && (await d.store.claim(fall.id, ANFRAGE_MAIL, d.clock.now()))) {
    await deliver(d, fall, attachments, dropped);
  }
  d.runner.kick();
  return r.success(next, 'duplicate', { fall: fall.id, kurz: fall.kurz });
}

async function contact(
  d: AppDeps,
  r: Responder,
  fields: TextFields,
  files: ReadonlyMap<string, readonly File[]>,
): Promise<Response> {
  const v = validateContact(fields);
  if (!v.ok) return invalidResponse(r, v);
  const { values, meta } = v.value;
  const att = await readAttachments(files, CONTACT_FILES);
  if (!att.ok) return attachmentFailure(r, att.code);
  const subject = enquirySubject(meta['_subject'], 'Anfrage über die Website');
  const mail = contactMail(d.config, values, subject, values['email'] ?? null, {
    attachments: att.attachments,
    dropped: att.dropped,
  });
  try {
    await d.mailer.send(mail);
  } catch (e) {
    d.log.warn('mail_failed', { kind: 'owner', mode: d.mailer.mode, code: errorCode(e) });
    return r.failure(502, 'mail_failed', ERROR_MSG.mail_failed);
  }
  return r.success(meta['_next'], 'ok_contact', { kind: 'owner', mode: d.mailer.mode });
}

function attachmentFailure(r: Responder, code: 'file_too_large' | 'too_many_files' | 'unknown_field'): Response {
  if (code === 'unknown_field') return r.failure(422, code, REASON_MSG.unknown_field);
  return r.failure(code === 'file_too_large' ? 413 : 422, code, ERROR_MSG[code]);
}

export { ERROR_MSG };
