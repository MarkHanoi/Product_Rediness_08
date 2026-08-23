// C105 §5.4 + §6.2 — the BYOM relay refuses to fall back, and never leaks.
//
// ⭐ THE LOAD-BEARING TEST HERE is `§NO-FALLBACK`. A user key that the provider
// rejects must NOT quietly retry on PRYZM's key: that would spend PRYZM's money
// on the user's request with neither party told, and would break the "leaves
// this device only to call the provider you choose" promise on precisely the
// request where it matters most.

import { describe, it, expect } from 'vitest';
import {
  createByomRelay,
  describeProviderError,
  findProvider,
  ByomProviderError,
  type ByomCredential,
} from '../src/byom/index.js';

const SECRET = 'sk-ant-api03-LEAKCANARYLEAKCANARYLEAKCANARY99';

function credential(over: Partial<ByomCredential> = {}): ByomCredential {
  const p = findProvider(over.providerId ?? 'anthropic')!;
  return {
    providerId: p.id,
    area: 'device',
    model: p.defaultModel,
    baseUrl: p.defaultBaseUrl,
    maskedKey: '••••ry99',
    enabled: true,
    secret: SECRET,
    ...over,
  } as ByomCredential;
}

/**
 * A typed fetch double that records its calls.
 *
 * ⚠ Deliberately NOT `vi.fn(async () => …)`: that infers a ZERO-ARG signature,
 * so `mock.calls[0][0]` is a type error under this repo's strictness — and the
 * URL and the headers are the two things these tests exist to assert.
 */
interface RecordedCall {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

function recordingFetch(handler: () => Promise<Response>): {
  impl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const impl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : '',
    });
    return handler();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const ok = (body: unknown) => async () => jsonResponse(200, body);
const fail = (status: number, body: unknown) => async () => jsonResponse(status, body);

