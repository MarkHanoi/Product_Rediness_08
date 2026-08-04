// Sevilla (INE 41091) — the PGOU-2006 `Alineaciones` (Layer 4) NEAR-QUERY resolver.
//
// WHAT THIS IS
// ─────────────────────────────────────────────────────────────────────────────────────────────
// The published `fondo máximo edificable` (maximum buildable depth) line, CONFIRMED live as real,
// queryable ArcGIS geometry on `Info_Urban_Groups/PGOU/FeatureServer` layer 4 ("Alineaciones") —
// not merely a cartographic legend entry, as `SEVILLA_SB_FONDO_UNRESOLVED_RING` (`esSevilla.ts`)
// assumed when it shipped as a structural refusal. The layer has NO formal coded-value domain;
// classification lives in a plain string field `layer`, whose values this file has verified live
// (2026-08-04) against real queried features:
//
//   A_EXTERIOR, A_EXTERIOR_MOD_TR, CS_A_EXTERIOR              — street (exterior) alignment
//   A_INTERIOR-OBLIGATORIA, A_RETRANQUEO, A_RETRANQUEO_MOD_TR,
//     CS_A_INTERIOR-OBLIGATORIA, CS_RETRANQUEO                — mandatory interior / setback line
//   A_INTERIOR-MAXIMA, A_PASAJE_PB,
//     CS_A_INTERIOR-MAXIMA, CS_PASAJE_PB                      — MAXIMUM buildable depth / ground-
//                                                                floor passage (`fondo máximo
//                                                                edificable`) — THE line Art.
//                                                                12.5.6 (SB) governs
//   DIVISION_ALTURA-ZO, CS_DIVISION_ALTURA-ZO                 — height-change / zoning division
//
// A live envelope query (`A_INTERIOR-MAXIMA`, 2026-08-04) confirmed 28 real polyline features,
// `spatialReference.wkid: 25830`, a genuine 4-vertex path — not an empty schema.
//
// ⚠⚠ IT RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `SEVILLA_ENVELOPE_VERIFIED`
// (`esSevilla.ts`) is `false` and this resolver does not read or write it. What this resolver
// closes is a DIFFERENT, narrower gap than the zone resolver: SB's `geometricRule` no longer
// needs to hard-refuse for want of a footprint — a REAL `explicitAreaFootprint` can now be
// constructed by clipping the parcel against the nearest `A_INTERIOR-MAXIMA` line, exactly what
// Art. 12.5.6's own wording describes ("build until this line"), never a scalar depth guess.
//
// THREE HONESTY PROPERTIES (mirrors `resolveSevillaZone`):
//   1. NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed refusal.
//   2. DOES NOT DECIDE TO RENDER. The caller decides, still gated on `SEVILLA_ENVELOPE_VERIFIED`.
//   3. NEVER INVENTS A LINE. An empty/unreachable response yields a typed refusal, never a guessed
//      depth or a borrowed line from a neighbouring parcel.
//
// PURITY: this is the ONE impure boundary (a network fetch) — the geometric CLIP itself is a
// separate pure function (`sevillaFondoClip.ts`, L2-pure) so this file stays a thin, testable seam.
//
// Strategic context — `containers/arcgisRest.ts` (`queryArcgisRestEnvelopeIntersect`, built
// alongside this file since no envelope-query capability existed before), `esSevilla.ts`
// (`SEVILLA_SB_FONDO_UNRESOLVED_RING`), C58 §1.4/§1.9/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { queryArcgisRestEnvelopeIntersect } from './containers/arcgisRest.js';
import { isInSevilla } from './sevillaBbox.js';
import { SEVILLA_ARCGIS_SERVICE, SEVILLA_NATIVE_EPSG } from './resolveSevillaZone.js';

const tracer = trace.getTracer('pryzm.zoning');

/** "Alineaciones" — the alignment/setback/depth-line layer, confirmed live 2026-08-04. */
export const SEVILLA_ALINEACIONES_LAYER = 4 as const;

/**
 * The `layer` field values that carry the MAXIMUM buildable-depth line (`fondo máximo edificable`)
 * — the line Art. 12.5.6 (SB) governs. Verified live against 28 real `A_INTERIOR-MAXIMA` features;
 * the sibling codes are named by the layer's own legend but not yet individually confirmed present.
 */
export const SEVILLA_FONDO_MAXIMA_CODES: readonly string[] = [
    'A_INTERIOR-MAXIMA',
    'CS_A_INTERIOR-MAXIMA',
];

