// SWITZERLAND / City of Zürich — the OPTIONAL runtime-classify FALLBACK for BZO regime resolution.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — the static crosswalk is PRIMARY; this is the fallback with the error contract
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `resolveZurichBzoRegime` (pure, in `chZurichBzoCatalogue.ts`) reads the STATIC docid→regime crosswalk
// (`ZURICH_BZO_REGIME_BY_DOC`, populated 2026-07-25 from real fetched documents) and is the fast,
// no-I/O primary path. This module adds the impure RUNTIME-CLASSIFY fallback: when a parcel's
// ordinance docid is NOT yet in the static crosswalk, it fetches `getDoc?docid=<N>`, classifies the
// document text with the pure `classifyBzoRegimeFromDocText`, and CACHES the docid→regime verdict so
// each document is classified at most once across parcels.
//
// ⚠ HONESTY / ERROR CONTRACT (implemented EXACTLY — see the §CONTEXT-DATA-HONESTY family):
//   • Transient fetch failure (network / timeout / 429 / 5xx / 3xx-moved / non-OK): RETRY (2×, with
//     exponential backoff) then REFUSE with the DISTINCT reason `regime-fetch-failed` — never
//     `regime-ambiguous` (a failed fetch is not an ambiguous document).
//   • Document fetched but the classifier returns `null` (no clear marker): HARD-REFUSE
//     `regime-ambiguous` IMMEDIATELY (no retry) — guessing a regime risks the W2bIII 8.5-vs-9.0 m
//     fabrication.
//   • Clear marker: classify and cache.
//   • CONSENSUS across a parcel's several docids: any docid unresolved ⇒ `regime-ambiguous`; docids
//     that disagree ⇒ `regime-ambiguous`; exactly one regime ⇒ resolve.
//
// ⚠ This does NOT flip `CH_FAR_CERTIFIED` — it only makes regime resolution possible. And, like the
// BZO zone WFS, a browser fetch of `oerebdocs.zh.ch` is CSP-bound: production must route through a
// same-origin proxy (the Madrid-staging pattern), wired server-side (out of this module's remit). The
// fetch is fully injectable so this resolver is unit-testable without the network.
//
// LAYERING (C58 §1.9): the fetch is the ONE impure seam; the classifier + the crosswalk lookup + the
// consensus are pure (`chZurichBzoCatalogue.ts`). OTel span `pryzm.zoning.resolveZurichBzoRegime`.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    resolveZurichBzoRegime,
    extractOerebDocIds,
    classifyBzoRegimeFromDocText,
    ZURICH_BZO_REGIME_BY_DOC,
    type ZurichBzoRegime,
    type ZurichBzoRegimeInput,
} from './chZurichBzoCatalogue.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The oerebdocs `getDoc` base the fallback fetches from. Production overrides this with a same-origin
 *  proxy path (never browser→oerebdocs.zh.ch directly under CSP). */
export const CH_ZURICH_GETDOC_BASE = 'https://oerebdocs.zh.ch/getDoc';

/**
 * The async regime resolution. `ok` carries the regime + which path resolved it; the refusal reasons are
 * the two operationally-distinct classes the error contract requires.
 */
export type ZurichBzoRegimeAsyncResolution =
    | {
          readonly ok: true;
          readonly regime: ZurichBzoRegime;
          /** `static` = the pure crosswalk / plan-area path; `runtime-classify` = a fetched+classified doc. */
          readonly source: 'static' | 'runtime-classify';
      }
    | {
          readonly ok: false;
          /** The document(s) could not place a regime (unresolved / no marker / conflicting). */
          readonly reason: 'regime-ambiguous' | 'regime-fetch-failed';
      };

/** Injectable dependencies so the fallback is unit-testable without the network. */
export interface ZurichBzoRegimeResolverDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses a same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** The `getDoc` base URL / proxy path (default `CH_ZURICH_GETDOC_BASE`). */
    readonly getDocBase?: string;
    /** Retries AFTER the first attempt on a transient failure (default 2 ⇒ up to 3 attempts). */
    readonly maxRetries?: number;
    /** Base backoff in ms; attempt N waits `backoffMs · 2^N` (default 250). */
    readonly backoffMs?: number;
    /** docid→verdict cache (regime, or `null` = fetched-and-classified-but-no-marker). Reused across parcels. */
    readonly cache?: Map<string, ZurichBzoRegime | null>;
    /** Injectable sleep so tests don't wait real backoff. */
    readonly sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One transient class: network throw / timeout / 429 / 5xx / 3xx-moved / any non-OK / bodyless. */
function isTransientStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600) || (status >= 300 && status < 400);
}

type FetchTextOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false };

