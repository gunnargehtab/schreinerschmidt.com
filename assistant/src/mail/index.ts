// Outgoing mail (docs/angebot.md §8.3). One Mailer, two kinds of mail: `owner` (enquiry, TL;DR,
// reminders) and `customer` (Angebot, Rückfragen, Absage; 7d). The transport follows SEND_MODE:
// - dry-run: nodemailer's stream transport renders RFC 822 and the message is written as .eml to
//   DATA_DIR/outbox/. No SMTP transport is ever constructed, so no socket is opened.
// - allowlist: real SMTP, but a customer mail to an address outside SEND_ALLOWLIST goes to
//   OWNER_EMAIL instead, its subject prefixed „[Pilot – nicht an Kunde]“.
// - live: real SMTP.
import { randomBytes } from 'node:crypto';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import type { Attachment } from '../attachments';
import type { Config, SendMode, SmtpConfig } from '../config';
import { headerText } from '../sanitize';

export type MailKind = 'owner' | 'customer';

export interface OutgoingMail {
  kind: MailKind;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | null;
  bcc?: string;
  /** Threading (7d): Message-ID of the enquiry mail. */
  inReplyTo?: string;
  references?: readonly string[];
  attachments?: readonly Attachment[];
}

export interface SentMail {
  messageId: string;
  /** True when an allowlist redirect sent a customer mail to the owner instead. */
  redirected: boolean;
}

export interface Mailer {
  readonly mode: SendMode;
  send(mail: OutgoingMail): Promise<SentMail>;
  close(): Promise<void>;
}

export const PILOT_PREFIX = '[Pilot – nicht an Kunde]';
export const OUTBOX = 'outbox';

/** Builds the transports; injectable so tests can prove that dry-run never builds SMTP. */
export interface TransportFactory {
  stream(): Transporter;
  smtp(cfg: SmtpConfig): Transporter;
}

/** Never read local files or fetch URLs named in a message (attachments are always Buffers). */
const SAFE = { disableFileAccess: true, disableUrlAccess: true } as const;

export const defaultTransports: TransportFactory = {
  stream: () => nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix', ...SAFE }),
  smtp: (c) =>
    nodemailer.createTransport({
      host: c.host,
      port: c.port,
      // 465 is implicit TLS; everything else must upgrade with STARTTLS.
      secure: c.port === 465,
      requireTLS: c.port !== 465,
      auth: { user: c.user, pass: c.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      logger: false,
      debug: false,
      ...SAFE,
    }),
};

export interface MailerOptions {
  transports?: TransportFactory;
  /** Clock for .eml file names. */
  now?: () => number;
}

export function createMailer(config: Config, opts: MailerOptions = {}): Mailer {
  const transports = opts.transports ?? defaultTransports;
  const now = opts.now ?? (() => Date.now());
  const mode = config.sendMode;
  const outbox = join(config.dataDir, OUTBOX);
  let transport: Transporter | null = null;
  const get = (): Transporter => {
    if (transport) return transport;
    if (mode === 'dry-run') return (transport = transports.stream());
    if (!config.smtp) throw Object.assign(new Error('SMTP is not configured'), { code: 'ENOSMTP' });
    return (transport = transports.smtp(config.smtp));
  };
  const allowed = new Set(config.sendAllowlist);

  return {
    mode,
    async send(m) {
      let to = m.to;
      let subject = headerText(m.subject, 250);
      let bcc = m.bcc;
      let redirected = false;
      if (mode === 'allowlist' && m.kind === 'customer' && !allowed.has(m.to.trim().toLowerCase())) {
        to = config.ownerEmail;
        subject = `${PILOT_PREFIX} ${subject}`;
        bcc = undefined;
        redirected = true;
      }
      const msg: SendMailOptions = {
        from: config.mailFrom,
        to,
        subject,
        // The injected clock (tests, the demo's fake clock); the system clock in production.
        date: new Date(now()),
        text: m.text,
        textEncoding: 'quoted-printable',
        attachments: (m.attachments ?? []).map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
          contentDisposition: 'attachment' as const,
        })),
      };
      if (m.html !== undefined) msg.html = m.html;
      if (m.replyTo) msg.replyTo = m.replyTo;
      if (bcc) msg.bcc = bcc;
      if (m.inReplyTo) msg.inReplyTo = m.inReplyTo;
      if (m.references?.length) msg.references = [...m.references];
      const info = (await get().sendMail(msg)) as { messageId: string; message?: unknown };
      if (mode === 'dry-run') {
        await mkdir(outbox, { recursive: true, mode: 0o700 });
        const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
        const file = `${stamp}-${m.kind}-${randomBytes(4).toString('hex')}.eml`;
        const body = Buffer.isBuffer(info.message) ? info.message : Buffer.from(String(info.message ?? ''));
        await writeFile(join(outbox, file), body, { mode: 0o600 });
      }
      return { messageId: info.messageId, redirected };
    },
    async close() {
      transport?.close();
      transport = null;
    },
  };
}

export interface OutboxEntry {
  file: string;
  bytes: number;
  modified: string;
}

/** The dry-run outbox, newest first (GET /dev/outbox). */
export async function listOutbox(dataDir: string): Promise<OutboxEntry[]> {
  const dir = join(dataDir, OUTBOX);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.eml'));
  } catch {
    return [];
  }
  const out = await Promise.all(
    names.map(async (file) => {
      const s = await stat(join(dir, file));
      return { file, bytes: s.size, modified: s.mtime.toISOString() };
    }),
  );
  return out.sort((a, b) => b.file.localeCompare(a.file));
}
