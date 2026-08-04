// §ARCGIS-REST-CONTAINER — the reusable ArcGIS REST FeatureServer/MapServer point-intersect seam.
//
// WHAT THIS IS, AND WHY IT IS A SEPARATE FILE
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Sevilla is the first Andalucían — and one of very few Spain-wide — municipality PRYZM has found
// publishing its zoning as ArcGIS REST Feature/MapServer layers rather than a GeoServer WFS
// (Córdoba, Murcia) endpoint. The Andalucía-generalization research (captured in
// `docs/04-reference/jurisdictions/es/es-an/41091-sevilla/findings/`) explicitly recommends this
// query-building + response-parsing logic live in its OWN file rather than be hand-inlined into a
// Sevilla-specific resolver, so a future ArcGIS-published Spanish municipality (any city on the
// same Esri stack) can reuse it without copy-pasting the URL construction and error handling.
//
// This file is deliberately NOT Sevilla-specific: it takes a service base URL, a layer id and a
// WGS84 point, and hands back typed ArcGIS features or a typed error. It knows nothing about
// `zona_orden`, PGOU-2006, or any other municipality's field vocabulary — that judgement belongs
// to the CALLER (`resolveSevillaZone.ts` today; a future `resolveXxxZone.ts` tomorrow).
//
// THE QUERY SHAPE mirrors the one seam this repo has already proven for an ArcGIS REST layer —
// València's `queryAtPoint` in `resolveValenciaAlineaciones.ts` (`layer/query?geometry=…&
// geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=…&f=json`).
// This file generalizes that seam rather than reimplementing it.
//
// PURITY: this is the ONE impure boundary (a network fetch); everything else in a caller should
// stay pure. NEVER THROWS from the caller's point of view for a transport/ArcGIS-body failure —
// `queryArcgisRestPointIntersect` returns a typed `{ ok: false }` result instead, so a resolver
// built on top of it can keep its own "never throws" honesty property.
//
// Strategic context — findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md §15 ("Reuse analysis"),
// findings/SOURCE-founder-sevilla-research-programme-2026-08-03.md §D.3 (ADR-0294/ADR-0295: a
// region supplies PROVIDERS, never a code path), C58 §1.4/§1.9/§1.10.

/** One ArcGIS REST feature: `attributes` (the field/value map) + optional raw `geometry`. */
export interface ArcgisRestFeature {
    readonly attributes: Record<string, unknown>;
    readonly geometry?: unknown;
}

export interface ArcgisRestQueryOk {
    readonly ok: true;
    readonly features: readonly ArcgisRestFeature[];
    /** The `spatialReference.latestWkid ?? spatialReference.wkid` the service actually answered. */
    readonly spatialReferenceWkid: number | null;
}

export interface ArcgisRestQueryError {
    readonly ok: false;
    /** Human-readable transport/ArcGIS-body failure detail — logged, never rendered as law. */
    readonly detail: string;
}

export type ArcgisRestQueryResult = ArcgisRestQueryOk | ArcgisRestQueryError;

export interface ArcgisRestPointQueryOptions {
    readonly fetchImpl: typeof fetch;
    /** The service root, ending in `.../MapServer` or `.../FeatureServer` — no trailing slash. */
    readonly serviceBase: string;
    readonly layerId: number;
    readonly lat: number;
    readonly lon: number;
    /** The spatial reference the QUERY POINT is expressed in. Default `4326` (WGS84). */
    readonly inSR?: number;
    /**
     * The spatial reference the RESPONSE GEOMETRY should be reprojected to. Default = `inSR`
     * (no reprojection requested). Pass the layer's own native EPSG (read from its `?f=json`
     * `spatialReference`, never guessed) to get metres back for a geometric measurement.
     */
    readonly outSR?: number;
    readonly outFields?: string;
    readonly timeoutMs?: number;
}

/**
 * Point-intersect a single ArcGIS REST FeatureServer/MapServer layer at a WGS84 (or `inSR`)
 * point. **NEVER THROWS** — every transport failure or ArcGIS error-body (ArcGIS returns HTTP 200
 * with an `{"error": {...}}` payload on a bad request, which is a FAILURE, not an empty answer)
 * resolves to a typed `{ ok: false, detail }`, never an exception and never silently treated as
 * "no feature here". Callers must keep that distinction — collapsing "the service failed" into
 * "there is nothing at this point" is the exact §CONTEXT-DATA-HONESTY defect this repo's other
 * resolvers (`resolveCordobaSubzone`, `resolveValenciaAlineaciones`) were built to avoid.
 */
