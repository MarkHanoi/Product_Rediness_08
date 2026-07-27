// C58 §3.1 / L-399a — `DkZoningProvider`: the Denmark (Plandata.dk) zoning adapter.
//
// The FIRST genuine-data jurisdiction of the compliance pilot (C58 §1.2 fidelity 1
// — `structured`). It fetches the applicable plan (lokalplan / kommuneplan-ramme)
// at a WGS84 point via the SAME-ORIGIN keyless proxy `GET /api/plandata/zoning`
// (server/plandataZoningProxy.js — mirrors the Catastro parcel proxy), then MAPS
// the plan's raw published attributes → a C58 `ZoningRecord` with `structuredFields`
// via the PURE `mapPlandataToZoningRecord`.
//
// LAYERING — the fetch is the one impure surface (C58 §1.9); the mapping is pure
// and unit-tested. NEVER throws: any miss / upstream failure / non-DK point →
// `null`, and the caller falls back to the estimated default (graceful degradation,
// C58 §1.2 fidelity 3 — the envelope is never broken).
//
// OTel span `pryzm.zoning.fetchZoning` per C58 §1.10 / P8.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §3.1;
// docs/04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md §2.3.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { ZoningRecord } from '@pryzm/schemas';
import type { ZoningProvider, ZoningProviderDeps } from './ZoningProvider.js';
import {
    mapPlandataToZoningRecord,
    extractDkPlanIdentity,
    type PlandataZoningResponse,
    type DkPlanIdentity,
} from './mapPlandataToZoningRecord.js';
import { isInDenmark } from './denmarkBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The same-origin proxy route the browser calls (never the gov endpoint directly). */
export const PLANDATA_ZONING_PATH = '/api/plandata/zoning';

/** Today's date as an ISO `YYYY-MM-DD` string (impure — used only in the adapter). */
function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * §DK-HONEST-REFUSAL — the three distinct outcomes of a DK zoning resolve, so the dispatch layer
 * can tell them apart instead of collapsing every non-structured case to `null` → the generic
 * `estimated-default`. `fetchZoningAtPoint` (the `ZoningProvider` interface method) still returns
 * `ZoningRecord | null` for back-compat; `fetchZoningResultAtPoint` returns this richer union:
 *
 *   • `structured`            — a plan resolved WITH usable dimensional fields → real envelope.
 *   • `plan-without-numbers`  — a plan resolved (we hold its zone identity + plan-document link)
 *                               but NOT enough structured numbers to draw a volume → honest cited
 *                               refusal, NEVER the estimated triple (§CONTEXT-DATA-HONESTY).
 *   • `no-plan`               — the source ANSWERED and no adopted plan covers the point (a durable
 *                               absence) / out-of-Denmark. NOT a fetch failure.
 *   • `unreachable`           — STRUCTURAL-SEAM-4: Plandata did not answer (proxy 502 / network /
 *                               timeout). A TRANSIENT failure, distinct from `no-plan`, so the
 *                               dispatcher can retry it and show "temporarily unavailable" rather
 *                               than a permanent "no plan here" (§CONTEXT-DATA-HONESTY, L-422/457/469).
 */
export type DkZoningResult =
    | { readonly kind: 'structured'; readonly record: ZoningRecord }
    | { readonly kind: 'plan-without-numbers'; readonly identity: DkPlanIdentity }
    | { readonly kind: 'no-plan' }
    | { readonly kind: 'unreachable' };

/**
 * STRUCTURAL-SEAM-4 — the classified outcome of the one impure fetch, so the caller can tell a
 * genuine empty apart from a source that did not answer:
 *   • `{ status:'answered', response }` — the proxy answered 200; `response` is the winning plan
 *     feature, or `null` when the source answered with no plan here (a DURABLE absence).
 *   • `{ status:'unreachable' }`        — non-OK (proxy 502) / no-fetch / network error / bad body.
 * Out-of-Denmark / non-finite coords resolve to `answered` with `null` (a real "nothing here"), NOT
 * `unreachable` — no fetch was even attempted, so it is not a source failure.
 */
type DkFetchOutcome =
    | { readonly status: 'answered'; readonly response: PlandataZoningResponse | null }
    | { readonly status: 'unreachable' };

/**
 * The one impure surface (C58 §1.9): fetch the raw winning Plandata feature at a WGS84 point via the
 * same-origin proxy, CLASSIFIED as answered-vs-unreachable (STRUCTURAL-SEAM-4 — no longer collapsing
 * an upstream failure to the same `null` a genuine empty uses). NEVER throws. Shared by both public
 * methods so there is a single fetch path.
 */
