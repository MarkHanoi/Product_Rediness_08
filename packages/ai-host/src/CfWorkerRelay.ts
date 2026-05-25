// @pryzm/ai-host — CfWorkerRelay (SPEC-47 §7, #51 A7).
//
// The production RelayPorter: POSTs to the server BFF `POST /api/anthropic/v1/messages`
// (server.js:782 — a transparent Anthropic proxy that routes to the CF Worker when
// CF_WORKER_URL is set, else the Anthropic API). The server passes Anthropic's
// response through UNCHANGED (no costUsd), so this adapter computes the cost from
// `usage` tokens via @pryzm/ai-cost's pricing table (SPEC-28 §3.2) — the AiPlane
// records it against the per-project budget.
//
// `loadRelay()` dynamic-imports this when ANTHROPIC_RELAY_URL is set (server/test);
// the browser editor wires it directly. Same-origin relative URL → the browser
// includes the session cookie, satisfying the route's authMiddleware. Loud-fail:
// a non-2xx / malformed response THROWS so the orchestrator's loud-fail-soft retry
// (generateLayoutOptions) feeds the failure back + ultimately rejects with a reason.

import type { RelayPorter, RelayRequest, RelayResponse } from './AnthropicRelay.js';
import { computeCostUSD, type ModelClass } from '@pryzm/ai-cost';

/** Default relay endpoint — the server's transparent Anthropic proxy. */
export const DEFAULT_RELAY_ENDPOINT = '/api/anthropic/v1/messages';

/**
 * Wrap a primary relay so a failure transparently falls back to a secondary
 * (e.g. the live CfWorkerRelay → MockAnthropicRelay demo layouts when the server
 * has no AI upstream configured). On fallback it logs loudly + invokes `onFallback`
 * so the UI can tell the user the result is demo data, not real AI. Never hides a
 * fallback silently.
 */
export function createResilientRelay(
    primary: RelayPorter,
    fallback: RelayPorter,
    onFallback?: (err: unknown) => void,
): RelayPorter {
    return {
        async complete(req: RelayRequest): Promise<RelayResponse> {
            try {
                return await primary.complete(req);
            } catch (err) {
                if (typeof console !== 'undefined') {
                    console.warn('[ai-host/ResilientRelay] primary relay failed — using fallback (demo) relay:', err);
                }
                try { onFallback?.(err); } catch { /* listener error is non-fatal */ }
                return fallback.complete(req);
            }
        },
    };
}

/** Map an Anthropic model id to a pricing class (defaults to haiku). */
export function modelClassOf(model: string): ModelClass {
    if (/opus/i.test(model)) return 'opus';
    if (/sonnet/i.test(model)) return 'sonnet';
    if (/gpt-4o/i.test(model)) return 'gpt-4o';
    return 'haiku';
}

/** Minimal Anthropic /v1/messages response shape this adapter reads. */
interface AnthropicMessageResponse {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    model?: string;
    stop_reason?: string;
}

/**
 * Build the production RelayPorter. `fetchImpl` is injectable (a mock in tests; the
 * authed/same-origin global fetch in the browser).
 */
export function createCfWorkerRelay(
    url: string = DEFAULT_RELAY_ENDPOINT,
    fetchImpl: typeof fetch = globalThis.fetch,
): RelayPorter {
    if (typeof fetchImpl !== 'function') {
        throw new Error('[ai-host/CfWorkerRelay] no fetch implementation available');
    }
    return {
        async complete(req: RelayRequest): Promise<RelayResponse> {
            // RelayRequest → Anthropic /v1/messages shape.
            const body = {
                model: req.model,
                max_tokens: req.maxTokens ?? 1024,
                ...(req.system ? { system: req.system } : {}),
                messages: [{ role: 'user', content: req.user }],
                ...(req.stopSequences ? { stop_sequences: req.stopSequences } : {}),
            };
            const resp = await fetchImpl(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resp.ok) {
                throw new Error(`[ai-host/CfWorkerRelay] relay ${resp.status} ${resp.statusText}`);
            }
            const data = (await resp.json()) as AnthropicMessageResponse;
            const text = (data.content ?? [])
                .filter(b => b.type === 'text')
                .map(b => b.text ?? '')
                .join('');
            const input = data.usage?.input_tokens ?? 0;
            const output = data.usage?.output_tokens ?? 0;
            const model = data.model ?? req.model;
            const costUsd = computeCostUSD(modelClassOf(model), input, output).totalUSD;
            return {
                text,
                costUsd,
                model,
                tokens: { input, output },
                ...(data.stop_reason ? { stopReason: data.stop_reason } : {}),
            };
        },
    };
}
