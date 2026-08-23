// @pryzm/ai-host — BYOM provider registry (C103 §2, SPEC-BYOM-PROVIDER-KEYS §3).
//
// ⚠ NAMING. "BYOK" is ALREADY TAKEN in this repo and means something else:
// C22 §1.4 and C08 §8 use it for customer-managed *encryption* keys (KMS /
// Supabase service-role). Overloading it would have made two unrelated security
// postures share one word inside a compliance document. The user-supplied
// *model* credential introduced here is therefore called **BYOM — Bring Your
// Own Model**, and the two terms never mix. See C103 §0.1.
//
// WHAT THIS FILE IS. Pure data plus four pure functions per provider: build the
// request URL, build the headers, build the body, read the response. No fetch,
// no DOM, no storage, no logging. `ByomRelay.ts` is the only thing that calls
// them, and it is the only thing that ever holds a live secret.
//
// ⛔ NOTHING IN THIS FILE MAY LOG. A provider descriptor is safe to print; a
// credential is not. They are deliberately different types, so "print the
// descriptor" can never accidentally print the secret.

import type { RelayRequest } from '../AnthropicRelay.js';

/** The six providers the reference surface names. Stable ids — these are
 *  persisted in the device vault and cited by C103 §2.1, so renaming one is a
 *  breaking change to a stored value, not a cosmetic edit. */
export type ByomProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'openrouter'
  | 'ollama';

/**
 * How a provider is authenticated. `none` is not "insecure" — it is Ollama,
 * which runs on the user's own machine and has no account to hold a key.
 * Modelling it as a THIRD value rather than "an empty API key" keeps the
 * refusal honest: a blank key for Anthropic is a misconfiguration, a blank key
 * for Ollama is the correct configuration. (§CONTEXT-DATA-HONESTY — an absent
 * value and an inapplicable value are never the same value.)
 */
export type ByomAuthKind = 'api-key' | 'none';

/**
 * The browser-direct verdict for this provider, per C103 §3.2.
 *
 * ⭐ MEASURED 2026-08-23, and the evidence class is part of the verdict. A live
 * `OPTIONS` preflight (`Origin: https://example.com`) was run against every
 * internet endpoint below, and the vendor docs were read separately. THE TWO
 * DISAGREE for three providers, and that disagreement is the whole reason this
 * is a four-value union rather than a boolean: "the wire serves CORS today" and
 * "the vendor promises to keep serving it" are different facts, and an
 * undocumented capability can be withdrawn without a release note.
 *
 *  • `supported-documented`   — the vendor's own docs show a browser `fetch()`
 *                               example, AND the preflight succeeds.
 *  • `supported-opt-in`       — the preflight succeeds ONLY when an explicit
 *                               opt-in request header is present. Measured:
 *                               without it Anthropic returns 400 with NO
 *                               `access-control-allow-origin` at all.
 *  • `supported-undocumented` — the preflight succeeds, but no official page
 *                               documents it and some actively steer callers
 *                               to a server-side proxy. ⚠ Works today; not a
 *                               guarantee. C66 §1 forbids calling this
 *                               "supported" without the qualifier.
 *  • `local-opt-in`           — the user's own machine, reachable only after
 *                               THEY configure their local server to accept
 *                               this page's origin. See C103 §3.4 for the
 *                               browser-side conditions, which are NOT mixed
 *                               content and are per-browser.
 */
export type BrowserDirectVerdict =
  | 'supported-documented'
  | 'supported-opt-in'
  | 'supported-undocumented'
  | 'local-opt-in';