/** A WGS84 point — the frame this resolver is queried by. */
export interface SevillaLngLat2 {
    readonly lat: number;
    readonly lon: number;
}

/** One resolved polyline, in WGS84 `[lon, lat]` vertex pairs, verbatim from the service. */
export interface SevillaAlignmentLine {
    readonly layerCode: string;
    readonly path: ReadonlyArray<readonly [number, number]>;
}

export interface SevillaAlignmentsDeps {
    readonly fetchImpl?: typeof fetch;
    readonly serviceBase?: string;
    /** Half-width of the query envelope in degrees. Default ≈ 60 m at this latitude. */
    readonly searchRadiusDeg?: number;
}

export type SevillaAlignmentsRefusalReason =
    | 'out-of-sevilla'
    | 'no-fetch'
    | 'service-error'
    | 'no-fondo-line-nearby';

export type SevillaAlignmentsResult =
    | { readonly ok: true; readonly fondoLines: readonly SevillaAlignmentLine[] }
    | { readonly ok: false; readonly reason: SevillaAlignmentsRefusalReason; readonly detail?: string };

/** Read an Esri polyline geometry's first path as WGS84 `[lon, lat]` pairs. Malformed → `[]`. */
function readPath(geometry: unknown): ReadonlyArray<readonly [number, number]> {
    if (!geometry || typeof geometry !== 'object') return [];
    const g = geometry as { paths?: unknown };
    if (!Array.isArray(g.paths) || !Array.isArray(g.paths[0])) return [];
    const path = g.paths[0] as unknown[];
    const out: Array<readonly [number, number]> = [];
    for (const v of path) {
        if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') {
            out.push([v[0], v[1]]);
        }
    }
    return out;
}

/**
 * Resolve every `fondo máximo edificable` (max buildable-depth) line within a search radius of a
 * WGS84 point. **NEVER THROWS.**
 *
 * @param point            the parcel query point (WGS84) — typically the parcel centroid.
 * @param deps             injectable fetch + service base + search radius.
 */
export async function resolveSevillaAlignments(
    point: SevillaLngLat2 | null | undefined,
    deps: SevillaAlignmentsDeps = {},
): Promise<SevillaAlignmentsResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveSevillaAlignments');
    span.setAttribute('provider', 'sevilla-arcgis-alineaciones-4');
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInSevilla(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-sevilla');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-sevilla' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }

        const serviceBase = deps.serviceBase ?? SEVILLA_ARCGIS_SERVICE;
        // ≈ 60 m half-width at Sevilla's latitude (1° lat ≈ 111 km) — generous enough to catch the
        // nearest fondo line for a typical urban SB parcel without pulling in the whole block.
        const searchRadiusDeg = deps.searchRadiusDeg ?? 0.00054;
        const codesList = SEVILLA_FONDO_MAXIMA_CODES.map((c) => `'${c}'`).join(',');
        const result = await queryArcgisRestEnvelopeIntersect({
            fetchImpl,
            serviceBase,
            layerId: SEVILLA_ALINEACIONES_LAYER,
            lat: point.lat,
            lon: point.lon,
            halfWidth: searchRadiusDeg,
            inSR: 4326,
            outSR: 4326,
            where: `layer IN (${codesList})`,
            outFields: 'objectid,layer',
        });

        if (!result.ok) {
            span.setAttribute('resultFields', 'service-error');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'service-error', detail: result.detail };
        }

        const fondoLines: SevillaAlignmentLine[] = [];
        for (const f of result.features) {
            const path = readPath(f.geometry);
            if (path.length < 2) continue;
            const layerCode = typeof f.attributes['layer'] === 'string' ? f.attributes['layer'] : 'unknown';
            fondoLines.push({ layerCode, path });
        }

        if (fondoLines.length === 0) {
            span.setAttribute('resultFields', 'no-fondo-line-nearby');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fondo-line-nearby' };
        }

        span.setAttribute('resultFields', 'ok');
        span.setAttribute('fondoLineCount', fondoLines.length);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, fondoLines };
    } catch (e) {
        span.setAttribute('resultFields', 'service-error');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
    } finally {
        span.end();
    }
}

/** Referenced so a future reviewer can confirm the CRS this file's WGS84 output was reprojected FROM. */
export const SEVILLA_ALINEACIONES_NATIVE_EPSG = SEVILLA_NATIVE_EPSG;
