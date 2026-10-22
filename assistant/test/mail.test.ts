// SEND_MODE transports and header hygiene (docs/angebot.md §8.3, §11).
import net from 'node:net';
import tls from 'node:tls';
import nodemailer from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PILOT_PREFIX, createMailer, defaultTransports } from '../src/mail/index';
import { headerText, safeFilename } from '../src/sanitize';
import { REGAL, configuratorForm, contactForm, newId } from './fixtures';
import { OWNER, cleanupDirs, harness, header, headers, tempDir, testConfig, type Harness } from './helpers';

let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
  vi.restoreAllMocks();
  cleanupDirs();
});

const SMTP_ENV = { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'u', SMTP_PASS: 'p' };

/** A fake "SMTP" transport (nodemailer's JSON transport) with a spy on sendMail. */
function fakeSmtp() {
  const t = nodemailer.createTransport({ jsonTransport: true });
  const spy = vi.spyOn(t, 'sendMail');
  return { factory: vi.fn(() => t), spy };
}

describe('dry-run', () => {
  it('writes an .eml to DATA_DIR/outbox and never builds SMTP or opens a socket', async () => {
    const connect = vi.spyOn(net.Socket.prototype, 'connect');
    const netConnect = vi.spyOn(net, 'connect');
    const tlsConnect = vi.spyOn(tls, 'connect');
    h = harness();
    const res = await h.post(configuratorForm(REGAL));
    expect(res.status).toBe(200);
    expect(h.outbox()).toHaveLength(1);
    expect(h.outbox()[0]).toMatch(/^Content-Type: |^From: |^To: |^Message-ID: /m);
    expect(h.smtp).not.toHaveBeenCalled();
    expect(h.stream).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    expect(netConnect).not.toHaveBeenCalled();
    expect(tlsConnect).not.toHaveBeenCalled();
  });

  it('lists the outbox on GET /dev/outbox outside production', async () => {
    h = harness();
    await h.post(configuratorForm(REGAL));
    const res = await h.app.request('/dev/outbox');
    expect(res.status).toBe(200);
    const list = (await res.json()) as { file: string; bytes: number }[];
    expect(list).toHaveLength(1);
    expect(list[0]?.file).toMatch(/-owner-[0-9a-f]{8}\.eml$/);
  });
});

describe('allowlist', () => {
  it('redirects a customer mail to a non-allowlisted address to the owner with the pilot prefix', async () => {
    const { factory, spy } = fakeSmtp();
    const config = testConfig(tempDir(), { SEND_MODE: 'allowlist', SEND_ALLOWLIST: 'Kunde@Example.com', ...SMTP_ENV });
    const mailer = createMailer(config, { transports: { stream: defaultTransports.stream, smtp: factory } });

    const away = await mailer.send({
      kind: 'customer',
      to: 'fremd@example.org',
      subject: 'Ihr Angebot',
      text: 'x',
      bcc: OWNER,
    });
    expect(away.redirected).toBe(true);
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ to: OWNER, subject: `${PILOT_PREFIX} Ihr Angebot` });
    expect(spy.mock.calls[0]?.[0]).not.toHaveProperty('bcc');

    const allowed = await mailer.send({ kind: 'customer', to: 'kunde@example.com', subject: 'Ihr Angebot', text: 'x' });
    expect(allowed.redirected).toBe(false);
    expect(spy.mock.calls[1]?.[0]).toMatchObject({ to: 'kunde@example.com', subject: 'Ihr Angebot' });

    const owner = await mailer.send({ kind: 'owner', to: OWNER, subject: 'Anfrage', text: 'x' });
    expect(owner.redirected).toBe(false);
    expect(spy.mock.calls[2]?.[0]).toMatchObject({ to: OWNER, subject: 'Anfrage' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('live sends customer mail as addressed', async () => {
    const { factory, spy } = fakeSmtp();
    const config = testConfig(tempDir(), { SEND_MODE: 'live', ...SMTP_ENV });
    const mailer = createMailer(config, { transports: { stream: defaultTransports.stream, smtp: factory } });
    await mailer.send({ kind: 'customer', to: 'fremd@example.org', subject: 'Ihr Angebot', text: 'x' });
    expect(spy.mock.calls[0]?.[0]).toMatchObject({ to: 'fremd@example.org', subject: 'Ihr Angebot' });
  });
});

describe('header injection', () => {
  const INJECT = 'Anfrage\r\nBcc: evil@example.com\r\nX-Evil: 1\nSubject: fake';

  it('neutralises CR/LF in _subject and ignores a crafted _replyto (configurator)', async () => {
    h = harness();
    const fd = configuratorForm(REGAL, {
      id: newId(),
      subject: INJECT,
      extra: { _replyto: 'erika@example.com\r\nBcc: evil@example.com' },
    });
    expect((await h.post(fd)).status).toBe(200);
    const [eml] = h.outbox();
    const lines = headers(eml!);
    expect(lines.filter((l) => /^(bcc|x-evil|cc):/i.test(l))).toEqual([]);
    expect(lines.filter((l) => /^subject:/i.test(l))).toHaveLength(1);
    expect(header(eml!, 'Subject')).toBe('Anfrage Bcc: evil@example.com X-Evil: 1 Subject: fake');
    expect(header(eml!, 'Reply-To')).toBe('erika@example.com');
    expect(header(eml!, 'To')).toBe(OWNER);
    expect(eml).not.toContain('evil@example.com\r\n');
  });

  it('neutralises the same in a contact form subject and rejects an e-mail with CR/LF', async () => {
    h = harness();
    expect((await h.post(contactForm({ _subject: INJECT }))).status).toBe(200);
    const lines = headers(h.outbox()[0]!);
    expect(lines.filter((l) => /^(bcc|x-evil):/i.test(l))).toEqual([]);
    const bad = await h.post(contactForm({ email: 'a@example.com\r\nBcc: evil@example.com' }));
    expect(bad.status).toBe(422);
  });

  it('caps the subject length and strips control and separator characters', () => {
    const sep = String.fromCharCode(0x2028);
    expect(headerText(`a\u0000b${sep}c\u0085d\te`)).toBe('a b c d e');
    const long = headerText('x'.repeat(500));
    expect(long).toHaveLength(200);
    expect(long.endsWith('…')).toBe(true);
  });

  it('sanitizes attachment file names', () => {
    expect(safeFilename('../../etc/passwd.jpg', 'jpg', 'foto')).toBe('passwd.jpg');
    expect(safeFilename('C:\\Users\\a\\Bild 1 (2).PNG', 'png', 'foto')).toBe('Bild_1_2_.png');
    expect(safeFilename('.htaccess', 'jpg', 'foto')).toBe('foto.jpg');
    expect(safeFilename('a\r\nContent-Type: text/html.jpg', 'jpg', 'foto')).toBe('html.jpg');
    expect(safeFilename('a\r\nContent-Type: text.jpg', 'jpg', 'foto')).toBe('aContent-Type_text.jpg');
    expect(safeFilename('Schrank.svg.exe', 'jpg', 'foto')).toBe('Schrank.svg.jpg');
  });
});
