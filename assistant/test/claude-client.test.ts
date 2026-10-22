// The SDK client (docs/angebot.md §6.1) with an injected transport: request parameters, stop_reason
// handling, parsed_output, refusal fallback, error classes and content-free usage logs. No network.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_BETA,
  KiFehler,
  MODEL,
  createSdkClient,
  klassifiziere,
  requestParams,
  type ParseCall,
  type RohAntwort,
} from '../src/claude/client';
import type { AngebotstextInput, BewertenInput } from '../src/claude/input';
import { createLogger } from '../src/log';
import type { Angebotstext, Bewertung } from '../src/claude/schemas';

const CANARY = 'Kanarienvogel7F3K';
const INPUT: BewertenInput = {
  fall: 'fall-1',
  typ: 'moebel',
  typLabel: 'Möbel nach Maß',
  mengenNoetig: false,
  anfrage: `Besondere Wünsche: ${CANARY}`,
};
const A_INPUT: AngebotstextInput = {
  ...INPUT,
  kalkulation: `- Werkstatt ${CANARY}`,
  bewertung: 'Machbarkeit: machbar',
};

const BEW: Bewertung = {
  spam: false,
  machbarkeit: 'machbar',
  gruende: [CANARY],
  risiken: [],
  fehlende_angaben: [],
  rueckfragen: [],
  passt_zum_betrieb: true,
  mengen: null,
};

function antwort(over: Partial<RohAntwort> = {}, parsed: unknown = BEW): RohAntwort {
  return {
    model: MODEL,
    stop_reason: 'end_turn',
    stop_details: null,
    usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    content: [{ type: 'text', parsed_output: parsed }],
    parsed_output: parsed,
    ...over,
  };
}

function client(reply: (p: Parameters<ParseCall>[0]) => Promise<RohAntwort>) {
  const logs: string[] = [];
  const calls: Parameters<ParseCall>[0][] = [];
  const parse: ParseCall = async (p) => {
    calls.push(p);
    return reply(p);
  };
  const c = createSdkClient({ apiKey: 'sk-test', log: createLogger((l) => logs.push(l)), parse, now: () => 0 });
  return { c, logs, calls };
}

