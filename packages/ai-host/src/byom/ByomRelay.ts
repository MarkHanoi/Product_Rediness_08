// @pryzm/ai-host — BYOM relay porter (C103 §3, §5; C23 §BYOM-KEY-CLASS).
//
// A `RelayPorter` exactly like `CfWorkerRelay`, so every existing caller works
// unchanged. The difference is the topology: this one calls the PROVIDER the
// user chose, DIRECTLY from the browser, with the user's key. PRYZM's server is
// not on the path at all — which is precisely the promise the UI makes, and the
// only topology under which that promise is true.
//
// ⛔ THE THREE THINGS THIS FILE MUST NEVER DO.
//
//  1. FALL BACK TO PRYZM'S KEY. A user's key that is invalid, revoked or
//     rate-limited must fail with the PROVIDER'S OWN reason. Quietly retrying on
//     PRYZM's key would spend PRYZM's money on the user's request with neither
//     party told — and it would break the "leaves this device only to call the
//     provider you choose" promise on the one request where it matters most.
//     `createResilientRelay` in CfWorkerRelay.ts exists and does exactly that
//     wrapping; it MUST NOT be wrapped around this porter. C103 §5.4.
//  2. LOG THE KEY, in any form. Everything that leaves here goes through
//     `redactSecrets` first, including the provider's own error body — some
//     vendors echo the offending credential back in the 401.
//  3. PRICE THE CALL. `costUsd` is 0 because PRYZM did not pay for it. That is
//     not "unknown rendered as zero": PRYZM's ledger genuinely records zero,
//     and the USER'S cost is a separate quantity PRYZM cannot compute (it does
//     not know their negotiated rate). The tokens ARE reported, so a future
//     per-provider price table has its inputs. C103 §5.2.

import type { RelayPorter, RelayRequest, RelayResponse } from '../AnthropicRelay.js';
import {
  buildBody,
  buildHeaders,
  buildUrl,
  findProvider,
  parseResponse,
  type ByomProvider,
} from './ByomProviders.js';
import { redactSecrets } from './ByomRedaction.js';
import type { ByomCredential } from './ByomVault.js';

/**
 * A failure on the user's own key. Carries the provider's status and its own
 * message (redacted) so the chat can say what actually happened instead of the
 * generic "AI unavailable" a swallowed error would produce.
 */
export class ByomProviderError extends Error {
  readonly kind = 'byom-provider-error' as const;
  constructor(
    readonly providerId: string,
    readonly providerLabel: string,
    /** HTTP status, or 0 when the request never reached the provider. */
    readonly status: number,
    /** The provider's own words, already redacted. */
    readonly providerMessage: string,
    /** True when the browser blocked the call before it left (CORS, mixed
     *  content, offline). A different remedy from "your key is wrong", so it is
     *  a different value — never folded into `status: 0` alone. */
    readonly blockedByBrowser: boolean,
  ) {
    super(`[byom:${providerId}] ${status || 'network'} — ${providerMessage}`);
    this.name = 'ByomProviderError';
  }

  /** One sentence for the chat transcript. Says WHOSE fault and WHAT to do. */
  userMessage(): string {
    if (this.blockedByBrowser) {
      return (
        `Your browser blocked the call to ${this.providerLabel} before it left this device ` +
        `(${this.providerMessage}). Your key was not sent anywhere else, and PRYZM did not ` +
        `substitute its own. Check that ${this.providerLabel} allows calls from a web page, ` +
        `or switch back to PRYZM's built-in AI in AI provider keys.`
      );
    }
    if (this.status === 401 || this.status === 403) {
      return (
        `${this.providerLabel} rejected your API key (${this.status}): ${this.providerMessage}. ` +
        `PRYZM did NOT fall back to its own key — nothing was spent on your behalf. ` +
        `Re-check the key in AI provider keys, or clear it to return to PRYZM's built-in AI.`
      );
    }
    if (this.status === 429) {
      return (
        `${this.providerLabel} rate-limited your key (429): ${this.providerMessage}. ` +
        `PRYZM did NOT fall back to its own key. Wait and retry, or clear the key to return ` +
        `to PRYZM's built-in AI.`
      );
    }
    return (
      `${this.providerLabel} could not answer (${this.status}): ${this.providerMessage}. ` +
      `PRYZM did NOT fall back to its own key.`
    );
  }
}

