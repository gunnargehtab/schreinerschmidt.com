// Backend configuration (docs/angebot.md §10, §8.3). Parsed once from the environment with zod.
// Development gets safe defaults (SEND_MODE=dry-run, DATA_DIR=./data, .invalid addresses); in
// NODE_ENV=production, and whenever SEND_MODE is `allowlist` or `live`, every required value must
// be set, or the process fails at start; allowlist and live also need SMTP and ANTHROPIC_API_KEY.
// Errors name the variables, never their values, and nothing here is ever logged except
// `describeConfig()`.
import { resolve } from 'node:path';
import { z } from 'zod';

export type SendMode = 'dry-run' | 'allowlist' | 'live';
export type NodeEnv = 'development' | 'test' | 'production';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface Config {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  /** Backend origin for links in mails (7d). */
  publicBaseUrl: string;
  /** The only allowed `Origin` of POSTs, and the only allowed `_next` origin. */
  siteOrigin: string;
  /** Base path of the site on SITE_ORIGIN (`/` in production), the fallback redirect target. */
  siteBase: string;
  ownerEmail: string;
  mailFrom: string;
  sendMode: SendMode;
  /** Lower-cased customer addresses that may receive mail in `allowlist` mode. */
  sendAllowlist: readonly string[];
  smtp: SmtpConfig | null;
  dataDir: string;
  tokenTtlDays: number;
  /**
   * Behind a reverse proxy: take the client IP for the rate limit from the last X-Forwarded-For hop,
   * but only when the socket peer is loopback or a private address (the proxy).
   */
  trustProxy: boolean;
  /** Claude (7c). Required whenever SEND_MODE is allowlist or live; without it the AI step is skipped. */
  anthropicApiKey: string | null;
  /** Optional monthly cap of the estimated Claude spend in USD; null: no cap (claude/kosten.ts). */
  claudeMonthlyLimitUsd: number | null;
  ownerPin: string | null;
}

export class ConfigError extends Error {
  constructor(readonly variables: string[]) {
    super(`Invalid or missing configuration: ${variables.join(', ')}`);
    this.name = 'ConfigError';
  }
}

/** Single address, optionally with a display name: `Name <a@b.de>` or `a@b.de`. No CR/LF. */
const ADDRESS = /^(?:[^<>\r\n]*<[^\s@<>]+@[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+)$/;
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

const empty = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opt = <T extends z.ZodType>(t: T) => z.preprocess(empty, t.optional());
const origin = z.url({ protocol: /^https?$/ }).transform((s) => new URL(s).origin);

const Env = z.object({
  NODE_ENV: opt(z.enum(['development', 'test', 'production'])),
  HOST: opt(z.string().max(255)),
  PORT: opt(z.coerce.number().int().min(1).max(65535)),
  PUBLIC_BASE_URL: opt(origin),
  SITE_ORIGIN: opt(origin),
  SITE_BASE: opt(z.string().regex(/^\/(?:[^\s?#]*\/)?$/)),
  OWNER_EMAIL: opt(z.string().max(254).regex(EMAIL)),
  MAIL_FROM: opt(z.string().max(320).regex(ADDRESS)),
  SMTP_HOST: opt(z.string().max(255)),
  SMTP_PORT: opt(z.coerce.number().int().min(1).max(65535)),
  SMTP_USER: opt(z.string().max(320)),
  SMTP_PASS: opt(z.string().max(1024)),
  SEND_MODE: opt(z.enum(['dry-run', 'allowlist', 'live'])),
  SEND_ALLOWLIST: opt(z.string().max(10000)),
  OWNER_PIN: opt(z.string().min(4).max(64)),
  DATA_DIR: opt(z.string().max(1024)),
  TOKEN_TTL_DAYS: opt(z.coerce.number().int().min(1).max(90)),
  TRUST_PROXY: opt(z.enum(['0', '1', 'true', 'false'])),
  ANTHROPIC_API_KEY: opt(z.string().max(512)),
  CLAUDE_MONTHLY_LIMIT_USD: opt(z.coerce.number().positive().max(100_000)),
});

/**
 * Variables that production (and any real-mail mode) must set explicitly; SEND_MODE too, as a
 * silent dry-run would lose mail.
 */
const REQUIRED_IN_PRODUCTION = [
  'PUBLIC_BASE_URL',
  'SITE_ORIGIN',
  'OWNER_EMAIL',
  'MAIL_FROM',
  'SEND_MODE',
  'DATA_DIR',
] as const;
/** Real mail (allowlist and live): SMTP, and Claude, since a pilot without the AI step is no pilot. */
const REQUIRED_FOR_REAL_MAIL = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'ANTHROPIC_API_KEY'] as const;

/**
 * Parses the environment. Throws ConfigError listing the offending variable names (never values).
 * `cwd` resolves a relative DATA_DIR.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env, cwd = process.cwd()): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError([...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? '?')))]);
  }
  const e = parsed.data;
  const nodeEnv: NodeEnv = e.NODE_ENV ?? 'development';
  const sendMode: SendMode = e.SEND_MODE ?? 'dry-run';
  const missing: string[] = [];
  // Real mail needs real addresses, whatever NODE_ENV says.
  if (nodeEnv === 'production' || sendMode !== 'dry-run') {
    for (const k of REQUIRED_IN_PRODUCTION) if (e[k] === undefined) missing.push(k);
  }
  if (sendMode !== 'dry-run') for (const k of REQUIRED_FOR_REAL_MAIL) if (e[k] === undefined) missing.push(k);
  const allowlist = (e.SEND_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.some((a) => !EMAIL.test(a))) missing.push('SEND_ALLOWLIST');
  if (missing.length) throw new ConfigError(missing);

  const port = e.PORT ?? 8787;
  return {
    nodeEnv,
    host: e.HOST ?? '127.0.0.1',
    port,
    publicBaseUrl: e.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
    siteOrigin: e.SITE_ORIGIN ?? 'http://localhost:4321',
    siteBase: e.SITE_BASE ?? '/',
    ownerEmail: e.OWNER_EMAIL ?? 'inhaber@example.invalid',
    mailFrom: e.MAIL_FROM ?? 'anfrage@example.invalid',
    sendMode,
    sendAllowlist: allowlist,
    smtp:
      e.SMTP_HOST && e.SMTP_USER && e.SMTP_PASS
        ? { host: e.SMTP_HOST, port: e.SMTP_PORT ?? 587, user: e.SMTP_USER, pass: e.SMTP_PASS }
        : null,
    dataDir: resolve(cwd, e.DATA_DIR ?? './data'),
    tokenTtlDays: e.TOKEN_TTL_DAYS ?? 14,
    trustProxy: e.TRUST_PROXY === '1' || e.TRUST_PROXY === 'true',
    anthropicApiKey: e.ANTHROPIC_API_KEY ?? null,
    claudeMonthlyLimitUsd: e.CLAUDE_MONTHLY_LIMIT_USD ?? null,
    ownerPin: e.OWNER_PIN ?? null,
  };
}

/** The loggable view of a config: modes and flags only, no addresses, hosts or secrets. */
export const describeConfig = (c: Config) => ({
  nodeEnv: c.nodeEnv,
  sendMode: c.sendMode,
  port: c.port,
  smtp: c.smtp !== null,
  allowlist: c.sendAllowlist.length,
  claude: c.anthropicApiKey !== null,
  claudeLimit: c.claudeMonthlyLimitUsd !== null,
  pin: c.ownerPin !== null,
  trustProxy: c.trustProxy,
});
