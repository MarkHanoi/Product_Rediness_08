// L-650 Phase-4 (USA / San Francisco) — the DataSF assessor PARCEL resolver (APN / blocklot).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — and how SF differs from the NYC flagship
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The US has NO national cadastre and NO national zone taxonomy (`jurisdictions/us/USA.md` — the
// INVERSE-of-Germany city-federation), so the US is wired CITY BY CITY. This is the second US city
// provider after `nycPlutoParcelProvider`, and it mirrors that module's shape exactly:
//   • a bbox routing predicate (`isInSF`) + an injectable-fetch resolver that NEVER throws;
//   • a pure, byte-deterministic parse of the upstream feature → a typed OK/refusal union;
//   • a same-origin proxy (`/api/parcel/us-sf`) the editor calls (the network hop is L5's, not L2's);
//   • a CRS honesty guard: consume WGS84, REFUSE a projected (State-Plane feet) ring.
//
// **The crucial SF-vs-NYC difference (do NOT copy NYC's FAR head-start here).** NYC MapPLUTO ships the
// tax-lot polygon PRE-JOINED with zoning + FAR in ONE BBL-keyed layer. SF does NOT: the DataSF
// **assessor parcel** layer (APN / blocklot) carries geometry + identity only. Zoning district and the
// **height-and-bulk district** live in SEPARATE DataSF layers (the `SFZoningProvider`'s job per
// `us/CITIES/SAN_FRANCISCO.md` §3). So this provider is **geometry-first**: APN + ring + area. It
// surfaces a zoning/height payload ONLY as an OPTIONAL DRAFT bonus, and only when the same-origin proxy
// chose to spatially join the companion layer and passed those fields through — never fabricated here.
//
// **SF governs by height-and-bulk district, NOT by a citywide FAR** (ADR-0270 / C58 §2.2 — the
// `tiered-occupation + explicit height` KIND). This module therefore emits NO `farRatio`. Forcing a FAR
// number onto SF would be a C58 §1.4 false-provenance failure. The DRAFT height it may surface is a
// LEAD to verify (the DataSF height-and-bulk district string), cited to the SF Planning Code with a
// DRAFT caveat — never a buildable envelope, which stays not-assessed until the SF rule pack + L-449.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ENDPOINTS (the orchestrator wires the server proxy; see the PROBE markers)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • Socrata (DataSF assessor parcels — "Parcels – Active and Retired", resource `acdm-wktn`):
//       `data.sfgov.org/resource/acdm-wktn.json` — lower-case fields (`blklot`, `mapblklot`, `block_num`,
//       `lot_num`, `active`) + a GeoJSON `the_geom` (already WGS84). Spatial point query via SoQL
//       `intersects(the_geom, 'POINT(lon lat)')`. // PROBE: verify resource id + field names live.
//   • ArcGIS REST FeatureServer (the SF assessor/DataSF parcels service — spatial point query):
//       must carry `outSR=4326` → WGS84 rings + attributes (`blklot`/`mapblklot`). // PROBE: verify the
//       FeatureServer org + path + layer index live before prod (DataSF/SF Planning re-publish services).
//   The parser accepts EITHER shape (attribute read is case-insensitive), so one proxy can pass through
//   whichever upstream is chosen. // PROBE: confirm the exact endpoints before prod — coded to the
//   documented DataSF resource above.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// CRS — DataSF publishes WGS84 (EPSG:4326); the ArcGIS assessor service is native EPSG:2227
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Socrata's `the_geom` is already 4326 and the ArcGIS query MUST carry `outSR=4326`, so the ring arrives
// in WGS84 lon/lat. As a HONESTY GUARD against a mis-configured proxy that forgets `outSR`, the parser
// REFUSES (`crs-unprojected`) any ring whose coordinates are State-Plane-magnitude (|lon|>180 / |lat|>90)
// rather than silently plotting feet as degrees. It never re-projects here (no proj4 in L2) — projection
// into the authoring scene frame is the L5 dispatcher's job.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// AREA — geometry-derived, not a trusted upstream field
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Unlike NYC MapPLUTO's authoritative `LotArea` (ft²), the DataSF assessor parcel feature's area field
// (when present) is of ambiguous unit/provenance. Rather than guess a unit, `areaM2` is computed from the
// WGS84 ring by a local equirectangular shoelace (mean-latitude scaling) — deterministic and honest,
// a geometry fact, not a legal claim.
//
// PURITY (C58 §1.9): the fetch is injected; given the same body the parse is byte-deterministic.
// OTel span `pryzm.parcel.sfDataSf` (C58 §1.10 / P8). NEVER throws — every miss/unreachable/malformed
// body is a typed refusal, so the editor falls to the OSM footprint, never a crash and never a guess.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ROUTING — the San Francisco city-county bbox predicate. A bbox is a COARSE proximity gate, never an
// authorisation: it only decides whether to try DataSF; the feature service's own empty result is the
// real "no lot here" answer, and the universal footprint covers every miss.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point — the frame the resolver queries with and returns the ring in. */
export interface SfLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** San Francisco city-county bounding box (the peninsula + bay islands: Treasure/Yerba Buena, Alcatraz).
 *  Mirrors the SF dossier's terrain bbox `[-122.52,37.70,-122.36,37.83]`; the Farallones are excluded
 *  (a bbox is only a router and ocean self-corrects to the footprint). Generous by design. */
export const SF_BBOX = {
    minLat: 37.70,
    maxLat: 37.84,
    minLon: -122.53,
    maxLon: -122.35,
} as const;

/** True when a WGS84 point falls in the San Francisco city-county bbox. Non-finite input → false. */
export function isInSF(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= SF_BBOX.minLat && lat <= SF_BBOX.maxLat && lon >= SF_BBOX.minLon && lon <= SF_BBOX.maxLon;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The same-origin proxy route the editor calls (never `data.sfgov.org` directly — C57 CSP). The proxy
 *  runs the DataSF assessor spatial point query and passes the Socrata/ArcGIS feature body through in a
 *  shape this module parses. Mirrors `/api/parcel/us-nyc`, `/api/parcel/dk`, `/api/nl/bestemmingsplan`. */
export const SF_DATASF_PARCEL_PATH = '/api/parcel/us-sf';

/**
 * The documented upstream DataSF Socrata resource the SERVER proxy queries ("Parcels – Active and
 * Retired"). Lower-case fields (`blklot`/`mapblklot`) + a GeoJSON `the_geom` already in WGS84; a spatial
 * point query uses SoQL `intersects(the_geom, 'POINT(lon lat)')` (optionally `&active=true`).
 * // PROBE: verify this resource id + the `blklot`/`the_geom` field names live before prod.
 */
export const SF_DATASF_SOCRATA_RESOURCE = 'https://data.sfgov.org/resource/acdm-wktn.json';

/**
 * The documented upstream ArcGIS REST FeatureServer point query the SERVER proxy MAY run instead.
 * `geometryType` is a point in WGS84 (`inSR=4326`), `spatialRel=esriSpatialRelIntersects` → the parcel
 * under the click; `outSR=4326` returns the ring in WGS84; `outFields=*` returns `blklot`/`mapblklot`.
 * // PROBE: verify the SF assessor/DataSF FeatureServer org + path + layer index live before prod.
 */
export const SF_DATASF_ARCGIS_QUERY =
    'https://services.sfgov.org/arcgis/rest/services/DataSF/Parcels/MapServer/0/query'; // PROBE: verify before prod

/** The SF Planning Code the OPTIONAL DRAFT height-and-bulk lead is cited to (never a buildable value). */
export const SF_ZONING_CITATION =
    'SF Planning Code Art. 2.5 (height-and-bulk districts) + Art. 2 (zoning districts), via DataSF companion layer — DRAFT, unverified; SF governs by height-and-bulk, NOT a citywide FAR (ADR-0270)';

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors NYC/NL/Madrid). */
export interface SfDataSfDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `SF_DATASF_PARCEL_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RESULT TYPES — the module-local cadastral shape (L2-pure; the L5 editor maps it into its ParcelFeature)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Confidence in the parcel↔click correspondence. `high` requires a real APN/blocklot + a valid ring
 *  from a point-in-lot spatial query (the DataSF strong case); anything softer never claims `high`. */
export type SfParcelConfidence = 'high' | 'medium' | 'low';

/** OPTIONAL DRAFT zoning/height lead surfaced ONLY if the proxy spatially joined the companion DataSF
 *  layer and passed the fields through. Every field is null for honest absence — never fabricated. This
 *  is NOT a buildable envelope: it is a cited LEAD for the SF rule pack + the L-449 verification gate. */
export interface SfZoningDraft {
    /** The zoning district code (`RH-1`, `RM-2`, `NC-3`, `C-3`, `PDR-1`…) from the DataSF zoning layer, or null. */
    readonly zoningDistrict: string | null;
    /** DataSF's simplified zoning class (`zoning_sim`), or null. */
    readonly zoningSimplified: string | null;
    /** The raw height-and-bulk district string (e.g. `40-X`, `85-X`, `240-S`) — the code combines a
     *  height prefix (ft) with a bulk suffix. Carried RAW; null when absent. */
    readonly heightBulkDistrict: string | null;
    /** A DRAFT numeric height in metres parsed from the leading integer (feet) of `heightBulkDistrict`
     *  (e.g. `40-X` → 12.19 m), or null when no leading number is present. UNVERIFIED — a lead, not a cap. */
    readonly heightLimitDraftM: number | null;
    /** The governing citation for the DRAFT lead (SF Planning Code). */
    readonly citation: string;
    /** Always true — this payload is a DRAFT lead requiring the SF rule pack + L-449 before it may serve. */
    readonly draft: true;
}

/** A resolved SF assessor parcel: WGS84 ring + APN/blocklot + geometry-derived area (+ an OPTIONAL DRAFT
 *  zoning lead). The L5 dispatcher maps `ring`→`ParcelFeature.ring` and `apn`→`refcat`. */
export interface SfParcel {
    /** The parcel boundary as a WGS84 lon/lat ring (outer ring). */
    readonly ring: readonly SfLatLon[];
    /** APN / blocklot — the SF assessor block-lot id (the routing key). Always present on an OK result. */
    readonly apn: string;
    /** The base map blocklot (`mapblklot`) when the click hit a sub-lot / condo, or null. */
    readonly mapBlockLot: string | null;
    /** The assessor block number (`block_num`), or null. */
    readonly blockNum: string | null;
    /** The assessor lot number (`lot_num`), or null. */
    readonly lotNum: string | null;
    /** Parcel area in m², COMPUTED from the WGS84 ring (equirectangular shoelace). 0 for a degenerate ring. */
    readonly areaM2: number;
    /** OPTIONAL DRAFT zoning/height lead (only if the proxy joined the companion layer), else null. */
    readonly zoning: SfZoningDraft | null;
    /** Confidence in the parcel↔click correspondence. */
    readonly confidence: SfParcelConfidence;
    /** Provenance tag for the info card / C57 credibility. */
    readonly source: 'sf-datasf';
}

/** Why an SF resolution refused. Closed vocabulary — these are operationally distinct. */
export type SfParcelRefusalReason =
    /** No usable WGS84 point was supplied — nothing to query the lot by. */
    | 'no-point'
    /** The point is outside the SF city-county bbox — DataSF does not answer here. */
    | 'out-of-sf'
    /** No `fetch` available, the endpoint could not be reached, or it returned non-OK / a bad body. */
    | 'endpoint-unreachable'
    /** The query returned zero features — no assessor parcel at this point (water, an unmapped sliver). */
    | 'no-lot'
    /** A feature came back but carried no usable APN/blocklot — cannot key it, so refuse rather than guess. */
    | 'no-apn'
    /** The lot geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry'
    /** The ring came back in State-Plane feet (proxy forgot `outSR=4326`) — refuse over mis-plotting. */
    | 'crs-unprojected';

export type SfParcelResolution =
    | { readonly ok: true; readonly parcel: SfParcel }
    | { readonly ok: false; readonly reason: SfParcelRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — the parse + the APN/CRS/area honesty gates
// ──────────────────────────────────────────────────────────────────────────────────────────────

const FT_TO_M = 0.3048;
const M_PER_DEG_LAT = 111_320;

/** Read a value as a clean finite number, or null (honest withheld). Tolerates numeric strings.
 *  Rejects a non-finite value; does NOT coerce blank/absent to 0. */
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

/** Read a non-empty trimmed string, or null. */
function toStr(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s === '' ? null : s;
}

/**
 * Case-insensitive attribute read: ArcGIS uses `BLKLOT`/`MapBlockLot`, Socrata uses `blklot`/`mapblklot`.
 * Builds a lower-cased key index once, so a single reader serves either upstream. Returns the raw value.
 */
function attr(rec: Record<string, unknown>, ...names: string[]): unknown {
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
 * geometry (`{ type: 'Polygon'|'MultiPolygon', coordinates }` — Socrata `the_geom`). Returns the outer
 * ring as `[lon, lat]` pairs, dropping non-finite vertices. `null` when no usable ring is present.
 * DOES NOT re-project — a State-Plane ring is caught by the CRS guard in the caller.
 */
export function parseRing(geometry: unknown): Array<[number, number]> | null {
    if (!geometry || typeof geometry !== 'object') return null;
    const g = geometry as Record<string, unknown>;

    // Esri-JSON: geometry.rings[0] is the outer ring.
    if (Array.isArray(g.rings)) {
        return coordsToPairs(g.rings[0]);
    }
    // GeoJSON Polygon / MultiPolygon.
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

/** True when any coordinate is State-Plane-magnitude (feet), i.e. NOT WGS84 degrees. */
function looksLikeStatePlane(pairs: Array<[number, number]>): boolean {
    for (const [lon, lat] of pairs) {
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return true;
    }
    return false;
}

/**
 * Parcel area in m², computed from a WGS84 lon/lat ring by a local equirectangular shoelace (scale
 * longitude by cos(mean-lat)). Deterministic; a geometry fact, not a trusted upstream field. Returns 0
 * for a ring of < 3 vertices. Exported so a unit test can pin the area math.
 */
export function ringAreaM2(ring: readonly SfLatLon[]): number {
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
 * Parse the OPTIONAL DRAFT zoning/height lead IF the proxy joined the companion DataSF layer onto the
 * feature (zoning district / `zoning_sim` / a height-and-bulk district string). Returns null when NONE
 * of the companion fields are present — the geometry-only default. Every value is a cited DRAFT lead,
 * never a buildable envelope. Emits NO FAR (SF is height-and-bulk, not FAR — ADR-0270). Exported for tests.
 */
export function parseZoningDraft(attributes: Record<string, unknown>): SfZoningDraft | null {
    const zoningDistrict = toStr(attr(attributes, 'zoning', 'zoning_code', 'zonedist', 'districtname'));
    const zoningSimplified = toStr(attr(attributes, 'zoning_sim', 'zoningsim'));
    const heightBulkDistrict = toStr(
        attr(attributes, 'height_and_bulk', 'heightbulk', 'hgt_bulk', 'height', 'gen_hght', 'heightlimit'),
    );
    if (zoningDistrict === null && zoningSimplified === null && heightBulkDistrict === null) return null;

    // Parse a leading integer (feet) from a height-and-bulk district code like `40-X` / `240-S`.
    let heightLimitDraftM: number | null = null;
    if (heightBulkDistrict !== null) {
        const m = /^\s*(\d+(?:\.\d+)?)/.exec(heightBulkDistrict);
        const ft = m ? Number.parseFloat(m[1]!) : NaN;
        if (Number.isFinite(ft) && ft > 0) heightLimitDraftM = ft * FT_TO_M;
    }
    return {
        zoningDistrict,
        zoningSimplified,
        heightBulkDistrict,
        heightLimitDraftM,
        citation: SF_ZONING_CITATION,
        draft: true,
    };
}

/**
 * Parse ONE DataSF assessor feature (ArcGIS `{ attributes, geometry }` OR a Socrata row with `the_geom` +
 * flat fields) into an `SfParcel`, or a typed refusal. Pure + byte-deterministic. Exported so a unit test
 * can pin the parse (APN + geometry + area) in isolation from the network.
 */
export function parseSfParcelFeature(feature: unknown): SfParcelResolution {
    if (!feature || typeof feature !== 'object') return { ok: false, reason: 'no-lot' };
    const f = feature as Record<string, unknown>;

    // Attributes: ArcGIS nests them under `attributes`; Socrata is flat (the row itself).
    const attributes =
        (f.attributes && typeof f.attributes === 'object' ? (f.attributes as Record<string, unknown>) : f);
    // Geometry: ArcGIS under `geometry`; Socrata under `the_geom`.
    const geometry = f.geometry ?? attributes.the_geom ?? (f as Record<string, unknown>).the_geom;

    const apn = toStr(attr(attributes, 'blklot', 'blocklot', 'apn', 'mapblklot'));
    if (!apn) return { ok: false, reason: 'no-apn' };

    const pairs = parseRing(geometry);
    if (!pairs) return { ok: false, reason: 'degenerate-geometry' };
    if (looksLikeStatePlane(pairs)) return { ok: false, reason: 'crs-unprojected' };
    // Distinct-vertex count for a usable ring (a closing duplicate does not count).
    const distinct = new Set(pairs.map(([lon, lat]) => `${lon},${lat}`)).size;
    if (distinct < 3) return { ok: false, reason: 'degenerate-geometry' };
    const ring: SfLatLon[] = pairs.map(([lon, lat]) => ({ lat, lon }));

    const parcel: SfParcel = {
        ring,
        apn,
        mapBlockLot: toStr(attr(attributes, 'mapblklot', 'mapblocklot')),
        blockNum: toStr(attr(attributes, 'block_num', 'blocknum', 'block')),
        lotNum: toStr(attr(attributes, 'lot_num', 'lotnum', 'lot')),
        areaM2: ringAreaM2(ring),
        zoning: parseZoningDraft(attributes),
        // Confidence HIGH: a real APN + a valid point-in-lot ring is the DataSF strong case (C57 §2.1).
        confidence: 'high',
        source: 'sf-datasf',
    };
    return { ok: true, parcel };
}

/**
 * Pick the governing feature from an ArcGIS FeatureServer query response (`{ features: [...] }`) or a
 * Socrata array (`[ row, … ]`) and parse it. A point-in-lot query returns exactly one lot; if several
 * come back (a boundary click), the FIRST is taken. Pure. Exported for testing the response shape.
 */
export function parseSfParcelResponse(json: unknown): SfParcelResolution {
    if (Array.isArray(json)) {
        return json.length === 0 ? { ok: false, reason: 'no-lot' } : parseSfParcelFeature(json[0]);
    }
    if (json && typeof json === 'object') {
        const j = json as Record<string, unknown>;
        if (Array.isArray(j.features)) {
            return j.features.length === 0 ? { ok: false, reason: 'no-lot' } : parseSfParcelFeature(j.features[0]);
        }
        // A consolidated proxy shape `{ parcel: <feature> }` or a bare single feature.
        if (j.parcel !== undefined) return parseSfParcelFeature(j.parcel);
        return parseSfParcelFeature(j);
    }
    return { ok: false, reason: 'no-lot' };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — never throws
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the real SF assessor parcel at a WGS84 point via the same-origin DataSF proxy. Returns a typed
 * OK/refusal union and NEVER throws — every miss/unreachable/malformed body is a refusal, so the editor
 * falls to the OSM footprint. Confidence is `high` on an APN + point-in-lot ring. OTel span (P8).
 */
export async function fetchParcelAtPoint(
    point: SfLatLon | null | undefined,
    deps: SfDataSfDeps = {},
): Promise<SfParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.sfDataSf');
    span.setAttribute('pryzm.parcel.provider', 'sf-datasf');
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
        if (!isInSF(point.lat, point.lon)) {
            span.setAttribute('pryzm.parcel.result', 'out-of-sf');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-sf' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('pryzm.parcel.result', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? SF_DATASF_PARCEL_PATH;
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
            console.warn('[sf-datasf] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const parsed = parseSfParcelResponse(json);
        if (parsed.ok) {
            span.setAttribute('pryzm.parcel.result', 'ok');
            span.setAttribute('pryzm.parcel.apn', parsed.parcel.apn);
            span.setAttribute('pryzm.parcel.areaM2', parsed.parcel.areaM2);
            span.setAttribute('pryzm.parcel.zoningDraft', parsed.parcel.zoning !== null);
        } else {
            span.setAttribute('pryzm.parcel.result', parsed.reason);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return parsed;
    } catch (err) {
        // Defensive: best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[sf-datasf] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}

/**
 * The provider handle mirroring the sibling cadastral adapters (`id` + `label` + a fetch fn). `kind`
 * is `'cadastral'`: the DataSF assessor layer is a real parcel fabric, not an OSM footprint.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * ORCHESTRATOR — registry wiring (this module intentionally does NOT edit `parcelProviders/registry.ts`):
 *
 *   // TODO(orchestrator): register isInSF→sf-datasf
 *
 *   Add to `PARCEL_JURISDICTIONS` in `registry.ts` (import `isInSF` from `./sfParcelProvider.js`),
 *   ordered BEFORE any coarser US/footprint entry (and after `US-NY-NYC`; the two city boxes do not
 *   overlap, so their relative order is free):
 *     {
 *       regionCode: 'US-CA-SF',
 *       countryName: 'United States (San Francisco)',
 *       providerId: 'sf-datasf',
 *       label: 'DataSF Assessor Parcels (San Francisco · APN/blocklot)',
 *       proxyPath: '/api/parcel/us-sf',
 *       kind: 'cadastral',
 *       contains: isInSF,
 *       note: 'DataSF assessor parcels (Socrata acdm-wktn / ArcGIS) — parcel polygon + APN/blocklot + geometry-derived area, keyless. Zoning + height-and-bulk are SEPARATE DataSF layers (SFZoningProvider), NOT FAR. // PROBE: verify the DataSF resource/FeatureServer live before prod.',
 *     }
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
export const sfParcelProvider = {
    id: 'sf-datasf',
    label: 'DataSF Assessor Parcels (San Francisco · APN/blocklot)',
    kind: 'cadastral' as const,
    isInSF,
    fetchParcelAtPoint,
};
