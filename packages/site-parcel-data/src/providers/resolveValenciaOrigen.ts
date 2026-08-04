// §VALENCIA-ORIGEN — the LIVE per-parcel read of `MapServer/231.origen`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS CLOSES
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// `esValenciaPgou.ts` §DELEGATION-MEASURED and `registry.ts`'s València block both name the same
// open item (CLOSURE-REGISTER #3): 36,40 % of València's private buildable land (the L-656
// denominator) is ordered by a DERIVED instrument, not the PGOU itself — measured over the whole
// `MapServer/231.origen` column, 2026-08-01. That measurement is a LAND SHARE; it says nothing
// about any ONE parcel. Publishing the stronger, legally-grounded `derived-plan` refusal
// (`legallyGrounded: true` — the LAW is known: a document other than the PGOU governs this site)
// on a specific parcel needs the LIVE `origen` value AT THAT POINT, which nothing fetched it
// before this file. Until now every València parcel — PGOU-ordered or not — received the same
// weaker, coverage-only `no-rule-pack` refusal (`legallyGrounded: false`), which is honest but
// throws away a legal fact PRYZM can establish for over a third of the city.
//
// This file is the missing seam, and nothing more — the ONE impure boundary for layer 231's
// `origen` field, mirroring `resolveValenciaAlineaciones.ts` (which already queries the SAME
// layer for the R1 containment check, but only for its rings — never for `origen`). Fetch,
// classify nothing, hand back the raw field, never throw. The judgement — is `origen` a PGOU
// instrument or a derived one — stays in the L2-pure `valenciaOrigenIsPgouOrdered()`
// (`esValenciaEnvelope.ts`), exactly as `resolveValenciaAlineaciones` keeps `altura`
// interpretation out of its own fetch.
//
// ⚠ THIS DOES NOT TOUCH THE ENVELOPE GATE. `VALENCIA_ENVELOPE_VERIFIED` stays `false`; this file
// answers a DIFFERENT, narrower question — "which document governs, not what it permits" — and
// upgrades a refusal's LEGAL GROUNDING, never its NUMBER. No field here is height, depth, FAR or
// coverage; `origen` is a document identifier.
//
// Contracts/ADRs: C58 §1.4/§1.5/§1.9/§1.10 · C63 · L-656 (denominator discipline) ·
// L-422/457/467/469 (failure ≠ empty — `service-error` and `no-parcel-here` are DIFFERENT).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInValencia } from './valenciaBbox.js';
// ⚠ THE SAME LAYER CONSTANT `resolveValenciaAlineaciones.ts` ALREADY EXPORTS — imported, never
// redeclared, so the two providers cannot silently drift onto different layer ids for what is
// the same published service and the same layer number (231).
import { VALENCIA_CALIFICACION_LAYER } from './resolveValenciaAlineaciones.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The same published service every València provider in this package targets. */
export const VALENCIA_ORIGEN_SERVICE =
    'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer';

/** Why a resolution produced no `origen` reading. Mirrors `ValenciaAlineacionesRefusal`'s discipline. */
export type ValenciaOrigenRefusal =
    /** The point is outside the València routing box. */
    | 'out-of-valencia'
    /** No `fetch` was supplied and none exists in scope. */
    | 'no-fetch'
    /** ⚠ The service did not answer, or answered an ArcGIS error. NOT "no parcel here". */
    | 'service-error'
    /** The service answered correctly and there is genuinely no calificación polygon at this point. */
    | 'no-parcel-here';

/** What layer 231 says about the governing instrument at a point. */
export interface ValenciaOrigenHit {
    readonly ok: true;
    /** `origen` verbatim, trimmed. Empty/blank comes back as `null`, never as `''`. */
    readonly origen: string | null;
    readonly califi: string | null;
    readonly tipoca: string | null;
    /** `clase` verbatim — e.g. `SU` (suelo urbano), the L-656 denominator's first filter. */
    readonly clase: string | null;
}

export interface ValenciaOrigenMiss {
    readonly ok: false;
    readonly reason: ValenciaOrigenRefusal;
    readonly detail?: string;
}

export type ValenciaOrigenResolution = ValenciaOrigenHit | ValenciaOrigenMiss;

export interface ValenciaOrigenDeps {
    readonly fetchImpl?: typeof globalThis.fetch;
    /** Override the service root (tests, or a same-origin proxy). */
    readonly serviceBase?: string;
}

const blank = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
    return s.length ? s : null;
};

/**
 * Resolve València's live governing-instrument field (`origen`) at a point, together with the
 * `califi` / `tipoca` / `clase` already used elsewhere in this package — one request answers all
 * four rather than four callers each paying for their own round trip.
 *
 * **NEVER THROWS** — every miss is a typed refusal. OTel span
 * `pryzm.zoning.resolveValenciaOrigen` (P8 / C58 §1.10).
 *
 * ⚠ NO GEOMETRY IS REQUESTED (`returnGeometry=false`): this seam answers a document-identity
 * question, not a footprint question — `resolveValenciaAlineaciones` already owns the geometry
 * read of this same layer for the R1 containment check. Two callers each fetching geometry they
 * do not use would double the round-trip cost of every València parcel for no benefit.
 */
export async function resolveValenciaOrigen(
    point: { lat: number; lon: number } | null | undefined,
    deps: ValenciaOrigenDeps = {},
): Promise<ValenciaOrigenResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveValenciaOrigen');
    span.setAttribute('provider', 'valencia-pgou-calificaciones-231-origen');
    try {
        if (
            !point ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInValencia(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-valencia');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-valencia' };
        }
        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }
        const base = deps.serviceBase ?? VALENCIA_ORIGEN_SERVICE;
        const geometry = encodeURIComponent(
            JSON.stringify({ x: point.lon, y: point.lat, spatialReference: { wkid: 4326 } }),
        );
        const url =
            `${base}/${VALENCIA_CALIFICACION_LAYER}/query?geometry=${geometry}` +
            '&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326' +
            '&outFields=origen,califi,tipoca,clase&returnGeometry=false&resultRecordCount=4&f=json';

        let body: unknown;
        try {
            const res = await fetchImpl(url, {
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(20_000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            body = await res.json();
        } catch (e) {
            // ⚠ UNREACHABLE ≠ EMPTY (L-422/457/467/469). Must never become `no-parcel-here`.
            span.setAttribute('resultFields', 'service-error');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
        }

        const b = body as {
            error?: { code?: number; message?: string };
            features?: ReadonlyArray<{ attributes?: Record<string, unknown> }>;
        };
        // ⚠ ArcGIS returns HTTP 200 with an `error` body. That is a FAILURE, not an empty result.
        if (b.error) {
            span.setAttribute('resultFields', 'service-error');
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'service-error',
                detail: `ArcGIS ${b.error.code ?? '?'}: ${b.error.message ?? 'error'}`,
            };
        }

        const feature = (b.features ?? [])[0];
        if (!feature) {
            // The service DID answer, and answered "nothing here". A genuine empty.
            span.setAttribute('resultFields', 'no-parcel-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-parcel-here' };
        }

        const attrs = feature.attributes ?? {};
        const origen = blank(attrs['origen']);
        const califi = blank(attrs['califi']);
        const tipoca = blank(attrs['tipoca']);
        const clase = blank(attrs['clase']);
        span.setAttribute('resultFields', 'origen,califi,tipoca,clase');
        span.setAttribute('origen', origen ?? '');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, origen, califi, tipoca, clase };
    } catch (e) {
        // Defence in depth: this function's contract is that it never throws.
        span.setAttribute('resultFields', 'service-error');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
    } finally {
        span.end();
    }
}