/** Public, non-secret description of one provider. Safe to log, safe to render. */
export interface ByomProvider {
  readonly id: ByomProviderId;
  /** Display name exactly as the user knows the product. */
  readonly label: string;
  /** One line under the field in the UI. */
  readonly blurb: string;
  /** Where the user goes to mint a key. Empty when `auth` is `none`. */
  readonly consoleUrl: string;
  /** How the credential is supplied. */
  readonly auth: ByomAuthKind;
  /** Default endpoint origin + path. Overridable by the user only when
   *  `allowsCustomBaseUrl`. */
  readonly defaultBaseUrl: string;
  /** May the user point this at their own host? */
  readonly allowsCustomBaseUrl: boolean;
  /** The CSP `connect-src` origin this provider needs (C103 §3.3). */
  readonly connectSrcOrigin: string;
  /** Default model id if the user does not name one. */
  readonly defaultModel: string;
  /** Browser-direct verdict — see `BrowserDirectVerdict`. */
  readonly browserDirect: BrowserDirectVerdict;
  /** Human sentence explaining the verdict; shown in the UI verbatim. */
  readonly browserDirectNote: string;
  /** Expected key prefix, when the vendor uses a recognisable one. Used ONLY to
   *  warn the user they pasted a different provider's key — never to reject,
   *  because a vendor may change its prefix at any time and a client-side format
   *  assertion that is wrong is worse than no assertion at all. */
  readonly keyHint: string | null;
  /** Wire dialect. Drives which builder below runs. */
  readonly dialect: 'anthropic' | 'openai' | 'google';
}

/** The registry, ordered as the reference surface orders it. */
export const BYOM_PROVIDERS: readonly ByomProvider[] = Object.freeze([
  Object.freeze({
    id: 'anthropic' as const,
    label: 'Claude',
    blurb: 'Anthropic — the same family PRYZM runs by default.',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    auth: 'api-key' as const,
    defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
    allowsCustomBaseUrl: false,
    connectSrcOrigin: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    browserDirect: 'supported-opt-in' as const,
    browserDirectNote:
      'Anthropic serves browser requests only when the request carries its explicit ' +
      'browser opt-in header. PRYZM sends that header for you.',
    keyHint: 'sk-ant-',
    dialect: 'anthropic' as const,
  }),
  Object.freeze({
    id: 'openai' as const,
    label: 'ChatGPT',
    blurb: 'OpenAI — GPT models via the Chat Completions API.',
    consoleUrl: 'https://platform.openai.com/api-keys',
    auth: 'api-key' as const,
    defaultBaseUrl: 'https://api.openai.com/v1/chat/completions',
    allowsCustomBaseUrl: false,
    connectSrcOrigin: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    browserDirect: 'supported-undocumented' as const,
    browserDirectNote:
      'Measured 2026-08-23: the endpoint does answer a browser preflight. But OpenAI ' +
      'does not document that, and its own guides tell developers to keep keys on a ' +
      'server — so it could stop working without notice. If it does, you will see the ' +
      "error itself; PRYZM will not silently reroute the request.",
    keyHint: 'sk-',
    dialect: 'openai' as const,
  }),
  Object.freeze({
    id: 'google' as const,
    label: 'Gemini',
    blurb: 'Google AI Studio — Gemini models.',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    auth: 'api-key' as const,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    allowsCustomBaseUrl: false,
    connectSrcOrigin: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.0-flash',
    browserDirect: 'supported-undocumented' as const,
    browserDirectNote:
      'Measured 2026-08-23: the endpoint does answer a browser preflight. Google does ' +
      'not document that and advises a backend proxy for client apps, so it could stop ' +
      'working without notice. If it does, you will see the error itself; PRYZM will ' +
      'not silently reroute the request.',
    keyHint: null,
    dialect: 'google' as const,
  }),
  Object.freeze({
    id: 'deepseek' as const,
    label: 'DeepSeek',
    blurb: 'DeepSeek — an OpenAI-compatible endpoint.',
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    auth: 'api-key' as const,
    defaultBaseUrl: 'https://api.deepseek.com/chat/completions',
    allowsCustomBaseUrl: false,
    connectSrcOrigin: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    browserDirect: 'supported-undocumented' as const,
    browserDirectNote:
      'Measured 2026-08-23: the endpoint does answer a browser preflight. DeepSeek does ' +
      'not document browser use either way, so it could stop working without notice. ' +
      'If it does, you will see the error itself; PRYZM will not silently reroute the ' +
      'request.',
    keyHint: 'sk-',
    dialect: 'openai' as const,
  }),
  Object.freeze({
    id: 'openrouter' as const,
    label: 'OpenRouter',
    blurb: 'OpenRouter — one key, many models.',
    consoleUrl: 'https://openrouter.ai/keys',
    auth: 'api-key' as const,
    defaultBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    allowsCustomBaseUrl: false,
    connectSrcOrigin: 'https://openrouter.ai',
    defaultModel: 'anthropic/claude-3.5-haiku',
    browserDirect: 'supported-documented' as const,
    browserDirectNote:
      'OpenRouter documents calling it straight from a web page and its preflight was ' +
      'confirmed on 2026-08-23. This is the best-supported of the hosted options.',
    keyHint: 'sk-or-',
    dialect: 'openai' as const,
  }),
  Object.freeze({
    id: 'ollama' as const,
    label: 'Ollama (fully local)',
    blurb: 'Runs on your own machine. No key, and your prompt never leaves it.',
    consoleUrl: 'https://ollama.com/download',
    auth: 'none' as const,
    defaultBaseUrl: 'http://localhost:11434/v1/chat/completions',
    allowsCustomBaseUrl: true,
    connectSrcOrigin: 'http://localhost:11434',
    defaultModel: 'llama3.1',
    browserDirect: 'local-opt-in' as const,
    browserDirectNote:
      'Two things must be true, and both are on your machine, not ours. (1) Ollama only ' +
      'accepts 127.0.0.1 and 0.0.0.0 origins by default — start it with OLLAMA_ORIGINS ' +
      'set to the address this page is served from. (2) Chrome 142+ and recent Firefox ' +
      'ask permission before a web page may reach your local network; Safari refuses ' +
      'outright. Running PRYZM from http://localhost avoids all of it. See C103 §3.4.',
    keyHint: null,
    dialect: 'openai' as const,
  }),
]);

