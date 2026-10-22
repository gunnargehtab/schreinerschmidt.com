// Storage (docs/angebot.md §5): a small async Store interface, so a serverless host can bring its
// own adapter, and the node:sqlite implementation (one file, WAL, migrations by PRAGMA user_version).
// Tables: `faelle` (cases), `ereignisse` (event log: kind + code, never content) and `jobs` (the
// persisted steps of the job runner, jobs.ts).
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Payload } from './types';

/** Lifecycle (§3), exactly as specified. */
export type Status =
  | 'eingegangen' // stored, enquiry mail sent
  | 'bewertet' // price + Claude done, TL;DR sent, waiting for the owner
  | 'bewertung_fehlgeschlagen' // pricing or Claude failed; TL;DR says so, owner can still price manually
  | 'gesendet' // Angebot sent to the customer
  | 'manuell' // owner calculates himself; may later send via /manuell → 'gesendet'
  | 'kontakt' // Rückfragen mail sent, or owner calls (nothing sent)
  | 'abgesagt' // Absage sent
  | 'abgelaufen'; // no decision after 14 days; links expire, nothing is sent

export const STATUSES: readonly Status[] = [
  'eingegangen',
  'bewertet',
  'bewertung_fehlgeschlagen',
  'gesendet',
  'manuell',
  'kontakt',
  'abgesagt',
  'abgelaufen',
];

/**
 * Allowed forward moves (§3 "only forward"). Everything not listed is rejected, including every
 * move back to an earlier state. 7d may widen `kontakt` (e.g. to `gesendet` after the answers).
 */
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  eingegangen: ['bewertet', 'bewertung_fehlgeschlagen', 'abgelaufen'],
  bewertet: ['gesendet', 'manuell', 'kontakt', 'abgesagt', 'abgelaufen'],
  bewertung_fehlgeschlagen: ['gesendet', 'manuell', 'kontakt', 'abgesagt', 'abgelaufen'],
  manuell: ['gesendet', 'abgelaufen'],
  kontakt: [],
  gesendet: [],
  abgesagt: [],
  abgelaufen: [],
};

/** Owner decisions set `decided_at`. */
const DECISIONS: readonly Status[] = ['gesendet', 'manuell', 'kontakt', 'abgesagt'];

export const canTransition = (from: Status, to: Status): boolean => TRANSITIONS[from].includes(to);

export interface Fall {
  id: string;
  /** The client's idempotency key (`anfrage_id`), unique. */
  anfrageId: string;
  /** Vorgangsnummer shown to the customer („7F3K“). */
  kurz: string;
  status: Status;
  createdAt: string;
  decidedAt: string | null;
  payload: Payload;
  /** KalkulierenResult of the `preis` step (Kalkulation or the `mengen-noetig` marker). */
  kalkulation: unknown;
  bewertung: unknown;
  angebot: unknown;
  tokenHash: string | null;
  /** Message-ID of the enquiry mail, for threading (7d). */
  messageId: string | null;
  version: number;
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface Job {
  fallId: string;
  step: string;
  status: JobStatus;
  attempts: number;
  /** Epoch ms. */
  nextAt: number;
  lastErrorCode: string | null;
}

export interface Ereignis {
  id: number;
  fallId: string;
  at: string;
  kind: string;
  code: string | null;
}

export interface NewFall {
  anfrageId: string;
  kurz: string;
  payload: Payload;
}

export interface NewJob {
  step: string;
  status: 'pending' | 'running';
  nextAt: number;
}

export type CreateResult = { created: true; fall: Fall } | { created: false; fall: Fall };

export type TransitionResult =
  { ok: true; fall: Fall } | { ok: false; reason: 'not_found' | 'illegal' | 'stale'; fall: Fall | null };

export interface FallPatch {
  kalkulation?: unknown;
  bewertung?: unknown;
  angebot?: unknown;
  tokenHash?: string | null;
  messageId?: string | null;
}

export interface Store {
  /** Stores a new case with its first jobs atomically; an existing anfrage_id returns that case. */
  create(input: NewFall, jobs: readonly NewJob[], now: number): Promise<CreateResult>;
  get(id: string): Promise<Fall | null>;
  getByAnfrageId(anfrageId: string): Promise<Fall | null>;
  /** Data update without a status change; bumps the version (stale `expectedVersion` → null). */
  update(id: string, patch: FallPatch, expectedVersion?: number): Promise<Fall | null>;
  /** Forward-only status change, pinned to the current status and version. */
  transition(id: string, from: Status, to: Status, expectedVersion: number, now: number): Promise<TransitionResult>;
  /** Content-free event: a kind and an optional machine code. */
  event(fallId: string, kind: string, code: string | null, now: number): Promise<void>;
  events(fallId: string): Promise<Ereignis[]>;

