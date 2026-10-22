// Environment parsing (docs/angebot.md §10, §8.3).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, describeConfig, loadConfig } from '../src/config';

const PROD = {
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://anfrage.schreinerei.test',
  SITE_ORIGIN: 'https://www.schreinerei.test/',
  OWNER_EMAIL: 'inhaber@schreinerei.test',
  MAIL_FROM: 'Schreinerei Schmidt <anfrage@schreinerei.test>',
  SEND_MODE: 'dry-run',
  DATA_DIR: '/var/lib/assistant',
};

const fails = (env: Record<string, string>): ConfigError => {
  try {
    loadConfig(env, '/srv');
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return e as ConfigError;
  }
  throw new Error('expected a ConfigError');
};

describe('config', () => {
  it('has safe development defaults', () => {
    const c = loadConfig({}, '/srv/assistant');
    expect(c).toMatchObject({
      nodeEnv: 'development',
      sendMode: 'dry-run',
      smtp: null,
      siteBase: '/',
      tokenTtlDays: 14,
    });
    expect(c.dataDir).toBe(resolve('/srv/assistant', './data'));
    expect(c.ownerEmail.endsWith('.invalid')).toBe(true);
  });

  it('accepts a complete production environment and normalises origins', () => {
    const c = loadConfig(PROD, '/srv');
    expect(c.siteOrigin).toBe('https://www.schreinerei.test');
    expect(c.dataDir).toBe('/var/lib/assistant');
  });

  it('fails fast in production when required values are missing, naming them', () => {
    const e = fails({ NODE_ENV: 'production' });
    expect(e.variables).toEqual([
      'PUBLIC_BASE_URL',
      'SITE_ORIGIN',
      'OWNER_EMAIL',
      'MAIL_FROM',
      'SEND_MODE',
      'DATA_DIR',
    ]);
  });

  it('requires SMTP credentials for allowlist and live', () => {
    expect(fails({ ...PROD, SEND_MODE: 'live' }).variables).toEqual(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']);
    expect(fails({ ...PROD, SEND_MODE: 'allowlist', SMTP_HOST: 'smtp.test' }).variables).toEqual([
      'SMTP_USER',
      'SMTP_PASS',
    ]);
    const c = loadConfig({ ...PROD, SEND_MODE: 'live', SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(c.smtp).toEqual({ host: 'smtp.test', port: 587, user: 'u', pass: 'p' });
  });

  it('never puts values into errors or the loggable summary', () => {
    const e = fails({
      ...PROD,
      SITE_ORIGIN: 'not-a-url-geheim',
      SMTP_PORT: 'geheim-port',
      SMTP_PASS: 'geheim-pass',
      SEND_ALLOWLIST: 'ok@example.com, geheim',
    });
    expect(e.message).not.toContain('geheim');
    expect(e.variables).toEqual(expect.arrayContaining(['SITE_ORIGIN', 'SMTP_PORT']));
    const c = loadConfig({
      ...PROD,
      SEND_MODE: 'live',
      SMTP_HOST: 'h',
      SMTP_USER: 'u',
      SMTP_PASS: 'geheim-pass',
      ANTHROPIC_API_KEY: 'sk-geheim',
    });
    const s = JSON.stringify(describeConfig(c));
    expect(s).not.toMatch(/geheim|schreinerei|@/);
  });

  it('rejects a MAIL_FROM with a line break and a malformed allowlist', () => {
    expect(fails({ ...PROD, MAIL_FROM: 'a@b.de\r\nBcc: x@y.de' }).variables).toEqual(['MAIL_FROM']);
    expect(fails({ ...PROD, SEND_ALLOWLIST: 'a@b.de, nope' }).variables).toEqual(['SEND_ALLOWLIST']);
  });
});
