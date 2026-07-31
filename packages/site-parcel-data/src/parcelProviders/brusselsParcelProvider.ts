// BELGIUM / BRUSSELS-CAPITAL — `resolveBrusselsParcel`: the Brussels (UrbIS / CIRB) cadastral parcel
// resolver. Phase-4 (be) — completes the BE regional split by wiring the Brussels-Capital Region's
// cadastral redistribution so Belgium's PARCEL + DATA-SOURCES axes go from `not-assessed` to
// `measured` for Brussels (Flanders already landed as `flandersGrbParcelProvider.ts`; Wallonia lands
// alongside this as `walloniaParcelProvider.ts`).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Belgian cadastre is FEDERAL — AGDP/SPF Finances maintains one national parcel dataset
// (CadGIS/CADMAP) carrying the federal cadastral key `CAPAKEY` (CaPaKey). It stays the parcel-GEOMETRY
// authority (VERIFIED LIVE 2026-07-24). Brussels-Capital republishes it — combined with the region's
// own building + address layers — as the OFFICIAL UrbIS **"Parcels and buildings"** product (federal
// CadGIS parcels + Paradigm buildings + BeSt addresses in ONE product), run by CIRB / paradigm.brussels.
// That combined product is downloadable/queryable across SEVERAL official surfaces (see the multi-surface
// resilience note on `BRUSSELS_CADASTRE_WFS_ENDPOINT` below), so a Brussels map click can resolve a REAL
// cadastral parcel, exactly as a Barcelona click resolves a Catastro one.
//
// ⚠ ARCHITECTURE — SYNC-FIRST, LIVE-WFS-FALLBACK (founder research 2026-07-31). Do NOT hard-depend on
// the bot-blocked `gis.urban.brussels` GeoServer WFS. The proxy behind `/api/parcel/be-bru` should
// serve from a NIGHTLY-SYNCED UrbIS "Parcels and buildings" GeoPackage → PostGIS, with a live WFS query
// as FALLBACK ONLY. This pure module is agnostic to which surface the proxy used — it only parses the
// GeoJSON the proxy returns — but the provenance/PROBE notes document the sync-first design so the
// orchestrator wires the proxy correctly (a bot-blocked live endpoint must never be the sole path).
//
// ⚠ SCOPE — BRUSSELS ONLY (honesty). This routes behind `isInBrussels`, NOT `isInBelgium`. Flanders
// (GRB `Adp`) and Wallonia (SPW / WALONMAP) are DIFFERENT redistribution portals of the same federal
// cadastre — separate providers. TODO(orchestrator): a later unifying `isInBelgium` dispatcher will
// front Flanders + Wallonia + Brussels (and ultimately the federal CADMAP WFS directly, the single
// cross-region efficiency — `RATE-IMPLEMENTATION-PLAN.md §Phase A`); do NOT conflate the region-split
// providers with that federal win. ⚠ The Brussels-Capital Region is an ENCLAVE inside Flemish Brabant,
// so its bbox sits WITHIN the coarse Flanders bbox: a Brussels click may reach the Flanders GRB WFS,
// which returns no `Adp` feature there → the registry self-corrects. The orchestrator's `isInBelgium`
// dispatcher must order Brussels BEFORE Flanders (tightest-enclave-first) to avoid that wasted round
// trip — noted here so the single-writer registry edit gets the ordering right.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure
//      returns a typed REFUSAL (mirrors `resolveFlandersParcel` / `resolveChZone`), so the L5 map
//      shows an honest "no parcel here" and never a fabricated ring.
//   2. GEOMETRY-ONLY. The cadastre is a GEOMETRY product — it carries no ownership, no FAR, no height.
//      This resolver returns the boundary + CaPaKey + commune + area and NOTHING about the buildable
//      envelope. Brussels' envelope is a separate, per-region SOURCING problem (RATE-plan Phase C) — the
//      BE honesty caveat. Its buildable DEPTH is a confirmed RRU Titre I Art. 4 resolver (≤¾ parcel depth
//      + neighbour rule); its HEIGHT is CONTEXTUAL (no per-zone table; the widely-cited `H = P + 3 + D`
//      is UNCONFIRMED from the official text — do NOT encode it) and instead geometry-DERIVED from the
//      UrbIS-3D CityGML product. See `be/be-bru/bru-brussels/LEGISLATION-RATE.md`. None of that lives here.
//   3. NO FABRICATED COORDINATES. The Belgian cadastre is native EPSG:31370 (Belgian Lambert 1972).
//      The proxy requests WGS84 (`srsName=EPSG:4326`) so features arrive as lon/lat — the SAME
//      server-side reprojection seam the DK (EPSG:25832) / NL / NO / FR / Flanders providers use. If a
//      body ever arrives in native 31370 the parse REFUSES `crs-unhandled` rather than emit hand-rolled
//      (and therefore wrong) lat/lon.
//
// LAYERING (C58 §1.9): the fetch (through the C57 same-origin proxy `/api/parcel/be-bru`, never
// browser→geoservices directly under CSP — and `gis.urban.brussels` is bot-blocked on direct fetch from
// non-Belgian IPs besides, `findings/ §B.1`) is the ONE impure seam; `parseBrusselsCadastreFeatures` is
// PURE and deterministic and is what the fixture test exercises. Injectable `fetchImpl`. OTel span
// `pryzm.parcel.resolveBrusselsParcel` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInBrussels→brussels-cadastre in `parcelProviders/registry.ts`
//   (single-writer), ordered BEFORE the Flanders row (Brussels is enclaved in Flanders). The exact
//   PARCEL_JURISDICTIONS entry + import line are in the Phase-4 report and in
//   `be/RATE-IMPLEMENTATION-PLAN.md` (Parcel axis → wired-pending-probe).
//
// Strategic context — docs/04-reference/jurisdictions/be/RATE-IMPLEMENTATION-PLAN.md (§Phase A),
// be/findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md (§A.1, §A.6, §B.1),
// be/be-bru/21004-brussels/sources/SOURCES.md, C58 §1.2/§1.4/§1.5/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

