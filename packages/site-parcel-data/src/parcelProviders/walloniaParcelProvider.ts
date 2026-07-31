// BELGIUM / WALLONIA — `resolveWalloniaParcel`: the Wallonia (SPW / WALONMAP) cadastral parcel
// resolver. Phase-4 (be) — completes the BE regional split by wiring the Walloon Region's cadastral
// redistribution so Belgium's PARCEL + DATA-SOURCES axes go from `not-assessed` to `measured` for
// Wallonia (Flanders already landed as `flandersGrbParcelProvider.ts`; Brussels lands alongside this
// as `brusselsParcelProvider.ts`).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Belgian cadastre is FEDERAL — AGDP/SPF Finances maintains one national parcel dataset
// (CadGIS/CADMAP) carrying the federal cadastral key `CAPAKEY` (CaPaKey). Each Region re-serves that
// same federal parcel geometry through its OWN geoportal (a redistribution relationship, not a
// competing dataset — `findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §A.1.D`). Wallonia's public
// portal is **WALONMAP** / the SPW Géoportail de Wallonie (`geoservices.wallonie.be`), whose cadastral
// WFS publishes the parcel polygon + `CAPAKEY` + the commune (NIS/INS) — free, keyless ("Accès libre
// et gratuit au service pour tout public", verified on the SPW zoning WFS 2026-07-24), so a Walloon
// map click can resolve a REAL cadastral parcel, exactly as a Barcelona click resolves a Catastro one.
//
// ⚠ SCOPE — WALLONIA ONLY (honesty). This routes behind `isInWallonia`, NOT `isInBelgium`. Flanders
// (GRB `Adp`) and Brussels-Capital (UrbIS/CIRB) are DIFFERENT redistribution portals of the same
// federal cadastre — separate providers. TODO(orchestrator): a later unifying `isInBelgium` dispatcher
// will front Flanders + Wallonia + Brussels (and ultimately the federal CADMAP WFS directly, the
// single cross-region efficiency — `RATE-IMPLEMENTATION-PLAN.md §Phase A`); do NOT conflate the
// region-split providers with that federal win. A coarse Wallonia bbox does not enclose the Brussels
// enclave (Brussels is enclaved in Flemish Brabant, north of the Walloon border), and a click that
// reaches the wrong regional WFS simply returns no feature → the registry self-corrects to footprint.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure
//      returns a typed REFUSAL (mirrors `resolveFlandersParcel` / `resolveChZone`), so the L5 map
//      shows an honest "no parcel here" and never a fabricated ring.
//   2. GEOMETRY-ONLY. The cadastre is a GEOMETRY product — it carries no ownership, no FAR, no height.
//      This resolver returns the boundary + CaPaKey + commune + area and NOTHING about the buildable
//      envelope. Wallonia's envelope is a separate, per-region SOURCING problem (RATE-plan Phase C),
//      and is uniquely discretionary here — plan de secteur (1977–1987) carries only broad affectation
//      and *bon aménagement des lieux* (CoDT Art. D.IV.13) is load-bearing (BE honesty caveat).
//   3. NO FABRICATED COORDINATES. The Belgian cadastre is native EPSG:31370 (Belgian Lambert 1972).
//      The proxy requests WGS84 (`srsName=EPSG:4326`) so features arrive as lon/lat — the SAME
//      server-side reprojection seam the DK (EPSG:25832) / NL / NO / FR / Flanders providers use. If a
//      body ever arrives in native 31370 the parse REFUSES `crs-unhandled` rather than emit hand-rolled
//      (and therefore wrong) lat/lon.
//
// LAYERING (C58 §1.9): the fetch (through the C57 same-origin proxy `/api/parcel/be-wal`, never
// browser→geoservices directly under CSP) is the ONE impure seam; `parseWalloniaCadastreFeatures` is
// PURE and deterministic and is what the fixture test exercises. Injectable `fetchImpl`. OTel span
// `pryzm.parcel.resolveWalloniaParcel` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInWallonia→wallonia-cadastre in `parcelProviders/registry.ts`
//   (single-writer). The exact PARCEL_JURISDICTIONS entry + import line are in the Phase-4 report and
//   in `be/RATE-IMPLEMENTATION-PLAN.md` (Parcel axis → wired-pending-probe).
//
// Strategic context — docs/04-reference/jurisdictions/be/RATE-IMPLEMENTATION-PLAN.md (§Phase A),
// be/findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md (§A.1, §B.3), be/be-wal/lie-liege/sources/SOURCES.md,
// C58 §1.2/§1.4/§1.5/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

/** Stable provider / provenance id — the registry's `providerId` for the Wallonia (WALONMAP) cadastre. */
export const WALLONIA_CADASTRE_PROVIDER_ID = 'wallonia-cadastre';

/**
 * The same-origin proxy route the browser calls (never geoservices.wallonie.be directly — C57 CSP).
 * `-be-wal` NOT `-be`: a future FEDERAL CADMAP/CadGIS provider (all-region, `isInBelgium`) would own
 * `/api/parcel/be`, so the Wallonia provider takes the region-suffixed path to avoid colliding with it
 * (and to sit alongside `/api/parcel/be-vlg` (Flanders) + `/api/parcel/be-bru` (Brussels)).
 */