export async function queryArcgisRestPointIntersect(
    opts: ArcgisRestPointQueryOptions,
): Promise<ArcgisRestQueryResult> {
    const inSR = opts.inSR ?? 4326;
    const outSR = opts.outSR ?? inSR;
    const outFields = opts.outFields ?? '*';
    const timeoutMs = opts.timeoutMs ?? 20_000;

    try {
        const geometry = encodeURIComponent(
            JSON.stringify({ x: opts.lon, y: opts.lat, spatialReference: { wkid: inSR } }),
        );
        const url =
            `${opts.serviceBase}/${opts.layerId}/query?geometry=${geometry}` +
            `&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects` +
            `&inSR=${inSR}&outSR=${outSR}&outFields=${encodeURIComponent(outFields)}` +
            `&returnGeometry=true&f=json`;

        const res = await opts.fetchImpl(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

        const body: unknown = await res.json();
        const b = body as {
            error?: { code?: number; message?: string };
            spatialReference?: { wkid?: number; latestWkid?: number };
            features?: ReadonlyArray<{ attributes?: Record<string, unknown>; geometry?: unknown }>;
        };
        // ArcGIS returns HTTP 200 with an `error` body on a bad request — a FAILURE, not an empty
        // result. Treating it as "no feature" would silently turn a broken query into a claim
        // about the land.
        if (b.error) {
            return { ok: false, detail: `ArcGIS ${b.error.code ?? '?'}: ${b.error.message ?? 'error'}` };
        }
        const features = (b.features ?? []).map((f) => ({
            attributes: f.attributes ?? {},
            geometry: f.geometry,
        }));
        const spatialReferenceWkid = b.spatialReference?.latestWkid ?? b.spatialReference?.wkid ?? null;
        return { ok: true, features, spatialReferenceWkid };
    } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
}

export interface ArcgisRestEnvelopeQueryOptions {
    readonly fetchImpl: typeof fetch;
    /** The service root, ending in `.../MapServer` or `.../FeatureServer` — no trailing slash. */
    readonly serviceBase: string;
    readonly layerId: number;
    /** Envelope centre, in `inSR`. */
    readonly lat: number;
    readonly lon: number;
    /** Half-width of the query envelope, in `inSR` UNITS (degrees when `inSR` is WGS84). */
    readonly halfWidth: number;
    /** The spatial reference the ENVELOPE is expressed in. Default `4326` (WGS84). */
    readonly inSR?: number;
    /** The spatial reference the RESPONSE GEOMETRY should be reprojected to. Default = `inSR`. */
    readonly outSR?: number;
    /** ArcGIS `where` clause — e.g. `"layer IN ('A','B')"`. Default `'1=1'` (no filter). */
    readonly where?: string;
    readonly outFields?: string;
    readonly timeoutMs?: number;
}

/**
 * Envelope (bounding-box) intersect an ArcGIS REST FeatureServer/MapServer layer — the query shape
 * a POLYLINE layer needs, since a line almost never passes through a queried point exactly.
 * Otherwise identical honesty contract to `queryArcgisRestPointIntersect`: NEVER THROWS, an
 * ArcGIS `error` body is a typed failure, never collapsed into "no features".
 */
export async function queryArcgisRestEnvelopeIntersect(
    opts: ArcgisRestEnvelopeQueryOptions,
): Promise<ArcgisRestQueryResult> {
    const inSR = opts.inSR ?? 4326;
    const outSR = opts.outSR ?? inSR;
    const outFields = opts.outFields ?? '*';
    const where = opts.where ?? '1=1';
    const timeoutMs = opts.timeoutMs ?? 20_000;

    try {
        const geometry = encodeURIComponent(
            JSON.stringify({
                xmin: opts.lon - opts.halfWidth,
                ymin: opts.lat - opts.halfWidth,
                xmax: opts.lon + opts.halfWidth,
                ymax: opts.lat + opts.halfWidth,
                spatialReference: { wkid: inSR },
            }),
        );
        const url =
            `${opts.serviceBase}/${opts.layerId}/query?geometry=${geometry}` +
            `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
            `&where=${encodeURIComponent(where)}` +
            `&inSR=${inSR}&outSR=${outSR}&outFields=${encodeURIComponent(outFields)}` +
            `&returnGeometry=true&f=json`;

        const res = await opts.fetchImpl(url, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

        const body: unknown = await res.json();
        const b = body as {
            error?: { code?: number; message?: string };
            spatialReference?: { wkid?: number; latestWkid?: number };
            features?: ReadonlyArray<{ attributes?: Record<string, unknown>; geometry?: unknown }>;
        };
        if (b.error) {
            return { ok: false, detail: `ArcGIS ${b.error.code ?? '?'}: ${b.error.message ?? 'error'}` };
        }
        const features = (b.features ?? []).map((f) => ({
            attributes: f.attributes ?? {},
            geometry: f.geometry,
        }));
        const spatialReferenceWkid = b.spatialReference?.latestWkid ?? b.spatialReference?.wkid ?? null;
        return { ok: true, features, spatialReferenceWkid };
    } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
}
