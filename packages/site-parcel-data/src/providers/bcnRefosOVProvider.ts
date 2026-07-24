// BARCELONA-GIS-AUDIT-SPIKE — the AMB "Refós de Planejament" *Ordenació Volumètrica* (`OV_Trames`)
// resolver: the provider half of the clau-18 (*volumetria específica*) `explicit-area` path.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS, AND WHY IT EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// clau 18 (22.5 % of Barcelona's private buildable land) was a PERMANENT refusal: PGM Art. 306
// points buildability at *"the established volumetric ordering"* — a per-site document PRYZM does
// not hold (`esBarcelonaZoneClassification.ts`, code `derived-plan`). The GIS audit
// (`findings/BARCELONA-GIS-AUDIT-SPIKE.md`, 2026-07-24) found that the AMB has ALREADY vectorised
// that ordering and PUBLISHES IT AS QUERYABLE GEOMETRY: the `OV_Trames` layer of the Refós carries a
// closed volumetric FOOTPRINT polygon plus a `PLANTES` floor-count attribute (`B+7`, `PX+3`, …),
// 100 % populated over 5 073 Barcelona polygons. Footprint + floors = an extrudable envelope, READ
// rather than constructed — the same shape as Madrid's `explicit-area` `Fondo de la Edificación`.
//
// So this adapter is the exact counterpart of `resolveMadridNZ1Ring`: the ONE impure seam (a fetch,
// in production through a C57 same-origin proxy) wrapping a deterministic parse, turning a parcel
// POINT into { the closed buildable ring (WGS84), the floor count }.
//
// SOURCE (verified live 2026-07-24, `findings/BARCELONA-GIS-AUDIT-SPIKE.md` §1/§5):
//   geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer
//     layer 17 "OV_Trames" (polygon) — carries PLANTES (String, e.g. "B+7"), CLAU ("18hs"), EXP.
//     A point-in-polygon query returns the closed volumetric footprint AND the floor count in one
//     call, so it is the layer this resolver reads. `qualificacio_refos_3857` publishes in
//     EPSG:3857; we ask the server for `outSR=4326` so the ring returns in WGS84 (see property 2).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ THE CERTIFICATION GATE — read before wiring this to render anything
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Refós is a *transcripció gràfica i alfanumèrica* — a re-edition with a provenance ceiling. The
// spike's honest ceiling revision (48 % MIN / ~58 % LIKELY) is **conditional on L-449 certifying the
// Refós vintage/authority**, exactly like Córdoba's OCR pack. `BCN_REFOS_OV_CERTIFIED` is that gate,
// DEFAULT OFF: while false, clau 18 keeps its existing cited refusal and this resolver renders
// nothing. When a human signs off, the dispatcher may render — and even then only at
// `estimated-ruleset` (a constructed envelope, NEVER `structured`), with a caveat naming the AMB
// Refós source + vintage. A wrong-vintage transcription passes a gate as easily as a right one
// (the L-526 trap), so an absent number is the correct default and a confident one is the hazard.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THREE HONESTY PROPERTIES (mirror `resolveMadridNZ1Ring`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / malformed body / unparseable PLANTES
//      returns a typed REFUSAL, so the L5 dispatcher keeps the clau-18 cited refusal, never a
//      fabricated number.
//   2. IT DOES NOT PROJECT. The ring returns in WGS84 (`outSR=4326`), NOT the source's native
//      EPSG:3857 and NOT scene-XZ. Projection into the authoring frame is the L5 dispatcher's job
//      (it holds the site origin + θ and projects the parcel the same way).
//   3. `PLANTES` IS PARSED UNDER ASSERTION, NEVER DEFAULTED. It is a String at source; a PRESENT
//      but unparseable value (`ED`, blank) REFUSES (`unparseable-plantes`) rather than degrade to a
//      floor count of 0 or 1. The resolver never invents storeys — the whole clau-18 win is the
//      floor count, so a bad one must fail loudly, not silently.
//
// PURITY of the parse (C58 §1.9): the fetch is injected; given the same response the parse is
// byte-deterministic. OTel span `pryzm.zoning.resolveBcnRefosOV` (C58 §1.10 / P8).
//
// Strategic context — `findings/BARCELONA-GIS-AUDIT-SPIKE.md`, ADR-0270 (explicit-area),
// C58 §1.2/§1.4/§1.11 (tiers/estimates/granularity), L-449 (human gate), L-590h (the PDF-corpus
// measurement this GIS finding corrects).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.zoning');

/**
 * ⚠⚠ THE L-449 CERTIFICATION GATE. **DEFAULT OFF.** While false, the dispatcher keeps clau 18's
 * existing cited refusal and this resolver's output is never rendered. Flip to true ONLY after a
 * human certifies the AMB Refós OV vintage/authority against the *fitxa urbanística* (the same
 * discipline as `CORDOBA_ENVELOPE_VERIFIED`). Even then the envelope renders `estimated-ruleset`,
 * never `structured` — see the header.
 */