  /** Pending jobs whose time has come, oldest first. */
  due(now: number, limit?: number): Promise<Job[]>;
  job(fallId: string, step: string): Promise<Job | null>;
  enqueue(fallId: string, step: string, nextAt: number, now: number): Promise<void>;
  /** pending/failed → running; false when another worker has it or it is done. */
  claim(fallId: string, step: string, now: number): Promise<boolean>;
  complete(fallId: string, step: string, now: number): Promise<void>;
  /** running → pending at `nextAt`, attempts + 1. */
  retry(fallId: string, step: string, nextAt: number, code: string, now: number): Promise<void>;
  /** running → failed, attempts + 1. */
  fail(fallId: string, step: string, code: string, now: number): Promise<void>;
  /** After a crash nothing is really running: running → pending (single process). */
  resetRunning(now: number): Promise<number>;
  /** The earliest `next_at` of a pending job, or null. */
  nextDue(): Promise<number | null>;
  close(): Promise<void>;
}

/** Schema migrations, applied in order; `PRAGMA user_version` holds the count applied. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE faelle (
     id TEXT PRIMARY KEY,
     anfrage_id TEXT NOT NULL UNIQUE,
     kurz TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(',')})),
     created_at TEXT NOT NULL,
     decided_at TEXT,
     payload TEXT NOT NULL,
     kalkulation TEXT,
     bewertung TEXT,
     angebot TEXT,
     token_hash TEXT,
     message_id TEXT,
     version INTEGER NOT NULL DEFAULT 1
   ) STRICT;
   CREATE TABLE ereignisse (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     fall_id TEXT NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
     at TEXT NOT NULL,
     kind TEXT NOT NULL,
     code TEXT
   ) STRICT;
   CREATE INDEX ereignisse_fall ON ereignisse(fall_id);
   CREATE TABLE jobs (
     fall_id TEXT NOT NULL REFERENCES faelle(id) ON DELETE CASCADE,
     step TEXT NOT NULL,
     status TEXT NOT NULL CHECK (status IN ('pending','running','done','failed')),
     attempts INTEGER NOT NULL DEFAULT 0,
     next_at INTEGER NOT NULL,
     last_error_code TEXT,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (fall_id, step)
   ) STRICT;
   CREATE INDEX jobs_due ON jobs(status, next_at);`,
];

type Row = Record<string, unknown>;

const iso = (ms: number): string => new Date(ms).toISOString();
const json = (x: unknown): string | null => (x === null || x === undefined ? null : JSON.stringify(x));
const parse = (x: unknown): unknown => (typeof x === 'string' ? JSON.parse(x) : null);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);

function toFall(r: Row): Fall {
  return {
    id: String(r['id']),
    anfrageId: String(r['anfrage_id']),
    kurz: String(r['kurz']),
    status: r['status'] as Status,
    createdAt: String(r['created_at']),
    decidedAt: str(r['decided_at']),
    payload: parse(r['payload']) as Payload,
    kalkulation: parse(r['kalkulation']),
    bewertung: parse(r['bewertung']),
    angebot: parse(r['angebot']),
    tokenHash: str(r['token_hash']),
    messageId: str(r['message_id']),
    version: Number(r['version']),
  };
}

const toJob = (r: Row): Job => ({
  fallId: String(r['fall_id']),
  step: String(r['step']),
  status: r['status'] as JobStatus,
  attempts: Number(r['attempts']),
  nextAt: Number(r['next_at']),
  lastErrorCode: str(r['last_error_code']),
});

export const DB_FILE = 'angebote.sqlite';

/** Opens (and migrates) `DATA_DIR/angebote.sqlite`; `:memory:` for a throwaway store. */
export function openSqliteStore(dataDir: string | ':memory:'): Store {
  let path = ':memory:';
  if (dataDir !== ':memory:') {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    path = join(dataDir, DB_FILE);
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);

  const q = {
    insertFall: db.prepare(
      `INSERT INTO faelle (id, anfrage_id, kurz, status, created_at, payload, version)
       VALUES (?, ?, ?, 'eingegangen', ?, ?, 1)`,
    ),
    insertJob: db.prepare(
      `INSERT OR IGNORE INTO jobs (fall_id, step, status, attempts, next_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
    ),
    get: db.prepare('SELECT * FROM faelle WHERE id = ?'),
    byAnfrage: db.prepare('SELECT * FROM faelle WHERE anfrage_id = ?'),
    transition: db.prepare(
      `UPDATE faelle SET status = ?, version = version + 1, decided_at = COALESCE(?, decided_at)
       WHERE id = ? AND status = ? AND version = ?`,
    ),
    event: db.prepare('INSERT INTO ereignisse (fall_id, at, kind, code) VALUES (?, ?, ?, ?)'),
    events: db.prepare('SELECT * FROM ereignisse WHERE fall_id = ? ORDER BY id'),
    due: db.prepare(`SELECT * FROM jobs WHERE status = 'pending' AND next_at <= ? ORDER BY next_at, rowid LIMIT ?`),
    job: db.prepare('SELECT * FROM jobs WHERE fall_id = ? AND step = ?'),
    claim: db.prepare(
      `UPDATE jobs SET status = 'running', updated_at = ?
       WHERE fall_id = ? AND step = ? AND status IN ('pending', 'failed')`,
    ),
    complete: db.prepare(
      `UPDATE jobs SET status = 'done', last_error_code = NULL, updated_at = ? WHERE fall_id = ? AND step = ?`,
    ),
    retry: db.prepare(
      `UPDATE jobs SET status = 'pending', attempts = attempts + 1, next_at = ?, last_error_code = ?, updated_at = ?
       WHERE fall_id = ? AND step = ?`,
    ),
    fail: db.prepare(
      `UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error_code = ?, updated_at = ?
       WHERE fall_id = ? AND step = ?`,
    ),
    resetRunning: db.prepare(`UPDATE jobs SET status = 'pending', updated_at = ? WHERE status = 'running'`),
    nextDue: db.prepare(`SELECT MIN(next_at) AS n FROM jobs WHERE status = 'pending'`),
  };

  const getFall = (id: string): Fall | null => {
    const r = q.get.get(id) as Row | undefined;
    return r ? toFall(r) : null;
  };

  /** Runs `fn` in one write transaction. */
  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    async create(input, jobs, now) {
      return tx((): CreateResult => {
        const existing = q.byAnfrage.get(input.anfrageId) as Row | undefined;
        if (existing) return { created: false, fall: toFall(existing) };
        const id = randomUUID();
        q.insertFall.run(id, input.anfrageId, input.kurz, iso(now), JSON.stringify(input.payload));
        for (const j of jobs) q.insertJob.run(id, j.step, j.status, j.nextAt, iso(now));
        return { created: true, fall: getFall(id)! };
      });
    },
    async get(id) {
      return getFall(id);
    },
    async getByAnfrageId(anfrageId) {
      const r = q.byAnfrage.get(anfrageId) as Row | undefined;
      return r ? toFall(r) : null;
    },
    async update(id, patch, expectedVersion) {
      const cols: Record<string, string | null> = {};
      if ('kalkulation' in patch) cols['kalkulation'] = json(patch.kalkulation);
      if ('bewertung' in patch) cols['bewertung'] = json(patch.bewertung);
      if ('angebot' in patch) cols['angebot'] = json(patch.angebot);
      if ('tokenHash' in patch) cols['token_hash'] = patch.tokenHash ?? null;
      if ('messageId' in patch) cols['message_id'] = patch.messageId ?? null;
      const keys = Object.keys(cols);
      const set = [...keys.map((k) => `${k} = ?`), 'version = version + 1'].join(', ');
      const where = expectedVersion === undefined ? 'id = ?' : 'id = ? AND version = ?';
      const args = [
        ...keys.map((k) => cols[k] ?? null),
        id,
        ...(expectedVersion === undefined ? [] : [expectedVersion]),
      ];
      const r = db.prepare(`UPDATE faelle SET ${set} WHERE ${where}`).run(...args);
      return r.changes === 1 ? getFall(id) : null;
    },
    async transition(id, from, to, expectedVersion, now) {
      return tx((): TransitionResult => {
        const cur = getFall(id);
        if (!cur) return { ok: false, reason: 'not_found', fall: null };
        if (!canTransition(from, to)) return { ok: false, reason: 'illegal', fall: cur };
        if (cur.status !== from || cur.version !== expectedVersion) return { ok: false, reason: 'stale', fall: cur };
        const r = q.transition.run(to, DECISIONS.includes(to) ? iso(now) : null, id, from, expectedVersion);
        if (r.changes !== 1) return { ok: false, reason: 'stale', fall: cur };
        q.event.run(id, iso(now), `status:${to}`, null);
        return { ok: true, fall: getFall(id)! };
      });
    },
    async event(fallId, kind, code, now) {
      q.event.run(fallId, iso(now), kind, code);
    },
    async events(fallId) {
      return (q.events.all(fallId) as Row[]).map((r) => ({
        id: Number(r['id']),
        fallId: String(r['fall_id']),
        at: String(r['at']),
        kind: String(r['kind']),
        code: str(r['code']),
      }));
    },
    async due(now, limit = 50) {
      return (q.due.all(now, limit) as Row[]).map(toJob);
    },
    async job(fallId, step) {
      const r = q.job.get(fallId, step) as Row | undefined;
      return r ? toJob(r) : null;
    },
    async enqueue(fallId, step, nextAt, now) {
      q.insertJob.run(fallId, step, 'pending', nextAt, iso(now));
    },
    async claim(fallId, step, now) {
      return q.claim.run(iso(now), fallId, step).changes === 1;
    },
    async complete(fallId, step, now) {
      q.complete.run(iso(now), fallId, step);
    },
    async retry(fallId, step, nextAt, code, now) {
      q.retry.run(nextAt, code, iso(now), fallId, step);
    },
    async fail(fallId, step, code, now) {
      q.fail.run(code, iso(now), fallId, step);
    },
    async resetRunning(now) {
      return Number(q.resetRunning.run(iso(now)).changes);
    },
    async nextDue() {
      const r = q.nextDue.get() as Row | undefined;
      return r && r['n'] !== null && r['n'] !== undefined ? Number(r['n']) : null;
    },
    async close() {
      if (db.isOpen) db.close();
    },
  };
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as Row | undefined;
  const current = Number(row?.['user_version'] ?? 0);
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}
