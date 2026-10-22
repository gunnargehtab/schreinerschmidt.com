// Hono app factory (docs/angebot.md §2.1). Every dependency is injected (config, store, mailer,
// clock, logger, job runner, rate limiter), so tests run the app in-process with app.request().
// Security headers on every response; `Cache-Control: no-store` on everything but /health.
import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ERROR_MSG, cors, createResponder, handleAnfrage } from './anfrage';
import { BODY_LIMIT } from './attachments';
import type { Config } from './config';
import type { JobRunner } from './jobs';
import { errorCode, type Logger } from './log';
import { listOutbox, type Mailer } from './mail/index';
import type { RateLimiter } from './ratelimit';
import type { Store } from './store';
import type { Clock } from './types';

export interface AppDeps {
  config: Config;
  store: Store;
  mailer: Mailer;
  clock: Clock;
  log: Logger;
  runner: JobRunner;
  limiter: RateLimiter;
  /** Client address for the rate limit; default: the socket, or the last X-Forwarded-For hop with TRUST_PROXY. */
  clientIp?: (c: Context) => string;
  /** Override of INLINE_MAIL_MS (tests). */
  inlineMailMs?: number;
  /** Override of BODY_LIMIT (tests). */
  bodyLimit?: number;
}

/** CSP for the backend's own responses; the review page (7d) sets its own. */
const CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function defaultClientIp(config: Config): (c: Context) => string {
  return (c) => {
    if (config.trustProxy) {
      const hops = (c.req.header('x-forwarded-for') ?? '').split(',').map((s) => s.trim());
      const last = hops.at(-1);
      if (last) return last;
    }
    try {
      return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
      return 'unknown';
    }
  };
}

export function createApp(d: AppDeps): Hono {
  const app = new Hono();
  const clientIp = d.clientIp ?? defaultClientIp(d.config);

  app.use('*', async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    h.set('X-Frame-Options', 'DENY');
    if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', CSP);
    if (c.req.path !== '/health') h.set('Cache-Control', 'no-store');
  });

  app.get('/health', (c) => c.body(null, 204));

  // Origin first: nothing else is looked at for a foreign origin (no CORS headers either).
  const origin: MiddlewareHandler = async (c, next) => {
    if (c.req.header('origin') !== d.config.siteOrigin) {
      return createResponder(c, d).failure(403, 'origin', ERROR_MSG.origin);
    }
    cors(c, d.config.siteOrigin);
    return next();
  };
  const multipart: MiddlewareHandler = async (c, next) => {
    if (!/^multipart\/form-data\s*;\s*boundary=/i.test(c.req.header('content-type') ?? '')) {
      return createResponder(c, d).failure(415, 'content_type', ERROR_MSG.content_type);
    }
    return next();
  };
  const rate: MiddlewareHandler = async (c, next) => {
    if (!d.limiter.hit(clientIp(c))) return createResponder(c, d).failure(429, 'rate_limited', ERROR_MSG.rate_limited);
    return next();
  };
  const size = bodyLimit({
    maxSize: d.bodyLimit ?? BODY_LIMIT,
    onError: (c) => createResponder(c, d).failure(413, 'body_too_large', ERROR_MSG.body_too_large),
  });

  // A cross-origin fetch with Accept: application/json is a simple request; the preflight answer
  // is only there for browsers that send one anyway.
  app.options('/anfrage', origin, (c) => {
    c.header('Access-Control-Allow-Methods', 'POST');
    c.header('Access-Control-Allow-Headers', 'Accept');
    c.header('Access-Control-Max-Age', '600');
    return c.body(null, 204);
  });
  app.post('/anfrage', origin, multipart, rate, size, (c) => handleAnfrage(c, d));

  if (d.config.nodeEnv !== 'production') {
    app.get('/dev/outbox', async (c) => c.json(await listOutbox(d.config.dataDir)));
  }

  app.notFound((c) => c.text('Not found', 404));
  app.onError((err, c) => {
    d.log.error('unhandled', { route: c.req.routePath, code: errorCode(err) });
    return c.json({ success: false, error: 'network', error_msg: ERROR_MSG.internal }, 500);
  });
  return app;
}
