// SQLite store (docs/angebot.md §3 lifecycle, §5 storage).
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { DB_FILE, STATUSES, TRANSITIONS, canTransition, openSqliteStore, type Store } from '../src/store';
import type { Payload } from '../src/types';
import { cleanupDirs, tempDir } from './helpers';

const T = Date.UTC(2026, 9, 22, 9, 0, 0);
const payload: Payload = {
  values: { typ: 'boden' },
  anfrage: null,
  zusammenfassung: 'x',
  subject: 's',
  replyTo: null,
  configUrl: null,
  anhaenge: [],
};

let stores: Store[] = [];
const open = (dir: string) => {
  const s = openSqliteStore(dir);
  stores.push(s);
  return s;
};
afterEach(async () => {
  for (const s of stores) await s.close();
  stores = [];
  cleanupDirs();
});

async function fresh() {
  const s = open(tempDir());
  const r = await s.create(
    { anfrageId: 'id-00000001', kurz: 'ABCD', payload },
    [{ step: 'preis', status: 'pending', nextAt: T }],
    T,
  );
  return { s, fall: r.fall };
}

describe('cases', () => {
  it('creates once per anfrage_id', async () => {
    const { s, fall } = await fresh();
    expect(fall).toMatchObject({ status: 'eingegangen', version: 1, kurz: 'ABCD', decidedAt: null });
    const again = await s.create({ anfrageId: 'id-00000001', kurz: 'ABCD', payload }, [], T);
    expect(again).toMatchObject({ created: false, fall: { id: fall.id } });
    expect(await s.getByAnfrageId('id-00000001')).toMatchObject({ id: fall.id });
  });

  it('moves forward and records a content-free event', async () => {
    const { s, fall } = await fresh();
    const r = await s.transition(fall.id, 'eingegangen', 'bewertet', 1, T);
    expect(r).toMatchObject({ ok: true, fall: { status: 'bewertet', version: 2, decidedAt: null } });
    const d = await s.transition(fall.id, 'bewertet', 'gesendet', 2, T + 1000);
    expect(d).toMatchObject({ ok: true, fall: { status: 'gesendet', decidedAt: new Date(T + 1000).toISOString() } });
    expect((await s.events(fall.id)).map((e) => [e.kind, e.code])).toEqual([
      ['status:bewertet', null],
      ['status:gesendet', null],
    ]);
  });

  it('rejects backward moves and moves out of final states', async () => {
    const { s, fall } = await fresh();
    await s.transition(fall.id, 'eingegangen', 'bewertet', 1, T);
    expect(await s.transition(fall.id, 'bewertet', 'eingegangen', 2, T)).toMatchObject({
      ok: false,
      reason: 'illegal',
    });
    await s.transition(fall.id, 'bewertet', 'abgesagt', 2, T);
    for (const to of STATUSES) {
      expect(await s.transition(fall.id, 'abgesagt', to, 3, T)).toMatchObject({ ok: false, reason: 'illegal' });
    }
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      expect(tos).not.toContain(from); // no self-transitions
      expect(tos).not.toContain('eingegangen'); // nothing goes back to the start
    }
    expect(canTransition('gesendet', 'manuell')).toBe(false);
    expect(canTransition('bewertung_fehlgeschlagen', 'eingegangen')).toBe(false);
    expect(canTransition('manuell', 'gesendet')).toBe(true);
  });

  it('rejects stale versions and a wrong current status (no double action)', async () => {
    const { s, fall } = await fresh();
    expect(await s.transition(fall.id, 'eingegangen', 'bewertet', 0, T)).toMatchObject({ ok: false, reason: 'stale' });
    expect(await s.transition(fall.id, 'bewertet', 'gesendet', 1, T)).toMatchObject({ ok: false, reason: 'stale' });
    await s.update(fall.id, { kalkulation: { kind: 'mengen-noetig' } });
    expect(await s.transition(fall.id, 'eingegangen', 'bewertet', 1, T)).toMatchObject({ ok: false, reason: 'stale' });
    expect(await s.transition(fall.id, 'eingegangen', 'bewertet', 2, T)).toMatchObject({ ok: true });
    expect(await s.transition('nope', 'eingegangen', 'bewertet', 1, T)).toMatchObject({
      ok: false,
      reason: 'not_found',
    });
    expect(await s.update(fall.id, { messageId: '<a@b>' }, 1)).toBeNull();
  });

  it('migrates once (user_version) and keeps data across reopen; WAL is on', async () => {
    const dir = tempDir();
    const a = open(dir);
    await a.create({ anfrageId: 'id-00000002', kurz: 'WXYZ', payload }, [], T);
    await a.close();
    const b = open(dir);
    expect(await b.getByAnfrageId('id-00000002')).toMatchObject({ kurz: 'WXYZ', payload });
    const db = new DatabaseSync(join(dir, DB_FILE), { readOnly: true });
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 });
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    const cols = (db.prepare("SELECT name FROM pragma_table_info('ereignisse')").all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(cols).toEqual(['id', 'fall_id', 'at', 'kind', 'code']);
    db.close();
  });
});