/** Stable provider / provenance id — the registry's `providerId` for the Brussels (UrbIS/CIRB) cadastre. */
export const BRUSSELS_CADASTRE_PROVIDER_ID = 'brussels-cadastre';

/**
 * The same-origin proxy route the browser calls (never geoservices-urbis.irisnet.be /
 * gis.urban.brussels directly — C57 CSP, and the Brussels GeoServer is bot-blocked from non-Belgian IPs
 * on direct fetch besides). `-be-bru` NOT `-be`: a future FEDERAL CADMAP/CadGIS provider (all-region,
 * `isInBelgium`) would own `/api/parcel/be`, so the Brussels provider takes the region-suffixed path to
 * avoid colliding with it (alongside `/api/parcel/be-vlg` (Flanders) + `/api/parcel/be-wal` (Wallonia)).
 */
export const BRUSSELS_CADASTRE_PARCEL_PATH = '/api/parcel/be-bru';

/**
 * The upstream Brussels (UrbIS "Parcels and buildings") cadastral surface the proxy resolves a point
 * query against. ⚠ MULTI-SURFACE RESILIENCE (founder research 2026-07-31): the proxy should prefer a
 * SYNCED copy of the official combined product and use a live WFS only as fallback. In priority order:
 *   1. ⭐ Datastore Brussels downloadable GeoPackage/SHP — `datastore.brussels` "Parcels and buildings"
 *      (the canonical combined product: CadGIS parcels + Paradigm buildings + BeSt addresses). SYNC this
 *      nightly → PostGIS and serve parcel point-queries from it (the primary path).
 *   2. ⭐ `data.gov.be` federal open-data mirror of the same product (redundant download surface).
 *   3. OGC API Features at `data.mobility.brussels` (live queryable surface).
 *   4. Opendatasoft REST at `opendata.brussels.be` (live queryable surface).
 *   5. UrbIS / Urban GeoServer WFS = LAST-RESORT FALLBACK ONLY — `geoservices-urbis.irisnet.be` (UrbIS,
 *      WMS confirmed `findings/ §A.6`) / `gis.urban.brussels/geoserver`. The latter is BOT-BLOCKED on
 *      direct fetch from non-Belgian IPs, which is exactly why it must never be the sole path.
 * PROBE: confirm the datastore.brussels GeoPackage layer/field names + the OGC API Features collection
 * id live before prod; the proxy owns the exact surface + base URL and the sync cadence.
 */
