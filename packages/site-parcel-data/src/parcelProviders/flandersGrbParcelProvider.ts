// BELGIUM / FLANDERS — `resolveFlandersParcel`: the GRB (Grootschalig Referentiebestand) parcel
// resolver. Phase-4 (be) — wires the Flemish large-scale reference cadastre so Belgium's PARCEL +
// DATA-SOURCES axes go from `not-assessed` to `measured` for the Flemish Region.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// GRB is Flanders' authoritative large-scale reference base map (Digitaal Vlaanderen / AGIV). Its
// `Adp` layer (ADministratieve Percelen) publishes the ADMINISTRATIVE-PARCEL polygon carrying the
// federal cadastral key `CAPAKEY` (CaPaKey), the municipality NIS code `NISCODE`, and the parcel
// geometry — open data ("Gratis Open Data", no key), so a Flemish map click can resolve a REAL
// cadastral parcel, exactly as a Barcelona click resolves a Catastro parcel.
//
// ⚠ SCOPE — FLANDERS ONLY (honesty). GRB is the *Flemish* reference; Brussels-Capital (CoBAT /
// UrbIS) and Wallonia (CoDT / PICC) are DIFFERENT systems GRB does not cover. So this routes behind
// `isInFlanders`, NOT `isInBelgium`. The federal CADMAP/CadGIS cadastre (the RATE-plan Phase-A
// `isInBelgium` win that serves all three regions) is a SEPARATE, later provider — do not conflate
// the two: a coarse Flanders bbox includes the Brussels enclave, and a Brussels click that reaches
// GRB simply returns no ADP feature → the registry self-corrects to the footprint fallback.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure
//      returns a typed REFUSAL (mirrors `resolveChZone` / `resolveMadridNZ1Ring`), so the L5 map
//      shows an honest "no parcel here" and never a fabricated ring.
//   2. GEOMETRY-ONLY. GRB `Adp` is a cadastral GEOMETRY product — it carries no ownership, no FAR,
//      no height. This resolver returns the boundary + CaPaKey + municipality + area and NOTHING
//      about the buildable envelope (the same caveat Spain's Catastro carries). The envelope is a
//      separate, per-region SOURCING problem (RATE-plan Phase C).
//   3. NO FABRICATED COORDINATES. GRB is native EPSG:31370 (Belgian Lambert 72). The proxy requests
//      WGS84 (`srsName=EPSG:4326`) so features arrive as lon/lat — the SAME server-side reprojection
//      seam the DK (EPSG:25832) / NL / NO / FR providers use. If a body ever arrives in native 31370
//      the parse REFUSES `crs-unhandled` rather than emit hand-rolled (and therefore wrong) lat/lon.
//
// LAYERING (C58 §1.9): the fetch (through the C57 same-origin proxy `/api/parcel/be-vlg`, never
// browser→geoservices directly under CSP — and GRB is robots-blocked on direct fetch besides) is the
// ONE impure seam; `parseGrbAdpResponse` is PURE and deterministic and is what the fixture test
// exercises. Injectable `fetchImpl`. OTel span `pryzm.parcel.resolveFlandersParcel` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInFlanders→flanders-grb in `parcelProviders/registry.ts`
//   (single-writer). The exact PARCEL_JURISDICTIONS entry + import line are in the Phase-4 report and
//   in `be/RATE-IMPLEMENTATION-PLAN.md` (Parcel axis → wired-pending-probe).
//
// Strategic context — docs/04-reference/jurisdictions/be/RATE-IMPLEMENTATION-PLAN.md (§Phase A),
// be/findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md, be/README.md §Flanders, C58 §1.2/§1.4/§1.5/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

/** Stable provider / provenance id — the registry's `providerId` for the Flanders GRB cadastre. */
export const FLANDERS_GRB_PROVIDER_ID = 'flanders-grb';

/**
 * The same-origin proxy route the browser calls (never geoservices.informatievlaanderen.be directly
 * — C57 CSP, and GRB robots-blocks direct fetch besides). `-be-vlg` NOT `-be`: a future FEDERAL
 * CADMAP/CadGIS provider (all-region, `isInBelgium`) would own `/api/parcel/be`, so the Flanders GRB
 * provider takes the region-suffixed path to avoid colliding with it.
 */
export const FLANDERS_GRB_PARCEL_PATH = '/api/parcel/be-vlg';