/** Undoes migration 3 (7d) on a database file, back to user_version 2. */
const ROLLBACK_7D = `DROP INDEX faelle_angebotsnummer; DROP INDEX faelle_status; DROP TABLE angebotsnummern;
  ${[
    'token_expires_at',
    'tldr_at',
    'tldr_message_id',
    'empfehlung',
    'entscheidung',
    'sperre',
    'angebotsnummer',
    'preis_min',
    'preis_max',
    'status_at',
    'erinnert_at',
    'bereinigt_at',
  ]
    .map((c) => `ALTER TABLE faelle DROP COLUMN ${c};`)
    .join(' ')}
  PRAGMA user_version = 2;`;

describe('owner side (7d)', () => {
  it('upgrades a 7c database (user_version 2) and keeps its cases', async () => {
    const dir = tempDir();
    const a = open(dir);
    await a.create({ anfrageId: 'id-00000004', kurz: 'EFGH', payload }, [], T);
    await a.close();
    const raw = new DatabaseSync(join(dir, DB_FILE));
    raw.exec(ROLLBACK_7D);
    raw.close();
    const b = open(dir);
    const f = await b.getByAnfrageId('id-00000004');
    expect(f).toMatchObject({ kurz: 'EFGH', tokenExpiresAt: null, angebotsnummer: null, statusAt: null });
    expect(await b.angebotsnummer(f!.id, 2026)).toBe('A-2026-0001');
    await b.close();
  });
});

describe('ki_kosten (7c)', () => {
  it('sums the estimated spend per month and upgrades a 7b database (user_version 1)', async () => {
    const dir = tempDir();
    const a = open(dir);
    await a.create({ anfrageId: 'id-00000003', kurz: 'ABCD', payload }, [], T);
    await a.close();
    // Roll the file back to the 7b schema, then reopen: migrations 2 and 3 run, the case stays.
    const raw = new DatabaseSync(join(dir, DB_FILE));
    raw.exec(ROLLBACK_7D);
    raw.exec('DROP TABLE ki_kosten; PRAGMA user_version = 1;');
    raw.close();
    const b = open(dir);
    expect(await b.getByAnfrageId('id-00000003')).toMatchObject({ kurz: 'ABCD' });
    expect(await b.kiKosten('2026-10')).toBe(0);
    await b.addKiKosten('2026-10', 0.25, T);
    await b.addKiKosten('2026-10', 0.5, T);
    await b.addKiKosten('2026-11', 1, T);
    await b.addKiKosten('2026-10', Number.NaN, T);
    await b.addKiKosten('2026-10', -3, T);
    expect(await b.kiKosten('2026-10')).toBeCloseTo(0.75);
    expect(await b.kiKosten('2026-11')).toBe(1);
  });
});

describe('jobs', () => {
  it('claims once, completes, retries and resets running rows', async () => {
    const { s, fall } = await fresh();
    expect(await s.due(T - 1)).toEqual([]);
    expect((await s.due(T)).map((j) => j.step)).toEqual(['preis']);
    expect(await s.claim(fall.id, 'preis', T)).toBe(true);
    expect(await s.claim(fall.id, 'preis', T)).toBe(false);
    expect(await s.due(T)).toEqual([]);
    expect(await s.resetRunning(T)).toBe(1);
    expect(await s.claim(fall.id, 'preis', T)).toBe(true);
    await s.retry(fall.id, 'preis', T + 30_000, 'E1', T);
    expect(await s.nextDue()).toBe(T + 30_000);
    expect(await s.job(fall.id, 'preis')).toMatchObject({ status: 'pending', attempts: 1, lastErrorCode: 'E1' });
    expect(await s.claim(fall.id, 'preis', T)).toBe(true);
    await s.complete(fall.id, 'preis', T);
    expect(await s.claim(fall.id, 'preis', T)).toBe(false);
    expect(await s.nextDue()).toBeNull();
  });
});
