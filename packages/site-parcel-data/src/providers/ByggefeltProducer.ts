// DK gap G3/G6 — `ByggefeltProducer`: the Plandata WFS client that produces `PlacementEvidence[]`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The ONE impure surface of the DK placement chain (C58 §1.9). It fetches adopted byggefelter that
// intersect a bbox from `geoserver.plandata.dk`, and hands them to the PURE classifier
// (`evidence/byggefeltEvidence.ts`) which decides `legalStatus` from the published flags. This module
// therefore knows about HTTP, retries and caches; it knows nothing about what makes a byggefelt bind.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §FAILURE-IS-NOT-ABSENCE — the bug class this module is shaped around (L-422/457/467/469)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A 500, a timeout, and zero features are THREE DIFFERENT RESULTS and this producer never lets them
// collapse. It returns `FetchOutcome<PlacementEvidence[]>` (C57 §1.5), never a bare array:
//
//   `found`     — the WFS answered and byggefelter intersect the bbox.        CACHEABLE.
//   `absent`    — the WFS answered `numberMatched=0`. A DURABLE coverage fact. CACHEABLE.
//   `transient` — non-OK status / network error / timeout / unparseable body. NEVER CACHED, retried.
//   `aborted`   — the caller's AbortSignal fired (a newer request supersedes). NEVER CACHED.
//
// The two rules that make this real rather than decorative:
//   1. **Only `found` and `absent` enter the cache.** Caching a `transient` would turn one bad
//      minute into a permanent "no byggefelt here" for the TTL — the exact way a fetch failure
//      becomes a fake coverage fact.
//   2. **An empty `features` array with a non-OK status is `transient`, not `absent`.** The status
//      is checked BEFORE the body, so a proxy error page that happens to parse as `{features:[]}`
//      can never read as "the plan published nothing here".
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// BEING A POLITE CLIENT (this is a public, keyless, taxpayer-funded endpoint)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • A real, identifying `User-Agent` — so Erhvervsstyrelsen can see who we are and contact us.
//   • A MINIMUM INTERVAL between requests (single-flight queue), so a map pan cannot fan out.
//   • IN-FLIGHT DE-DUPLICATION — concurrent callers asking for the same bbox share ONE request.
//     (The L-585 lesson: the de-dup must sit ABOVE the fetch, not below it, or it de-dups nothing.)
//   • EXPONENTIAL BACKOFF with jitter on 429/5xx/network, bounded — never a hot retry loop.
//   • `Retry-After` is HONOURED when the server sends one; our backoff is only the fallback.
//   • A bounded LRU cache so panning back over the same ground re-asks nothing.
//
// ⚠ BROWSER NOTE — `User-Agent` is a forbidden header in browser `fetch` and will be silently
// dropped there. In production this producer should run SERVER-SIDE behind the same-origin proxy
// pattern the DK zoning path already uses (`server/plandataZoningProxy.js`, `DkZoningProvider`), so
// that the identifying UA and the rate limit are actually enforced at one place instead of once per
// browser tab. Injecting `fetchImpl` + `baseUrl` is how a caller points this at that proxy.
//
// PURITY — this module is the impure boundary BY DESIGN (C58 §1.9). All decision logic it uses is
// imported from the pure `evidence/` modules, so the state machine is testable with no network.
//
// P8 — emits `pryzm.zoning.dk.byggefelt.*` spans.
//
// Strategic context — DENMARK-GAP-ROADMAP.md G3/G6/G11, ADR-0279 §2, C57 §1.5, C58 §1.4/§1.9,
// docs/04-reference/jurisdictions/dk/findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
    fetchAborted,
    fetchAbsent,
    fetchFound,
    fetchTransient,
    type FetchOutcome,
} from '@pryzm/schemas';
import {
    byggefeltCollectionToEvidence,
    dkByggefeltFromEvidence,
    DK_BYGGEFELT_LAYER,
    type ByggefeltEvidenceOptions,
    type DkByggefeltFeature,
} from '../evidence/byggefeltEvidence.js';
import {
    collectEvidenceConflicts,
    rankPlacementEvidence,
    type PlacementEvidence,
} from '../evidence/placementEvidence.js';
import type { DkByggefelt } from '../rulepacks/dkEnvelopePlacement.js';

