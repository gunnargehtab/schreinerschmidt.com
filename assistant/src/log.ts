// Structured JSON logs (docs/assistant.md §4.1 point 6, §8): ids, timings and outcome codes only.
// The field set is closed on purpose, so a name, an address, a subject or any free text cannot be
// passed by accident. Errors are reduced to a code with errorCode(), never their message (an SMTP
// error, for instance, can quote the recipient).

export interface LogFields {
  /** Case id (server-generated). */
  fall?: string;
  /** Short Vorgangsnummer (derived from the random anfrage_id). */
  kurz?: string;
  route?: string;
  method?: string;
  status?: number;
  port?: number;
  /** Duration in ms. */
  ms?: number;
  /** Machine outcome or error code, e.g. `ok`, `honeypot`, `unknown_field`, `ECONNECTION`. */
  code?: string;
  step?: string;
  attempt?: number;
  /** Mail kind (`owner` | `customer`) or send mode. */
  kind?: string;
  mode?: string;
  count?: number;
  redirected?: boolean;
  /** Config flags at start (describeConfig()). */
  config?: Record<string, string | number | boolean>;
}

export type Level = 'info' | 'warn' | 'error';
export type Sink = (line: string) => void;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function createLogger(sink: Sink = (line) => process.stdout.write(`${line}\n`), now = () => Date.now()): Logger {
  const write = (level: Level, event: string, fields: LogFields = {}) =>
    sink(JSON.stringify({ t: new Date(now()).toISOString(), level, event, ...fields }));
  return {
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f),
  };
}

/** A short code for an error: its `code` when it looks like one (`EAUTH`, `ETIMEDOUT`), else its class. */
export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code)) return code;
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' && /^[A-Za-z]{1,40}$/.test(name) ? name : 'error';
}