export const BCN_REFOS_OV_CERTIFIED: boolean = false;

/**
 * The `ringRef` handle the clau-18 pack rule carries and this resolver answers for. Versioned so a
 * source-vintage change is a diff, not a silent re-point; asserted at the top of the resolver so a
 * drifted handle refuses rather than resolves against the wrong plane.
 */
export const BCN_REFOS_OV_RING_REF = 'bcn-refos-ov:plantes/amb-v2024' as const;

/**
 * The same-origin proxy route the browser would call (never geoportal.amb.cat directly — C57 CSP).
 * ⚠ NOT YET WIRED server-side (like Madrid's `/api/madrid/condiciones`). Documented here so the day
 * it lands this is the one constant to point at it; until then the fetch fails and the resolver
 * refuses `endpoint-unreachable` — the correct state while `BCN_REFOS_OV_CERTIFIED` is off anyway.
 */
export const BCN_REFOS_OV_PATH = '/api/bcn-refos/ov';

/** The AMB Refós ArcGIS layer id carrying the volumetric footprint + PLANTES (audit §1). */
export const BCN_REFOS_OV_LAYER = 17;

/** Barcelona's INE code — the `CODI_INE` filter keeps the metro-wide service to the city. */
export const BCN_INE_CODE = '08019';

/** A WGS84 point — the frame the resolver returns the ring in (property 2). */
export interface BcnLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** Injectable dependencies so the adapter is unit-testable without the network. */
export interface BcnRefosOVDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `BCN_REFOS_OV_PATH`). */
    readonly pathBase?: string;
    /** ArcGIS layer id to query (default `BCN_REFOS_OV_LAYER`). */
    readonly layer?: number;
}

/** Why an OV resolution refused. Closed vocabulary — these are legally/operationally distinct. */
export type BcnRefosOVRefusalReason =
    /** The rule this was asked to resolve carries a different `ringRef` (vintage / plane drift). */
    | 'ringref-mismatch'
    /** No `fetch` available, the endpoint could not be reached, or it returned a non-OK / bad body. */
    | 'endpoint-unreachable'
    /** The query returned no OV feature at this point (no published volumetric footprint here). */
    | 'no-feature'
    /** The returned geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry'
    /** PLANTES was PRESENT but not a parseable floor count — refuse, never default to a storey. */
    | 'unparseable-plantes';

/**
 * A parsed `PLANTES` string. `floorsAboveGround` = storeys ABOVE the ground floor (the `+N` in
 * `B+N`); `totalStoreys` counts the ground floor too (used for the envelope's `maxFloors`).
 */
export interface ParsedPlantes {
    /** The raw source string, echoed for provenance/logging (e.g. "B+7", "PX+3", "B+5+A"). */
    readonly raw: string;
    /** Storeys above the ground floor. `B+7` → 7. */
    readonly floorsAboveGround: number;
    /** Total storeys incl. the ground floor. `B+7` → 8; `B+5+A` (attic) → 7. */
    readonly totalStoreys: number;
    /** True when the string carried a `+A` (àtic / recessed penthouse) — counted, flagged. */
    readonly hasAttic: boolean;
}

export type BcnRefosOVResolution =
    | {
          readonly ok: true;
          /** The published volumetric footprint for this parcel's OV polygon, WGS84 (L5 projects). */
          readonly ringLatLon: BcnLngLat[];
          /** The parsed floor count — the clau-18 win the qualification polygon does NOT carry. */
          readonly plantes: ParsedPlantes;
          /** The OV polygon's own clau string (e.g. "18hs"), echoed for the log/provenance. */
          readonly clau: string | null;
          /** The expedient the volumetric ordering came from (echoed for provenance). */
          readonly expedient: string | null;
      }
    | { readonly ok: false; readonly reason: BcnRefosOVRefusalReason };

/**
 * Parse an AMB `PLANTES` string (`B+7`, `PX+3`, `B+5+A`, `ED`) to a floor count.
 *
 * Grammar observed live (audit §2, 46 distinct values): a ground-floor token (`B` = planta baixa,
 * `PX` = planta baixa amb porxo) then `+N` storeys, optionally `+A` (àtic, a recessed top floor).
 * `+A` is counted as one additional storey and FLAGGED (`hasAttic`) so a consumer can caveat that it
 * is set back. A value with no parseable `+N` (`ED`, blank) yields `null` → the resolver refuses,
 * never invents a storey count (property 3).
 */
