// Review tokens and the PIN session (docs/angebot.md §7.4): only the hash is stored, digests are
// compared in constant time, the session value is HMAC-signed and expires after 12 h.
import * as crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:crypto')>();
  return { ...orig, timingSafeEqual: vi.fn(orig.timingSafeEqual) };
});

const { SESSION_MS, neueSitzung, neuesToken, pinPasst, sitzungGueltig, sitzungsCookie, tokenHash, tokenPasst } =
  await import('../src/token');

afterEach(() => vi.mocked(crypto.timingSafeEqual).mockClear());

describe('review token', () => {
  it('is 32 random bytes in base64url; the store keeps its SHA-256', () => {
    const t = neuesToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    expect(neuesToken()).not.toBe(t);
    expect(tokenHash(t)).toBe(crypto.createHash('sha256').update(t).digest('hex'));
  });

  it('compares the digests with timingSafeEqual', () => {
    const t = neuesToken();
    const h = tokenHash(t);
    expect(tokenPasst(h, t)).toBe(true);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    const other = neuesToken();
    expect(tokenPasst(h, other)).toBe(false);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed input before comparing', () => {
    const t = neuesToken();
    const h = tokenHash(t);
    for (const x of ['', t.slice(1), `${t}=`, `${t.slice(0, 42)}+`, null, undefined])
      expect(tokenPasst(h, x)).toBe(false);
    expect(tokenPasst(null, t)).toBe(false);
    expect(tokenPasst('zz', t)).toBe(false);
    expect(crypto.timingSafeEqual).not.toHaveBeenCalled();
  });
});

describe('PIN and session', () => {
  const secret = 's'.repeat(40);
  const now = Date.UTC(2026, 9, 22, 9);

  it('PIN compare hashes both sides (constant time, any length)', () => {
    expect(pinPasst('4711', '4711')).toBe(true);
    expect(pinPasst('4711', '471')).toBe(false);
    expect(pinPasst('4711', '4711'.repeat(500))).toBe(false);
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(3);
  });

  it('session: HMAC-signed, valid 12 h, tamper-proof', () => {
    const v = neueSitzung(secret, now);
    expect(sitzungGueltig(secret, v, now)).toBe(true);
    expect(sitzungGueltig(secret, v, now + SESSION_MS - 1)).toBe(true);
    expect(sitzungGueltig(secret, v, now + SESSION_MS)).toBe(false);
    expect(sitzungGueltig('t'.repeat(40), v, now)).toBe(false);
    const [exp, mac] = v.split('.') as [string, string];
    expect(sitzungGueltig(secret, `${Number(exp) + 3_600_000}.${mac}`, now)).toBe(false);
    expect(sitzungGueltig(secret, `${now + 100 * SESSION_MS}.${mac}`, now)).toBe(false);
    expect(sitzungGueltig(secret, undefined, now)).toBe(false);
    expect(sitzungGueltig(secret, 'x.y', now)).toBe(false);
    expect(sitzungsCookie(v)).toBe(`__Host-ss_sitzung=${v}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=43200`);
  });
});
