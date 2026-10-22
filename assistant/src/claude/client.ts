// Claude client (docs/angebot.md §6.1): two structured-output calls behind a small interface, so
// the step and the tests never touch the SDK. The SDK implementation:
// - model claude-opus-5-5, `output_config: { format, effort: 'medium' }`, max_tokens 4000 / 3000;
//   thinking is always on for this model and is not configured; no temperature/top_p/top_k, no prefill;
// - the stable system prompt (rules + shop brief) first with cache_control, the task block second
//   (also cached), an optional corrective note last (not cached); the case data is the user message;
// - server-side refusal fallback opted in on the beta surface (`betas` + `fallbacks: 'default'`,
//   §6.1 of docs/angebot.md records why the beta parse was used);
// - `stop_reason` is checked before any output is used: `refusal` (only its category is logged) and
//   `max_tokens` are failures, as is a missing or invalid `parsed_output`;
// - SDK errors are mapped most-specific-first to a KiFehler: 408/409/429, ≥ 500 and connection
//   errors are retryable (the job runner's backoff retries the step), other 4xx are permanent.
// The SDK's own retries are off (maxRetries 0): the runner's schedule is the one retry policy.
// Usage is logged as model, stop_reason, token counts and latency; never content.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { MessageCreateParamsNonStreaming as BetaMessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { z } from 'zod';
import type { Logger } from '../log';
import type { Verstoss } from './guards';
import { angebotstextNachricht, bewertenNachricht, type AngebotstextInput, type BewertenInput } from './input';
import { SYSTEM_ANGEBOTSTEXT, SYSTEM_BEWERTEN, korrekturHinweis, systemBasis } from './prompts';
import { Angebotstext, Bewertung } from './schemas';

export const MODEL = 'claude-opus-5-5';
export const MAX_TOKENS = { bewerten: 4000, angebotstext: 3000 } as const;
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Per request; Opus with thinking and ≤ 4000 output tokens stays well below. */
export const TIMEOUT_MS = 180_000;

export type Aufruf = keyof typeof MAX_TOKENS;

export interface KiNutzung {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface KiErgebnis<T> {
  output: T;
  usage: KiNutzung;
  /** The model that produced the output (a fallback model after a refusal). */
  model: string;
}

export interface KiOptionen {
  /** Guard violations of the previous answer: adds the corrective system note (retry). */
  korrektur?: readonly Verstoss[];
}

export interface ClaudeClient {
  bewerten(input: BewertenInput, o?: KiOptionen): Promise<KiErgebnis<Bewertung>>;
  angebotstext(input: AngebotstextInput, o?: KiOptionen): Promise<KiErgebnis<Angebotstext>>;
}

/**
 * A failed call, as a code. `retryable`: the job runner may try again (rate limit, overload,
 * network). `permanent` (the opposite) tells the runner to give up at once. `usage` is set when the
 * API answered (refusal, max_tokens, invalid output), so the cost guard can count it.
 */
export class KiFehler extends Error {
  readonly permanent: boolean;
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly usage: KiNutzung | null = null,
  ) {
    super(code);
    this.name = 'KiFehler';
    this.permanent = !retryable;
  }
}

/** The response fields the client reads (a subset of ParsedBetaMessage, so tests can fake it). */
export interface RohAntwort {
  model: string;
  stop_reason: string | null;
  stop_details?: { category?: string | null } | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  content: readonly { type: string; parsed_output?: unknown }[];
  parsed_output?: unknown;
}

export type ParseCall = (params: BetaMessageCreateParamsNonStreaming) => Promise<RohAntwort>;

const nutzung = (u: RohAntwort['usage']): KiNutzung => ({
  input: u.input_tokens ?? 0,
  output: u.output_tokens ?? 0,
  cacheRead: u.cache_read_input_tokens ?? 0,
  cacheWrite: u.cache_creation_input_tokens ?? 0,
});

/**
 * The output format: the SDK's zod helper, but a parse failure yields null instead of throwing,
 * so stop_reason can be checked first and a refused or truncated answer is reported as such.
 */
function format<S extends z.ZodType>(schema: S) {
  const base = zodOutputFormat(schema);
  return {
    ...base,
    parse: (content: string): z.infer<S> | null => {
      try {
        return base.parse(content);
      } catch {
        return null;
      }
    },
  };
}