/**
 * The upstream GRB WFS the proxy forwards a point query to. Documented in `be/README.md §Flanders`
 * and `be/NEXT.md` (confirmed free / "kosteloos", robots-blocked on DIRECT fetch → proxy-only).
 * PROBE: verify live before prod — the modern alias `geo.api.vlaanderen.be/GRB/wfs` may have
 * superseded the `overdrachtdiensten` host; the proxy owns the exact base URL.
 */
export const GRB_WFS_ENDPOINT =
    'https://geoservices.informatievlaanderen.be/overdrachtdiensten/GRB/wfs';

/**
 * The GRB administrative-parcel layer. GRB's ADP (ADministratieve Percelen) feature carries the
 * `CAPAKEY` cadastral key, `NISCODE` municipality code, `OIDN`/`UIDN` object ids, and geometry.
 * PROBE: confirm the exact typeName (`GRB:Adp` vs `Adp` vs `GRB:ADP`) via GetCapabilities live.
 */
export const GRB_ADP_LAYER = 'GRB:Adp';

/** GRB's native projected CRS (Belgian Lambert 1972). The proxy reprojects it to `GRB_REQUEST_CRS`. */
export const GRB_NATIVE_CRS = 'EPSG:31370';

/**
 * The CRS the proxy asks the GRB WFS to reproject the response into, so features arrive as WGS84
 * lon/lat and this pure module needs no hand-rolled projection (the DK/NL/NO/FR server-side
 * reprojection seam). PROBE: confirm the GeoServer honours `srsName=EPSG:4326` for `GRB:Adp` live;
 * if it only serves native 31370 the PROXY must proj4-reproject (as `dkMatrikelProxy` does for 25832).
 */
export const GRB_REQUEST_CRS = 'EPSG:4326';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ROUTING PREDICATE — the Flemish Region bbox (the national analogue of the zoning city predicates)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface FlandersBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * The Flemish Region (Vlaams Gewest) extent GRB serves. Coarse proximity gate ONLY — like every
 * parcel bbox it decides WHICH cadastre proxy to try first, never an authorisation. West ≈ 2.53°E
 * (De Panne / North-Sea coast) · East ≈ 5.95°E (Voeren/Limburg exclave) · South ≈ 50.67°N (Wallonia
 * border) · North ≈ 51.51°N (Netherlands/Zeeland border). ⚠ It necessarily encloses the
 * Brussels-Capital enclave (≈50.83°N, 4.35°E); a Brussels click that reaches GRB returns no ADP
 * feature → the registry self-corrects to the footprint (the documented coarse-router tradeoff).
 */
export const FLANDERS_BBOX: FlandersBbox = {
    minLat: 50.67,
    maxLat: 51.51,
    minLon: 2.53,
    maxLon: 5.95,
};

