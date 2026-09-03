// LANE US-EXPAND — the SHARED US ArcGIS parcel client, ONE module parameterised by regionCode.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY ONE CLIENT AND NOT FOUR COPIES — and what it deliberately does NOT hide
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The US has NO national cadastre and NO national zone taxonomy (`jurisdictions/us/USA.md` — the
// INVERSE-of-Germany city-federation), so it is wired JURISDICTION BY JURISDICTION. The first three
// were hand-rolled one file each (`nycPlutoParcelProvider` · `sfParcelProvider` · `chicagoParcel-
// Provider`). This wave adds four MORE — MassGIS statewide (MA), FDOR statewide (FL), King County
// (WA), Harris County / HCAD (TX) — and every one of them is the SAME upstream shape: an ArcGIS
// REST FeatureServer/MapServer `…/query` that takes a WGS84 point, intersects the parcel fabric, and
// returns an Esri-JSON polygon + an assessor id. Four copies of the SF module would be four places to
// fix the next CRS-guard bug, so this is ONE client parameterised by a per-jurisdiction CONFIG.
//
// ⛔ DRY WITHOUT HIDING PROVENANCE. The config is not a black box: each jurisdiction's endpoint, its
// native CRS, its id field(s), its licence and its LIVE-PROBE verdict live in `usJurisdiction.ts` as
// DATA, one row per jurisdiction, exactly as legible as a hand-written module — so the C63
// DATA-SOURCES axis stays scorable per jurisdiction and a false "measured" can never be minted for a
// jurisdiction nobody probed. The parameterisation removes the DUPLICATED PARSE, never the per-source
// evidence.
//
// This mirrors the SF idiom (do NOT invent a second US idiom):
//   • a bbox routing predicate lives beside each config (`usJurisdiction.ts`) — the registry routes
//     on it exactly as it routes on `isInSF`;
//   • the pure parse is byte-deterministic and returns a typed OK/refusal union — empty, unreachable
//     and malformed are DIFFERENT values (§CONTEXT-DATA-HONESTY, L-422/457/467/469);
//   • a same-origin proxy (`/api/parcel/us-ma` …) is what the editor calls — the network hop is L5's,
//     never L2's (C57 CSP);
//   • a CRS honesty guard: consume WGS84, REFUSE a projected (State-Plane / Albers metre) ring rather
//     than silently plot feet/metres as degrees.
//
// GEOMETRY-FIRST, like SF. These are PARCEL fabrics: geometry + an assessor id + a geometry-derived
// area. Some layers ALSO carry assessor attributes inline (MassGIS L3 use-code, FDOR DOR_UC, HCAD
// owner) — surfaced ONLY as OPTIONAL context, never as a buildable envelope and never as FAR. The US
// governs bulk locally (zoning ordinance per municipality); this module emits NO farRatio and NO
// height. Forcing either would be a C58 §1.4 false-provenance failure.
//
// PURITY (C58 §1.9): the fetch is injected; given the same body the parse is byte-deterministic.
// OTel span `pryzm.parcel.usArcgis` (C58 §1.10 / P8). NEVER throws — every miss/unreachable/malformed
// body is a typed refusal, so the editor falls to the OSM footprint, never a crash and never a guess.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// GEOMETRY / TYPES
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point — the frame the resolver queries with and returns the ring in. */
export interface UsLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** A coarse WGS84 routing box — a proximity gate that only decides WHICH cadastre to try. */
export interface UsBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * The per-jurisdiction CONFIG. The whole difference between MA / FL / WA-King / TX-Harris is DATA in
 * these fields; the parse below is identical for all of them. Every field is provenance the C63
 * DATA-SOURCES axis reads — nothing here is derived or guessed.
 */
export interface UsArcgisParcelConfig {
    /** Registry regionCode, e.g. `US-MA`, `US-WA-KING`. */
    readonly regionCode: string;
    /** Stable provider/provenance id, e.g. `us-ma-massgis-l3`. */
    readonly providerId: string;
    /** Human attribution for the parcel info card. */
    readonly label: string;
    /** The same-origin proxy route the editor calls (never the upstream host — C57 CSP). */
    readonly proxyPath: string;
    /**
     * The DOCUMENTED upstream ArcGIS `…/query` endpoint the SERVER proxy queries. Recorded for
     * provenance + so a probe can re-verify it; this module NEVER calls it directly (the editor calls
     * `proxyPath`). A point query appends the standard params (`buildUsArcgisPointQueryUrl`).
     */
    readonly upstreamQueryUrl: string;
    /** The upstream layer's human name (from its FeatureServer metadata), for the info card. */
    readonly layerName: string;
    /** The upstream layer's NATIVE spatial-reference wkid (informational; we always request 4326). */
    readonly nativeWkid: number;
    /** Ordered candidate field names for the PRIMARY parcel id (first present wins). */
    readonly idFields: readonly string[];
    /** Ordered candidate field names for a SECONDARY/local id (map-parcel id, MAJOR, …), or []. */
    readonly altIdFields: readonly string[];
    /** Ordered candidate field names for a best-effort site address, or []. */
    readonly addressFields: readonly string[];
    /** Ordered candidate field names for a best-effort locality (city/town/county), or []. */
    readonly localityFields: readonly string[];
    /** Licence / attribution string (verbatim from the source's terms). */
    readonly licence: string;
    /** The coarse WGS84 routing box (also the specificity metric in the registry). */
    readonly bbox: UsBbox;
    /** One-line LIVE-PROBE verdict, verbatim, for the registry `note`. */
    readonly note: string;
}

/** Confidence in the parcel↔click correspondence. `high` = a real id + a valid point-in-parcel ring. */
export type UsParcelConfidence = 'high' | 'medium' | 'low';

/** A resolved US parcel: WGS84 ring + assessor id + geometry-derived area (+ optional context). */
export interface UsParcel {
    /** The parcel boundary as a WGS84 lon/lat ring (outer ring). */
    readonly ring: readonly UsLatLon[];
    /** The primary assessor/parcel id (the routing key). Always present on an OK result. */
    readonly parcelId: string;
    /** A secondary/local id (map-parcel id, MAJOR, …), or null. */
    readonly altParcelId: string | null;
    /** Best-effort site address as the source reported it, or null. NOT a legal claim. */
    readonly address: string | null;
    /** Best-effort locality (city/town/county) as the source reported it, or null. */
    readonly locality: string | null;
    /** Parcel area in m², COMPUTED from the WGS84 ring (equirectangular shoelace). 0 for degenerate. */
    readonly areaM2: number;
    /** CRS of `ring` — always `EPSG:4326` (we request `outSR=4326`; the guard refuses anything else). */
    readonly crs: 'EPSG:4326';
    /** Confidence in the parcel↔click correspondence. */
    readonly confidence: UsParcelConfidence;
    /** Provenance tag — the config's `providerId`. */
    readonly source: string;
}

/** Why a US parcel resolution refused. Closed vocabulary — operationally distinct. */
export type UsParcelRefusalReason =
    /** No usable WGS84 point was supplied — nothing to query the parcel by. */
    | 'no-point'
    /** The point is outside the jurisdiction's bbox — this source does not answer here. */
    | 'out-of-bounds'
    /** No `fetch` available, the endpoint could not be reached, or it returned non-OK / a bad body. */
    | 'endpoint-unreachable'
    /** The query returned zero features — no parcel at this point (water, a street ROW, a sliver). */
    | 'no-parcel'
    /** A feature came back but carried no usable id — cannot key it, so refuse rather than guess. */
    | 'no-parcel-id'
    /** The parcel geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry'
    /** The ring came back projected (State-Plane feet / Albers metres) — refuse over mis-plotting. */
    | 'crs-unprojected';

export type UsParcelResolution =
    | { readonly ok: true; readonly parcel: UsParcel }
    | { readonly ok: false; readonly reason: UsParcelRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — the parse + the id/CRS/area honesty gates
// ──────────────────────────────────────────────────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;

/** Read a value as a clean finite number, or null. Tolerates numeric strings; never coerces to 0. */
export function toFiniteNum(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
        const s = v.trim();
        if (s === '') return null;
        const n = Number.parseFloat(s);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Read a non-empty trimmed string (tolerating a number), or null. */
function toStr(v: unknown): string | null {
    if (typeof v === 'string') {
        const s = v.trim();
        return s === '' ? null : s;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/**
 * Case-insensitive attribute read across a record — ArcGIS servers vary casing (`PIN` vs `pin`,
 * `LOC_ID` vs `loc_id`). Builds a lower-cased index once and returns the first non-null candidate.
 */
function attr(rec: Record<string, unknown>, names: readonly string[]): unknown {
    const lower: Record<string, unknown> = {};
    for (const k of Object.keys(rec)) lower[k.toLowerCase()] = rec[k];
    for (const n of names) {
        const v = lower[n.toLowerCase()];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

/**
 * Parse a ring from either an ArcGIS Esri-JSON geometry (`{ rings: [[[x,y],…]] }`) or a GeoJSON
 * geometry (`{ type: 'Polygon'|'MultiPolygon', coordinates }`). Returns the outer ring as
 * `[lon, lat]` pairs, dropping non-finite vertices. `null` when no usable ring is present. DOES NOT
 * re-project — a projected ring is caught by the CRS guard in the caller.
 */
export function parseRing(geometry: unknown): Array<[number, number]> | null {
    if (!geometry || typeof geometry !== 'object') return null;
    const g = geometry as Record<string, unknown>;
    if (Array.isArray(g.rings)) {
        return coordsToPairs(g.rings[0]);
    }
    const type = typeof g.type === 'string' ? g.type : null;
    if (type === 'Polygon' && Array.isArray(g.coordinates)) {
        return coordsToPairs((g.coordinates as unknown[])[0]);
    }
    if (type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
        const first = (g.coordinates as unknown[])[0];
        return coordsToPairs(Array.isArray(first) ? (first as unknown[])[0] : null);
    }
    return null;
}

function coordsToPairs(raw: unknown): Array<[number, number]> | null {
    if (!Array.isArray(raw)) return null;
    const pairs: Array<[number, number]> = [];
    for (const p of raw) {
        if (!Array.isArray(p) || p.length < 2) continue;
        const lon = toFiniteNum(p[0]);
        const lat = toFiniteNum(p[1]);
        if (lon === null || lat === null) continue;
        pairs.push([lon, lat]);
    }
    return pairs.length > 0 ? pairs : null;
}

/** True when any coordinate is projected-magnitude (State-Plane feet / Albers metres), NOT WGS84. */
function looksProjected(pairs: Array<[number, number]>): boolean {
    for (const [lon, lat] of pairs) {
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return true;
    }
    return false;
}

/**
 * Parcel area in m² from a WGS84 lon/lat ring by a local equirectangular shoelace (scale longitude by
 * cos(mean-lat)). Deterministic; a geometry fact, not a trusted upstream field. 0 for < 3 vertices.
 */
export function ringAreaM2(ring: readonly UsLatLon[]): number {
    if (ring.length < 3) return 0;
    let latSum = 0;
    for (const p of ring) latSum += p.lat;
    const meanLat = latSum / ring.length;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);
    let twiceArea = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ax = a.lon * mPerDegLon;
        const ay = a.lat * M_PER_DEG_LAT;
        const bx = b.lon * mPerDegLon;
        const by = b.lat * M_PER_DEG_LAT;
        twiceArea += ax * by - bx * ay;
    }
    return Math.abs(twiceArea) / 2;
}

/**
 * Parse ONE ArcGIS feature (`{ attributes, geometry }`) OR a bare GeoJSON-ish row into a `UsParcel`,
 * or a typed refusal, against the jurisdiction CONFIG. Pure + byte-deterministic. Exported so a unit
 * test can pin the parse (id + geometry + area) in isolation from the network.
 */
export function parseUsArcgisParcelFeature(
    feature: unknown,
    config: UsArcgisParcelConfig,
): UsParcelResolution {
    if (!feature || typeof feature !== 'object') return { ok: false, reason: 'no-parcel' };
    const f = feature as Record<string, unknown>;
    const attributes =
        f.attributes && typeof f.attributes === 'object' ? (f.attributes as Record<string, unknown>) : f;
    const geometry = f.geometry ?? attributes.geometry ?? attributes.the_geom ?? attributes.shape;

    const parcelId = toStr(attr(attributes, config.idFields));
    if (!parcelId) return { ok: false, reason: 'no-parcel-id' };

    const pairs = parseRing(geometry);
    if (!pairs) return { ok: false, reason: 'degenerate-geometry' };
    if (looksProjected(pairs)) return { ok: false, reason: 'crs-unprojected' };
    const distinct = new Set(pairs.map(([lon, lat]) => `${lon},${lat}`)).size;
    if (distinct < 3) return { ok: false, reason: 'degenerate-geometry' };
    const ring: UsLatLon[] = pairs.map(([lon, lat]) => ({ lat, lon }));

    const parcel: UsParcel = {
        ring,
        parcelId,
        altParcelId: toStr(attr(attributes, config.altIdFields)),
        address: toStr(attr(attributes, config.addressFields)),
        locality: toStr(attr(attributes, config.localityFields)),
        areaM2: ringAreaM2(ring),
        crs: 'EPSG:4326',
        // HIGH: a real id + a valid point-in-parcel ring is the strong case (C57 §2.1). These are
        // survey-adjacent assessor fabrics, not general-boundary ownership indexes.
        confidence: 'high',
        source: config.providerId,
    };
    return { ok: true, parcel };
}

/**
 * Pick the governing feature from an ArcGIS query response (`{ features: [...] }`), a Socrata-style
 * array, or a consolidated proxy shape (`{ parcel: <feature> }`), and parse it. A point query returns
 * one parcel; if several come back (a boundary click) the FIRST is taken. Pure. Exported for testing.
 */
export function parseUsArcgisParcelResponse(
    json: unknown,
    config: UsArcgisParcelConfig,
): UsParcelResolution {
    if (Array.isArray(json)) {
        return json.length === 0
            ? { ok: false, reason: 'no-parcel' }
            : parseUsArcgisParcelFeature(json[0], config);
    }
    if (json && typeof json === 'object') {
        const j = json as Record<string, unknown>;
        // An ArcGIS server error body (`{ error: {...} }`) is an unreachable/upstream failure, never
        // a "no parcel" — keep them distinct.
        if (j.error !== undefined) return { ok: false, reason: 'endpoint-unreachable' };
        if (Array.isArray(j.features)) {
            return j.features.length === 0
                ? { ok: false, reason: 'no-parcel' }
                : parseUsArcgisParcelFeature(j.features[0], config);
        }
        if (j.parcel !== undefined) return parseUsArcgisParcelFeature(j.parcel, config);
        return parseUsArcgisParcelFeature(j, config);
    }
    return { ok: false, reason: 'no-parcel' };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE DOCUMENTED UPSTREAM QUERY — recorded for the proxy + probes; never called from this module
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the DOCUMENTED upstream ArcGIS point-query URL the SERVER proxy runs for a jurisdiction: a
 * WGS84 point geometry (JSON form — the robust one the hosted FDOR service requires), `inSR=4326`,
 * `spatialRel=esriSpatialRelIntersects`, `outFields=*`, `returnGeometry=true`, `outSR=4326`, `f=json`.
 * Exported for provenance/probes; the EDITOR calls `config.proxyPath`, never this (C57 CSP).
 */
export function buildUsArcgisPointQueryUrl(
    config: UsArcgisParcelConfig,
    lat: number,
    lon: number,
): string {
    const geometry = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
    const params = new URLSearchParams({
        geometry,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
    });
    return `${config.upstreamQueryUrl}?${params.toString()}`;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — never throws
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors SF/NYC/NL). */
export interface UsArcgisDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `config.proxyPath`). */
    readonly pathBase?: string;
}

/** True when a WGS84 point falls in the jurisdiction's bbox. Non-finite input → false. */
export function isInUsBbox(bbox: UsBbox, lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= bbox.minLat && lat <= bbox.maxLat && lon >= bbox.minLon && lon <= bbox.maxLon;
}

/**
 * Resolve the real parcel at a WGS84 point via the jurisdiction's same-origin proxy. Returns a typed
 * OK/refusal union and NEVER throws — every miss/unreachable/malformed body is a refusal, so the
 * editor falls to the OSM footprint. Confidence is `high` on an id + a point-in-parcel ring. OTel
 * span `pryzm.parcel.usArcgis` (P8), tagged with the jurisdiction.
 */
export async function fetchUsParcelAtPoint(
    config: UsArcgisParcelConfig,
    point: UsLatLon | null | undefined,
    deps: UsArcgisDeps = {},
): Promise<UsParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.usArcgis');
    span.setAttribute('pryzm.parcel.provider', config.providerId);
    span.setAttribute('pryzm.parcel.region', config.regionCode);
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon)
        ) {
            span.setAttribute('pryzm.parcel.result', 'no-point');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-point' };
        }
        if (!isInUsBbox(config.bbox, point.lat, point.lon)) {
            span.setAttribute('pryzm.parcel.result', 'out-of-bounds');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-bounds' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('pryzm.parcel.result', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? config.proxyPath;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let json: unknown;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('pryzm.parcel.result', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            json = await res.json();
        } catch (fetchErr) {
            span.setAttribute('pryzm.parcel.result', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn(
                `[${config.providerId}] fetch failed (non-fatal):`,
                (fetchErr as Error)?.message ?? fetchErr,
            );
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const parsed = parseUsArcgisParcelResponse(json, config);
        if (parsed.ok) {
            span.setAttribute('pryzm.parcel.result', 'ok');
            span.setAttribute('pryzm.parcel.parcelId', parsed.parcel.parcelId);
            span.setAttribute('pryzm.parcel.areaM2', parsed.parcel.areaM2);
        } else {
            span.setAttribute('pryzm.parcel.result', parsed.reason);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return parsed;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn(`[${config.providerId}] unexpected error (non-fatal):`, (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}

/**
 * The provider handle mirroring the sibling cadastral adapters (`id` + `label` + a fetch fn bound to
 * the config). `kind` is `'cadastral'`: these are real parcel fabrics, not an OSM footprint.
 */
export function makeUsArcgisParcelProvider(config: UsArcgisParcelConfig) {
    return {
        id: config.providerId,
        label: config.label,
        kind: 'cadastral' as const,
        regionCode: config.regionCode,
        bbox: config.bbox,
        isInBounds: (lat: number, lon: number): boolean => isInUsBbox(config.bbox, lat, lon),
        fetchParcelAtPoint: (point: UsLatLon | null | undefined, deps: UsArcgisDeps = {}) =>
            fetchUsParcelAtPoint(config, point, deps),
    };
}
