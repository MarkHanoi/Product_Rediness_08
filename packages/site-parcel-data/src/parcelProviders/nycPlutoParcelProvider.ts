// L-650 Phase-4 (USA / New York City) — the NYC MapPLUTO PARCEL + zoning/FAR resolver.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — and why NYC is wired first among US cities
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The US has NO national cadastre and NO national zone taxonomy (see `jurisdictions/us/USA.md` — the
// INVERSE-of-Germany city-federation). So there is no `USParcelProvider`; the US is wired city by
// city. NYC is the flagship because **MapPLUTO** (NYC Dept. of Finance + Dept. of City Planning) is
// the closest thing in the US to a complete PRYZM dataset in ONE layer: it merges the tax-lot polygon
// (PLUTO) with the zoning district(s), FAR, land-use, floor count and lot area, all keyed by **BBL**
// (Borough-Block-Lot, a 10-digit parcel id). Most US cities need 4–6 datasets joined; NYC ships them
// pre-joined. That single-layer completeness is why this ONE provider lights up the PARCEL and
// DATA-SOURCES axes AND — uniquely for NYC — a partial LEGISLATION head-start (the FAR fields), in one
// wiring. (`jurisdictions/us/CITIES/NEW_YORK_CITY.md` · `us/RATE-IMPLEMENTATION-PLAN.md` Phase A.)
//
// This mirrors the shape of the other L2 cadastral resolvers (`resolveNlBestemmingsplan`,
// `resolveMadridNZ1Ring`, `chGrundnutzungProvider`): a bbox routing predicate + an injectable-fetch
// resolver that NEVER throws + a pure, byte-deterministic parse of the upstream feature, returning a
// typed OK/refusal union. The impure network hop (browser → gov endpoint) is proxied same-origin by
// the editor for CSP; this module only knows a same-origin path (default) it can query.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ENDPOINTS (the orchestrator wires the server proxy; see the PROBE markers)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • ArcGIS REST FeatureServer (the "MapPLUTO lot FeatureServer" — spatial point query):
//       NYC DCP MapPLUTO service, `outSR=4326` → WGS84 rings + attributes (BBL, ZoneDist1, ResidFAR…).
//       Documented endpoint below (`NYC_MAPPLUTO_ARCGIS_QUERY`). // PROBE: verify live before prod.
//   • Socrata (the FAR fill was probed 2026-07-24 — `data.cityofnewyork.us/resource/64uk-42ks.json`,
//       858,602 parcels / 99.5% FAR fill; `us/findings/USA-PROBE-RESULTS-2026-07-24.md`). Lower-case
//       field names + a GeoJSON `the_geom`. The parser accepts either shape (attribute read is
//       case-insensitive) so the same proxy can pass through EITHER upstream.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// CRS — MapPLUTO is native EPSG:2263 (NAD83 / NY Long Island ftUS), NOT WGS84
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The ArcGIS query MUST carry `outSR=4326` and Socrata's `the_geom` is already 4326, so the ring
// arrives in WGS84 lon/lat. As a HONESTY GUARD against a mis-configured proxy that forgets `outSR`,
// the parser REFUSES (`crs-unprojected`) any ring whose coordinates are State-Plane-magnitude
// (|value| > 180) rather than silently plotting feet as degrees. It never re-projects here (no proj4
// in L2) — projection into the authoring scene frame is the L5 dispatcher's job.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// FAR / LEGISLATION honesty (the §CONTEXT-DATA-HONESTY gate)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   • `farRatio` is derived as the GOVERNING as-of-right FAR = max(ResidFAR, CommFAR, FacilFAR) where
//     any is present, tagged with `farBasis` (which field it came from), cited to the NYC Zoning
//     Resolution. Their semantics ARE known (as-of-right maxima by use class). This is PLUTO's
//     *allowable* FAR attribute per DCP — NOT a PRYZM re-derivation from the ordinance text.
//   • `maxAllwFAR` is carried RAW but NOT folded into `farRatio`: whether `MaxAllwFAR` includes bonus
//     potential (Inclusionary Housing / POPS) or only as-of-right is UNPROBED and is the single most
//     consequential NYC trap (a ~30 pt ceiling swing — `us/RATE-IMPLEMENTATION-PLAN.md` §Phase-A
//     blocker). We do not trust it as *the* number until probed.
//   • Special Purpose Districts (SPDist1-3) + TDR/air-rights are NOT derivable from the base zone code
//     and are NOT resolved here — they are carried raw (SPD) or omitted (air-rights) for the Phase-C
//     rule pack + a cited refusal. A lot that bought air-rights has more FAR than MapPLUTO shows.
//
// PURITY (C58 §1.9): the fetch is injected; given the same body the parse is byte-deterministic.
// OTel span `pryzm.parcel.nycPluto` (C58 §1.10 / P8). NEVER throws — every miss/unreachable/malformed
// body is a typed refusal, so the editor falls to the OSM footprint, never a crash and never a guess.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ROUTING — the 5-borough NYC bbox predicate (the national analogue is `countryBbox.ts`; NYC is a
// CITY, so this predicate is city-granularity, like `isInBarcelona`/`isInMadrid`). A bbox is a COARSE
// proximity gate, never an authorisation: it only decides whether to try MapPLUTO; the feature
// service's own empty result is the real "no lot here" answer, and the universal footprint covers
// every miss.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point — the frame the resolver queries with and returns the ring in. */
export interface NycLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** NYC 5-borough bounding box (Manhattan, Bronx, Brooklyn, Queens, Staten Island).
 *  Generous enough to cover the harbour islands + the Rockaways; a bbox is only a router. */
export const NYC_BBOX = {
    minLat: 40.47,
    maxLat: 40.93,
    minLon: -74.28,
    maxLon: -73.68,
} as const;

/** True when a WGS84 point falls in the NYC 5-borough bbox. Non-finite input → false. */
export function isInNYC(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= NYC_BBOX.minLat && lat <= NYC_BBOX.maxLat && lon >= NYC_BBOX.minLon && lon <= NYC_BBOX.maxLon;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The same-origin proxy route the editor calls (never `services5.arcgis.com` / `data.cityofnewyork.us`
 *  directly — C57 CSP). The proxy runs the MapPLUTO spatial point query and passes the ArcGIS/Socrata
 *  feature body through in a shape this module parses. Mirrors `/api/parcel/dk`, `/api/nl/bestemmingsplan`. */
export const NYC_MAPPLUTO_PARCEL_PATH = '/api/parcel/us-nyc';

/**
 * The documented upstream ArcGIS REST FeatureServer point query the SERVER proxy runs. `geometryType`
 * is a point in WGS84 (`inSR=4326`), `spatialRel=esriSpatialRelIntersects` → the tax lot under the
 * click; `outSR=4326` returns the ring in WGS84; `outFields=*` returns BBL + zoning + FAR.
 * // PROBE: verify this MapPLUTO FeatureServer path + layer index live before prod (NYC DCP re-publishes
 * the service annually and the org id / layer index can drift). The Socrata route below is the probed one.
 */
export const NYC_MAPPLUTO_ARCGIS_QUERY =
    'https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/arcgis/rest/services/MAPPLUTO/FeatureServer/0/query';

/** The Socrata resource (PROBED 2026-07-24 — 858,602 parcels, 99.5% FAR fill). Lower-case fields +
 *  a GeoJSON `the_geom`; a spatial point query uses SoQL `intersects(the_geom, 'POINT(lon lat)')`. */
export const NYC_MAPPLUTO_SOCRATA_RESOURCE = 'https://data.cityofnewyork.us/resource/64uk-42ks.json';

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors NL/Madrid). */
export interface NycPlutoDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `NYC_MAPPLUTO_PARCEL_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RESULT TYPES — the module-local parcel shape (L2-pure; the L5 editor maps it into its ParcelFeature)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Confidence in the parcel↔click correspondence. `high` requires a real BBL + a valid ring from a
 *  point-in-lot spatial query (the MapPLUTO case); anything softer never claims `high`. */
export type NycParcelConfidence = 'high' | 'medium' | 'low';

/** Which raw FAR field `farRatio` was taken from (provenance for the LEGISLATION head-start). */
export type NycFarBasis = 'resid' | 'comm' | 'facil';

/** The zoning + FAR payload MapPLUTO carries alongside the geometry (the LEGISLATION bonus). Every
 *  numeric field is `null` for honest absence — never a fabricated 0. */
export interface NycPlutoZoning {
    /** Primary base zoning district, e.g. `R6`, `C2-7`, `M1-6` (MapPLUTO `ZoneDist1`), or null. */
    readonly zoneDist1: string | null;
    /** Secondary/tertiary/quaternary districts on split lots (`ZoneDist2`-`4`), sparse; null when absent. */
    readonly zoneDist2: string | null;
    readonly zoneDist3: string | null;
    readonly zoneDist4: string | null;
    /** Commercial overlays (`Overlay1`/`Overlay2`), e.g. `C1-4`; null when none. */
    readonly overlay1: string | null;
    readonly overlay2: string | null;
    /** Special Purpose District(s) (`SPDist1`-`3`) — NOT resolvable to numbers from the base zone;
     *  carried raw for the Phase-C rule pack + cited refusal. Null when the lot is in no SPD. */
    readonly spDist1: string | null;
    readonly spDist2: string | null;
    readonly spDist3: string | null;
    /** As-of-right residential FAR (`ResidFAR`), or null. Semantics known: max as-of-right by use. */
    readonly residFAR: number | null;
    /** As-of-right commercial FAR (`CommFAR`), or null. */
    readonly commFAR: number | null;
    /** As-of-right community-facility FAR (`FacilFAR`), or null. */
    readonly facilFAR: number | null;
    /** `MaxAllwFAR` — carried RAW, NOT folded into `farRatio` (its bonus-vs-base semantics are UNPROBED;
     *  the #1 NYC trap). Null when absent. */
    readonly maxAllwFAR: number | null;
    /** `BuiltFAR` — the as-built floor-area ratio (a physical fact, not a legal cap). Null when absent. */
    readonly builtFAR: number | null;
    /** The GOVERNING as-of-right FAR = max(residFAR, commFAR, facilFAR) where present; else null. Cited
     *  to the NYC Zoning Resolution (PLUTO's *allowable* attribute per DCP — NOT a PRYZM re-derivation). */
    readonly farRatio: number | null;
    /** Which raw field `farRatio` came from, or null when no FAR is published. */
    readonly farBasis: NycFarBasis | null;
    /** The ordinance the FAR fields are cited to. */
    readonly farCitation: string;
}

/** A resolved NYC tax lot: WGS84 ring + BBL + borough + lot area + the zoning/FAR payload. The L5
 *  dispatcher maps `ring`→`ParcelFeature.ring`, `bbl`→`refcat`, and copies `zoning` into its ZoningRecord. */
export interface NycPlutoParcel {
    /** The tax-lot boundary as a WGS84 lon/lat ring (outer ring). */
    readonly ring: readonly NycLatLon[];
    /** Borough-Block-Lot — the 10-digit parcel id (the routing key). Always present on an OK result. */
    readonly bbl: string;
    /** Borough name derived from the BBL's leading digit / MapPLUTO `Borough` code, or null. */
    readonly borough: string | null;
    /** Lot area in m² (`LotArea` is ft²; converted). 0 when unpublished. */
    readonly lotAreaM2: number;
    /** Raw `LotArea` in ft² as MapPLUTO publishes it (provenance), or null. */
    readonly lotAreaSqFt: number | null;
    /** `NumFloors` — the as-built floor count (a physical fact), or null. */
    readonly numFloors: number | null;
    /** `BldgHeight`/derived building height in metres where MapPLUTO/height model supplies one, else null. */
    readonly bldgHeightM: number | null;
    /** The zoning + FAR payload (the LEGISLATION head-start). */
    readonly zoning: NycPlutoZoning;
    /** Confidence in the parcel↔click correspondence. */
    readonly confidence: NycParcelConfidence;
    /** Provenance tag for the info card / C57 credibility. */
    readonly source: 'nyc-mappluto';
}

/** Why an NYC resolution refused. Closed vocabulary — these are operationally distinct. */
export type NycPlutoRefusalReason =
    /** No usable WGS84 point was supplied — nothing to query the lot by. */
    | 'no-point'
    /** The point is outside the NYC 5-borough bbox — MapPLUTO does not answer here. */
    | 'out-of-nyc'
    /** No `fetch` available, the endpoint could not be reached, or it returned non-OK / a bad body. */
    | 'endpoint-unreachable'
    /** The query returned zero features — no tax lot at this point (water, an unmapped sliver). */
    | 'no-lot'
    /** A feature came back but carried no usable BBL — cannot key it, so refuse rather than guess. */
    | 'no-bbl'
    /** The lot geometry has < 3 distinct vertices — not a usable ring. */
    | 'degenerate-geometry'
    /** The ring came back in State-Plane feet (proxy forgot `outSR=4326`) — refuse over mis-plotting. */
    | 'crs-unprojected';

export type NycPlutoResolution =
    | { readonly ok: true; readonly parcel: NycPlutoParcel }
    | { readonly ok: false; readonly reason: NycPlutoRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — the parse + the FAR/CRS/BBL honesty gates
// ──────────────────────────────────────────────────────────────────────────────────────────────

const SQFT_TO_M2 = 0.09290304;

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

/** Read a value as a positive finite number, or null. A FAR/area of 0 or negative is a transcription
 *  artefact, not a real value — withheld, never rendered. */
function toPositiveNum(v: unknown): number | null {
    const n = toFiniteNum(v);
    return n !== null && n > 0 ? n : null;
}

/** Read a non-empty trimmed string, or null. */
function toStr(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s === '' ? null : s;
}

/** Borough from the BBL leading digit (1 Manhattan…5 Staten Island) or the MapPLUTO `Borough` code. */
export function boroughFromBbl(bbl: string | null, boroughCode: string | null): string | null {
    const byCode: Record<string, string> = { MN: 'Manhattan', BX: 'Bronx', BK: 'Brooklyn', QN: 'Queens', SI: 'Staten Island' };
    const code = boroughCode ? boroughCode.trim().toUpperCase() : '';
    if (code && byCode[code]) return byCode[code]!;
    const byDigit: Record<string, string> = { '1': 'Manhattan', '2': 'Bronx', '3': 'Brooklyn', '4': 'Queens', '5': 'Staten Island' };
    const firstDigit = bbl && bbl.length > 0 ? bbl.charAt(0) : '';
    if (firstDigit && byDigit[firstDigit]) return byDigit[firstDigit]!;
    return null;
}

/**
 * Fold the raw FAR fields into `farRatio` = the GOVERNING as-of-right FAR = max(resid, comm, facil),
 * tagged with `farBasis`. `MaxAllwFAR` is deliberately NOT considered (unprobed bonus semantics).
 * Ties resolve to the highest-precedence use in the order comm > resid > facil (the field a mixed-use
 * lot would build to first); this only affects the `farBasis` provenance label, not the number.
 */
export function deriveFarRatio(
    residFAR: number | null,
    commFAR: number | null,
    facilFAR: number | null,
): { farRatio: number | null; farBasis: NycFarBasis | null } {
    const candidates: Array<{ v: number; b: NycFarBasis }> = [];
    if (commFAR !== null) candidates.push({ v: commFAR, b: 'comm' });
    if (residFAR !== null) candidates.push({ v: residFAR, b: 'resid' });
    if (facilFAR !== null) candidates.push({ v: facilFAR, b: 'facil' });
    if (candidates.length === 0) return { farRatio: null, farBasis: null };
    let best = candidates[0]!;
    for (const c of candidates) if (c.v > best.v) best = c;
    return { farRatio: best.v, farBasis: best.b };
}

export const NYC_FAR_CITATION =
    'NYC Zoning Resolution (ResidFAR/CommFAR/FacilFAR via NYC MapPLUTO, DCP allowable-FAR attribute — not a PRYZM re-derivation)';

/**
 * Case-insensitive attribute read: ArcGIS uses `BBL`/`ResidFAR`, Socrata uses `bbl`/`residfar`. Builds
 * a lower-cased key index once, so a single reader serves either upstream. Returns the raw value.
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
        const outer = g.rings[0];
        return coordsToPairs(outer);
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
 * Parse ONE MapPLUTO feature (ArcGIS `{ attributes, geometry }` OR a Socrata row with `the_geom` +
 * flat fields) into a `NycPlutoParcel`, or a typed refusal. Pure + byte-deterministic. Exported so a
 * unit test can pin the parse (BBL + FAR + geometry) in isolation from the network.
 */
export function parseMapPlutoFeature(feature: unknown): NycPlutoResolution {
    if (!feature || typeof feature !== 'object') return { ok: false, reason: 'no-lot' };
    const f = feature as Record<string, unknown>;

    // Attributes: ArcGIS nests them under `attributes`; Socrata is flat (the row itself).
    const attributes =
        (f.attributes && typeof f.attributes === 'object' ? (f.attributes as Record<string, unknown>) : f);
    // Geometry: ArcGIS under `geometry`; Socrata under `the_geom`.
    const geometry = f.geometry ?? attributes.the_geom ?? (f as Record<string, unknown>).the_geom;

    const bbl = toStr(attr(attributes, 'BBL', 'bbl'));
    if (!bbl) return { ok: false, reason: 'no-bbl' };

    const pairs = parseRing(geometry);
    if (!pairs) return { ok: false, reason: 'degenerate-geometry' };
    if (looksLikeStatePlane(pairs)) return { ok: false, reason: 'crs-unprojected' };
    // Distinct-vertex count for a usable ring (a closing duplicate does not count).
    const distinct = new Set(pairs.map(([lon, lat]) => `${lon},${lat}`)).size;
    if (distinct < 3) return { ok: false, reason: 'degenerate-geometry' };
    const ring: NycLatLon[] = pairs.map(([lon, lat]) => ({ lat, lon }));

    const boroughCode = toStr(attr(attributes, 'Borough', 'borough'));
    const borough = boroughFromBbl(bbl, boroughCode);

    const lotAreaSqFt = toPositiveNum(attr(attributes, 'LotArea', 'lotarea'));
    const lotAreaM2 = lotAreaSqFt !== null ? lotAreaSqFt * SQFT_TO_M2 : 0;

    const numFloors = toPositiveNum(attr(attributes, 'NumFloors', 'numfloors'));
    const bldgHeightM = readBldgHeightM(attributes);

    const residFAR = toPositiveNum(attr(attributes, 'ResidFAR', 'residfar'));
    const commFAR = toPositiveNum(attr(attributes, 'CommFAR', 'commfar'));
    const facilFAR = toPositiveNum(attr(attributes, 'FacilFAR', 'facilfar'));
    const { farRatio, farBasis } = deriveFarRatio(residFAR, commFAR, facilFAR);

    const zoning: NycPlutoZoning = {
        zoneDist1: toStr(attr(attributes, 'ZoneDist1', 'zonedist1')),
        zoneDist2: toStr(attr(attributes, 'ZoneDist2', 'zonedist2')),
        zoneDist3: toStr(attr(attributes, 'ZoneDist3', 'zonedist3')),
        zoneDist4: toStr(attr(attributes, 'ZoneDist4', 'zonedist4')),
        overlay1: toStr(attr(attributes, 'Overlay1', 'overlay1')),
        overlay2: toStr(attr(attributes, 'Overlay2', 'overlay2')),
        spDist1: toStr(attr(attributes, 'SPDist1', 'spdist1')),
        spDist2: toStr(attr(attributes, 'SPDist2', 'spdist2')),
        spDist3: toStr(attr(attributes, 'SPDist3', 'spdist3')),
        residFAR,
        commFAR,
        facilFAR,
        maxAllwFAR: toPositiveNum(attr(attributes, 'MaxAllwFAR', 'maxallwfar')),
        builtFAR: toPositiveNum(attr(attributes, 'BuiltFAR', 'builtfar')),
        farRatio,
        farBasis,
        farCitation: NYC_FAR_CITATION,
    };

    // Confidence HIGH: a real BBL + a valid point-in-lot ring is the MapPLUTO strong case (C57 §2.1).
    const parcel: NycPlutoParcel = {
        ring,
        bbl,
        borough,
        lotAreaM2,
        lotAreaSqFt,
        numFloors,
        bldgHeightM,
        zoning,
        confidence: 'high',
        source: 'nyc-mappluto',
    };
    return { ok: true, parcel };
}

/** Height in metres from `HeightRoof`/`BldgHeight` (MapPLUTO ft) or `heightroof` (Socrata), else null. */
function readBldgHeightM(attributes: Record<string, unknown>): number | null {
    const ft = toPositiveNum(attr(attributes, 'HeightRoof', 'heightroof', 'BldgHeight', 'bldgheight'));
    return ft !== null ? ft * 0.3048 : null;
}

/**
 * Pick the governing feature from an ArcGIS FeatureServer query response (`{ features: [...] }`) or a
 * Socrata array (`[ row, … ]`) and parse it. A point-in-lot query returns exactly one lot; if several
 * come back (a boundary click), the FIRST is taken. Pure. Exported for testing the response shape.
 */
export function parseMapPlutoResponse(json: unknown): NycPlutoResolution {
    if (Array.isArray(json)) {
        return json.length === 0 ? { ok: false, reason: 'no-lot' } : parseMapPlutoFeature(json[0]);
    }
    if (json && typeof json === 'object') {
        const j = json as Record<string, unknown>;
        if (Array.isArray(j.features)) {
            return j.features.length === 0 ? { ok: false, reason: 'no-lot' } : parseMapPlutoFeature(j.features[0]);
        }
        // A consolidated proxy shape `{ parcel: <feature> }` or a bare single feature.
        if (j.parcel !== undefined) return parseMapPlutoFeature(j.parcel);
        return parseMapPlutoFeature(j);
    }
    return { ok: false, reason: 'no-lot' };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — never throws
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the real NYC tax lot at a WGS84 point via the same-origin MapPLUTO proxy. Returns a typed
 * OK/refusal union and NEVER throws — every miss/unreachable/malformed body is a refusal, so the editor
 * falls to the OSM footprint. Confidence is `high` on a BBL + point-in-lot ring. OTel span (P8).
 */
export async function fetchParcelAtPoint(
    point: NycLatLon | null | undefined,
    deps: NycPlutoDeps = {},
): Promise<NycPlutoResolution> {
    const span = tracer.startSpan('pryzm.parcel.nycPluto');
    span.setAttribute('pryzm.parcel.provider', 'nyc-mappluto');
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
        if (!isInNYC(point.lat, point.lon)) {
            span.setAttribute('pryzm.parcel.result', 'out-of-nyc');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-nyc' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('pryzm.parcel.result', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? NYC_MAPPLUTO_PARCEL_PATH;
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
            console.warn('[nyc-pluto] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const parsed = parseMapPlutoResponse(json);
        if (parsed.ok) {
            span.setAttribute('pryzm.parcel.result', 'ok');
            span.setAttribute('pryzm.parcel.bbl', parsed.parcel.bbl);
            span.setAttribute('pryzm.parcel.zoneDist1', parsed.parcel.zoning.zoneDist1 ?? '');
            span.setAttribute('pryzm.parcel.farRatio', parsed.parcel.zoning.farRatio ?? -1);
        } else {
            span.setAttribute('pryzm.parcel.result', parsed.reason);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return parsed;
    } catch (err) {
        // Defensive: best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[nyc-pluto] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}

/**
 * The provider handle mirroring the sibling cadastral adapters (`id` + `label` + a fetch fn). `kind`
 * is `'cadastral'`: MapPLUTO is a real tax-lot fabric, not an OSM footprint.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * ORCHESTRATOR — registry wiring (this module intentionally does NOT edit `parcelProviders/registry.ts`):
 *
 *   // TODO(orchestrator): register isInNYC→nyc-pluto
 *
 *   Add to `PARCEL_JURISDICTIONS` in `registry.ts` (import `isInNYC` from `./nycPlutoParcelProvider.js`),
 *   ordered BEFORE any coarser US/footprint entry:
 *     {
 *       regionCode: 'US-NY-NYC',
 *       countryName: 'United States (New York City)',
 *       providerId: 'nyc-pluto',
 *       label: 'MapPLUTO (NYC · Dept. of Finance + City Planning)',
 *       proxyPath: '/api/parcel/us-nyc',
 *       kind: 'cadastral',
 *       contains: isInNYC,
 *       note: 'NYC DCP MapPLUTO lot FeatureServer (BBL) — tax-lot polygon + ZoneDist1 + ResidFAR/CommFAR/FacilFAR + LotArea, keyless. // PROBE: verify the ArcGIS FeatureServer path live before prod (Socrata 64uk-42ks probed 2026-07-24).',
 *     }
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
export const nycPlutoParcelProvider = {
    id: 'nyc-pluto',
    label: 'MapPLUTO (NYC · Dept. of Finance + City Planning)',
    kind: 'cadastral' as const,
    isInNYC,
    fetchParcelAtPoint,
};
