// L-608 — the Madrid Norma Zonal 1 `ringRef` RESOLVER (the provider half of the explicit-area
// wiring, C58 §2.2 KG-4 / ADR-0270).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `esMadridNZ1.ts` ships `geometricRule.ringRef = 'madrid-nz1:fondo-condiciones/v-2023'` and nothing
// else — the buildable footprint is PUBLISHED AS GEOMETRY on the municipal ArcGIS plane, not stated
// as parameters, so the pack carries a HANDLE and this adapter turns that handle into a closed
// buildable RING for the clicked parcel's manzana. It is the Madrid-specific counterpart of
// `DkZoningProvider.fetchZoningAtPoint`: the ONE impure seam (a fetch through the C57 same-origin
// proxy), wrapping a deterministic parse.
//
// SOURCE (verified live 2026-07-23, SOURCES.md §A):
//   sigma.madrid.es/.../PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer
//     layer 6 "Condiciones de la Edificación" (polygon) — carries COEF_Z (the weighted
//     edificabilidad, typed String at source), COND_EDIF (grado) and CODMANZANA (the block key it
//     is per). A polygon feature keyed by CODMANZANA gives BOTH the closed buildable area AND the
//     edificabilidad in one query, so it is the layer this resolver reads.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body / unparseable edificabilidad
//      returns a typed REFUSAL, so the L5 dispatcher shows a cited refusal, never a fabricated number
//      (mirrors `ZoningProvider.fetchZoningAtPoint`). ⚠ Until a same-origin Madrid proxy is wired
//      server-side AND the zone code is verified against the live calificación plane, production has
//      no endpoint to reach, so this resolver returns `endpoint-unreachable` and the dispatcher
//      REFUSES. That is the correct shipping state (the L-608 constraint), not a bug.
//   2. IT DOES NOT PROJECT. The ring comes back in WGS84 (the query asks the server for `outSR=4326`),
//      NOT in the source's native EPSG:25830, and NOT in scene-XZ. Projection to the authoring frame
//      is the L5 dispatcher's job (it holds the site origin + θ and already projects the parcel and
//      the block ring the same way) — so this module stays L2-pure with no proj4 dependency. Returning
//      WGS84 lat/lon is the deliberate seam: the engine's `explicitAreaFootprint` is scene-XZ, and the
//      dispatcher converts.
//   3. `COEF_Z` IS PARSED UNDER ASSERTION, NEVER DEFAULTED. It is a String at source (pack header §3);
//      an unparseable value REFUSES (`unparseable-edificabilidad`) rather than degrade to 0, and an
//      ABSENT value yields `null` (honest absence) — the resolver never invents an edificabilidad.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveMadridRing` (C58 §1.10 / P8).
//
// Strategic context — C58 §2.2 (KG-4), ADR-0270, `esMadridNZ1.ts` header, and
// docs/04-reference/jurisdictions/es/es-md/28079-madrid/.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * The `ringRef` handle this resolver answers for. MUST equal the pack's
 * `MADRID_NZ1_RULE.ringRef` — asserted at the top of `resolveMadridNZ1Ring` so a vintage drift
 * refuses rather than resolves against the wrong plane.
 */
export const MADRID_NZ1_RING_REF = 'madrid-nz1:fondo-condiciones/v-2023' as const;

/**
 * The same-origin proxy route the browser would call (never sigma.madrid.es directly — C57 CSP).
 * ⚠ NOT YET WIRED server-side. Documented here so the day it lands, this is the one constant to
 * point at it; until then the fetch fails and the resolver refuses (property 1 above).
 */
export const MADRID_CONDICIONES_PATH = '/api/madrid/condiciones';

/** The ArcGIS layer id carrying COEF_Z + CODMANZANA + the closed polygon (SOURCES.md §A). */
export const MADRID_CONDICIONES_LAYER = 6;

/** A WGS84 point — the frame the resolver returns the ring in (property 2 above). */
export interface MadridLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network (mirrors `ZoningProviderDeps`). */
export interface MadridRingDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `MADRID_CONDICIONES_PATH`). */
    readonly pathBase?: string;
    /** ArcGIS layer id to query (default `MADRID_CONDICIONES_LAYER`). */
    readonly layer?: number;
}

/** Why a Madrid ring resolution refused. Closed vocabulary — these are legally/operationally distinct. */
export type MadridRingRefusalReason =
    /** The rule this was asked to resolve carries a different `ringRef` (vintage / plane drift). */
    | 'ringref-mismatch'
    /** No usable CODMANZANA key was supplied — nothing to query the plane by. */
    | 'no-cod-manzana'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The query returned no feature for this manzana (no published footprint here). */
    | 'no-feature'
    /** The returned geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry'
    /** COEF_Z was PRESENT but could not be parsed to a positive number — refuse, never default to 0. */
    | 'unparseable-edificabilidad';