/** Request parameters of one call; typed against the SDK, so the compiler checks every field. */
export function requestParams(
  aufruf: Aufruf,
  user: string,
  korrektur: readonly Verstoss[] | undefined,
  fallbacks = true,
): BetaMessageCreateParamsNonStreaming {
  const system: BetaMessageCreateParamsNonStreaming['system'] = [
    { type: 'text', text: systemBasis(), cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text: aufruf === 'bewerten' ? SYSTEM_BEWERTEN() : SYSTEM_ANGEBOTSTEXT(),
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (korrektur?.length) system.push({ type: 'text', text: korrekturHinweis(korrektur) });
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS[aufruf],
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: format(aufruf === 'bewerten' ? Bewertung : Angebotstext), effort: 'medium' },
    ...(fallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
  };
}

/** Maps any thrown value to a KiFehler (SDK classes most-specific-first). */
export function klassifiziere(e: unknown): KiFehler {
  if (e instanceof KiFehler) return e;
  if (e instanceof Anthropic.RateLimitError) return new KiFehler('ki_429', true);
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new KiFehler('ki_timeout', true);
  if (e instanceof Anthropic.APIConnectionError) return new KiFehler('ki_verbindung', true);
  if (e instanceof Anthropic.InternalServerError) return new KiFehler(`ki_${e.status ?? 500}`, true);
  if (e instanceof Anthropic.AuthenticationError) return new KiFehler('ki_401', false);
  if (e instanceof Anthropic.PermissionDeniedError) return new KiFehler('ki_403', false);
  if (e instanceof Anthropic.NotFoundError) return new KiFehler('ki_404', false);
  if (e instanceof Anthropic.UnprocessableEntityError) return new KiFehler('ki_422', false);
  if (e instanceof Anthropic.BadRequestError) return new KiFehler('ki_400', false);
  if (e instanceof Anthropic.APIError) {
    const s = typeof e.status === 'number' ? e.status : 0;
    return new KiFehler(s ? `ki_${s}` : 'ki_api', !s || s === 408 || s === 409 || s === 429 || s >= 500);
  }
  if (e instanceof Anthropic.AnthropicError) return new KiFehler('ki_sdk', true);
  return new KiFehler('ki_unbekannt', true);
}

export interface SdkClientOptions {
  apiKey: string;
  log: Logger;
  now?: () => number;
  /** Injected for tests; default: the SDK's beta.messages.parse. */
  parse?: ParseCall;
  /** Server-side refusal fallback (default on). */
  fallbacks?: boolean;
}

export function createSdkClient(o: SdkClientOptions): ClaudeClient {
  const now = o.now ?? (() => Date.now());
  let parse = o.parse;
  if (!parse) {
    const sdk = new Anthropic({ apiKey: o.apiKey, maxRetries: 0, timeout: TIMEOUT_MS });
    parse = (p) => sdk.beta.messages.parse(p);
  }
  const call = parse;

  async function run<T>(aufruf: Aufruf, fall: string, user: string, k: KiOptionen | undefined): Promise<KiErgebnis<T>> {
    const t0 = now();
    let res: RohAntwort;
    try {
      res = await call(requestParams(aufruf, user, k?.korrektur, o.fallbacks ?? true));
    } catch (e) {
      const f = klassifiziere(e);
      o.log.warn('ki_error', { fall, step: aufruf, code: f.code, ms: now() - t0 });
      throw f;
    }
    const usage = nutzung(res.usage);
    const fallback = res.content.some((b) => b.type === 'fallback');
    o.log.info('ki_call', {
      fall,
      step: aufruf,
      model: String(res.model).slice(0, 60),
      stop: String(res.stop_reason).slice(0, 40),
      tokensIn: usage.input,
      tokensOut: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      ms: now() - t0,
      ...(fallback ? { kind: 'fallback' } : {}),
    });
    if (res.stop_reason === 'refusal') {
      const cat = res.stop_details?.category;
      o.log.warn('ki_refusal', { fall, step: aufruf, code: typeof cat === 'string' ? cat.slice(0, 40) : 'none' });
      throw new KiFehler('ki_refusal', false, usage);
    }
    if (res.stop_reason === 'max_tokens') throw new KiFehler('ki_max_tokens', false, usage);
    if (res.stop_reason !== 'end_turn' && res.stop_reason !== 'stop_sequence') {
      throw new KiFehler('ki_stop', false, usage);
    }
    // After a fallback the answer is the last text block (the declining model's part comes first).
    let output: unknown = null;
    for (const b of res.content) if (b.type === 'text' && b.parsed_output != null) output = b.parsed_output;
    output ??= res.parsed_output ?? null;
    if (output === null) throw new KiFehler('ki_ungueltig', true, usage);
    return { output: output as T, usage, model: String(res.model) };
  }

  return {
    bewerten: (i, k) => run<Bewertung>('bewerten', i.fall, bewertenNachricht(i), k),
    angebotstext: (i, k) => run<Angebotstext>('angebotstext', i.fall, angebotstextNachricht(i), k),
  };
}