export const WALLONIA_CADASTRE_PARCEL_PATH = '/api/parcel/be-wal';

/**
 * The upstream Wallonia (SPW / WALONMAP) cadastral WFS the proxy forwards a point query to. The SPW
 * GeoServer host `geoservices.wallonie.be` is confirmed free/keyless on its zoning workspace
 * (`inspire_lu`, VERIFIED LIVE 2026-07-24 — `be-wal/lie-liege/sources/SOURCES.md`).
 * PROBE: the exact cadastral workspace/host is documented-not-live — Wallonia redistributes the
 * federal CADMAP parcels, and the precise WFS base URL (SPW `geoservices.wallonie.be` cadastral
 * workspace vs the federal `ccff02.minfin.fgov.be` INSPIRE CP service) must be confirmed live via
 * GetCapabilities before prod; the proxy owns the exact base URL.
 */
export const WALLONIA_CADASTRE_WFS_ENDPOINT =
    'https://geoservices.wallonie.be/geoserver/wfs'; // PROBE: confirm cadastral workspace live

/**
 * The Wallonia cadastral-parcel layer (the federal CADMAP CP parcel, redistributed by SPW). Carries
 * `CAPAKEY` + commune identity + geometry.
 * PROBE: confirm the exact typeName live via GetCapabilities — the SPW cadastral workspace name and
 * the INSPIRE `CP:CadastralParcel` vs a SPW-local alias are documented-not-live.
 */
export const WALLONIA_CADASTRE_LAYER = 'CP:CadastralParcel'; // PROBE: confirm typeName live

/** The Belgian cadastre's native projected CRS (Belgian Lambert 1972). The proxy reprojects it. */
export const WALLONIA_NATIVE_CRS = 'EPSG:31370';

/**
 * The CRS the proxy asks the WFS to reproject the response into, so features arrive as WGS84 lon/lat
 * and this pure module needs no hand-rolled projection (the DK/NL/NO/FR/Flanders reprojection seam).
 * PROBE: confirm the SPW GeoServer honours `srsName=EPSG:4326` for the cadastral layer live; if it
 * only serves native 31370 the PROXY must proj4-reproject (as `dkMatrikelProxy` does for 25832).
 */
