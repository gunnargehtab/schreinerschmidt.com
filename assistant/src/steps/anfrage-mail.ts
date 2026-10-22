// The enquiry mail of a configurator case (docs/angebot.md §0 "delivery first"). POST /anfrage sends
// it inline with the attachments. When that fails, the case is already stored and this job retries
// it (30 s, 2 min) from the stored payload, without the attachments (they are never stored); the
// mail then names them and asks the owner to request them. A client retry with the same anfrage_id
// carries the attachments again and is used instead when it comes first (anfrage.ts).
import type { Attachment } from '../attachments';
import { backoff, type StepContext, type StepDef } from '../jobs';
import { errorCode } from '../log';
import { configuratorMail } from '../mail/enquiry';
import type { Fall } from '../store';

export const ANFRAGE_MAIL = 'anfrage_mail';

/** Sends the enquiry mail of a case and records the Message-ID (threading in 7d). Throws on failure. */
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
  await ctx.store.update(fall.id, { messageId: sent.messageId });
  await ctx.store.event(fall.id, 'anfrage_mail_sent', attachments === null ? 'ohne_anhaenge' : null, ctx.clock.now());
  ctx.log.info('mail_sent', { fall: fall.id, kind: 'owner', mode: ctx.mailer.mode });
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
    await store.complete(fall.id, ANFRAGE_MAIL, clock.now());
    return true;
  } catch (e) {
    const code = errorCode(e);
    const job = await store.job(fall.id, ANFRAGE_MAIL);
    const delay = backoff((job?.attempts ?? 0) + 1);
    if (delay === null) await store.fail(fall.id, ANFRAGE_MAIL, code, clock.now());
    else await store.retry(fall.id, ANFRAGE_MAIL, clock.now() + delay, code, clock.now());
    await store.event(fall.id, 'anfrage_mail_retry', code, clock.now());
    log.warn('mail_failed', { fall: fall.id, kind: 'owner', code });
    return false;
  }
}

export const anfrageMail: StepDef = {
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