export const BRUSSELS_CADASTRE_WFS_ENDPOINT =
    'https://datastore.brussels/'; // PROBE: sync-first — datastore.brussels "Parcels and buildings" GPKG (⭐ primary); WFS is fallback

/**
 * The Brussels cadastral-parcel layer within the UrbIS "Parcels and buildings" combined product. That
 * product's parcel feature carries a stable `INSPIRE_ID`, the federal parcel link `CAPA_ID` / `CAPAKEY`
 * (so a parcel↔building join needs NO spatial join), and a block id `BL_ID` (block → neighbour
 * discovery, which the future RRU Titre I Art. 4 depth resolver needs to find adjacent footprints).
 * PROBE: confirm the exact GeoPackage layer / WFS typeName + the `CAPA_ID` vs `CAPAKEY` field naming
 * live via the datastore.brussels product schema / GetCapabilities before prod.
 */
export const BRUSSELS_CADASTRE_LAYER = 'UrbAdm:Cadastral_parcel'; // PROBE: confirm UrbIS layer/typeName live

/** The Belgian cadastre's native projected CRS (Belgian Lambert 1972). The proxy reprojects it. */
export const BRUSSELS_NATIVE_CRS = 'EPSG:31370';

/**
 * The CRS the proxy asks the WFS to reproject the response into, so features arrive as WGS84 lon/lat
 * and this pure module needs no hand-rolled projection (the DK/NL/NO/FR/Flanders reprojection seam).
 * PROBE: confirm the UrbIS GeoServer honours `srsName=EPSG:4326` for the cadastral layer live; if it
 * only serves native 31370 the PROXY must proj4-reproject (as `dkMatrikelProxy` does for 25832).
 */
export const BRUSSELS_REQUEST_CRS = 'EPSG:4326';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ROUTING PREDICATE — the Brussels-Capital Region bbox (national analogue of the zoning city predicates)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface BrusselsBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * The Brussels-Capital Region (Région de Bruxelles-Capitale) extent UrbIS serves — the 19-commune
 * enclave. Coarse proximity gate ONLY — like every parcel bbox it decides WHICH cadastre proxy to try
 * first, never an authorisation. West ≈ 4.24°E (Anderlecht) · East ≈ 4.48°E (Woluwe) · South ≈ 50.76°N
 * (Uccle / forêt de Soignes edge) · North ≈ 50.92°N (Neder-Over-Heembeek). ⚠ This box sits ENTIRELY
 * INSIDE the coarse Flanders bbox (the region is enclaved in Flemish Brabant), so the orchestrator's
 * `isInBelgium` dispatcher must test `isInBrussels` BEFORE `isInFlanders` (tightest-enclave-first). A
 * click that nonetheless reaches the Flanders GRB WFS returns no `Adp` feature → the registry
 * self-corrects to the footprint (the documented coarse-router tradeoff).
 */
export const BRUSSELS_BBOX: BrusselsBbox = {
    minLat: 50.76,
    maxLat: 50.92,
    minLon: 4.24,
    maxLon: 4.48,
};

