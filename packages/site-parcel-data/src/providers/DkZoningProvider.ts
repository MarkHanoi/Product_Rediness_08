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
    type PlandataZoningResponse,
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
 * `DkZoningProvider` — resolve the structured Danish zoning at a WGS84 point, or
 * null (miss / failure / out-of-Denmark). Never throws.
 */
export const DkZoningProvider: ZoningProvider = {
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
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInDenmark(lat, lon)) {
                span.setAttribute('resultFields', 'out-of-denmark');
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }

            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setAttribute('resultFields', 'no-fetch');
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }
            const base = deps.pathBase ?? PLANDATA_ZONING_PATH;
            const url =
                `${base}?lat=${encodeURIComponent(String(lat))}` +
                `&lon=${encodeURIComponent(String(lon))}`;

            let response: PlandataZoningResponse | null = null;
            try {
                const res = await fetchImpl(url, {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                });
                if (!res || !res.ok) {
                    span.setAttribute('resultFields', 'upstream-miss');
                    span.setStatus({ code: SpanStatusCode.OK });
                    return null;
                }
                const body = (await res.json()) as { zoning?: PlandataZoningResponse | null };
                response = body?.zoning ?? null;
            } catch (fetchErr) {
                // Network / parse failure → graceful null (caller falls back).
                span.setAttribute('resultFields', 'fetch-error');
                span.setStatus({ code: SpanStatusCode.OK });
                console.warn('[dk-zoning] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
                return null;
            }

            const record = mapPlandataToZoningRecord(response, {
                fetchDateISO: deps.nowISO ?? todayISO(),
            });
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
};
