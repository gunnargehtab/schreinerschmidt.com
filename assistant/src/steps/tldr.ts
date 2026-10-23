// Step `tldr` (docs/angebot.md §7.1, §7.2, §7.4): after `bewertung`, and also for a case that ended
// in `bewertung_fehlgeschlagen` (the runner enqueues it then), so the owner hears about every case.
// 1. The recommendation from the stored inputs (empfehlung.ts).
// 2. A new review token: 32 random bytes, base64url, only its SHA-256 is stored, valid
//    TOKEN_TTL_DAYS (default 14) days.
// 3. The TL;DR mail to OWNER_EMAIL, threaded to the enquiry mail.
// 4. `eingegangen` → `bewertet` with the TL;DR's Message-ID and time, in one transaction (a failed
//    case keeps its status).
// Once the transport has accepted the mail it counts as delivered: a failing store write afterwards
// is logged (`bookkeeping_failed`) and never causes a second mail; a rerun after a crash between
// send and write finds no Message-ID and sends once more with a fresh token (the old link dies).
// The step uses the enquiry mail's longer retry schedule (MAIL_BACKOFF_MS).
import { empfehlungFuer, fallDaten } from '../fall-daten';
import type { StepContext, StepDef } from '../jobs';
import { errorCode } from '../log';
import { tldrMail } from '../mail/tldr';
import type { Fall } from '../store';
import { neuesToken, tokenHash } from '../token';
import { MAIL_BACKOFF_MS } from './anfrage-mail';

const DAY = 86_400_000;

/** The review link of a case (the token only travels in it). */
export const reviewLink = (publicBaseUrl: string, id: string, token: string): string =>
  `${publicBaseUrl}/angebot/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;

async function abschliessen(ctx: StepContext, fall: Fall, messageId: string, at: number): Promise<void> {
  const { store, clock } = ctx;
  for (let i = 0; i < 3; i++) {
    const cur = (await store.get(fall.id)) ?? fall;
    if (cur.status !== 'eingegangen') {
      await store.update(cur.id, { tldrMessageId: messageId, tldrAt: at });
      return;
    }
    const r = await store.transition(cur.id, 'eingegangen', 'bewertet', cur.version, clock.now(), {
      tldrMessageId: messageId,
      tldrAt: at,
    });
    if (r.ok || r.reason !== 'stale') return;
  }
}

export const tldr: StepDef = {
  backoff: MAIL_BACKOFF_MS,
  async run(ctx) {
    const { store, clock, config, mailer, log } = ctx;
    const fall = await store.get(ctx.fall.id);
    if (!fall || (fall.status !== 'eingegangen' && fall.status !== 'bewertung_fehlgeschlagen')) return;
    if (fall.tldrMessageId) {
      // Sent before; only the status change is missing.
      if (fall.status === 'eingegangen') await abschliessen(ctx, fall, fall.tldrMessageId, fall.tldrAt ?? clock.now());
      return;
    }
    const e = empfehlungFuer(fall, await store.events(fall.id));
    const d = fallDaten(fall);
    const token = neuesToken();
    const now = clock.now();
    const gueltigBis = now + config.tokenTtlDays * DAY;
    const saved = await store.update(fall.id, {
      tokenHash: tokenHash(token),
      tokenExpiresAt: gueltigBis,
      empfehlung: e,
      preisMin: d.kalkulation?.min ?? null,
      preisMax: d.kalkulation?.max ?? null,
    });
    if (!saved) throw Object.assign(new Error('case vanished'), { code: 'no_case' });
    const sent = await mailer.send(
      tldrMail(config, {
        fall: saved,
        empfehlung: e,
        kalkulation: d.kalkulation,
        bewertung: d.bewertung,
        link: reviewLink(config.publicBaseUrl, fall.id, token),
        gueltigBis,
      }),
    );
    log.info('mail_sent', { fall: fall.id, kind: 'owner', mode: mailer.mode, code: 'tldr' });
    try {
      await store.event(fall.id, 'tldr_gesendet', e.empfehlung, clock.now());
      await abschliessen(ctx, saved, sent.messageId, clock.now());
    } catch (err) {
      log.error('bookkeeping_failed', { fall: fall.id, step: 'tldr', code: errorCode(err) });
    }
  },
};