export type MadridRingResolution =
    | {
          readonly ok: true;
          /** The published buildable footprint for the manzana, in WGS84 (L5 projects it). */
          readonly ringLatLon: MadridLngLat[];
          /** COEF_Z parsed to a positive number, or null when the source publishes none. */
          readonly edificabilidad: number | null;
          /** The CODMANZANA the footprint answers for (echoed for the dispatcher's log/provenance). */
          readonly codManzana: string;
      }
    | { readonly ok: false; readonly reason: MadridRingRefusalReason };

/** Parse COEF_Z (String at source) to a positive finite number; PRESENT-but-bad → refusal signal. */
function parseCoefZ(raw: unknown): { ok: true; value: number | null } | { ok: false } {
    if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
    // Spanish decimals may use a comma (e.g. "1,25"); normalise before parsing.
    const s = typeof raw === 'number' ? String(raw) : String(raw).trim().replace(',', '.');
    const n = Number.parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return { ok: false };
    return { ok: true, value: n };
}

/**
 * Close an ArcGIS polygon ring (outer ring, WGS84 `[lon, lat]` pairs) into the resolver's
 * `MadridLngLat[]` form, dropping the duplicated closing vertex ArcGIS appends. Returns null when
 * fewer than 3 distinct vertices survive (degenerate).
 */
function ringFromArcgis(rings: unknown): MadridLngLat[] | null {
    if (!Array.isArray(rings) || rings.length === 0) return null;
    const outer = rings[0];
    if (!Array.isArray(outer) || outer.length < 3) return null;
    const pts: MadridLngLat[] = [];
    for (const pair of outer) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        pts.push({ lat, lon });
    }
    // Drop the ArcGIS closing vertex (first === last) so callers get distinct vertices only.
    if (
        pts.length >= 2 &&
        pts[0]!.lat === pts[pts.length - 1]!.lat &&
        pts[0]!.lon === pts[pts.length - 1]!.lon
    ) {
        pts.pop();
    }
    return pts.length >= 3 ? pts : null;
}

/**
 * Resolve the Madrid NZ 1 buildable footprint ring for a manzana. Fetches the published
 * PG_CONDICIONES_EDIFICACION polygon (layer 6) through the same-origin proxy, closes it into a
 * WGS84 ring and parses COEF_Z. NEVER throws — every failure is a typed refusal (see the header's
 * three honesty properties).
 *
 * @param ruleRingRef  the pack rule's `ringRef` — asserted to equal `MADRID_NZ1_RING_REF`.
 * @param codManzana   the CODMANZANA to key the query on (from Catastro/parcel resolution at L5).
 */
export async function resolveMadridNZ1Ring(
    ruleRingRef: string,
    codManzana: string | null | undefined,
    deps: MadridRingDeps = {},
): Promise<MadridRingResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveMadridRing');
    span.setAttribute('provider', 'madrid-pgoum');
    try {
        if (ruleRingRef !== MADRID_NZ1_RING_REF) {
            span.setAttribute('resultFields', 'ringref-mismatch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'ringref-mismatch' };
        }
        const cod = typeof codManzana === 'string' ? codManzana.trim() : '';
        if (!cod) {
            span.setAttribute('resultFields', 'no-cod-manzana');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-cod-manzana' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? MADRID_CONDICIONES_PATH;
        const layer = deps.layer ?? MADRID_CONDICIONES_LAYER;
        // ArcGIS REST query: this manzana's Condiciones polygon + COEF_Z, geometry in WGS84 so L5
        // needs no client-side EPSG:25830 reprojection (honesty property 2).
        const where = encodeURIComponent(`CODMANZANA='${cod}'`);
        const url =
            `${base}?layer=${encodeURIComponent(String(layer))}` +
            `&where=${where}` +
            `&outFields=${encodeURIComponent('COEF_Z,COND_EDIF,CODMANZANA')}` +
            `&returnGeometry=true&outSR=4326&f=json`;

        let body: unknown = null;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            body = await res.json();
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            // eslint-disable-next-line no-console
            console.warn('[madrid-ring] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = (body as { features?: unknown } | null)?.features;
        const feature = Array.isArray(features) ? features[0] : null;
        if (!feature || typeof feature !== 'object') {
            span.setAttribute('resultFields', 'no-feature');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-feature' };
        }
        const attributes = (feature as { attributes?: Record<string, unknown> }).attributes ?? {};
        const geometry = (feature as { geometry?: { rings?: unknown } }).geometry ?? {};

        const ring = ringFromArcgis(geometry.rings);
        if (!ring) {
            span.setAttribute('resultFields', 'degenerate-geometry');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'degenerate-geometry' };
        }

        const coef = parseCoefZ(attributes.COEF_Z);
        if (!coef.ok) {
            span.setAttribute('resultFields', 'unparseable-edificabilidad');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparseable-edificabilidad' };
        }

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('edificabilidad', coef.value ?? -1);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, ringLatLon: ring, edificabilidad: coef.value, codManzana: cod };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        // eslint-disable-next-line no-console
        console.warn('[madrid-ring] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