describe('§NO-FALLBACK — a rejected user key never reaches PRYZM', () => {
  it('a 401 throws with the provider own reason and calls nothing else', async () => {
    const { impl, calls } = recordingFetch(
      fail(401, { error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    );
    const relay = createByomRelay(credential(), impl);

    await expect(relay.complete({ model: 'x', system: 's', user: 'u' })).rejects.toBeInstanceOf(
      ByomProviderError,
    );

    // EXACTLY ONE outbound call. A second would BE the silent fallback.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('api.anthropic.com');
    // ⛔ and it must never be PRYZM's proxy.
    expect(calls[0]!.url).not.toContain('/api/anthropic');
  });

  it('the user-facing message says PRYZM did NOT substitute its own key', async () => {
    const { impl } = recordingFetch(fail(401, { error: { message: 'invalid x-api-key' } }));
    const relay = createByomRelay(credential(), impl);
    const err = await relay.complete({ model: 'x', system: '', user: 'u' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ByomProviderError);
    const msg = (err as ByomProviderError).userMessage();
    expect(msg).toContain('rejected your API key');
    expect(msg).toContain('invalid x-api-key');
    expect(msg).toContain('did NOT fall back');
  });

  it('a 429 is its own remedy, distinct from a bad key', async () => {
    const { impl, calls } = recordingFetch(fail(429, { error: { message: 'rate limit exceeded' } }));
    const relay = createByomRelay(credential(), impl);
    const err = (await relay
      .complete({ model: 'x', system: '', user: 'u' })
      .catch((e: unknown) => e)) as ByomProviderError;
    expect(err.status).toBe(429);
    expect(err.userMessage()).toContain('rate-limited');
    expect(calls).toHaveLength(1);
  });

  it('a browser-blocked call is a DIFFERENT value from a rejected key', async () => {
    // CORS / local-network refusal / offline: fetch throws before anything left.
    const { impl } = recordingFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const relay = createByomRelay(credential(), impl);
    const err = (await relay
      .complete({ model: 'x', system: '', user: 'u' })
      .catch((e: unknown) => e)) as ByomProviderError;
    expect(err.blockedByBrowser).toBe(true);
    expect(err.status).toBe(0);
    // The remedy differs, so the sentence differs. Collapsing them would send
    // the user off to re-check a key that was never the problem.
    expect(err.userMessage()).toContain('blocked the call');
    expect(err.userMessage()).toContain('was not sent anywhere else');
  });

  it('a 200 carrying no completion is a FAILURE, not an empty answer', async () => {
    const { impl } = recordingFetch(ok({ content: [] }));
    const relay = createByomRelay(credential(), impl);
    await expect(relay.complete({ model: 'x', system: '', user: 'u' })).rejects.toBeInstanceOf(
      ByomProviderError,
    );
  });
});

describe('§NO-LEAK — nothing that leaves the relay carries the key', () => {
  it('a provider that echoes the key back in its error has it redacted', async () => {
    const { impl } = recordingFetch(fail(401, { error: { message: `the key ${SECRET} is not valid` } }));
    const relay = createByomRelay(credential(), impl);
    const err = (await relay
      .complete({ model: 'x', system: '', user: 'u' })
      .catch((e: unknown) => e)) as ByomProviderError;
    expect(err.providerMessage).not.toContain(SECRET);
    expect(err.providerMessage).toContain('[redacted]');
    expect(err.message).not.toContain(SECRET);
    expect(err.userMessage()).not.toContain(SECRET);
  });

  it('a thrown network error mentioning the key has it redacted', async () => {
    const { impl } = recordingFetch(async () => {
      throw new Error(`refused to connect with Bearer ${SECRET}`);
    });
    const relay = createByomRelay(credential(), impl);
    const err = (await relay
      .complete({ model: 'x', system: '', user: 'u' })
      .catch((e: unknown) => e)) as ByomProviderError;
    expect(err.providerMessage).not.toContain(SECRET);
  });

  it('describeProviderError redacts whatever shape the provider used', () => {
    expect(describeProviderError(`plain text with ${SECRET}`)).not.toContain(SECRET);
    expect(describeProviderError({ message: SECRET })).not.toContain(SECRET);
    expect(describeProviderError({ error: SECRET })).not.toContain(SECRET);
  });
});

describe('§WIRE — the request is built in the provider own dialect', () => {
  it('Anthropic gets x-api-key, the version header AND the browser opt-in', async () => {
    const { impl, calls } = recordingFetch(
      ok({
        content: [{ type: 'text', text: 'hello' }],
        usage: { input_tokens: 11, output_tokens: 3 },
        model: 'claude-haiku-4-5-20251014',
      }),
    );
    const relay = createByomRelay(credential(), impl);
    const res = await relay.complete({ model: 'ignored', system: 'sys', user: 'usr' });

    const headers = calls[0]!.headers;
    expect(headers['x-api-key']).toBe(SECRET);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    // ⭐ MEASURED 2026-08-23: without this exact header Anthropic answers the
    // preflight 400 with NO access-control-allow-origin, so the browser never
    // sends the request at all.
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    expect(res.text).toBe('hello');
    expect(res.tokens).toEqual({ input: 11, output: 3 });
    // ⛔ PRYZM paid zero, so PRYZM's ledger records zero. C105 §5.2.
    expect(res.costUsd).toBe(0);
  });

  it('an OpenAI-dialect provider gets a bearer and a chat-completions body', async () => {
    const { impl, calls } = recordingFetch(
      ok({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
        model: 'gpt-4o-mini',
      }),
    );
    const openai = findProvider('openai')!;
    const relay = createByomRelay(
      credential({ providerId: 'openai', model: 'gpt-4o-mini', baseUrl: openai.defaultBaseUrl }),
      impl,
    );
    const res = await relay.complete({ model: 'ignored', system: 'sys', user: 'usr' });
    expect(calls[0]!.headers['authorization']).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(calls[0]!.body) as { messages: Array<{ role: string }> };
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(res.text).toBe('hi');
  });

  it('Ollama gets NO authorization header — a keyless provider is not a blank bearer', async () => {
    const { impl, calls } = recordingFetch(ok({ choices: [{ message: { content: 'local' } }], usage: {} }));
    const ollama = findProvider('ollama')!;
    const relay = createByomRelay(
      credential({
        providerId: 'ollama',
        secret: '',
        model: ollama.defaultModel,
        baseUrl: ollama.defaultBaseUrl,
      }),
      impl,
    );
    await relay.complete({ model: 'ignored', system: '', user: 'usr' });
    expect(calls[0]!.headers['authorization']).toBeUndefined();
    expect(calls[0]!.url).toContain('localhost:11434');
  });

  it('Gemini puts the model in the path and the key in a HEADER, never the query string', async () => {
    const { impl, calls } = recordingFetch(
      ok({
        candidates: [{ content: { parts: [{ text: 'g' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 },
      }),
    );
    const google = findProvider('google')!;
    const relay = createByomRelay(
      credential({ providerId: 'google', model: 'gemini-2.0-flash', baseUrl: google.defaultBaseUrl }),
      impl,
    );
    const res = await relay.complete({ model: 'ignored', system: 'sys', user: 'usr' });
    expect(calls[0]!.url).toContain('gemini-2.0-flash:generateContent');
    // ⛔ A key in the query string lands in proxy logs, browser history and
    // Referer headers. It goes in a header.
    expect(calls[0]!.url).not.toContain(SECRET);
    expect(calls[0]!.headers['x-goog-api-key']).toBe(SECRET);
    expect(res.text).toBe('g');
  });

  it('OpenRouter carries its documented attribution headers', async () => {
    const { impl, calls } = recordingFetch(ok({ choices: [{ message: { content: 'or' } }], usage: {} }));
    const or = findProvider('openrouter')!;
    const relay = createByomRelay(
      credential({ providerId: 'openrouter', model: or.defaultModel, baseUrl: or.defaultBaseUrl }),
      impl,
    );
    await relay.complete({ model: 'ignored', system: '', user: 'u' });
    expect(calls[0]!.headers['HTTP-Referer']).toBeTruthy();
    expect(calls[0]!.headers['X-Title']).toBe('PRYZM');
  });
});