export const WALLONIA_REQUEST_CRS = 'EPSG:4326';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ROUTING PREDICATE — the Walloon Region bbox (the national analogue of the zoning city predicates)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface WalloniaBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * The Walloon Region (Région wallonne) extent WALONMAP serves. Coarse proximity gate ONLY — like every
 * parcel bbox it decides WHICH cadastre proxy to try first, never an authorisation. West ≈ 2.84°E
 * (Rongy / French border) · East ≈ 6.41°E (Eupen / German border, incl. the German-speaking Community)
 * · South ≈ 49.49°N (Torgny / French border, Belgium's southernmost point) · North ≈ 50.85°N
 * (Walloon-Brabant border with Flanders/Brussels). ⚠ It does NOT enclose the Brussels-Capital enclave
 * (≈50.76–50.91°N — enclaved in Flemish Brabant, north of the Walloon border), so the two BE-region
 * boxes barely touch; a click landing in the wrong regional WFS returns no feature → the registry
 * self-corrects to the footprint (the documented coarse-router tradeoff).
 */
export const WALLONIA_BBOX: WalloniaBbox = {
    minLat: 49.49,
    maxLat: 50.85,
    minLon: 2.84,
    maxLon: 6.41,
};

/** True when a WGS84 point falls inside the coarse Walloon-Region bbox. Pure; never throws. */
export function isInWallonia(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= WALLONIA_BBOX.minLat &&
        lat <= WALLONIA_BBOX.maxLat &&
        lon >= WALLONIA_BBOX.minLon &&
        lon <= WALLONIA_BBOX.maxLon
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
 *  fall inside the returned parcel polygon — never derived from an invented numeric cutoff. */
export type WalloniaParcelMatchTier = 'high' | 'medium' | 'low';

/** A resolved Walloon cadastral parcel — GEOMETRY + identity only (no envelope). */
export interface WalloniaParcel {
    /** The parcel boundary as a WGS84 lat/lon ring (outer ring; closing vertex not guaranteed). */
    readonly ring: ReadonlyArray<LatLon>;
    /** The federal cadastral key `CAPAKEY` (CaPaKey) — the parcel identifier that joins to CADMAP. */
    readonly capakey: string;
    /** The commune NIS/INS code (or name where that is all the WFS publishes), or null when absent. */
    readonly communeNis: string | null;
    /** Parcel area in m² — from the cadastral attribute when published, else shoelace-derived from the ring. */
    readonly areaM2: number;
    /** Whether `areaM2` came from a cadastral attribute or was derived from the ring (C57 §2.1 honesty). */
    readonly areaSource: 'cadastre-attribute' | 'derived-from-ring';
    /** Provenance tag — always the provider id. */
    readonly source: string;
    /** Fact-based confidence: `high` when the geometry parsed AND the query point is inside it. */
    readonly confidence: WalloniaParcelMatchTier;
}

/** Why a Wallonia parcel resolution refused. Closed vocabulary — operationally distinct. */
export type WalloniaParcelRefusalReason =
    /** The point is outside the loose Wallonia bbox — nothing to query. */
    | 'out-of-wallonia'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /** The WFS returned zero cadastral polygons at the point (no parcel published here). */
    | 'no-parcel-here'
    /** A body came back in native EPSG:31370 (not the requested WGS84) — refuse, never fabricate lat/lon. */
    | 'crs-unhandled'
    /** A body was returned but no cadastral feature with a CaPaKey + ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type WalloniaParcelResolution =
    | { readonly ok: true; readonly parcel: WalloniaParcel }
    | { readonly ok: false; readonly reason: WalloniaParcelRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors `FlandersParcelDeps`). */
export interface WalloniaParcelDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `WALLONIA_CADASTRE_PARCEL_PATH`). */
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
 *  latitude. Deterministic; adequate for a parcel-scale sanity area when the cadastral attribute is absent. */
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

/** A parsed Wallonia cadastral feature — the identity fields the CP layer publishes plus its ring. */
export interface WalloniaCadastreFeature {
    readonly ring: LatLon[];
    readonly capakey: string | null;
    readonly communeNis: string | null;
    readonly areaM2Attr: number | null;
    /** True when a geometry object was present but its ring came back in a non-WGS84 CRS. */
    readonly crsUnhandled: boolean;
}

/** Read a property case-insensitively from a GeoJSON feature `properties` bag. */
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
 * Parse a Wallonia cadastral WFS `GetFeature` GeoJSON response into its features. PURE + deterministic —
 * no I/O, no guess. Returns one entry per polygon the WFS returned (0, 1, or many — the resolver decides
 * disposition). Tolerant of the INSPIRE CP / SPW property names (`CAPAKEY`, `nationalCadastralReference`,
 * commune code). Exported so the parse is unit-testable in isolation from `fetch`.
 */
export function parseWalloniaCadastreFeatures(json: unknown): WalloniaCadastreFeature[] {
    if (!json || typeof json !== 'object') return [];
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const out: WalloniaCadastreFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        // Federal CaPaKey — also carried as the INSPIRE `nationalCadastralReference`.
        const capakeyRaw = prop(props, 'CAPAKEY', 'capakey', 'capaKey', 'nationalCadastralReference');
        const capakey = typeof capakeyRaw === 'string' && capakeyRaw.length > 0 ? capakeyRaw : null;
        // Commune identity — SPW/CADMAP publish the NIS/INS code (or a commune name on some variants).
        const communeRaw = prop(props, 'NISCODE', 'niscode', 'nis', 'commune', 'COMMUNE', 'municipality');
        const communeNis =
            communeRaw === undefined ? null : String(communeRaw).length > 0 ? String(communeRaw) : null;
        // Optional computed area attribute (`AREA` / `SHAPE_Area` / `oppervlakte`).
        const areaM2Attr = toFiniteNum(prop(props, 'AREA', 'area', 'SHAPE_Area', 'oppervlakte', 'CAPASHAPE'));

        out.push({ ring, capakey, communeNis, areaM2Attr, crsUnhandled });
    }
    return out;
}

/** True when a parsed feature is usable: a CaPaKey AND a ≥3-vertex ring. */
function hasUsableParcel(f: WalloniaCadastreFeature): boolean {
    return f.capakey !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the parcel at a WGS84 point
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Walloon cadastral parcel at a WGS84 point from the SPW / WALONMAP cadastral WFS (through
 * the same-origin `/api/parcel/be-wal` proxy, which forwards a point `GetFeature` with
 * `srsName=EPSG:4326` and returns GeoJSON). NEVER throws — every failure is a typed refusal (see the
 * header honesty properties). GEOMETRY-ONLY: returns the boundary + CaPaKey + commune + area, never an
 * envelope.
 *
 * @param lat EPSG:4326 latitude of the map click.
 * @param lon EPSG:4326 longitude of the map click.
 */
export async function resolveWalloniaParcel(
    lat: number,
    lon: number,
    deps: WalloniaParcelDeps = {},
): Promise<WalloniaParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.resolveWalloniaParcel');
    span.setAttribute('pryzm.parcel.provider', WALLONIA_CADASTRE_PROVIDER_ID);
    try {
        if (!isInWallonia(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-wallonia');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-wallonia' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? WALLONIA_CADASTRE_PARCEL_PATH;
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
            console.warn('[be-wal-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = parseWalloniaCadastreFeatures(json);
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
        const parcel: WalloniaParcel = {
            ring: chosen.ring,
            capakey: chosen.capakey!,
            communeNis: chosen.communeNis,
            areaM2,
            areaSource: areaFromAttr !== null ? 'cadastre-attribute' : 'derived-from-ring',
            source: WALLONIA_CADASTRE_PROVIDER_ID,
            // HIGH only when the click falls inside the parcel polygon (a categorical fact, not a cutoff).
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
        console.warn('[be-wal-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