/** True when a WGS84 point falls inside the coarse Brussels-Capital bbox. Pure; never throws. */
export function isInBrussels(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= BRUSSELS_BBOX.minLat &&
        lat <= BRUSSELS_BBOX.maxLat &&
        lon >= BRUSSELS_BBOX.minLon &&
        lon <= BRUSSELS_BBOX.maxLon
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
export type BrusselsParcelMatchTier = 'high' | 'medium' | 'low';

/** A resolved Brussels cadastral parcel — GEOMETRY + identity only (no envelope). */
export interface BrusselsParcel {
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
    readonly confidence: BrusselsParcelMatchTier;
}

/** Why a Brussels parcel resolution refused. Closed vocabulary — operationally distinct. */
export type BrusselsParcelRefusalReason =
    /** The point is outside the loose Brussels bbox — nothing to query. */
    | 'out-of-brussels'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /** The WFS returned zero cadastral polygons at the point (no parcel published here). */
    | 'no-parcel-here'
    /** A body came back in native EPSG:31370 (not the requested WGS84) — refuse, never fabricate lat/lon. */
    | 'crs-unhandled'
    /** A body was returned but no cadastral feature with a CaPaKey + ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type BrusselsParcelResolution =
    | { readonly ok: true; readonly parcel: BrusselsParcel }
    | { readonly ok: false; readonly reason: BrusselsParcelRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors `FlandersParcelDeps`). */
export interface BrusselsParcelDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `BRUSSELS_CADASTRE_PARCEL_PATH`). */
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

/** A parsed Brussels cadastral feature — the identity fields the CP/UrbIS layer publishes plus its ring. */
export interface BrusselsCadastreFeature {
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
 * Parse a Brussels cadastral WFS `GetFeature` GeoJSON response into its features. PURE + deterministic —
 * no I/O, no guess. Returns one entry per polygon the WFS returned (0, 1, or many — the resolver decides
 * disposition). Tolerant of the INSPIRE CP / UrbIS property names (`CAPAKEY`,
 * `nationalCadastralReference`, commune code). Exported so the parse is unit-testable in isolation from
 * `fetch`.
 */
export function parseBrusselsCadastreFeatures(json: unknown): BrusselsCadastreFeature[] {
    if (!json || typeof json !== 'object') return [];
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const out: BrusselsCadastreFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        // Federal CaPaKey — UrbIS "Parcels and buildings" carries it as `CAPA_ID`/`CAPAKEY`; also the
        // INSPIRE `nationalCadastralReference` alias on the CADMAP CP variant.
        const capakeyRaw = prop(props, 'CAPAKEY', 'capakey', 'capaKey', 'CAPA_ID', 'capa_id', 'nationalCadastralReference');
        const capakey = typeof capakeyRaw === 'string' && capakeyRaw.length > 0 ? capakeyRaw : null;
        // Commune identity — CADMAP/UrbIS publish the NIS/INS code (or a commune name on some variants).
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
function hasUsableParcel(f: BrusselsCadastreFeature): boolean {
    return f.capakey !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the parcel at a WGS84 point
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Brussels cadastral parcel at a WGS84 point from the UrbIS / CIRB cadastral WFS (through
 * the same-origin `/api/parcel/be-bru` proxy, which forwards a point `GetFeature` with
 * `srsName=EPSG:4326` and returns GeoJSON). NEVER throws — every failure is a typed refusal (see the
 * header honesty properties). GEOMETRY-ONLY: returns the boundary + CaPaKey + commune + area, never an
 * envelope.
 *
 * @param lat EPSG:4326 latitude of the map click.
 * @param lon EPSG:4326 longitude of the map click.
 */
export async function resolveBrusselsParcel(
    lat: number,
    lon: number,
    deps: BrusselsParcelDeps = {},
): Promise<BrusselsParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.resolveBrusselsParcel');
    span.setAttribute('pryzm.parcel.provider', BRUSSELS_CADASTRE_PROVIDER_ID);
    try {
        if (!isInBrussels(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-brussels');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-brussels' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? BRUSSELS_CADASTRE_PARCEL_PATH;
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
            console.warn('[be-bru-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = parseBrusselsCadastreFeatures(json);
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
        const parcel: BrusselsParcel = {
            ring: chosen.ring,
            capakey: chosen.capakey!,
            communeNis: chosen.communeNis,
            areaM2,
            areaSource: areaFromAttr !== null ? 'cadastre-attribute' : 'derived-from-ring',
            source: BRUSSELS_CADASTRE_PROVIDER_ID,
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
        console.warn('[be-bru-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
