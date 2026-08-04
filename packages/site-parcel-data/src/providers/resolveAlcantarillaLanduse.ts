// Alcantarilla (INE 30005) — the CARM regional WFS `sitmurcia_plu_ze` COARSE land-use resolver.
//
// WHAT THIS IS
// ─────────────────────────────────────────────────────────────────────────────────────────────
// `mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/ows`, layer `sitmurcia_plu_ze`, CONFIRMED
// LIVE 2026-08-04 — `GetFeature&CQL_FILTER=Municipio='Alcantarilla'&OUTPUTFORMAT=application/json`
// returned 100 real HILUCS-classified MultiPolygon features (residential vs. open-space classes,
// areas 581–26,009 m², `plan` attribute `es.carm.sitmurcia.pgalca.plu.sp:0030005`, dated to 1984 —
// consistent with the 1983 PGOU's BORM publication date).
//
// ⚠⚠ THIS LAYER IS COARSE, NOT A ZONE-CODE RESOLVER. CARM's own dataset metadata states the
// source was originally paper-format, digitized/georeferenced at 1:5000 (MTR-5000), and that "the
// information offered has an informational character and will not be binding" — the region-wide
// ceiling already documented for Región de Murcia generally. It carries a broad land-use class
// (e.g. residential vs. open-space), NEVER a fine zone code (e.g. a specific "Zona B-3") and NEVER
// a numeric ordinance parameter. `esAlcantarilla.ts`'s refusal names this resolver's result as a
// FACT the parcel's refusal card can cite, never as a determination.
//
// ⚠ WHY A CLIENT-SIDE POINT-IN-POLYGON TEST, NOT A SERVER-SIDE SPATIAL FILTER. The 2026-08-04
// research pass confirmed the ATTRIBUTE-filtered bulk request (`Municipio='Alcantarilla'`) works;
// it did NOT confirm the layer's geometry property name (needed for a server-side `BBOX`/`CQL`
// spatial filter), and guessing one risks a silently-wrong query that returns zero features and
// reads as "no zone here" rather than as a broken guess. So this resolver fetches the CONFIRMED
// bulk request (100 features, small enough to hold in memory) and does the point-in-polygon test
// itself, purely, against GeoJSON geometry the server already returned.
//
// THREE HONESTY PROPERTIES (mirrors `resolveCartagenaZone.ts` / `resolveSevillaZone.ts`):
//   1. NEVER THROWS. Every miss / unreachable endpoint / malformed body returns a typed refusal.
//   2. DOES NOT DECIDE TO RENDER. The caller decides; there is no verification gate this layer
//      could open even in principle — it is explicitly non-binding.
//   3. NEVER INVENTS A CLASS. An empty/unreachable response yields a typed refusal, never a
//      guessed land-use label.
//
// PURITY: the ONE impure boundary is the network fetch; the point-in-polygon test is a separate
// pure function so this file stays a thin, testable seam.
//
// Strategic context — `docs/04-reference/jurisdictions/es/es-mc/30005-alcantarilla/findings/
// CAPABILITY-RESEARCH-2026-08-04.md` §E, `alcantarillaBbox.ts`, `esAlcantarilla.ts`.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { isInAlcantarilla } from './alcantarillaBbox.js';

const tracer = trace.getTracer('pryzm.zoning');

/** The live CARM regional planning WFS service (WFS 2.0.0). */
export const CARM_SIT_USU_PLU_SERVICE = 'https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/ows';

/** The zoning-elements layer, confirmed to return real Alcantarilla geometry 2026-08-04. */
export const CARM_PLU_ZE_LAYER = 'sitmurcia_plu_ze';

/** A WGS84 point — the frame this resolver is queried by. */
export interface AlcantarillaLngLat {
    readonly lat: number;
    readonly lon: number;
}

/** One resolved `sitmurcia_plu_ze` feature's attributes, carried through verbatim — never re-keyed
 *  onto an assumed field name, since the layer's exact schema was not exhaustively confirmed. */
export interface AlcantarillaLanduseResolution {
    readonly properties: Readonly<Record<string, unknown>>;
}

export type AlcantarillaLanduseRefusalReason =
    | 'out-of-alcantarilla'
    | 'no-fetch'
    | 'service-error'
    | 'no-feature-here'
    | 'malformed-response';

export type AlcantarillaLanduseResult =
    | { readonly ok: true; readonly resolution: AlcantarillaLanduseResolution }
    | { readonly ok: false; readonly reason: AlcantarillaLanduseRefusalReason; readonly detail?: string };