async function fetchPlandataOutcome(
    lat: number,
    lon: number,
    deps: ZoningProviderDeps,
): Promise<DkFetchOutcome> {
    // No fetch attempted (off-Denmark / bad coords) → a real "nothing here", not a source failure.
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInDenmark(lat, lon)) {
        return { status: 'answered', response: null };
    }
    const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') return { status: 'unreachable' };
    const base = deps.pathBase ?? PLANDATA_ZONING_PATH;
    const url =
        `${base}?lat=${encodeURIComponent(String(lat))}` +
        `&lon=${encodeURIComponent(String(lon))}`;
    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        // A non-OK proxy response (502 = upstream failure) is a TRANSIENT failure, NOT "no plan".
        if (!res || !res.ok) return { status: 'unreachable' };
        const body = (await res.json()) as { zoning?: PlandataZoningResponse | null };
        return { status: 'answered', response: body?.zoning ?? null };
    } catch (fetchErr) {
        // Network / parse failure → transient unreachable (caller retries, then refuses honestly).
        console.warn('[dk-zoning] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
        return { status: 'unreachable' };
    }
}

interface DkZoningProviderShape extends ZoningProvider {
    /**
     * §DK-HONEST-REFUSAL — resolve the DK zoning at a WGS84 point as a three-way result (see
     * `DkZoningResult`). Never throws: any failure resolves to `{ kind: 'no-plan' }`. OTel span
     * `pryzm.zoning.fetchZoningResult` (C58 §1.10 / P8).
     */
    fetchZoningResultAtPoint(
        lat: number,
        lon: number,
        deps?: ZoningProviderDeps,
    ): Promise<DkZoningResult>;
}

/**
 * `DkZoningProvider` — resolve the structured Danish zoning at a WGS84 point, or
 * null (miss / failure / out-of-Denmark). Never throws.
 */
export const DkZoningProvider: DkZoningProviderShape = {
    id: 'plandata-dk',
    label: 'Plandata.dk (Danish national plan register)',

    async fetchZoningAtPoint(
        lat: number,
        lon: number,
        deps: ZoningProviderDeps = {},
    ): Promise<ZoningRecord | null> {
        const span = tracer.startSpan('pryzm.zoning.fetchZoning');
        span.setAttribute('provider', 'plandata-dk');
        try {
            const outcome = await fetchPlandataOutcome(lat, lon, deps);
            // Back-compat method returns `ZoningRecord | null`: an unreachable source is a miss (null),
            // exactly as before — callers of this method have no transient/absent distinction to make.
            const response = outcome.status === 'answered' ? outcome.response : null;
            const record = response
                ? mapPlandataToZoningRecord(response, { fetchDateISO: deps.nowISO ?? todayISO() })
                : null;
            span.setAttribute('resultFields', record ? 'structured' : 'no-usable-plan');
            if (record) {
                span.setAttribute('zoneCode', record.zoneCode);
                span.setAttribute('jurisdictionId', record.jurisdictionId);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return record;
        } catch (err) {
            // Defensive: the whole path is best-effort — never throw into the caller.
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
            console.warn('[dk-zoning] unexpected error (non-fatal):', (err as Error)?.message ?? err);
            return null;
        } finally {
            span.end();
        }
    },

    async fetchZoningResultAtPoint(
        lat: number,
        lon: number,
        deps: ZoningProviderDeps = {},
    ): Promise<DkZoningResult> {
        const span = tracer.startSpan('pryzm.zoning.fetchZoningResult');
        span.setAttribute('provider', 'plandata-dk');
        try {
            const outcome = await fetchPlandataOutcome(lat, lon, deps);
            // STRUCTURAL-SEAM-4 — a source that did not answer is `unreachable` (transient), NEVER
            // collapsed into `no-plan` (a durable absence). The dispatcher retries the former.
            if (outcome.status === 'unreachable') {
                span.setAttribute('resultFields', 'unreachable');
                span.setStatus({ code: SpanStatusCode.OK });
                return { kind: 'unreachable' };
            }
            const response = outcome.response;
            if (!response) {
                span.setAttribute('resultFields', 'no-plan');
                span.setStatus({ code: SpanStatusCode.OK });
                return { kind: 'no-plan' };
            }
            const record = mapPlandataToZoningRecord(response, {
                fetchDateISO: deps.nowISO ?? todayISO(),
            });
            if (record) {
                span.setAttribute('resultFields', 'structured');
                span.setAttribute('zoneCode', record.zoneCode);
                span.setAttribute('jurisdictionId', record.jurisdictionId);
                span.setStatus({ code: SpanStatusCode.OK });
                return { kind: 'structured', record };
            }
            // A plan resolved but with no usable dimensional field: keep its IDENTITY + citation so
            // the caller refuses honestly (names the zone + links the PDF) rather than fabricating.
            const identity = extractDkPlanIdentity(response);
            if (identity) {
                span.setAttribute('resultFields', 'plan-without-numbers');
                span.setAttribute('zoneCode', identity.zoneCode);
                span.setStatus({ code: SpanStatusCode.OK });
                return { kind: 'plan-without-numbers', identity };
            }
            span.setAttribute('resultFields', 'no-plan');
            span.setStatus({ code: SpanStatusCode.OK });
            return { kind: 'no-plan' };
        } catch (err) {
            // Best-effort — a thrown resolve is honestly a no-plan (refuse), never a fabrication.
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
            console.warn('[dk-zoning] unexpected error (non-fatal):', (err as Error)?.message ?? err);
            return { kind: 'no-plan' };
        } finally {
            span.end();
        }
    },
};