describe('request parameters', () => {
  it('use claude-opus-5-5, structured output with effort medium, cached system prompt, fallbacks', () => {
    const p = requestParams('bewerten', 'USER', undefined);
    expect(p.model).toBe(MODEL);
    expect(p.max_tokens).toBe(4000);
    expect(p.output_config?.effort).toBe('medium');
    expect(p.output_config?.format?.type).toBe('json_schema');
    expect(p.betas).toEqual([FALLBACK_BETA]);
    expect((p as { fallbacks?: unknown }).fallbacks).toBe('default');
    expect(p.messages).toEqual([{ role: 'user', content: 'USER' }]);
    const system = p.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(2);
    expect(system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    expect(system[0]!.text).toContain('<betrieb>');
    expect(system[0]!.text).toContain('untrusted');
    expect(system[1]!.text).toContain('Task: assess');
    for (const k of ['thinking', 'temperature', 'top_p', 'top_k']) expect(p).not.toHaveProperty(k);
    expect(requestParams('angebotstext', 'U', undefined).max_tokens).toBe(3000);
    expect(requestParams('bewerten', 'U', undefined, false)).not.toHaveProperty('betas');
  });

  it('adds the corrective note last, uncached, with rules only', () => {
    const p = requestParams('angebotstext', 'U', ['betrag', 'url']);
    const system = p.system as { text: string; cache_control?: unknown }[];
    expect(system).toHaveLength(3);
    expect(system[2]!.cache_control).toBeUndefined();
    expect(system[2]!.text).toContain('no prices, amounts or currency');
    expect(system[2]!.text).toContain('no URLs');
  });

  it('parse yields null instead of throwing on invalid output', () => {
    const f = requestParams('bewerten', 'U', undefined).output_config!.format as unknown as {
      parse(s: string): unknown;
    };
    expect(f.parse('{"spam": true}')).toBeNull();
    expect(f.parse('not json')).toBeNull();
    expect(f.parse(JSON.stringify(BEW))).toEqual(BEW);
  });
});

describe('responses', () => {
  it('returns parsed output, usage and model; logs usage without content', async () => {
    const { c, logs, calls } = client(async () => antwort());
    const r = await c.bewerten(INPUT);
    expect(r.output).toEqual(BEW);
    expect(r.usage).toEqual({ input: 1200, output: 300, cacheRead: 900, cacheWrite: 0 });
    expect(calls[0]!.messages[0]!.content).toContain('<anfrage>');
    const line = JSON.parse(logs[0]!);
    expect(line).toMatchObject({ event: 'ki_call', step: 'bewerten', model: MODEL, stop: 'end_turn', tokensIn: 1200 });
    expect(logs.join('\n')).not.toContain(CANARY);
  });

  it('treats refusal as a permanent failure and logs only its category', async () => {
    const { c, logs } = client(async () =>
      antwort({ stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] }, null),
    );
    const e = await c.bewerten(INPUT).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(KiFehler);
    expect(e).toMatchObject({ code: 'ki_refusal', retryable: false, permanent: true });
    expect((e as KiFehler).usage?.input).toBe(1200);
    expect(logs.some((l) => l.includes('"event":"ki_refusal"') && l.includes('general_harms'))).toBe(true);
  });

  it('treats max_tokens and other stop reasons as failures, even with parsed output', async () => {
    const { c } = client(async () => antwort({ stop_reason: 'max_tokens' }));
    await expect(c.bewerten(INPUT)).rejects.toMatchObject({ code: 'ki_max_tokens', retryable: false });
    const { c: c2 } = client(async () => antwort({ stop_reason: 'pause_turn' }));
    await expect(c2.bewerten(INPUT)).rejects.toMatchObject({ code: 'ki_stop', retryable: false });
  });

  it('treats a null parsed_output as an invalid (retryable) answer', async () => {
    const { c } = client(async () => antwort({}, null));
    await expect(c.angebotstext(A_INPUT)).rejects.toMatchObject({ code: 'ki_ungueltig', retryable: true });
  });

  it('after a server-side fallback uses the last text block', async () => {
    const text: Angebotstext = {
      einleitung: 'Danke.',
      leistung: [],
      nicht_enthalten: [],
      naechster_schritt: 'Aufmaß.',
    };
    const { c, logs } = client(async () =>
      antwort(
        {
          model: 'claude-fallback',
          content: [{ type: 'text', parsed_output: null }, { type: 'fallback' }, { type: 'text', parsed_output: text }],
        },
        null,
      ),
    );
    const r = await c.angebotstext(A_INPUT);
    expect(r.output).toEqual(text);
    expect(r.model).toBe('claude-fallback');
    expect(logs.some((l) => l.includes('"kind":"fallback"'))).toBe(true);
  });
});

describe('errors', () => {
  const headers = new Headers();
  it.each([
    [new Anthropic.RateLimitError(429, undefined, CANARY, headers), 'ki_429', true],
    [new Anthropic.InternalServerError(500, undefined, CANARY, headers), 'ki_500', true],
    [new Anthropic.InternalServerError(529, undefined, CANARY, headers), 'ki_529', true],
    [new Anthropic.APIConnectionTimeoutError({ message: CANARY }), 'ki_timeout', true],
    [new Anthropic.APIConnectionError({ message: CANARY }), 'ki_verbindung', true],
    [new Anthropic.APIError(408, undefined, CANARY, headers), 'ki_408', true],
    [new Anthropic.APIError(409, undefined, CANARY, headers), 'ki_409', true],
    [new Anthropic.BadRequestError(400, undefined, CANARY, headers), 'ki_400', false],
    [new Anthropic.AuthenticationError(401, undefined, CANARY, headers), 'ki_401', false],
    [new Anthropic.PermissionDeniedError(403, undefined, CANARY, headers), 'ki_403', false],
    [new Anthropic.NotFoundError(404, undefined, CANARY, headers), 'ki_404', false],
    [new Anthropic.UnprocessableEntityError(422, undefined, CANARY, headers), 'ki_422', false],
    [new Anthropic.APIError(418, undefined, CANARY, headers), 'ki_418', false],
    [new Anthropic.AnthropicError(CANARY), 'ki_sdk', true],
    [new Error(CANARY), 'ki_unbekannt', true],
  ] as const)('%s → %s', async (err, code, retryable) => {
    expect(klassifiziere(err)).toMatchObject({ code, retryable, permanent: !retryable });
    const { c, logs } = client(async () => {
      throw err;
    });
    const e = await c.bewerten(INPUT).catch((x: unknown) => x);
    expect(e).toMatchObject({ code, retryable });
    expect(logs.join('\n')).not.toContain(CANARY);
    expect(logs.some((l) => l.includes(`"code":"${code}"`))).toBe(true);
  });
});
