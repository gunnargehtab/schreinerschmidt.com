// The enquiry mail of a configurator case (docs/angebot.md §0 "delivery first"). POST /anfrage sends
// it inline with the attachments. When that fails, the case is already stored and this job retries
// it from the stored payload on its own, longer schedule (MAIL_BACKOFF_MS: six attempts over about
// 7 h 20 min), without the attachments (they are never stored); the mail then names them and asks
// the owner to request them. A client retry with the same anfrage_id carries the attachments again
// and is used instead when it comes first (anfrage.ts). After the last attempt the case keeps an
// `anfrage_mail_failed` event, which 7d's TL;DR surfaces. Once the transport has accepted the mail
// it counts as delivered: a failing store write afterwards is logged (`bookkeeping_failed`) and
// never causes a second mail.
import type { Attachment } from '../attachments';
import { backoff, type StepContext, type StepDef } from '../jobs';
import { errorCode } from '../log';
import { configuratorMail } from '../mail/enquiry';
import type { Fall } from '../store';

export const ANFRAGE_MAIL = 'anfrage_mail';

/** Delays before attempts 2–6 of the enquiry mail: +30 s, +2 min, +15 min, +1 h, +6 h. */
export const MAIL_BACKOFF_MS: readonly number[] = [30_000, 120_000, 900_000, 3_600_000, 21_600_000];

/**
 * Sends the enquiry mail of a case and records the Message-ID (threading in 7d). Throws only when
 * the send fails; bookkeeping errors after an accepted send are logged and swallowed.
 */
export async function sendEnquiry(
  ctx: Pick<StepContext, 'store' | 'clock' | 'mailer' | 'config' | 'log'>,
  fall: Fall,
  attachments: readonly Attachment[] | null,
  dropped: number,
): Promise<void> {
  const mail = configuratorMail(ctx.config, fall.payload, fall.kurz, {
    attachments: attachments ?? [],
    dropped,
    withoutAttachments: attachments === null,
  });
  const sent = await ctx.mailer.send(mail);
  ctx.log.info('mail_sent', { fall: fall.id, kind: 'owner', mode: ctx.mailer.mode });
  try {
    await ctx.store.update(fall.id, { messageId: sent.messageId });
    await ctx.store.event(fall.id, 'anfrage_mail_sent', attachments === null ? 'ohne_anhaenge' : null, ctx.clock.now());
  } catch (e) {
    ctx.log.error('bookkeeping_failed', { fall: fall.id, step: ANFRAGE_MAIL, code: errorCode(e) });
  }
}

/**
 * The inline send of POST /anfrage for a claimed (`running`) mail job: done on success, otherwise
 * back to `pending` with backoff (or `failed` after the last attempt). Never throws.
 */
export async function sendEnquiryInline(
  ctx: Pick<StepContext, 'store' | 'clock' | 'mailer' | 'config' | 'log'>,
  fall: Fall,
  attachments: readonly Attachment[],
  dropped: number,
): Promise<boolean> {
  const { store, clock, log } = ctx;
  try {
    await sendEnquiry(ctx, fall, attachments, dropped);
  } catch (e) {
    const code = errorCode(e);
    log.warn('mail_failed', { fall: fall.id, kind: 'owner', code });
    try {
      const job = await store.job(fall.id, ANFRAGE_MAIL);
      const delay = backoff((job?.attempts ?? 0) + 1, MAIL_BACKOFF_MS);
      if (delay === null) {
        await store.fail(fall.id, ANFRAGE_MAIL, code, clock.now());
        await store.event(fall.id, 'anfrage_mail_failed', code, clock.now());
        log.error('anfrage_mail_failed', { fall: fall.id, code });
      } else {
        await store.retry(fall.id, ANFRAGE_MAIL, clock.now() + delay, code, clock.now());
        await store.event(fall.id, 'anfrage_mail_retry', code, clock.now());
      }
    } catch (e2) {
      log.error('bookkeeping_failed', { fall: fall.id, step: ANFRAGE_MAIL, code: errorCode(e2) });
    }
    return false;
  }
  try {
    await store.complete(fall.id, ANFRAGE_MAIL, clock.now());
  } catch (e) {
    log.error('bookkeeping_failed', { fall: fall.id, step: ANFRAGE_MAIL, code: errorCode(e) });
  }
  return true;
}

export const anfrageMail: StepDef = {
  backoff: MAIL_BACKOFF_MS,
  async run(ctx) {
    const cur = (await ctx.store.get(ctx.fall.id)) ?? ctx.fall;
    if (cur.messageId) return; // a client retry delivered it in the meantime
    await sendEnquiry(ctx, cur, null, 0);
  },
  async exhausted({ fall, log }, code) {
    // The case stays `eingegangen`; the pipeline is unaffected. Ops see the error line.
    log.error('anfrage_mail_failed', { fall: fall.id, code });
  },
};