/** Fetch a doc's text with retry-on-transient (2× backoff). Returns `{ ok:false }` once exhausted. */
async function fetchDocText(
    fetchImpl: typeof fetch,
    url: string,
    maxRetries: number,
    backoffMs: number,
    sleep: (ms: number) => Promise<void>,
): Promise<FetchTextOutcome> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        let transient = false;
        try {
            const res = await fetchImpl(url, { method: 'GET' });
            if (res && res.ok) {
                const text = await res.text();
                return { ok: true, text };
            }
            const status = res?.status ?? 0;
            // A hard 4xx (e.g. 404 gone) is not worth retrying — but it is still a fetch failure, so it
            // resolves to `regime-fetch-failed` (never `regime-ambiguous`). Only transient codes retry.
            if (!isTransientStatus(status)) return { ok: false };
            transient = true;
        } catch {
            transient = true; // network / timeout — transient.
        }
        if (transient && attempt < maxRetries) await sleep(backoffMs * 2 ** attempt);
    }
    return { ok: false };
}

/**
 * Resolve the BZO regime for a parcel, consulting the static crosswalk FIRST and, only on a miss,
 * fetching + classifying the governing document(s) at runtime — under the exact error contract above.
 * Never throws.
 *
 * @param input  the parcel's `rechtsvorschriftUrl` and/or an explicit `planArea` tag.
 * @param deps   injectable fetch / cache / retry config (production wires a same-origin proxy).
 */
export async function resolveZurichBzoRegimeWithFetch(
    input: ZurichBzoRegimeInput,
    deps: ZurichBzoRegimeResolverDeps = {},
): Promise<ZurichBzoRegimeAsyncResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveZurichBzoRegime');
    span.setAttribute('provider', 'zurich-bzo-regime');
    try {
        // (1) PRIMARY — the pure static path (plan-area tag or the docid crosswalk). No fetch.
        const staticRes = resolveZurichBzoRegime(input);
        if (staticRes.ok) {
            span.setAttribute('resultFields', 'static');
            span.setAttribute('regime', staticRes.regime);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: true, regime: staticRes.regime, source: 'static' };
        }

        // (2) FALLBACK — runtime classify, only if a fetch is available and the URL names docid(s).
        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        const docIds = extractOerebDocIds(input.rechtsvorschriftUrl);
        if (typeof fetchImpl !== 'function' || docIds.length === 0) {
            // No way to classify at runtime — the static path already refused ambiguous.
            span.setAttribute('resultFields', 'regime-ambiguous');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'regime-ambiguous' };
        }

        const base = deps.getDocBase ?? CH_ZURICH_GETDOC_BASE;
        const maxRetries = Number.isInteger(deps.maxRetries) ? Math.max(0, deps.maxRetries!) : 2;
        const backoffMs = Number.isFinite(deps.backoffMs) ? Math.max(0, deps.backoffMs!) : 250;
        const cache = deps.cache ?? new Map<string, ZurichBzoRegime | null>();
        const sleep = deps.sleepImpl ?? defaultSleep;

        const regimes = new Set<ZurichBzoRegime>();
        for (const id of docIds) {
            // Prefer the static crosswalk, then the cache; classify (once) only on a true miss.
            let verdict: ZurichBzoRegime | null | undefined = ZURICH_BZO_REGIME_BY_DOC.get(id);
            if (verdict === undefined) verdict = cache.has(id) ? cache.get(id)! : undefined;

            if (verdict === undefined) {
                const sep = base.includes('?') ? '&' : '?';
                const url = `${base}${sep}docid=${encodeURIComponent(id)}`;
                const fetched = await fetchDocText(fetchImpl, url, maxRetries, backoffMs, sleep);
                if (!fetched.ok) {
                    // Transient-exhausted or hard non-OK — a fetch failure, DISTINCT from ambiguity.
                    span.setAttribute('resultFields', 'regime-fetch-failed');
                    span.setStatus({ code: SpanStatusCode.OK });
                    return { ok: false, reason: 'regime-fetch-failed' };
                }
                verdict = classifyBzoRegimeFromDocText(fetched.text);
                cache.set(id, verdict); // cache the verdict (incl. `null` = classified-but-no-marker).
            }

            if (!verdict) {
                // Doc fetched but no clear marker — HARD refuse, no retry (guessing is a fabrication).
                span.setAttribute('resultFields', 'regime-ambiguous');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'regime-ambiguous' };
            }
            regimes.add(verdict);
        }

        if (regimes.size !== 1) {
            // Conflicting regimes across the parcel's docids — refuse, never pick one.
            span.setAttribute('resultFields', 'regime-ambiguous');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'regime-ambiguous' };
        }
        const regime = [...regimes][0]!;
        span.setAttribute('resultFields', 'runtime-classify');
        span.setAttribute('regime', regime);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, regime, source: 'runtime-classify' };
    } catch (err) {
        // Defensive: never throw into the caller — an unexpected error is a fetch-path failure.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[ch-zurich-bzo-regime] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'regime-fetch-failed' };
    } finally {
        span.end();
    }
}
