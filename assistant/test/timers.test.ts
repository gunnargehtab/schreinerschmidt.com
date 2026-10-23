// Timers (docs/angebot.md §3, §5) with a fake clock: one reminder after 2 working days (weekends and
// BW holidays skipped), expiry to `abgelaufen`, retention of the content only.
import { afterEach, describe, expect, it } from 'vitest';
import { FEIERTAGE_BW, istArbeitstag, nachArbeitstagen } from '../src/arbeitstage';
import { FakeClaude } from '../src/claude/fake';
import { LEERER_PAYLOAD } from '../src/store';
import { ablauf, aufbewahrung, erinnerungen } from '../src/timers';
import { REGAL } from './fixtures';
import { FakeClock, cleanupDirs, harness, type Harness } from './helpers';
import { aktion, bewerteterFall, formular, seite } from './review-helpers';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  cleanupDirs();
});

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Easter Sunday (anonymous Gregorian algorithm), as `YYYY-MM-DD`. */
function ostern(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31);
  const day = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const plus = (d: Date, n: number) => new Date(d.getTime() + n * DAY).toISOString().slice(0, 10);

describe('working days (arbeitstage.ts)', () => {
  it('the hard-coded BW holidays match the computed ones for 2026 and 2027', () => {
    for (const y of [2026, 2027]) {
      const o = ostern(y);
      const erwartet = [
        `${y}-01-01`,
        `${y}-01-06`,
        plus(o, -2),
        plus(o, 1),
        `${y}-05-01`,
        plus(o, 39),
        plus(o, 50),
        plus(o, 60),
        `${y}-10-03`,
        `${y}-11-01`,
        `${y}-12-25`,
        `${y}-12-26`,
      ].sort();
      expect([...FEIERTAGE_BW].filter((t) => t.startsWith(String(y))).sort()).toEqual(erwartet);
    }
    expect(istArbeitstag('2026-12-24')).toBe(true);
    expect(istArbeitstag('2026-12-25')).toBe(false);
    expect(istArbeitstag('2026-10-24')).toBe(false); // Saturday
  });

  it('counts across a weekend and holidays, Europe/Berlin', () => {
    // Thu 24 Dec 2026, 10:00 Berlin: Fri 25 + Sat 26 holidays, Sun 27 → Mon 28 (1), Tue 29 (2).
    const t = Date.UTC(2026, 11, 24, 9);
    expect(new Date(nachArbeitstagen(t, 2)).toISOString()).toBe('2026-12-29T09:00:00.000Z');
    // Fri 2 Oct 2026: Sat 3 Oct is a holiday anyway; Mon 5 (1), Tue 6 (2).
    expect(new Date(nachArbeitstagen(Date.UTC(2026, 9, 2, 12), 2)).toISOString()).toBe('2026-10-06T12:00:00.000Z');
    // 23:30 CEST on a Friday is still that Friday; Tuesday 23:30 CET after the DST change.
    expect(new Date(nachArbeitstagen(Date.UTC(2026, 9, 23, 21, 30), 2)).toISOString()).toBe('2026-10-27T22:30:00.000Z');
  });
});

describe('reminder', () => {
  it('goes out once, 2 working days after the TL;DR, threaded, without invalidating the page', async () => {
    const clock = new FakeClock(Date.UTC(2026, 11, 24, 9)); // Thu before Christmas
    h = harness({ clock, claude: new FakeClaude() });
    const { fall, token } = await bewerteterFall(h, REGAL);
    const f0 = (await h.deps.store.get(fall.id))!;
    const page = await (await seite(h, fall.id, token)).text();
    const reminders = () => h!.ctl.sent.filter((m) => m.subject.startsWith('[Erinnerung]'));

    for (const step of [DAY, DAY, DAY, DAY, DAY - HOUR]) {
      clock.advance(step); // Fri 25, Sat 26, Sun 27, Mon 28 … up to Tue 29 Dec 09:00 minus one hour
      await h.deps.runner.runDue();
    }
    expect(reminders()).toHaveLength(0);
    clock.advance(HOUR);
    await h.deps.runner.runDue();
    expect(reminders()).toHaveLength(1);
    const r = reminders()[0]!;
    expect(r.to).toBe('inhaber@schreinerei.test');
    expect(r.subject).toMatch(/^\[Erinnerung\] Anfrage #[0-9A-Z]{4} wartet – Regal 120×200×35$/);
    expect(r.text).toContain('wartet seit 24.12.2026');
    expect(r.inReplyTo).toBe(f0.tldrMessageId);
    expect(r.references).toEqual([f0.messageId, f0.tldrMessageId]);
    expect(r.text).not.toContain(token);

    clock.advance(DAY);
    await h.deps.runner.runDue();
    expect(await erinnerungen(h.deps)).toBe(0);
    expect(reminders()).toHaveLength(1);
    const f1 = (await h.deps.store.get(fall.id))!;
    expect(f1.erinnertAt).not.toBeNull();
    expect(f1.version).toBe(f0.version); // the open page stays valid
    const res = await aktion(h, fall.id, 'ablehnen', { ...formular(page, 'ablehnen'), folge: 'manuell' });
    expect(res.status).toBe(200);
  });

  it('retries on the next tick when the reminder mail fails; no reminder after a decision', async () => {
    const clock = new FakeClock(Date.UTC(2026, 9, 22, 9)); // Thu
    h = harness({ clock });
    const a = await bewerteterFall(h, REGAL);
    const b = await bewerteterFall(h, REGAL);
    await aktion(h, b.fall.id, 'ablehnen', {
      t: b.token,
      v: String(b.fall.version),
      folge: 'kontakt',
      kontakt_art: 'anruf',
    });
    clock.advance(4 * DAY + HOUR); // Mon 26 Oct 10:00 UTC (Fri 23 = 1, Mon 26 = 2)
    h.ctl.fail = 1;
    expect(await erinnerungen(h.deps)).toBe(0);
    expect((await h.deps.store.get(a.fall.id))?.erinnertAt).toBeNull();
    expect(await erinnerungen(h.deps)).toBe(1);
    expect(await erinnerungen(h.deps)).toBe(0);
  });
});

describe('expiry', () => {
  it('bewertet after the link’s 14 days → abgelaufen, nothing sent, the link answers 410', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, REGAL);
    const sent = h.ctl.sent.length;
    h.clock.advance(14 * DAY - 1);
    await h.deps.runner.runDue();
    expect((await h.deps.store.get(fall.id))?.status).toBe('bewertet');
    h.clock.advance(1);
    expect(await ablauf(h.deps)).toBe(1);
    expect((await h.deps.store.get(fall.id))?.status).toBe('abgelaufen');
    expect(h.ctl.sent.filter((m) => m.kind === 'customer')).toHaveLength(0);
    // Only the one reminder went out in between.
    expect(h.ctl.sent.length - sent).toBe(1);
    expect((await seite(h, fall.id, token)).status).toBe(410);
  });

  it('a case in manuell does not expire; its link was extended by the decision', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, REGAL);
    h.clock.advance(10 * DAY);
    await aktion(h, fall.id, 'ablehnen', {
      t: token,
      v: String((await h.deps.store.get(fall.id))!.version),
      folge: 'manuell',
    });
    h.clock.advance(10 * DAY);
    await h.deps.runner.runDue();
    expect((await h.deps.store.get(fall.id))?.status).toBe('manuell');
    expect((await seite(h, fall.id, token)).status).toBe(200);
    h.clock.advance(5 * DAY);
    expect((await seite(h, fall.id, token)).status).toBe(410);
  });
});

