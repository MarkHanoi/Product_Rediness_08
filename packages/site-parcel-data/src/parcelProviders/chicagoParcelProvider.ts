// L-650 Phase-4 (USA / Chicago) — the Cook County (PIN) PARCEL resolver + an optional Chicago
// zoning-district head-start.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — and why Chicago is wired as a CITY, not a country
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The US has NO national cadastre and NO national zone taxonomy (see `jurisdictions/us/USA.md` — the
// INVERSE-of-Germany city-federation). There is no `USParcelProvider`; the US is wired city by city.
// Chicago is a Tier-1 pilot: strong open data (`data.cityofchicago.org` + Cook County), but — UNLIKE
// NYC's single BBL-keyed MapPLUTO layer — Chicago's payload is SPLIT: Cook County owns the parcel
// fabric (keyed by the 14-digit **PIN**, Property Index Number) while the City of Chicago owns the
// zoning-district boundaries (a SEPARATE layer). So this provider's strong, always-present output is
// GEOMETRY + PIN (like Flanders' GRB / Spain's Catastro); the zoning district is an OPTIONAL
// head-start folded in only when the same-origin proxy joins the Chicago zoning companion layer, and
// even then it is DRAFT-caveated (code only, no numeric FAR/height — those live in Title 17 ordinance
// text, not the boundary layer). (`jurisdictions/us/CITIES/CHICAGO.md` · `us/RATE-IMPLEMENTATION-PLAN.md`
// Phase A · the scored dossier `us/us-il/1714000-chicago/`.)
//
// This mirrors the shape of the sibling L2 cadastral resolvers (`nycPlutoParcelProvider`,
// `resolveFlandersParcel`, `resolveMadridNZ1Ring`): a bbox routing predicate + an injectable-fetch
// resolver that NEVER throws + a pure, byte-deterministic parse of the upstream feature, returning a
// typed OK/refusal union. The impure network hop (browser → Cook County / City endpoint) is proxied
// same-origin by the editor for CSP; this module only knows a same-origin path it can query.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ENDPOINTS (the orchestrator wires the server proxy; see the PROBE markers)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • Cook County parcel FeatureServer (ArcGIS REST — spatial point query): the county's authoritative
//       parcel polygon carrying the PIN. `outSR=4326` → WGS84 rings. // PROBE: Cook County re-publishes
//       its GIS services and the exact host/layer index drifts — verify the FeatureServer path + PIN
//       field name live before prod (`COOK_COUNTY_PARCEL_ARCGIS_QUERY`).
//   • Chicago zoning companion (Socrata — data.cityofchicago.org `5s3e-9pji`): the zoning-district
//       boundary layer (VERIFIED-LEAD in `us-il/1714000-chicago/sources/SOURCES.md`, NOT live-probed).
//       When the proxy joins the district code onto the parcel, the parser folds it in as a DRAFT
//       zoning head-start. // PROBE: confirm the district-code field name (`zone_class`/`zoning_classification`)
//       and whether the table carries numeric FAR/height (the dossier's single highest-value free probe).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// CRS — Cook County parcels are native EPSG:3435 (NAD83 / Illinois State Plane East, ftUS), NOT WGS84
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The ArcGIS query MUST carry `outSR=4326` (Socrata GeoJSON is already 4326), so the ring arrives in
// WGS84 lon/lat. As a HONESTY GUARD against a mis-configured proxy that forgets `outSR`, the parser
// REFUSES (`crs-unprojected`) any ring whose coordinates are State-Plane-magnitude (|lon|>180 /
// |lat|>90) rather than silently plotting feet as degrees. It never re-projects here (no proj4 in L2)
// — projection into the authoring scene frame is the L5 dispatcher's job.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// AREA + ZONING honesty (the §CONTEXT-DATA-HONESTY gate)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • `areaM2` is SHOELACE-DERIVED from the returned WGS84 ring, NOT read from the parcel attribute:
//     Cook County's `shape_area` is in State-Plane ft² and its unit is easy to mis-carry, so we derive
//     the area from the geometry we actually plot (the Flanders `derived-from-ring` choice) and tag it.
//   • The zoning district is OPTIONAL and DRAFT. Cook County's parcel layer carries NO zoning; the
//     district appears only if the proxy joins the Chicago companion layer. When present it is cited to
//     the Chicago Zoning Ordinance (Title 17) but flagged `isDraft: true` — it is a district CODE only,
//     NOT a human-verified numeric rule (ADR-0269 curate-then-serve / L-449 gate). `far`/`maxHeightM`
//     stay `null`: they are in ordinance tables, not the boundary layer, and are the surviving cap.
//     Planned Developments (PDs) SUPERSEDE the base district and are not derivable from the code alone.
//
// PURITY (C58 §1.9): the fetch is injected; given the same body the parse is byte-deterministic.
// OTel span `pryzm.parcel.chicagoCookCounty` (C58 §1.10 / P8). NEVER throws — every miss/unreachable/
// malformed body is a typed refusal, so the editor falls to the OSM footprint, never a crash, never a
// guess.
//
// TODO(orchestrator): register isInChicago→chicago-cook in `parcelProviders/registry.ts` (single-writer).
//   The exact PARCEL_JURISDICTIONS entry + import line are in the Phase-4 report and in
//   `us/RATE-IMPLEMENTATION-PLAN.md` (Chicago PARCEL axis → wired-pending-probe). This module does NOT
//   edit the registry / index.ts / server.js.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ROUTING — the Chicago bbox predicate (the national analogue is `countryBbox.ts`; Chicago is a CITY,
// so this predicate is city-granularity, like `isInBarcelona` / `isInNYC`). A bbox is a COARSE
// proximity gate, never an authorisation: it only decides whether to try Cook County; the feature
// service's own empty result is the real "no lot here" answer, and the universal footprint covers
// every miss. ⚠ Cook County extends well beyond the Chicago city limits; a click in a suburban Cook
// municipality that falls in this box and reaches the county parcel layer still resolves a real PIN —
// acceptable (the county owns the fabric), and a click outside the county self-corrects to footprint.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point — the frame the resolver queries with and returns the ring in. */
export interface ChiLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Chicago (+ inner Cook County) bounding box. Generous enough to cover the full city footprint from
 *  the far NW (O'Hare) to the SE lakefront; a bbox is only a router. */
export const CHICAGO_BBOX = {
    minLat: 41.60,
    maxLat: 42.10,
    minLon: -87.95,
    maxLon: -87.50,
} as const;

/** True when a WGS84 point falls in the Chicago / inner-Cook bbox. Non-finite input → false. */
export function isInChicago(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= CHICAGO_BBOX.minLat &&
        lat <= CHICAGO_BBOX.maxLat &&
        lon >= CHICAGO_BBOX.minLon &&
        lon <= CHICAGO_BBOX.maxLon
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The same-origin proxy route the editor calls (never `gis.cookcountyil.gov` / `data.cityofchicago.org`
 *  directly — C57 CSP). The proxy runs the Cook County parcel point query (optionally joining the
 *  Chicago zoning district) and passes the feature body through in a shape this module parses. Mirrors
 *  `/api/parcel/us-nyc`, `/api/parcel/be-vlg`. */
export const CHICAGO_PARCEL_PATH = '/api/parcel/us-chi';

/**
 * The documented upstream Cook County parcel FeatureServer point query the SERVER proxy runs. A point
 * in WGS84 (`inSR=4326`), `spatialRel=esriSpatialRelIntersects` → the parcel under the click;
 * `outSR=4326` returns the ring in WGS84; `outFields=*` returns the PIN (+ any joined zoning code).
 * // PROBE: verify this Cook County FeatureServer host + layer index + PIN field name live before prod
 * (Cook County GIS re-publishes and the layer index drifts; the parcel layer may live under the
 * `cookVwrDynmMapSrvc` MapServer or a newer `gis.cookcountyil.gov` FeatureServer).
 */
export const COOK_COUNTY_PARCEL_ARCGIS_QUERY =
    'https://gis.cookcountyil.gov/traditional/rest/services/cookVwrDynmMapSrvc/MapServer/44/query';

/** The Chicago zoning-district companion (Socrata GeoJSON). VERIFIED-LEAD in the Chicago dossier
 *  (`us-il/1714000-chicago/sources/SOURCES.md`), NOT live-probed. // PROBE: confirm the district-code
 *  field name + whether it carries numeric FAR/height (the dossier's highest-value free probe). */
export const CHICAGO_ZONING_SOCRATA_RESOURCE = 'https://data.cityofchicago.org/resource/5s3e-9pji.geojson';

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors NYC / Flanders). */
export interface ChicagoParcelDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `CHICAGO_PARCEL_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RESULT TYPES — the module-local parcel shape (L2-pure; the L5 editor maps it into its ParcelFeature)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Confidence in the parcel↔click correspondence. `high` requires a real PIN + a valid ring from a
 *  point-in-lot spatial query; anything softer never claims `high`. */
export type ChicagoParcelConfidence = 'high' | 'medium' | 'low';

/** The OPTIONAL Chicago zoning-district head-start (the LEGISLATION bonus). Present only when the proxy
 *  joins the Chicago companion layer; DRAFT — a district CODE only, never a human-verified numeric rule.
 *  Every numeric field is `null` for honest absence (they live in Title 17 tables, not the boundary layer). */
export interface ChicagoZoning {
    /** The base zoning-district code, e.g. `RS-3`, `B3-2`, `DX-16` (Chicago Zoning Ordinance, Title 17),
     *  or null. NOT the governing rule for Planned-Development (PD) parcels — a PD supersedes the base. */
    readonly zoneClass: string | null;
    /** A human-readable district description where the companion layer publishes one, else null. */
    readonly zoneType: string | null;
    /** Floor Area Ratio — ALWAYS null here: FAR is in Title 17 ordinance tables, not the boundary layer. */
    readonly far: number | null;
    /** Max building height (m) — ALWAYS null here: height is in Title 17 tables, not the boundary layer. */
    readonly maxHeightM: number | null;
    /** DRAFT flag — true: this district code is a companion-layer join, NOT an L-449-verified rule. */
    readonly isDraft: boolean;
    /** The ordinance the district is cited to. */
    readonly citation: string;
    /** The DRAFT caveat carried to the info card / C57 credibility. */
    readonly caveat: string;
}

/** A resolved Cook County parcel: WGS84 ring + PIN + shoelace-derived area + an optional zoning head-start.
 *  The L5 dispatcher maps `ring`→`ParcelFeature.ring`, `pin`→`refcat`, and copies `zoning` (when present)
 *  into its ZoningRecord as a DRAFT district. */
export interface ChicagoParcel {
    /** The parcel boundary as a WGS84 lon/lat ring (outer ring; closing vertex not guaranteed). */
    readonly ring: readonly ChiLatLon[];
    /** The 14-digit Cook County Property Index Number (the routing key). Always present on an OK result. */
    readonly pin: string;
    /** Parcel area in m² — SHOELACE-DERIVED from the returned ring (Cook County `shape_area` is ambiguous
     *  State-Plane ft², so we derive from the geometry we actually plot). */
    readonly areaM2: number;
    /** Provenance for `areaM2` — always `derived-from-ring` here (C57 §2.1 honesty). */
    readonly areaSource: 'derived-from-ring';
    /** The OPTIONAL DRAFT zoning-district head-start, or null when the proxy joined no zoning layer. */
    readonly zoning: ChicagoZoning | null;
    /** Confidence in the parcel↔click correspondence. */
    readonly confidence: ChicagoParcelConfidence;
    /** Provenance tag for the info card / C57 credibility. */
    readonly source: 'chicago-cook';
}

/** Why a Chicago resolution refused. Closed vocabulary — these are operationally distinct. */
export type ChicagoParcelRefusalReason =
    /** No usable WGS84 point was supplied — nothing to query the parcel by. */
    | 'no-point'
    /** The point is outside the Chicago / inner-Cook bbox — Cook County does not answer here. */
    | 'out-of-chicago'
    /** No `fetch` available, the endpoint could not be reached, or it returned non-OK / a bad body. */
    | 'endpoint-unreachable'
    /** The query returned zero features — no parcel at this point (water, ROW, an unmapped sliver). */
    | 'no-parcel'
    /** A feature came back but carried no usable PIN — cannot key it, so refuse rather than guess. */
    | 'no-pin'
    /** The parcel geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry'
    /** The ring came back in State-Plane feet (proxy forgot `outSR=4326`) — refuse over mis-plotting. */
    | 'crs-unprojected';

export type ChicagoParcelResolution =
    | { readonly ok: true; readonly parcel: ChicagoParcel }
    | { readonly ok: false; readonly reason: ChicagoParcelRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — the parse + the area / CRS / PIN / zoning honesty gates
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Read a value as a clean finite number, or null. Tolerates numeric strings. Never coerces blank→0. */
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
 * Case-insensitive attribute read: ArcGIS uses `PIN`/`ZONE_CLASS`, Socrata is lower-case `pin`/`zone_class`.
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
 * Normalise a Cook County PIN. The county PIN is 14 digits (often published with dashes,
 * `17-04-441-035-0000`, or as a 10-digit `pin10`). We strip dashes/whitespace and accept a digit run;
 * refuse (null) anything with no digits. Returns the cleaned digit string.
 */
export function normalizePin(raw: unknown): string | null {
    const s = toStr(raw);
    if (!s) return null;
    const digits = s.replace(/[\s-]/g, '');
    return /^\d{5,14}$/.test(digits) ? digits : null;
}

export const CHICAGO_ZONING_CITATION =
    'Chicago Zoning Ordinance (Title 17, Chicago Municipal Code) — district code via the City of Chicago zoning GIS companion layer';

export const CHICAGO_ZONING_DRAFT_CAVEAT =
    'DRAFT — base district code only (companion-layer join), NOT an L-449-verified numeric rule. FAR/height are in Title 17 tables (not derivable here); a Planned Development (PD) supersedes the base district.';

/**
 * Fold an OPTIONAL Chicago zoning district out of the (possibly proxy-joined) attributes. Returns null
 * when no district code is present (the geometry-only case). When present it is DRAFT-caveated and
 * carries NO numeric FAR/height (those are not in the boundary layer). Pure.
 */
export function deriveZoning(attributes: Record<string, unknown>): ChicagoZoning | null {
    const zoneClass = toStr(attr(attributes, 'zone_class', 'zoning_classification', 'zone_type', 'zoning'));
    const zoneType = toStr(attr(attributes, 'zone_type', 'zone_class_description', 'description'));
    if (!zoneClass && !zoneType) return null;
    return {
        zoneClass,
        zoneType,
        far: null,
        maxHeightM: null,
        isDraft: true,
        citation: CHICAGO_ZONING_CITATION,
        caveat: CHICAGO_ZONING_DRAFT_CAVEAT,
    };
}

/**
 * Parse a ring from either an ArcGIS Esri-JSON geometry (`{ rings: [[[x,y],…]] }`) or a GeoJSON
 * geometry (`{ type: 'Polygon'|'MultiPolygon', coordinates }` — Socrata GeoJSON). Returns the outer
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

/** Shoelace area (m²) of a WGS84 ring via a local equirectangular projection at the ring's centroid
 *  latitude. Deterministic; adequate for a parcel-scale area. */
export function ringAreaM2(ring: readonly ChiLatLon[]): number {
    if (ring.length < 3) return 0;
    let latSum = 0;
    for (const p of ring) latSum += p.lat;
    const lat0 = (latSum / ring.length) * (Math.PI / 180);
    const mPerDegLat = 111_132.92;
    const mPerDegLon = 111_412.84 * Math.cos(lat0);
    let twice = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const ax = a.lon * mPerDegLon;
        const ay = a.lat * mPerDegLat;
        const bx = b.lon * mPerDegLon;
        const by = b.lat * mPerDegLat;
        twice += ax * by - bx * ay;
    }
    return Math.abs(twice) / 2;
}

/**
 * Parse ONE Cook County parcel feature (ArcGIS `{ attributes, geometry }` OR a Socrata GeoJSON row with
 * `the_geom`/`geometry` + flat fields) into a `ChicagoParcel`, or a typed refusal. Pure + byte-
 * deterministic. Exported so a unit test can pin the parse (PIN + geometry + optional zoning) in
 * isolation from the network.
 */
export function parseCookCountyFeature(feature: unknown): ChicagoParcelResolution {
    if (!feature || typeof feature !== 'object') return { ok: false, reason: 'no-parcel' };
    const f = feature as Record<string, unknown>;

    // GeoJSON Feature: attributes live under `properties`; ArcGIS nests them under `attributes`;
    // a bare Socrata row is flat (the row itself).
    const attributes =
        (f.properties && typeof f.properties === 'object'
            ? (f.properties as Record<string, unknown>)
            : f.attributes && typeof f.attributes === 'object'
              ? (f.attributes as Record<string, unknown>)
              : f);
    // Geometry: ArcGIS under `geometry`; GeoJSON Feature under `geometry`; Socrata flat under `the_geom`.
    const geometry = f.geometry ?? attributes.the_geom ?? (f as Record<string, unknown>).the_geom;

    const pin = normalizePin(attr(attributes, 'PIN', 'pin', 'PIN14', 'pin14', 'PIN10', 'pin10', 'pinnum', 'pin_nghbr'));
    if (!pin) return { ok: false, reason: 'no-pin' };

    const pairs = parseRing(geometry);
    if (!pairs) return { ok: false, reason: 'degenerate-geometry' };
    if (looksLikeStatePlane(pairs)) return { ok: false, reason: 'crs-unprojected' };
    // Distinct-vertex count for a usable ring (a closing duplicate does not count).
    const distinct = new Set(pairs.map(([lon, lat]) => `${lon},${lat}`)).size;
    if (distinct < 3) return { ok: false, reason: 'degenerate-geometry' };
    const ring: ChiLatLon[] = pairs.map(([lon, lat]) => ({ lat, lon }));

    const zoning = deriveZoning(attributes);

    // Confidence HIGH: a real PIN + a valid point-in-lot ring is the Cook County strong case (C57 §2.1).
    const parcel: ChicagoParcel = {
        ring,
        pin,
        areaM2: ringAreaM2(ring),
        areaSource: 'derived-from-ring',
        zoning,
        confidence: 'high',
        source: 'chicago-cook',
    };
    return { ok: true, parcel };
}

/**
 * Pick the governing feature from an ArcGIS FeatureServer query response (`{ features: [...] }`), a
 * GeoJSON FeatureCollection (`{ type: 'FeatureCollection', features: [...] }` — Socrata `.geojson`),
 * or a bare Socrata array (`[ row, … ]`) and parse it. A point-in-lot query returns exactly one parcel;
 * if several come back (a boundary click), the FIRST is taken. Pure. Exported for testing the shape.
 */
export function parseCookCountyResponse(json: unknown): ChicagoParcelResolution {
    if (Array.isArray(json)) {
        return json.length === 0 ? { ok: false, reason: 'no-parcel' } : parseCookCountyFeature(json[0]);
    }
    if (json && typeof json === 'object') {
        const j = json as Record<string, unknown>;
        if (Array.isArray(j.features)) {
            return j.features.length === 0
                ? { ok: false, reason: 'no-parcel' }
                : parseCookCountyFeature(j.features[0]);
        }
        // A consolidated proxy shape `{ parcel: <feature> }` or a bare single feature.
        if (j.parcel !== undefined) return parseCookCountyFeature(j.parcel);
        return parseCookCountyFeature(j);
    }
    return { ok: false, reason: 'no-parcel' };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — never throws
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the real Cook County parcel at a WGS84 point via the same-origin Chicago proxy. Returns a
 * typed OK/refusal union and NEVER throws — every miss/unreachable/malformed body is a refusal, so the
 * editor falls to the OSM footprint. Confidence is `high` on a PIN + point-in-lot ring. OTel span (P8).
 */
export async function fetchParcelAtPoint(
    point: ChiLatLon | null | undefined,
    deps: ChicagoParcelDeps = {},
): Promise<ChicagoParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.chicagoCookCounty');
    span.setAttribute('pryzm.parcel.provider', 'chicago-cook');
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
        if (!isInChicago(point.lat, point.lon)) {
            span.setAttribute('pryzm.parcel.result', 'out-of-chicago');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-chicago' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('pryzm.parcel.result', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? CHICAGO_PARCEL_PATH;
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
            console.warn('[chicago-cook] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const parsed = parseCookCountyResponse(json);
        if (parsed.ok) {
            span.setAttribute('pryzm.parcel.result', 'ok');
            span.setAttribute('pryzm.parcel.pin', parsed.parcel.pin);
            span.setAttribute('pryzm.parcel.zoneClass', parsed.parcel.zoning?.zoneClass ?? '');
        } else {
            span.setAttribute('pryzm.parcel.result', parsed.reason);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return parsed;
    } catch (err) {
        // Defensive: best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[chicago-cook] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}

/**
 * The provider handle mirroring the sibling cadastral adapters (`id` + `label` + a fetch fn). `kind`
 * is `'cadastral'`: Cook County is a real parcel fabric, not an OSM footprint.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * ORCHESTRATOR — registry wiring (this module intentionally does NOT edit `parcelProviders/registry.ts`):
 *
 *   // TODO(orchestrator): register isInChicago→chicago-cook
 *
 *   Add to `PARCEL_JURISDICTIONS` in `registry.ts` (import `isInChicago` from `./chicagoParcelProvider.js`),
 *   ordered BEFORE any coarser US/footprint entry:
 *     {
 *       regionCode: 'US-IL-CHI',
 *       countryName: 'United States (Chicago / Cook County)',
 *       providerId: 'chicago-cook',
 *       label: 'Cook County parcels (Chicago · PIN) + Chicago zoning (Title 17, DRAFT)',
 *       proxyPath: '/api/parcel/us-chi',
 *       kind: 'cadastral',
 *       contains: isInChicago,
 *       note: 'Cook County parcel FeatureServer (14-digit PIN) → WGS84 ring + shoelace area; optional Chicago zoning-district code joined from data.cityofchicago.org 5s3e-9pji (DRAFT, code-only, no FAR/height). // PROBE: verify the Cook County FeatureServer path + PIN field live; zoning companion + FAR fill unprobed.',
 *     }
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
export const chicagoParcelProvider = {
    id: 'chicago-cook',
    label: 'Cook County parcels (Chicago · PIN) + Chicago zoning (Title 17, DRAFT)',
    kind: 'cadastral' as const,
    isInChicago,
    fetchParcelAtPoint,
};
