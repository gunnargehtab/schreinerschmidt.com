// Timers of the owner side (docs/angebot.md §3, §5), run on the job runner's tick (at most once a
// minute, jobs.ts `periodic`) with the injected clock:
// - Reminder: a case still waiting for the owner (`bewertet`, also `bewertung_fehlgeschlagen`)
//   2 working days after its TL;DR gets one reminder mail (arbeitstage.ts: no Sat/Sun, no BW
//   holidays). Marked before the send (no version bump); a failed send clears the mark, so the next
//   tick tries again.
// - Expiry: a waiting case whose review link has expired (TOKEN_TTL_DAYS after the TL;DR) becomes
//   `abgelaufen`. Nothing is sent; the link answers 410 from then on.
// - Retention (daily, placeholder periods, needs-review): content of `abgesagt`/`abgelaufen` cases
//   90 days after the last status change, of `gesendet`/`kontakt`/`manuell` cases after 365 days;
//   the row keeps id, Vorgangsnummer, dates, status, range and Angebotsnummer (store.bereinige).
import { nachArbeitstagen } from './arbeitstage';
import type { Config } from './config';
import { errorCode, type Logger } from './log';
import type { Mailer } from './mail/index';
import { erinnerungMail } from './mail/tldr';
import type { Status, Store } from './store';
import type { Clock } from './types';

const DAY = 86_400_000;
/** Working days until the reminder (§3: the configurator promises a reply within 2 Werktage). */
export const ERINNERUNG_ARBEITSTAGE = 2;
/** Retention per final status (§5; placeholder, needs-review). */
export const AUFBEWAHRUNG_TAGE: Readonly<Partial<Record<Status, number>>> = {
  abgesagt: 90,
  abgelaufen: 90,
  gesendet: 365,
  kontakt: 365,
  manuell: 365,
};
const WARTEND: readonly Status[] = ['bewertet', 'bewertung_fehlgeschlagen'];

export interface TimerDeps {
  store: Store;
  clock: Clock;
  log: Logger;
  mailer: Mailer;
  config: Config;
}

/** One reminder per waiting case, 2 working days after its TL;DR. Returns the number sent. */
export async function erinnerungen(d: TimerDeps): Promise<number> {
  const now = d.clock.now();
  let n = 0;
  for (const f of await d.store.faelleMitStatus(WARTEND)) {
    if (f.erinnertAt !== null || f.tldrAt === null || f.bereinigtAt !== null) continue;
    if (now < nachArbeitstagen(f.tldrAt, ERINNERUNG_ARBEITSTAGE)) continue;
    if (f.tokenExpiresAt !== null && f.tokenExpiresAt <= now) continue;
    if (!(await d.store.erinnert(f.id, now))) continue;
    try {
      await d.mailer.send(erinnerungMail(d.config, f));
      await d.store.event(f.id, 'erinnerung_gesendet', null, now);
      d.log.info('mail_sent', { fall: f.id, kind: 'owner', mode: d.mailer.mode, code: 'erinnerung' });
      n++;
    } catch (e) {
      await d.store.erinnert(f.id, null);
      d.log.warn('mail_failed', { fall: f.id, kind: 'owner', code: errorCode(e) });
    }
  }
  return n;
}

/** Waiting cases whose link has expired → `abgelaufen` (nothing is sent). Returns the number moved. */
export async function ablauf(d: TimerDeps): Promise<number> {
  const now = d.clock.now();
  let n = 0;
  for (const f of await d.store.faelleMitStatus(WARTEND)) {
    if (f.tokenExpiresAt === null || f.tokenExpiresAt > now) continue;
    const r = await d.store.transition(f.id, f.status, 'abgelaufen', f.version, now, { sperre: null });
    if (r.ok) {
      d.log.info('abgelaufen', { fall: f.id });
      n++;
    }
  }
  return n;
}

/** Retention (§5): deletes the content of final cases after their period. Returns the number cleaned. */
export async function aufbewahrung(d: TimerDeps): Promise<number> {
  const now = d.clock.now();
  const statuses = Object.keys(AUFBEWAHRUNG_TAGE) as Status[];
  let n = 0;
  for (const f of await d.store.faelleMitStatus(statuses, 10_000)) {
    if (f.bereinigtAt !== null) continue;
    const tage = AUFBEWAHRUNG_TAGE[f.status];
    if (tage === undefined) continue;
    const seit = f.statusAt ?? Date.parse(f.createdAt);
    if (now - seit < tage * DAY) continue;
    if (await d.store.bereinige(f.id, now)) {
      await d.store.event(f.id, 'bereinigt', f.status, now);
      d.log.info('bereinigt', { fall: f.id, code: f.status });
      n++;
    }
  }
  return n;
}

/** The runner's periodic hook: reminders and expiry on every tick, retention once a day. */
export function zeitgeber(d: TimerDeps): () => Promise<void> {
  let letzteAufbewahrung = Number.NEGATIVE_INFINITY;
  return async () => {
    await erinnerungen(d);
    await ablauf(d);
    if (d.clock.now() - letzteAufbewahrung >= DAY) {
      letzteAufbewahrung = d.clock.now();
      await aufbewahrung(d);
    }
  };
}