export interface AlcantarillaLanduseDeps {
    readonly fetchImpl?: typeof fetch;
    readonly serviceBase?: string;
    readonly timeoutMs?: number;
}

type GeoJsonRing = readonly (readonly [number, number])[];
type GeoJsonPolygon = readonly GeoJsonRing[];

interface GeoJsonFeature {
    readonly type?: string;
    readonly properties?: Record<string, unknown>;
    readonly geometry?: {
        readonly type?: string;
        readonly coordinates?: unknown;
    };
}

/** Ray-casting point-in-ring test. PURE. `ring` is `[lon, lat]` pairs, first ring is the outer. */
function pointInRing(lon: number, lat: number, ring: GeoJsonRing): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/** True when `[lon, lat]` falls inside a GeoJSON Polygon's outer ring and outside its holes. PURE. */
function pointInPolygon(lon: number, lat: number, polygon: GeoJsonPolygon): boolean {
    if (polygon.length === 0) return false;
    const outer = polygon[0]!;
    if (!pointInRing(lon, lat, outer)) return false;
    for (let h = 1; h < polygon.length; h++) {
        if (pointInRing(lon, lat, polygon[h]!)) return false; // inside a hole ⇒ outside the feature
    }
    return true;
}

/** True when the point falls inside ANY feature's Polygon/MultiPolygon geometry. PURE. */
function featureContainsPoint(feature: GeoJsonFeature, lon: number, lat: number): boolean {
    const geom = feature.geometry;
    if (!geom || !geom.coordinates) return false;
    try {
        if (geom.type === 'Polygon') {
            return pointInPolygon(lon, lat, geom.coordinates as GeoJsonPolygon);
        }
        if (geom.type === 'MultiPolygon') {
            const polys = geom.coordinates as readonly GeoJsonPolygon[];
            return polys.some((p) => pointInPolygon(lon, lat, p));
        }
    } catch {
        return false;
    }
    return false;
}

/**
 * Resolve the `sitmurcia_plu_ze` feature covering a WGS84 point inside Alcantarilla, from CARM's
 * live regional WFS. **NEVER THROWS.**
 */
export async function resolveAlcantarillaLanduse(
    point: AlcantarillaLngLat | null | undefined,
    deps: AlcantarillaLanduseDeps = {},
): Promise<AlcantarillaLanduseResult> {
    const span = tracer.startSpan('pryzm.zoning.resolveAlcantarillaLanduse');
    span.setAttribute('provider', 'alcantarilla-carm-wfs-plu-ze');
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon) ||
            !isInAlcantarilla(point.lat, point.lon)
        ) {
            span.setAttribute('resultFields', 'out-of-alcantarilla');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-alcantarilla' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-fetch' };
        }

        const serviceBase = deps.serviceBase ?? CARM_SIT_USU_PLU_SERVICE;
        const timeoutMs = deps.timeoutMs ?? 20_000;
        const url =
            `${serviceBase}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
            `&TYPENAMES=${encodeURIComponent(CARM_PLU_ZE_LAYER)}` +
            `&CQL_FILTER=${encodeURIComponent("Municipio='Alcantarilla'")}` +
            `&OUTPUTFORMAT=application/json`;

        const res = await fetchImpl(url, {
            headers: { Accept: 'application/json, */*' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
            span.setAttribute('resultFields', 'service-error');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'service-error', detail: `HTTP ${res.status}` };
        }

        let body: unknown;
        try {
            body = await res.json();
        } catch (e) {
            span.setAttribute('resultFields', 'malformed-response');
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: false,
                reason: 'malformed-response',
                detail: e instanceof Error ? e.message : String(e),
            };
        }

        const features =
            body && typeof body === 'object' && Array.isArray((body as { features?: unknown }).features)
                ? ((body as { features: GeoJsonFeature[] }).features)
                : null;
        if (!features) {
            span.setAttribute('resultFields', 'malformed-response');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'malformed-response', detail: 'response had no `features` array' };
        }

        const hit = features.find((f) => featureContainsPoint(f, point.lon, point.lat));
        if (!hit) {
            span.setAttribute('resultFields', 'no-feature-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-feature-here' };
        }

        span.setAttribute('resultFields', 'ok');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, resolution: { properties: { ...(hit.properties ?? {}) } } };
    } catch (e) {
        span.setAttribute('resultFields', 'service-error');
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: false, reason: 'service-error', detail: e instanceof Error ? e.message : String(e) };
    } finally {
        span.end();
    }
}
