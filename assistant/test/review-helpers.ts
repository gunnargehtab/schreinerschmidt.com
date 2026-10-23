// Helpers for the owner-side tests (7d): a case run through the pipeline up to its TL;DR, the review
// link's token taken from that mail, and requests to the review page and its actions.
import type { Values } from '../../src/lib/configurator/fields';
import type { OutgoingMail } from '../src/mail/index';
import type { Fall } from '../src/store';
import { REGAL, configuratorForm, newId, type PostOptions } from './fixtures';
import type { Harness } from './helpers';

/** PUBLIC_BASE_URL of the test config (helpers.ts testConfig). */
export const BASE = 'https://anfrage.schreinerei.test';

export interface BewerteterFall {
  fall: Fall;
  token: string;
  tldr: OutgoingMail;
}

/** The TL;DR mail of a case (owner kind, link to the review page). */
export const tldrVon = (h: Harness, fall: Fall): OutgoingMail | undefined =>
  h.ctl.sent.find((m) => m.kind === 'owner' && m.text.includes(`/angebot/${fall.id}?t=`));

export const tokenAus = (mail: OutgoingMail): string => {
  const m = /\/angebot\/[0-9a-f-]+\?t=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!m?.[1]) throw new Error('no review link in the mail');
  return m[1];
};

/** Posts a configurator case and runs the pipeline up to the TL;DR. */
export async function bewerteterFall(
  h: Harness,
  values: Values = REGAL,
  opts: PostOptions = {},
): Promise<BewerteterFall> {
  const id = opts.id ?? newId();
  const res = await h.post(configuratorForm(values, { ...opts, id }));
  if (res.status !== 200) throw new Error(`POST /anfrage → ${res.status}`);
  await h.deps.runner.runDue();
  const fall = (await h.deps.store.getByAnfrageId(id!))!;
  const tldr = tldrVon(h, fall);
  if (!tldr) throw new Error('no TL;DR sent');
  return { fall, token: tokenAus(tldr), tldr };
}

export const seite = (h: Harness, id: string, token: string, headers: Record<string, string> = {}) =>
  h.app.request(`/angebot/${id}?t=${encodeURIComponent(token)}`, { headers });

export interface PostOpts {
  origin?: string | null;
  contentType?: string;
  cookie?: string;
  headers?: Record<string, string>;
}

/** A form POST to an action, as the browser sends it from the review page. */
export function aktion(h: Harness, id: string, name: string, fields: Record<string, string>, o: PostOpts = {}) {
  const headers: Record<string, string> = {
    'Content-Type': o.contentType ?? 'application/x-www-form-urlencoded',
    ...o.headers,
  };
  if (o.origin !== null) headers['Origin'] = o.origin ?? BASE;
  if (o.cookie) headers['Cookie'] = o.cookie;
  return h.app.request(`/angebot/${id}/${name}`, {
    method: 'POST',
    body: new URLSearchParams(fields).toString(),
    headers,
  });
}

/** Attributes of one tag's source (`name="value"` pairs, any order, across lines). */
const attribute = (tag: string): Record<string, string> =>
  Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));

const unescape = (s: string) => s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));

/** The hidden and visible values of the first POST form whose action ends with `/name` in a page. */
export function formular(html: string, name: string): Record<string, string> {
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)];
  const form = forms.find((m) => {
    const a = attribute(m[1]!);
    return a['method'] === 'post' && new RegExp(`^/angebot/[^/]+/${name}$`).test(a['action'] ?? '');
  });
  if (!form) throw new Error(`no form ${name}`);
  const f = form[2]!;
  const out: Record<string, string> = {};
  for (const m of f.matchAll(/<input\b([^>]*)>/g)) {
    const a = attribute(m[1]!);
    if ((a['type'] === 'hidden' || a['type'] === 'text') && a['name']) out[a['name']] = unescape(a['value'] ?? '');
  }
  for (const m of f.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    const a = attribute(m[1]!);
    if (a['name']) out[a['name']] = unescape(m[2]!);
  }
  return out;
}

/** Customer mails sent so far. */
export const kundenmails = (h: Harness): OutgoingMail[] => h.ctl.sent.filter((m) => m.kind === 'customer');

/** The page's visible h1 elements. */
export const h1s = (html: string): string[] => [...html.matchAll(/<h1[\s>]/g)].map((m) => m[0]);
