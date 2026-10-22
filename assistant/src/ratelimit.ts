// Rate limit of POST /anfrage (docs/assistant.md §8): 10 per hour per client, keyed by an HMAC of
// the IP with a random salt that lives in memory only and rotates daily. A rotation drops every
// key, so no IP-derived value is held longer than 24 h (and none survives a restart).
import { createHmac, randomBytes } from 'node:crypto';
import type { Clock } from './types';

const DAY = 86_400_000;

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
}

export class RateLimiter {
  private day = Number.NaN;
  private salt: Buffer = randomBytes(32);
  private hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(
    private readonly clock: Clock,
    opts: RateLimitOptions = {},
  ) {
    this.limit = opts.limit ?? 10;
    this.windowMs = opts.windowMs ?? 3_600_000;
  }

  /** Counts one request; false when the client is over the limit. */
  hit(ip: string): boolean {
    const now = this.clock.now();
    const day = Math.floor(now / DAY);
    if (day !== this.day) {
      this.day = day;
      this.salt = randomBytes(32);
      this.hits.clear();
    }
    const key = createHmac('sha256', this.salt).update(ip).digest('base64url');
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [k, list] of this.hits) if (!list.some((t) => t > now - this.windowMs)) this.hits.delete(k);
  }
}