export function parsePlantes(raw: unknown): ParsedPlantes | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().toUpperCase();
    if (s === '') return null;
    // ^(B|PX) +N (+A)? — ground token, at least one storey above, optional attic. Anything else
    // (e.g. "ED") does not parse and MUST refuse rather than default.
    const m = /^(B|PX)\+(\d{1,2})(\+A)?$/.exec(s);
    if (!m) return null;
    const floorsAboveGround = Number.parseInt(m[2]!, 10);
    if (!Number.isFinite(floorsAboveGround) || floorsAboveGround < 1 || floorsAboveGround > 60) {
        return null;
    }
    const hasAttic = m[3] !== undefined;
    // ground floor (1) + storeys above + attic if present.
    const totalStoreys = 1 + floorsAboveGround + (hasAttic ? 1 : 0);
    return { raw: s, floorsAboveGround, totalStoreys, hasAttic };
}

/**
 * Close an ArcGIS polygon ring (outer ring, WGS84 `[lon, lat]` pairs) into `BcnLngLat[]`, dropping
 * the duplicated closing vertex ArcGIS appends. Returns null when fewer than 3 distinct vertices
 * survive (degenerate). Mirrors `resolveMadridNZ1Ring`'s `ringFromArcgis`.
 */
function ringFromArcgis(rings: unknown): BcnLngLat[] | null {
    if (!Array.isArray(rings) || rings.length === 0) return null;
    const outer = rings[0];
    if (!Array.isArray(outer) || outer.length < 3) return null;
    const pts: BcnLngLat[] = [];
    for (const pair of outer) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        pts.push({ lat, lon });
    }
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
 * Resolve the AMB Refós OV (volumetric-ordering) footprint + floor count at a WGS84 parcel point.
 * Fetches the published `OV_Trames` polygon (layer 17) through the same-origin proxy, closes it into
 * a WGS84 ring and parses PLANTES. NEVER throws — every failure is a typed refusal (three honesty
 * properties in the header).
 *
 * ⚠ This resolves the DATA. It does NOT decide whether to render it — that is the dispatcher's, and
 * it is gated on `BCN_REFOS_OV_CERTIFIED` (default OFF). A successful resolution while the gate is
 * closed still results in the clau-18 refusal being shown.
 *
 * @param ruleRingRef  the pack rule's `ringRef` — asserted to equal `BCN_REFOS_OV_RING_REF`.
 * @param point        the parcel query point (WGS84); the OV polygon is found by point-in-polygon.
 */
export async function resolveBcnRefosOV(
    ruleRingRef: string,
    point: BcnLngLat | null | undefined,
    deps: BcnRefosOVDeps = {},
): Promise<BcnRefosOVResolution> {
    const span = tracer.startSpan('pryzm.zoning.resolveBcnRefosOV');
    span.setAttribute('provider', 'amb-refos-ov');
    try {
        if (ruleRingRef !== BCN_REFOS_OV_RING_REF) {
            span.setAttribute('resultFields', 'ringref-mismatch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'ringref-mismatch' };
        }
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon)
        ) {
            span.setAttribute('resultFields', 'no-point');
            span.setStatus({ code: SpanStatusCode.OK });
            // No usable point is an unreachable endpoint from the caller's view — nothing to query.
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? BCN_REFOS_OV_PATH;
        const layer = deps.layer ?? BCN_REFOS_OV_LAYER;
        // ArcGIS point-in-polygon query: the OV polygon intersecting this point, its PLANTES + CLAU +
        // EXP, geometry back in WGS84 (property 2) so L5 needs no EPSG:3857 reprojection. The point
        // is sent in WGS84 (`inSR=4326`); the service reprojects. `CODI_INE` scopes the metro-wide
        // service to Barcelona.
        const geometry = encodeURIComponent(
            JSON.stringify({ x: point.lon, y: point.lat, spatialReference: { wkid: 4326 } }),
        );
        const where = encodeURIComponent(`CODI_INE='${BCN_INE_CODE}'`);
        const url =
            `${base}?layer=${encodeURIComponent(String(layer))}` +
            `&geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326` +
            `&spatialRel=esriSpatialRelIntersects` +
            `&where=${where}` +
            `&outFields=${encodeURIComponent('PLANTES,CLAU,EXP')}` +
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
            console.warn('[bcn-refos-ov] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
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
        const geom = (feature as { geometry?: { rings?: unknown } }).geometry ?? {};

        const ring = ringFromArcgis(geom.rings);
        if (!ring) {
            span.setAttribute('resultFields', 'degenerate-geometry');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'degenerate-geometry' };
        }

        const plantes = parsePlantes(attributes.PLANTES);
        if (!plantes) {
            // PRESENT-but-bad (or absent) — refuse, never default a storey count (property 3).
            span.setAttribute('resultFields', 'unparseable-plantes');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparseable-plantes' };
        }

        const clau = typeof attributes.CLAU === 'string' ? attributes.CLAU : null;
        const expedient = typeof attributes.EXP === 'string' ? attributes.EXP : null;

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('floorsAboveGround', plantes.floorsAboveGround);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, ringLatLon: ring, plantes, clau, expedient };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[bcn-refos-ov] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