/** True when a WGS84 point falls inside the coarse Flemish-Region bbox. Pure; never throws. */
export function isInFlanders(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= FLANDERS_BBOX.minLat &&
        lat <= FLANDERS_BBOX.maxLat &&
        lon >= FLANDERS_BBOX.minLon &&
        lon <= FLANDERS_BBOX.maxLon
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PARCEL SHAPE — normalised to a WGS84 lat/lon ring (mirrors the editor `ParcelFeature` shape)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Fact-based match tier (mirrors the editor `ParcelMatchTier`). `high` requires the query point to
 *  fall inside the returned ADP polygon — never derived from an invented numeric cutoff. */
export type FlandersParcelMatchTier = 'high' | 'medium' | 'low';

/** A resolved Flemish administrative parcel — GEOMETRY + identity only (no envelope). */
export interface FlandersParcel {
    /** The parcel boundary as a WGS84 lat/lon ring (outer ring; closing vertex not guaranteed). */
    readonly ring: ReadonlyArray<LatLon>;
    /** The federal cadastral key `CAPAKEY` (CaPaKey) — the parcel identifier that joins to CADMAP. */
    readonly capakey: string;
    /** The municipality NIS/INS code (`NISCODE`), or null when the feature omits it. */
    readonly municipalityNis: string | null;
    /** Parcel area in m² — from the GRB attribute when published, else shoelace-derived from the ring. */
    readonly areaM2: number;
    /** Whether `areaM2` came from a GRB attribute or was derived from the ring (C57 §2.1 honesty). */
    readonly areaSource: 'grb-attribute' | 'derived-from-ring';
    /** Provenance tag — always the provider id. */
    readonly source: string;
    /** Fact-based confidence: `high` when the ADP geometry parsed AND the query point is inside it. */
    readonly confidence: FlandersParcelMatchTier;
}

/** Why a Flanders parcel resolution refused. Closed vocabulary — operationally distinct. */
export type FlandersParcelRefusalReason =
    /** The point is outside the loose Flanders bbox — nothing to query. */
    | 'out-of-flanders'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /** The WFS returned zero ADP polygons at the point (no parcel published here). */
    | 'no-parcel-here'
    /** A body came back in native EPSG:31370 (not the requested WGS84) — refuse, never fabricate lat/lon. */
    | 'crs-unhandled'
    /** A body was returned but no ADP feature with a CaPaKey + ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type FlandersParcelResolution =
    | { readonly ok: true; readonly parcel: FlandersParcel }
    | { readonly ok: false; readonly reason: FlandersParcelRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors `ChZoneDeps`). */
export interface FlandersParcelDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `FLANDERS_GRB_PARCEL_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

function toFiniteNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Shoelace area (m²) of a WGS84 ring via a local equirectangular projection at the ring's centroid
 *  latitude. Deterministic; adequate for a parcel-scale sanity area when the GRB attribute is absent. */
export function ringAreaM2(ring: ReadonlyArray<LatLon>): number {
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

/** Ray-casting point-in-polygon on a WGS84 ring (lon=x, lat=y). Pure; tolerant of an open ring. */
export function pointInRing(lat: number, lon: number, ring: ReadonlyArray<LatLon>): boolean {
    if (ring.length < 3 || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i]!.lat;
        const xi = ring[i]!.lon;
        const yj = ring[j]!.lat;
        const xj = ring[j]!.lon;
        const intersects =
            yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}

/**
 * Parse a GeoJSON coordinate ring (`[[lon, lat], ...]`) into a validated LatLon[] (drops bad
 * vertices). Guards against a native-EPSG:31370 body: Lambert-72 easting/northing are ~10^5–10^6, so
 * any |x|>180 signals the response was NOT reprojected to WGS84 → returns null (the caller refuses
 * `crs-unhandled` rather than emit projected metres as if they were degrees).
 */
export function parseGeoJsonRing(raw: unknown): LatLon[] | null {
    if (!Array.isArray(raw)) return [];
    const ring: LatLon[] = [];
    for (const pair of raw) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = toFiniteNum(pair[0]);
        const lat = toFiniteNum(pair[1]);
        if (lon === null || lat === null) continue;
        // WGS84 sanity: a projected (31370) coordinate lands far outside degree bounds → CRS not handled.
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
        ring.push({ lat, lon });
    }
    return ring;
}

/** A parsed GRB ADP feature — exactly the identity fields the layer publishes plus its ring. */
export interface GrbAdpFeature {
    readonly ring: LatLon[];
    readonly capakey: string | null;
    readonly municipalityNis: string | null;
    readonly areaM2Attr: number | null;
    /** True when a geometry object was present but its ring came back in a non-WGS84 CRS. */
    readonly crsUnhandled: boolean;
}

/** Read a property case-insensitively from a GeoJSON feature `properties` bag (GRB uses UPPERCASE). */
function prop(props: Record<string, unknown> | null | undefined, ...names: string[]): unknown {
    if (!props || typeof props !== 'object') return undefined;
    const lower: Record<string, unknown> = {};
    for (const k of Object.keys(props)) lower[k.toLowerCase()] = props[k];
    for (const n of names) {
        const v = lower[n.toLowerCase()];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

/** Pull the outer ring out of a GeoJSON Polygon / MultiPolygon geometry (first ring of first polygon). */
function outerRingCoords(geometry: unknown): unknown {
    if (!geometry || typeof geometry !== 'object') return null;
    const g = geometry as { type?: unknown; coordinates?: unknown };
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) return g.coordinates[0];
    if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
        const first = g.coordinates[0];
        return Array.isArray(first) ? first[0] : null;
    }
    return null;
}

/**
 * Parse a GRB `Adp` WFS `GetFeature` GeoJSON response into its ADP features. PURE + deterministic —
 * no I/O, no guess. Returns one entry per polygon the WFS returned (0, 1, or many — the resolver
 * decides disposition). Tolerant of GRB's UPPERCASE property names (`CAPAKEY`, `NISCODE`, `OPPERVL`).
 * Exported so the parse is unit-testable in isolation from `fetch` (mirrors `parseChGrundnutzungGml`).
 */
export function parseGrbAdpFeatures(json: unknown): GrbAdpFeature[] {
    if (!json || typeof json !== 'object') return [];
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const out: GrbAdpFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        const capakeyRaw = prop(props, 'CAPAKEY', 'capakey', 'capaKey');
        const capakey = typeof capakeyRaw === 'string' && capakeyRaw.length > 0 ? capakeyRaw : null;
        const nisRaw = prop(props, 'NISCODE', 'niscode', 'nis');
        const municipalityNis =
            nisRaw === undefined ? null : String(nisRaw).length > 0 ? String(nisRaw) : null;
        // GRB publishes a computed area on some ADP variants (`OPPERVL` / `SHAPE.AREA`); optional.
        const areaM2Attr = toFiniteNum(prop(props, 'OPPERVL', 'oppervl', 'SHAPE_Area', 'area'));

        out.push({ ring, capakey, municipalityNis, areaM2Attr, crsUnhandled });
    }
    return out;
}

/** True when a parsed feature is usable: a CaPaKey AND a ≥3-vertex ring. */
function hasUsableParcel(f: GrbAdpFeature): boolean {
    return f.capakey !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the parcel at a WGS84 point
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Flemish administrative parcel at a WGS84 point from the GRB `Adp` layer (through the
 * same-origin `/api/parcel/be-vlg` proxy, which forwards a point `GetFeature` to the GRB WFS with
 * `srsName=EPSG:4326` and returns GeoJSON). NEVER throws — every failure is a typed refusal (see the
 * header honesty properties). GEOMETRY-ONLY: returns the boundary + CaPaKey + municipality + area,
 * never an envelope.
 *
 * @param lat EPSG:4326 latitude of the map click.
 * @param lon EPSG:4326 longitude of the map click.
 */
export async function resolveFlandersParcel(
    lat: number,
    lon: number,
    deps: FlandersParcelDeps = {},
): Promise<FlandersParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.resolveFlandersParcel');
    span.setAttribute('pryzm.parcel.provider', FLANDERS_GRB_PROVIDER_ID);
    try {
        if (!isInFlanders(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-flanders');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-flanders' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? FLANDERS_GRB_PARCEL_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(lat))}` +
            `&lon=${encodeURIComponent(String(lon))}`;

        let json: unknown;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('resultFields', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            json = await res.json();
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[be-vlg-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = parseGrbAdpFeatures(json);
        if (features.length === 0) {
            span.setAttribute('resultFields', 'no-parcel-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-parcel-here' };
        }
        // A geometry came back but in native 31370 (not the requested WGS84) — refuse, never fabricate.
        if (features.some((f) => f.crsUnhandled) && !features.some(hasUsableParcel)) {
            span.setAttribute('resultFields', 'crs-unhandled');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'crs-unhandled' };
        }

        const usable = features.filter(hasUsableParcel);
        if (usable.length === 0) {
            span.setAttribute('resultFields', 'unparsable-response');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'unparsable-response' };
        }

        // Prefer the polygon that actually contains the click (point-in-polygon); else the first usable.
        const containing = usable.find((f) => pointInRing(lat, lon, f.ring));
        const chosen = containing ?? usable[0]!;
        const inside = containing !== undefined;

        const areaFromAttr = chosen.areaM2Attr;
        const areaM2 = areaFromAttr ?? ringAreaM2(chosen.ring);
        const parcel: FlandersParcel = {
            ring: chosen.ring,
            capakey: chosen.capakey!,
            municipalityNis: chosen.municipalityNis,
            areaM2,
            areaSource: areaFromAttr !== null ? 'grb-attribute' : 'derived-from-ring',
            source: FLANDERS_GRB_PROVIDER_ID,
            // HIGH only when the click falls inside the ADP polygon (a categorical fact, not a cutoff).
            confidence: inside ? 'high' : 'medium',
        };
        span.setAttribute('resultFields', 'parcel');
        span.setAttribute('pryzm.parcel.capakey', parcel.capakey);
        span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
        span.setAttribute('pryzm.parcel.confidence', parcel.confidence);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, parcel };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[be-vlg-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
