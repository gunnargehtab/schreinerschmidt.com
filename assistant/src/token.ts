// Review links and the owner's session (docs/angebot.md §7.4).
// - Token: 32 random bytes, base64url, only in the link; the case stores its SHA-256 (hex). A check
//   hashes the presented token and compares the digests in constant time.
// - Optional PIN: compared as SHA-256 digests in constant time. A correct PIN gives a session
//   cookie `__Host-ss_sitzung` = `<expiry ms>.<HMAC-SHA256(SESSION_SECRET, "sitzung:" + expiry)>`,
//   valid 12 h for every case (the link token is still required per case).
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOKEN_BYTES = 32;
/** base64url of 32 bytes, without padding. */
const TOKEN_FORM = /^[A-Za-z0-9_-]{43}$/;
const HASH_FORM = /^[0-9a-f]{64}$/;

export const neuesToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

export const tokenHash = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** True when `token` hashes to the stored digest (constant-time compare of the digests). */
export function tokenPasst(gespeichert: string | null | undefined, token: string | null | undefined): boolean {
  if (!gespeichert || !HASH_FORM.test(gespeichert) || typeof token !== 'string' || !TOKEN_FORM.test(token)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(gespeichert, 'hex'), createHash('sha256').update(token, 'utf8').digest());
}

/** PIN check: both sides hashed, so the compare is constant-time whatever the lengths. */
export function pinPasst(pin: string, eingabe: string): boolean {
  const a = createHash('sha256').update(pin, 'utf8').digest();
  const b = createHash('sha256').update(eingabe.slice(0, 256), 'utf8').digest();
  return timingSafeEqual(a, b);
}

export const SESSION_COOKIE = '__Host-ss_sitzung';
export const SESSION_MS = 12 * 3_600_000;

const mac = (secret: string, exp: number): Buffer =>
  createHmac('sha256', secret).update(`sitzung:${exp}`, 'utf8').digest();

/** A new session value, valid SESSION_MS from `now`. */
export function neueSitzung(secret: string, now: number): string {
  const exp = now + SESSION_MS;
  return `${exp}.${mac(secret, exp).toString('base64url')}`;
}

/** True for an untampered, unexpired session value. */
export function sitzungGueltig(secret: string, wert: string | undefined, now: number): boolean {
  const m = /^(\d{13,16})\.([A-Za-z0-9_-]{43})$/.exec(wert ?? '');
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > now) || exp > now + SESSION_MS) return false;
  return timingSafeEqual(Buffer.from(m[2]!, 'base64url'), mac(secret, exp));
}

/** The Set-Cookie value for a new session (§7.4: Secure, HttpOnly, SameSite=Strict, Path=/). */
export const sitzungsCookie = (wert: string): string =>
  `${SESSION_COOKIE}=${wert}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`;