const tracer = trace.getTracer('pryzm.zoning.dk');

/** The public, keyless Plandata WFS endpoint (Erhvervsstyrelsen, the Danish national plan register). */
export const PLANDATA_WFS_URL = 'https://geoserver.plandata.dk/geoserver/wfs';

/** Plandata's native projection — ETRS89 / UTM zone 32N. All DK plan geometry is published in it. */
export const PLANDATA_NATIVE_CRS = 'EPSG:25832';

/**
 * An identifying User-Agent. A public endpoint's operator should be able to tell who is calling and
 * reach them; an anonymous or spoofed UA on a taxpayer-funded service is not acceptable behaviour.
 */
export const PLANDATA_USER_AGENT = 'PRYZM-BIM/1.0 (+https://pryzm.fly.dev; site-feasibility)';

/**
 * Read `signal.aborted` through a function call.
 *
 * ⚠ NOT A STYLE CHOICE. `AbortSignal.aborted` is typed `readonly boolean`, so after one
 * `if (signal?.aborted === true) return …` guard TypeScript narrows it to `false` for the rest of
 * the scope — and then flags every LATER check as unreachable. But the whole point of an abort
 * signal is that it flips DURING the awaits in between. Narrowing it would delete the post-await
 * abort checks, turning a user's cancellation into a spurious `transient` failure. Reading through
 * an opaque call keeps each check live.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
    return signal !== undefined && signal.aborted;
}

/** A bbox in `PLANDATA_NATIVE_CRS` metres. */
export interface Bbox25832 {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface ByggefeltProducerConfig {
    /** Override the endpoint — point this at a same-origin proxy in the browser. */
    readonly baseUrl?: string;
    /** Injected fetch (tests, proxies, Node versions without a global). */
    readonly fetchImpl?: typeof globalThis.fetch;
    /** Injected clock (ms since epoch) so cache expiry is testable without waiting. */
    readonly now?: () => number;
    /** Injected sleep so backoff is testable without waiting. */
    readonly sleep?: (ms: number) => Promise<void>;
    /** Minimum ms between two outbound requests. Default 250 ms (≤ 4 req/s). */
    readonly minIntervalMs?: number;
    /** Max retry ATTEMPTS after the first try. Default 3 (so ≤ 4 requests total). */
    readonly maxRetries?: number;
    /** Base backoff in ms; attempt N waits ~`base * 2^N` plus jitter. Default 400 ms. */
    readonly backoffBaseMs?: number;
    /** Ceiling on a single backoff wait. Default 8000 ms. */
    readonly backoffMaxMs?: number;
    /** Per-request timeout in ms. Default 20000 ms. */
    readonly timeoutMs?: number;
    /** Cache TTL in ms. Default 15 min — plan data changes on a cadence of days, not seconds. */
    readonly cacheTtlMs?: number;
    /** Max cached bbox entries (LRU). Default 200. */
    readonly cacheMaxEntries?: number;
    /** Max features per request (WFS `count`). Default 500. */
    readonly pageSize?: number;
    /**
     * Deterministic jitter source in `[0,1)`. Defaults to `Math.random`. Injectable so a test can
     * pin the backoff schedule exactly (C58 §1.1 — a test must not depend on RNG).
     */
    readonly jitter?: () => number;
}

interface ResolvedConfig {
    readonly baseUrl: string;
    readonly fetchImpl: typeof globalThis.fetch | undefined;
    readonly now: () => number;
    readonly sleep: (ms: number) => Promise<void>;
    readonly minIntervalMs: number;
    readonly maxRetries: number;
    readonly backoffBaseMs: number;
    readonly backoffMaxMs: number;
    readonly timeoutMs: number;
    readonly cacheTtlMs: number;
    readonly cacheMaxEntries: number;
    readonly pageSize: number;
    readonly jitter: () => number;
}

function resolveConfig(c: ByggefeltProducerConfig): ResolvedConfig {
    return {
        baseUrl: c.baseUrl ?? PLANDATA_WFS_URL,
        fetchImpl: c.fetchImpl ?? globalThis.fetch?.bind(globalThis),
        now: c.now ?? (() => Date.now()),
        sleep: c.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
        minIntervalMs: c.minIntervalMs ?? 250,
        maxRetries: c.maxRetries ?? 3,
        backoffBaseMs: c.backoffBaseMs ?? 400,
        backoffMaxMs: c.backoffMaxMs ?? 8000,
        timeoutMs: c.timeoutMs ?? 20000,
        cacheTtlMs: c.cacheTtlMs ?? 15 * 60 * 1000,
        cacheMaxEntries: c.cacheMaxEntries ?? 200,
        pageSize: c.pageSize ?? 500,
        jitter: c.jitter ?? (() => Math.random()),
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// REQUEST OPTIONS + RESULT
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Which legal states to request. Omit for ALL — the honest default. */
export interface ByggefeltQueryOptions extends ByggefeltEvidenceOptions {
    /**
     * Ask the SERVER for only the binding subset (`bygkunifelt=true AND bygvejledende=false`).
     *
     * ⚠ USE WITH CARE. It is cheaper, but it destroys the caller's ability to tell "no byggefelt
     * here at all" from "byggefelter here, all advisory" — two very different answers for a user.
     * Default FALSE: fetch everything and classify locally, so the evidence list is complete and the
     * refusal can say WHY. Set true only for bulk statistics where the distinction is not needed.
     */
    readonly bindingOnly?: boolean;
    /** Abort signal — a fired signal yields `aborted`, which is NOT a failure and is never cached. */
    readonly signal?: AbortSignal;
}

/** The producer's answer, with the diagnostics needed to audit it. */
export interface ByggefeltFetchResult {
    /** Every byggefelt intersecting the bbox, as ranked-ready evidence. */
    readonly outcome: FetchOutcome<readonly PlacementEvidence[]>;
    /** How many WFS features were read (before splitting into polygon parts). Null when not answered. */
    readonly featureCount: number | null;
    /** TRUE when the answer came from the cache (no request was made). */
    readonly fromCache: boolean;
    /** How many outbound HTTP requests this call actually made (0 on a cache hit). */
    readonly requests: number;
    /**
     * TRUE when the WFS reported MORE matching features than it returned — the answer is a PAGE, not
     * the whole truth. A consumer must not treat a truncated list as exhaustive.
     */
    readonly truncated: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PRODUCER
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
    readonly expiresAt: number;
    readonly result: ByggefeltFetchResult;
}

/** One raw HTTP attempt's classified result. */
type Attempt =
    | { readonly kind: 'ok'; readonly body: unknown }
    | { readonly kind: 'aborted' }
    /** Retryable: 429/5xx/network/timeout. `retryAfterMs` is the server's own instruction, if any. */
    | { readonly kind: 'retry'; readonly reason: string; readonly retryAfterMs: number | null }
    /** NOT retryable: a 4xx that is our fault (bad CQL, unknown typeName). Retrying cannot help. */
    | { readonly kind: 'fatal'; readonly reason: string };

export interface ByggefeltProducer {
    /**
     * Fetch every adopted byggefelt intersecting `bbox` (in EPSG:25832) as `PlacementEvidence[]`.
     * NEVER throws — every failure is a typed `FetchOutcome`.
     */
    fetchByBbox(bbox: Bbox25832, options?: ByggefeltQueryOptions): Promise<ByggefeltFetchResult>;
    /**
     * Fetch the byggefelter relevant to a PARCEL, by its bounding box (optionally padded).
     * Convenience over `fetchByBbox`; the caller still clips to the parcel downstream (the engine's
     * `explicit-area` solve does `parcel ∩ footprint`).
     */
    fetchForParcelBbox(
        bbox: Bbox25832,
        padM?: number,
        options?: ByggefeltQueryOptions,
    ): Promise<ByggefeltFetchResult>;
    /** Drop all cached entries (e.g. on an explicit user refresh). */
    clearCache(): void;
}

/**
 * Create a byggefelt producer.
 *
 * Stateful by design — it owns the rate-limit queue, the in-flight de-duplication map and the LRU
 * cache, which only work if they are SHARED across calls. Create ONE per process/app and reuse it;
 * a per-call instance would silently disable all three.
 */
export function createByggefeltProducer(config: ByggefeltProducerConfig = {}): ByggefeltProducer {
    const cfg = resolveConfig(config);
    const cache = new Map<string, CacheEntry>();
    const inFlight = new Map<string, Promise<ByggefeltFetchResult>>();
    /** Serialises outbound requests and enforces `minIntervalMs` between them. */
    let gate: Promise<void> = Promise.resolve();
    let lastRequestAt = 0;

    /** Await our turn in the polite-client queue, then mark the request time. */
    function acquireSlot(): Promise<void> {
        const mine = gate.then(async () => {
            const wait = cfg.minIntervalMs - (cfg.now() - lastRequestAt);
            if (wait > 0) await cfg.sleep(wait);
            lastRequestAt = cfg.now();
        });
        // The queue must not break on a failed turn, or every later caller inherits the rejection.
        gate = mine.then(
            () => undefined,
            () => undefined,
        );
        return mine;
    }

    function buildUrl(bbox: Bbox25832, options: ByggefeltQueryOptions): string {
        const filters = [
            `BBOX(geometri,${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY},'${PLANDATA_NATIVE_CRS}')`,
        ];
        if (options.bindingOnly === true) {
            filters.push('bygkunifelt=true AND bygvejledende=false');
        }
        const params = new URLSearchParams({
            service: 'WFS',
            version: '2.0.0',
            request: 'GetFeature',
            typeNames: DK_BYGGEFELT_LAYER,
            outputFormat: 'application/json',
            srsName: PLANDATA_NATIVE_CRS,
            count: String(cfg.pageSize),
            CQL_FILTER: filters.join(' AND '),
        });
        return `${cfg.baseUrl}?${params.toString()}`;
    }

    /** ONE HTTP attempt, classified. Never throws. */
    async function attempt(url: string, signal: AbortSignal | undefined): Promise<Attempt> {
        const fetchImpl = cfg.fetchImpl;
        if (typeof fetchImpl !== 'function') {
            // No fetch at all is an ENVIRONMENT failure, not "Plandata says nothing is here".
            return { kind: 'retry', reason: 'no-fetch (no fetch implementation available)', retryAfterMs: null };
        }
        if (isAborted(signal)) return { kind: 'aborted' };

        const timer = new AbortController();
        const onOuterAbort = (): void => timer.abort();
        signal?.addEventListener('abort', onOuterAbort);
        const timeoutHandle = setTimeout(() => timer.abort(), cfg.timeoutMs);
        try {
            const res = await fetchImpl(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    // Dropped by browsers (forbidden header) — see the module header's browser note.
                    'User-Agent': PLANDATA_USER_AGENT,
                },
                signal: timer.signal,
            });
            // ⚠ STATUS BEFORE BODY. An error page that happens to parse as `{features:[]}` must never
            // read as a genuine absence.
            if (!res.ok) {
                const retryable = res.status === 429 || res.status >= 500;
                const reason = `plandata WFS responded ${res.status}`;
                if (!retryable) return { kind: 'fatal', reason };
                const header = res.headers?.get?.('retry-after') ?? null;
                const seconds = header !== null ? Number.parseFloat(header) : Number.NaN;
                return {
                    kind: 'retry',
                    reason,
                    retryAfterMs: Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null,
                };
            }
            return { kind: 'ok', body: await res.json() };
        } catch (err) {
            if (isAborted(signal)) return { kind: 'aborted' };
            const message = (err as Error)?.message ?? String(err);
            // Our own timeout aborted it — that is a transient source failure, not a caller abort.
            const isTimeout = timer.signal.aborted;
            return {
                kind: 'retry',
                reason: isTimeout ? `timeout after ${cfg.timeoutMs} ms` : `network-error: ${message}`,
                retryAfterMs: null,
            };
        } finally {
            clearTimeout(timeoutHandle);
            signal?.removeEventListener('abort', onOuterAbort);
        }
    }

    /** Full-jitter exponential backoff, honouring the server's `Retry-After` when it sent one. */
    function backoffMs(attemptIndex: number, retryAfterMs: number | null): number {
        if (retryAfterMs !== null) return Math.min(retryAfterMs, cfg.backoffMaxMs);
        const ceiling = Math.min(cfg.backoffBaseMs * 2 ** attemptIndex, cfg.backoffMaxMs);
        return Math.round(ceiling * (0.5 + 0.5 * cfg.jitter()));
    }

    async function fetchUncached(
        bbox: Bbox25832,
        options: ByggefeltQueryOptions,
    ): Promise<ByggefeltFetchResult> {
        const url = buildUrl(bbox, options);
        let requests = 0;
        let lastReason = 'unknown';

        for (let i = 0; i <= cfg.maxRetries; i += 1) {
            if (isAborted(options.signal)) {
                return {
                    outcome: fetchAborted('superseded by a newer request'),
                    featureCount: null,
                    fromCache: false,
                    requests,
                    truncated: false,
                };
            }
            await acquireSlot();
            requests += 1;
            const a = await attempt(url, options.signal);

            if (a.kind === 'aborted') {
                return {
                    outcome: fetchAborted('superseded by a newer request'),
                    featureCount: null,
                    fromCache: false,
                    requests,
                    truncated: false,
                };
            }
            if (a.kind === 'fatal') {
                // A 4xx is OUR bug (bad filter / unknown layer). It is NOT an absence — reporting it
                // as "no byggefelt here" would hide a broken query behind a plausible empty answer.
                return {
                    outcome: fetchTransient(`${a.reason} (non-retryable client error — check the query)`),
                    featureCount: null,
                    fromCache: false,
                    requests,
                    truncated: false,
                };
            }
            if (a.kind === 'retry') {
                lastReason = a.reason;
                if (i < cfg.maxRetries) await cfg.sleep(backoffMs(i, a.retryAfterMs));
                continue;
            }

            // ── ANSWERED. Parse. ──────────────────────────────────────────────────────────────
            const body = a.body as
                | { features?: unknown; numberMatched?: unknown; numberReturned?: unknown }
                | null
                | undefined;
            const features = Array.isArray(body?.features) ? (body.features as DkByggefeltFeature[]) : null;
            if (features === null) {
                // A 200 whose body is not a FeatureCollection means the source did not really answer.
                lastReason = 'unparseable body (no `features` array)';
                if (i < cfg.maxRetries) await cfg.sleep(backoffMs(i, null));
                continue;
            }

            const matched = Number(body?.numberMatched);
            const returned = Number(body?.numberReturned ?? features.length);
            const truncated = Number.isFinite(matched) && Number.isFinite(returned) && matched > returned;

            if (features.length === 0) {
                // A DURABLE absence: the register answered, and no byggefelt covers this bbox.
                return {
                    outcome: fetchAbsent('no adopted byggefelt intersects this bbox'),
                    featureCount: 0,
                    fromCache: false,
                    requests,
                    truncated: false,
                };
            }
            const evidence = byggefeltCollectionToEvidence(features, {
                sourceCrs: PLANDATA_NATIVE_CRS,
                project: options.project ?? null,
            });
            return {
                outcome: fetchFound(evidence),
                featureCount: features.length,
                fromCache: false,
                requests,
                truncated,
            };
        }

        // Retries exhausted — TRANSIENT, never `absent`, and never cached.
        return {
            outcome: fetchTransient(`${lastReason} (after ${requests} attempt(s))`),
            featureCount: null,
            fromCache: false,
            requests,
            truncated: false,
        };
    }

    function cacheKey(bbox: Bbox25832, options: ByggefeltQueryOptions): string {
        // The projector is a function and cannot be keyed; whether one was SUPPLIED changes the
        // emitted CRS, so it is part of the key. Two callers with different projectors must not
        // share an entry, so a projector's identity is included via its presence + `bindingOnly`.
        return [
            bbox.minX,
            bbox.minY,
            bbox.maxX,
            bbox.maxY,
            options.bindingOnly === true ? 'binding' : 'all',
            options.project ? 'projected' : 'raw',
        ].join('|');
    }

    function readCache(key: string): ByggefeltFetchResult | null {
        const hit = cache.get(key);
        if (hit === undefined) return null;
        if (hit.expiresAt <= cfg.now()) {
            cache.delete(key);
            return null;
        }
        // LRU touch.
        cache.delete(key);
        cache.set(key, hit);
        return { ...hit.result, fromCache: true, requests: 0 };
    }

    function writeCache(key: string, result: ByggefeltFetchResult): void {
        // ⚠ ONLY durable answers are cached. Caching a `transient` would turn one bad minute into a
        // TTL-long fake "no byggefelt here" — the §FAILURE-IS-NOT-ABSENCE failure, persisted.
        const status = result.outcome.status;
        if (status !== 'found' && status !== 'absent') return;
        cache.set(key, { expiresAt: cfg.now() + cfg.cacheTtlMs, result });
        while (cache.size > cfg.cacheMaxEntries) {
            const oldest = cache.keys().next();
            if (oldest.done === true) break;
            cache.delete(oldest.value);
        }
    }

    async function fetchByBbox(
        bbox: Bbox25832,
        options: ByggefeltQueryOptions = {},
    ): Promise<ByggefeltFetchResult> {
        const span = tracer.startSpan('pryzm.zoning.dk.byggefelt.fetchByBbox');
        try {
            if (
                ![bbox.minX, bbox.minY, bbox.maxX, bbox.maxY].every(Number.isFinite) ||
                bbox.maxX <= bbox.minX ||
                bbox.maxY <= bbox.minY
            ) {
                // A bad bbox is a CALLER error, not an absence — say so rather than return "nothing".
                span.setAttribute('outcome', 'invalid-bbox');
                return {
                    outcome: fetchTransient('invalid bbox (non-finite or zero/negative extent)'),
                    featureCount: null,
                    fromCache: false,
                    requests: 0,
                    truncated: false,
                };
            }

            const key = cacheKey(bbox, options);
            const cached = readCache(key);
            if (cached !== null) {
                span.setAttribute('outcome', cached.outcome.status);
                span.setAttribute('fromCache', true);
                return cached;
            }

            // IN-FLIGHT DE-DUP above the fetch (L-585): concurrent callers share ONE request.
            const pending = inFlight.get(key);
            if (pending !== undefined) {
                span.setAttribute('deduped', true);
                return await pending;
            }
            const p = fetchUncached(bbox, options).finally(() => inFlight.delete(key));
            inFlight.set(key, p);
            const result = await p;
            writeCache(key, result);
            span.setAttribute('outcome', result.outcome.status);
            span.setAttribute('requests', result.requests);
            span.setAttribute('truncated', result.truncated);
            span.setStatus({ code: SpanStatusCode.OK });
            return result;
        } catch (err) {
            // Defensive: this path is best-effort and must never throw into a caller.
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
            return {
                outcome: fetchTransient(`unexpected producer error: ${(err as Error)?.message ?? String(err)}`),
                featureCount: null,
                fromCache: false,
                requests: 0,
                truncated: false,
            };
        } finally {
            span.end();
        }
    }

    return {
        fetchByBbox,
        async fetchForParcelBbox(
            bbox: Bbox25832,
            padM = 0,
            options: ByggefeltQueryOptions = {},
        ): Promise<ByggefeltFetchResult> {
            const span = tracer.startSpan('pryzm.zoning.dk.byggefelt.fetchForParcelBbox');
            try {
                const pad = Number.isFinite(padM) && padM > 0 ? padM : 0;
                span.setAttribute('padM', pad);
                return await fetchByBbox(
                    {
                        minX: bbox.minX - pad,
                        minY: bbox.minY - pad,
                        maxX: bbox.maxX + pad,
                        maxY: bbox.maxY + pad,
                    },
                    options,
                );
            } finally {
                span.end();
            }
        },
        clearCache(): void {
            cache.clear();
        },
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE BRIDGE — producer result → the G6 resolver's TIER-1 input
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** What the bridge concluded, alongside the outcome it hands the resolver. */
export interface ByggefeltTierOneInput {
    /** Feed directly to `DkPlacementInputs.byggefelt`. */
    readonly outcome: FetchOutcome<DkByggefelt>;
    /** The full ranked evidence list (all legal states), for the UI / audit trail / QA. */
    readonly evidence: readonly PlacementEvidence[];
    /** The self-contradictory records found in this bbox — a QA output, never silently resolved. */
    readonly conflicts: readonly PlacementEvidence[];
    /**
     * Binding evidence that PRYZM could not adapt into a footprint, with the reason. These are OUR
     * capability limits (multi-part, holed, unprojected), not the register's gaps, and they are
     * reported separately so a coverage statistic never quietly absorbs them as "no data".
     */
    readonly unusableBinding: readonly { readonly evidence: PlacementEvidence; readonly detail: string }[];
}

/**
 * Turn a producer result into the tier-1 `FetchOutcome<DkByggefelt>` the G6 resolver consumes.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE THREE JUDGEMENTS THIS MAKES, AND WHY EACH IS THE HONEST ONE
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 1. **Byggefelter exist, but none is binding → `absent`, not `transient`.** This is a DURABLE fact:
 *    re-fetching will not make an advisory field binding. Marking it retryable would make the UI
 *    promise a better answer that can never arrive. (The resolver's own comment already anticipated
 *    this: the binding gate is correctly non-retryable.)
 *
 * 2. **⚠ TRUNCATED PAGE + no binding found → `transient`, NOT `absent`.** If the WFS matched more
 *    features than it returned, "none of them is binding" is a statement about a PAGE, not about the
 *    bbox — a binding byggefelt could sit on page 2. Concluding absence from a partial read is
 *    exactly how a fetch limit becomes a fake coverage fact (§FAILURE-IS-NOT-ABSENCE). So a
 *    truncated negative is reported as unresolved, which makes the resolver set
 *    `higherAuthorityUnresolved` and forbid caching the downstream answer.
 *
 * 3. **Binding evidence we cannot ADAPT → `absent`, with the limitation named in the reason.** A
 *    multi-part or holed byggefelt is real, published and binding; PRYZM simply cannot hand it to
 *    the single-ring `explicit-area` primitive without over-stating the buildable area. Falling
 *    through to a weaker tier is correct, but the reason string says `pryzm-limitation:` so this is
 *    never mistaken for "the register published nothing" — and the records ride out on
 *    `unusableBinding` so a coverage metric can subtract them explicitly.
 *
 * PURE (it only classifies a value the producer already fetched).
 */
export function byggefeltResultToTierOne(result: ByggefeltFetchResult): ByggefeltTierOneInput {
    const empty: readonly PlacementEvidence[] = [];
    const o = result.outcome;

    if (o.status === 'transient') {
        return { outcome: fetchTransient(o.reason), evidence: empty, conflicts: empty, unusableBinding: [] };
    }
    if (o.status === 'aborted') {
        return { outcome: fetchAborted(o.reason), evidence: empty, conflicts: empty, unusableBinding: [] };
    }
    if (o.status === 'absent') {
        return { outcome: fetchAbsent(o.reason), evidence: empty, conflicts: empty, unusableBinding: [] };
    }

    const ranked = rankPlacementEvidence(o.value);
    const conflicts = collectEvidenceConflicts(ranked);
    const unusableBinding: { evidence: PlacementEvidence; detail: string }[] = [];

    // Walk the ranked list and take the first BINDING record that actually adapts.
    for (const e of ranked) {
        if (e.legalStatus !== 'binding') break; // ranked: once past binding, nothing else qualifies.
        const adapted = dkByggefeltFromEvidence(e);
        if (adapted.ok) {
            return { outcome: fetchFound(adapted.byggefelt), evidence: ranked, conflicts, unusableBinding };
        }
        unusableBinding.push({ evidence: e, detail: adapted.detail });
    }

    // ── Nothing placeable. Decide DURABLE-vs-UNRESOLVED honestly. ─────────────────────────────
    if (result.truncated) {
        return {
            outcome: fetchTransient(
                'the byggefelt page was TRUNCATED (more features matched than were returned), so ' +
                    '"none is binding" describes only the page that was read, not the bbox — ' +
                    'refetch with a larger page size before treating this as an absence',
            ),
            evidence: ranked,
            conflicts,
            unusableBinding,
        };
    }
    if (unusableBinding.length > 0) {
        return {
            outcome: fetchAbsent(
                `pryzm-limitation: ${unusableBinding.length} BINDING byggefelt(er) intersect this ` +
                    'bbox but none could be adapted to the single-ring explicit-area primitive ' +
                    `(${unusableBinding.map((u) => u.detail.split(' — ')[0]).join('; ')}). This is a ` +
                    'PRYZM capability gap, NOT an absence of published data.',
            ),
            evidence: ranked,
            conflicts,
            unusableBinding,
        };
    }
    return {
        outcome: fetchAbsent(
            `${ranked.length} byggefelt record(s) intersect this bbox but none is declared binding ` +
                '(bygkunifelt=true AND bygvejledende=false). Durable: a retry cannot make an ' +
                'advisory field binding.',
        ),
        evidence: ranked,
        conflicts,
        unusableBinding,
    };
}