/** Pull the most useful sentence out of a provider error body, redacted. */
export function describeProviderError(body: unknown): string {
  const cap = (s: string): string => redactSecrets(s).slice(0, 400);
  if (typeof body === 'string') return cap(body) || 'no detail supplied';
  const d = (body ?? {}) as Record<string, unknown>;
  const err = d.error;
  if (typeof err === 'string') return cap(err);
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return cap(e.message);
    if (typeof e.type === 'string') return cap(e.type);
  }
  if (typeof d.message === 'string') return cap(d.message);
  if (typeof d.detail === 'string') return cap(d.detail);
  try {
    return cap(JSON.stringify(body));
  } catch {
    return 'no detail supplied';
  }
}

/**
 * Build the BYOM porter for one resolved credential.
 *
 * `fetchImpl` is injected — the browser passes the plain global `fetch`
 * DELIBERATELY, not the editor's authed `apiFetch`: `apiFetch` attaches the
 * PRYZM session token, and attaching PRYZM's session to a third-party provider
 * request would be its own credential leak, in the opposite direction.
 */
export function createByomRelay(
  credential: ByomCredential,
  fetchImpl: typeof fetch = globalThis.fetch,
): RelayPorter {
  const provider: ByomProvider | null = findProvider(credential.providerId);
  if (!provider) {
    throw new Error(`[byom] unknown provider id "${credential.providerId}"`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('[byom] no fetch implementation available');
  }

  return {
    async complete(req: RelayRequest): Promise<RelayResponse> {
      // The user's chosen model wins over the caller's suggestion: the caller
      // names an Anthropic snapshot because that is PRYZM's default, and it is
      // meaningless to a Gemini endpoint.
      const model = credential.model || provider.defaultModel;
      const url = buildUrl(provider, credential.baseUrl || provider.defaultBaseUrl, model);
      const headers = buildHeaders(provider, credential.secret);
      const body = JSON.stringify(buildBody(provider, req, model));

      let resp: Response;
      try {
        resp = await fetchImpl(url, { method: 'POST', headers, body });
      } catch (err) {
        // A thrown fetch is the browser refusing, not the provider answering:
        // CORS preflight, mixed content, DNS, offline. ⛔ Redact — a bad URL
        // built from a custom base could carry a token in the message.
        const detail = redactSecrets(err instanceof Error ? err.message : String(err));
        throw new ByomProviderError(provider.id, provider.label, 0, detail, true);
      }

      if (!resp.ok) {
        let parsed: unknown = null;
        try {
          parsed = await resp.json();
        } catch {
          try {
            parsed = await resp.text();
          } catch {
            parsed = null;
          }
        }
        throw new ByomProviderError(
          provider.id,
          provider.label,
          resp.status,
          describeProviderError(parsed),
          false,
        );
      }

      let data: unknown;
      try {
        data = await resp.json();
      } catch (err) {
        throw new ByomProviderError(
          provider.id,
          provider.label,
          resp.status,
          redactSecrets(`the response was not JSON: ${err instanceof Error ? err.message : String(err)}`),
          false,
        );
      }

      const parsed = parseResponse(provider, data, model);
      if (!parsed) {
        // A 200 carrying no completion is a FAILURE, not an empty answer.
        // Returning '' here would surface to the user as the model declining to
        // speak — the same defect class as C74 §3.3 CONFIGURED-BUT-FAILED.
        throw new ByomProviderError(
          provider.id,
          provider.label,
          resp.status,
          'the response carried no completion',
          false,
        );
      }

      return {
        text: parsed.text,
        // ⛔ Zero because PRYZM paid zero. See the header, and C103 §5.2.
        costUsd: 0,
        model: parsed.model,
        tokens: { input: parsed.inputTokens, output: parsed.outputTokens },
        ...(parsed.stopReason ? { stopReason: parsed.stopReason } : {}),
      };
    },
  };
}