/** Look a provider up by id. Returns `null` for an unknown id rather than
 *  throwing: the id can come from a vault written by an older build, and an
 *  unrecognised entry must degrade to "no BYOM", never to a crash. */
export function findProvider(id: string): ByomProvider | null {
  return BYOM_PROVIDERS.find(p => p.id === id) ?? null;
}

/** Every CSP `connect-src` origin the BYOM surface can require (C103 §3.3).
 *  Exported so the server derives its allowlist from THIS registry rather than
 *  from a second hand-maintained copy that would drift. */
export function byomConnectSrcOrigins(): readonly string[] {
  return BYOM_PROVIDERS.map(p => p.connectSrcOrigin);
}

// ─── Wire builders ──────────────────────────────────────────────────────────
//
// Each takes the neutral `RelayRequest` and returns the provider's own shape.
// `secret` is threaded in as a bare parameter and is NEVER stored on a returned
// object: the header map goes straight into fetch and is then dropped.

/** The URL to POST to, given the resolved base URL and the model. */
export function buildUrl(provider: ByomProvider, baseUrl: string, model: string): string {
  if (provider.dialect === 'google') {
    // Google puts the model in the path. The key goes in a HEADER, never in the
    // query string, so it cannot land in a proxy log or in a Referer.
    return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(model)}:generateContent`;
  }
  return baseUrl;
}

/** Request headers, including the credential. ⛔ Never log the return value. */
export function buildHeaders(provider: ByomProvider, secret: string): Record<string, string> {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  switch (provider.dialect) {
    case 'anthropic':
      h['x-api-key'] = secret;
      h['anthropic-version'] = '2023-06-01';
      // The explicit browser opt-in. Without it Anthropic does not serve CORS to
      // a page origin, and the call dies at the preflight with an error the user
      // cannot act on. C103 §3.2.
      h['anthropic-dangerous-direct-browser-access'] = 'true';
      break;
    case 'google':
      h['x-goog-api-key'] = secret;
      break;
    case 'openai':
      // Ollama has no account and therefore no bearer. Sending "Bearer " with an
      // empty tail would be a malformed header, not a permissive one.
      if (provider.auth === 'api-key') h['authorization'] = `Bearer ${secret}`;
      break;
  }
  // OpenRouter's documented attribution headers. Optional to the API, but they
  // are how a browser-origin call is identified on the user's OpenRouter
  // dashboard — without them their own usage page cannot tell them which app
  // spent their credit, which is a bad answer to "what am I paying for?".
  // ⚠ A literal `Referer` is forbidden to page script; `HTTP-Referer` is
  // OpenRouter's own custom header name and is settable.
  if (provider.id === 'openrouter') {
    h['HTTP-Referer'] = 'https://pryzm.app';
    h['X-Title'] = 'PRYZM';
  }
  return h;
}

/** Request body in the provider's dialect. */
export function buildBody(provider: ByomProvider, req: RelayRequest, model: string): unknown {
  const maxTokens = req.maxTokens ?? 1024;
  switch (provider.dialect) {
    case 'anthropic':
      return {
        model,
        max_tokens: maxTokens,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: 'user', content: req.user }],
        ...(req.stopSequences ? { stop_sequences: [...req.stopSequences] } : {}),
      };
    case 'google':
      return {
        ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          maxOutputTokens: maxTokens,
          ...(req.stopSequences ? { stopSequences: [...req.stopSequences] } : {}),
        },
      };
    case 'openai':
      return {
        model,
        max_tokens: maxTokens,
        messages: [
          ...(req.system ? [{ role: 'system', content: req.system }] : []),
          { role: 'user', content: req.user },
        ],
        ...(req.stopSequences ? { stop: [...req.stopSequences] } : {}),
      };
  }
}

/** What a parsed provider response yields. Cost is deliberately absent — see
 *  `ByomRelay.ts` and C103 §5.2: PRYZM does not price a call it did not pay for. */
export interface ByomParsed {
  readonly text: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly stopReason?: string;
}

/** Read a provider response. Returns `null` when the payload carries no
 *  completion at all — the caller turns that into a LOUD failure, never into an
 *  empty string, which would read to the user as "the model had nothing to say". */
export function parseResponse(
  provider: ByomProvider,
  data: unknown,
  fallbackModel: string,
): ByomParsed | null {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (provider.dialect) {
    case 'anthropic': {
      const content = Array.isArray(d.content) ? (d.content as Array<Record<string, unknown>>) : [];
      if (!content.length) return null;
      const text = content
        .filter(b => b.type === 'text')
        .map(b => (typeof b.text === 'string' ? b.text : ''))
        .join('');
      const usage = (d.usage ?? {}) as Record<string, unknown>;
      return {
        text,
        model: typeof d.model === 'string' ? d.model : fallbackModel,
        inputTokens: numOr0(usage.input_tokens),
        outputTokens: numOr0(usage.output_tokens),
        ...(typeof d.stop_reason === 'string' ? { stopReason: d.stop_reason } : {}),
      };
    }
    case 'google': {
      const cands = Array.isArray(d.candidates) ? (d.candidates as Array<Record<string, unknown>>) : [];
      if (!cands.length) return null;
      const first = (cands[0] ?? {}) as Record<string, unknown>;
      const content = (first.content ?? {}) as Record<string, unknown>;
      const parts = Array.isArray(content.parts) ? (content.parts as Array<Record<string, unknown>>) : [];
      const text = parts.map(p => (typeof p.text === 'string' ? p.text : '')).join('');
      const usage = (d.usageMetadata ?? {}) as Record<string, unknown>;
      return {
        text,
        model: typeof d.modelVersion === 'string' ? d.modelVersion : fallbackModel,
        inputTokens: numOr0(usage.promptTokenCount),
        outputTokens: numOr0(usage.candidatesTokenCount),
        ...(typeof first.finishReason === 'string' ? { stopReason: first.finishReason } : {}),
      };
    }
    case 'openai': {
      const choices = Array.isArray(d.choices) ? (d.choices as Array<Record<string, unknown>>) : [];
      if (!choices.length) return null;
      const head = (choices[0] ?? {}) as Record<string, unknown>;
      const msg = (head.message ?? {}) as Record<string, unknown>;
      const usage = (d.usage ?? {}) as Record<string, unknown>;
      return {
        text: typeof msg.content === 'string' ? msg.content : '',
        model: typeof d.model === 'string' ? d.model : fallbackModel,
        inputTokens: numOr0(usage.prompt_tokens),
        outputTokens: numOr0(usage.completion_tokens),
        ...(typeof head.finish_reason === 'string' ? { stopReason: head.finish_reason } : {}),
      };
    }
  }
}

function numOr0(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