describe('retention', () => {
  it('deletes the content only: abgesagt after 90 days, gesendet after 12 months', async () => {
    h = harness({ claude: new FakeClaude() });
    const abs = await bewerteterFall(h, REGAL);
    const conf = await aktion(h, abs.fall.id, 'ablehnen', {
      t: abs.token,
      v: String(abs.fall.version),
      folge: 'absage',
      grund: 'sonstiges',
    });
    await aktion(h, abs.fall.id, 'ablehnen', { ...formular(await conf.text(), 'ablehnen'), schritt: 'senden' });
    const ges = await bewerteterFall(h, REGAL);
    const page = await (await seite(h, ges.fall.id, ges.token)).text();
    const c2 = await aktion(h, ges.fall.id, 'freigeben', formular(page, 'freigeben'));
    await aktion(h, ges.fall.id, 'freigeben', { ...formular(await c2.text(), 'freigeben'), schritt: 'senden' });
    const vorher = (await h.deps.store.get(ges.fall.id))!;
    expect(vorher.status).toBe('gesendet');

    h.clock.advance(90 * DAY - 1);
    expect(await aufbewahrung(h.deps)).toBe(0);
    h.clock.advance(1);
    expect(await aufbewahrung(h.deps)).toBe(1);
    const a = (await h.deps.store.get(abs.fall.id))!;
    expect(a).toMatchObject({
      id: abs.fall.id,
      kurz: abs.fall.kurz,
      status: 'abgesagt',
      payload: LEERER_PAYLOAD,
      kalkulation: null,
      bewertung: null,
      angebot: null,
      empfehlung: null,
      entscheidung: null,
      tokenHash: null,
      messageId: null,
      tldrMessageId: null,
    });
    expect(a.createdAt).toBe(abs.fall.createdAt);
    expect(a.decidedAt).not.toBeNull();
    expect(a.preisMin).toBeGreaterThan(0);
    expect(a.bereinigtAt).toBe(h.clock.now());
    expect(JSON.stringify(a)).not.toContain('Erika');
    expect((await h.deps.store.events(abs.fall.id)).map((e) => e.kind)).toContain('bereinigt');
    expect((await seite(h, abs.fall.id, abs.token)).status).toBe(404);
    expect((await h.deps.store.get(ges.fall.id))?.payload.values['name']).toBe('Erika Mustermann');

    h.clock.advance(275 * DAY);
    expect(await aufbewahrung(h.deps)).toBe(1);
    const g = (await h.deps.store.get(ges.fall.id))!;
    expect(g).toMatchObject({ status: 'gesendet', payload: LEERER_PAYLOAD, angebotsnummer: 'A-2026-0001' });
    expect([g.preisMin, g.preisMax]).toEqual([vorher.preisMin, vorher.preisMax]);
    expect(await aufbewahrung(h.deps)).toBe(0);
  });

  it('runs daily on the runner’s tick', async () => {
    h = harness();
    const { fall, token } = await bewerteterFall(h, REGAL);
    await aktion(h, fall.id, 'ablehnen', { t: token, v: String(fall.version), folge: 'kontakt', kontakt_art: 'anruf' });
    h.clock.advance(366 * DAY);
    await h.deps.runner.runDue();
    expect((await h.deps.store.get(fall.id))?.bereinigtAt).not.toBeNull();
  });
});
