// UNITED KINGDOM / ENGLAND — `fetchParcelAtPoint`: the HM Land Registry **INSPIRE Index Polygons**
// parcel-routing provider. Phase-4 (gb) — wires England's ownership-extent polygons so GB's PARCEL +
// DATA-SOURCES axes go from `not-assessed` to `measured` for England (Greater London first), behind
// `isInEngland`. Scotland (Registers of Scotland) / Wales (HMLR-Wales) / Northern Ireland (LPS) are
// the SAME OS-tier ownership pattern, wired later behind the gb/JURISDICTIONS atlas (RATE Phase C).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE UK HONESTY INVARIANT — read before changing ANYTHING in this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HMLR INSPIRE Index Polygons (and the Land Registry title plans behind them) are **OWNERSHIP recorded
// with GENERAL BOUNDARIES** — s.60 Land Registration Act 2002. The red-line edge shows the *general
// position* of the ownership extent, NOT a surveyed legal boundary. They are **NOT a survey-grade
// engineering cadastre** the way France (PCI), Spain (Catastro), Denmark (Matriklen), or Switzerland
// (Amtliche Vermessung) are. The UK has NO national survey cadastre — by policy, not by data defect.
//
// CONSEQUENCE, ENCODED HERE AND NON-NEGOTIABLE (RATE-IMPLEMENTATION-PLAN.md §Phase-C, §3(b);
// GEOSPATIAL-DATA-INVENTORY.md; JURISDICTIONS/ENGLAND.md §3):
//   • Every resolved parcel carries `generalBoundary: true` and a cited caveat string.
//   • Confidence is CAPPED AT **MEDIUM**, by construction — it can NEVER be `high`, even when the click
//     falls squarely inside a returned polygon and the local authority resolves. A real cadastre earns
//     `high` on a point-in-parcel fact; an ownership general-boundary NEVER does, because the edge is
//     not a surveyed fact to be `high` about. `medium` (inside) vs `low` (nearest/miss) is the only
//     spread. This asymmetry vs the ES/IT/CH providers IS THE POINT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// SCOPE — what this provider is and is NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THIS provider resolves the ownership-extent polygon under a click (routing / footprint-fallback-plus).
// It is GEOMETRY + identity ONLY — INSPIRE Index Polygons carry no FAR, no height, no envelope (UK
// planning is discretionary; there is no numeric by-right envelope as data — RATE §Phase-D).
//
// The OTHER OS-open layers are CONTEXT, not this parcel provider, and are wired elsewhere (RATE Phase A):
//   • OS Open Buildings — authoritative national footprints (replace the OSM footprint fallback + feed
//     the Phase-B nDSM height stamp) → CONTEXT / footprint, NOT this provider.
//   • OS Open Roads / OS Open Greenspace / OS Open Rivers → CONTEXT layers, NOT this provider.
//   • AddressBase / UPRN → the national property-identifier addressing spine, NOT this provider.
// ⚠ OS MasterMap / OS Highways / OS Building Heights / AddressBase Premium are LICENSED (the
//   redistribution trap) — deliberately NOT used here. Only the OGL-v3 OPEN products + OGL INSPIRE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES (mirror `resolveFlandersParcel` / `agenziaEntrateParcelProvider`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure /
//      out-of-England point resolves to a TYPED REFUSAL, so the registry falls to the OSM footprint —
//      the L5 map shows an honest "no parcel here", never a fabricated ring, never a crash.
//   2. GENERAL-BOUNDARY-ONLY (the invariant above). No envelope fields, ever. `generalBoundary: true`
//      always. Confidence capped MEDIUM.
//   3. NO FABRICATED COORDINATES. INSPIRE Index Polygons are native EPSG:27700 (OSGB36 / British
//      National Grid — easting/northing in metres, ~10^5–10^6). The proxy requests WGS84 so features
//      arrive as lon/lat (the DK 25832 / BE 31370 / NL / NO server-side reprojection seam). If a body
//      ever arrives in native projected metres the parse REFUSES `crs-unhandled` rather than emit
//      hand-rolled (and therefore wrong) lat/lon. We do NOT fabricate an OSGB36→WGS84 projection here.
//
// LAYERING (C57 §1.9 / CSP): the fetch through the same-origin proxy `/api/parcel/gb` is the ONE impure
// seam — NEVER browser → HMLR/OS directly (CSP `connect-src`, and INSPIRE is a per-LPA ATOM/GML download
// besides). `parseInspirePolygonFeatures` is PURE + deterministic and is what the fixture test exercises.
// Injectable `fetchImpl`. OTel span `pryzm.parcel.fetchParcelAtPoint` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInEngland→gb-os-inspire in `parcelProviders/registry.ts` (single-writer).
//   The exact PARCEL_JURISDICTIONS row + import line are in the Phase-4 report and in
//   gb/RATE-IMPLEMENTATION-PLAN.md (PARCEL axis → wired-pending-probe). Ready-to-paste row:
//
//     {
//         // GB / England — HMLR INSPIRE Index Polygons. `kind:'cadastral'` for ROUTING only (it routes
//         // to a proxy); the OWNERSHIP general-boundary honesty + MEDIUM cap live in the parcel
//         // confidence (generalBoundary:true), NOT in this enum — NEVER scored HIGH like ES/IT/CH.
//         regionCode: 'GB-ENG',
//         countryName: 'United Kingdom (England)',
//         providerId: 'gb-os-inspire',
//         label: 'HM Land Registry INSPIRE (England · ownership, general boundaries)',
//         proxyPath: '/api/parcel/gb',
//         kind: 'cadastral',
//         contains: isInEngland,
//         note: 'HMLR INSPIRE Index Polygons (freehold ownership INDEX extents, OGL v3), EPSG:27700 → WGS84. ⚠ OWNERSHIP with GENERAL BOUNDARIES (s.60 LRA 2002) — NOT a survey cadastre; confidence capped MEDIUM (generalBoundary:true), NEVER survey-grade like FR/ES/DK/CH. Per-LPA ATOM/GML download — proxy must aggregate/serve a point query. CONVERGENT-SECONDARY: endpoint + OGL redistribution NOT live-probed.',
//     },
//   with:  import { isInEngland } from './gbOsInspireParcelProvider.js';
//
// Strategic context — gb/RATE-IMPLEMENTATION-PLAN.md §Phase-C · gb/GEOSPATIAL-DATA-INVENTORY.md (Priority 1) ·
// gb/JURISDICTIONS/ENGLAND.md §3 · C57 (parcel) · C63 (the 7-axis scorecard: this makes PARCEL + DATA-SOURCES
// assessable for England — capped MEDIUM by the general-boundary rule).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PUBLIC CONSTANTS — the INSPIRE knowledge + the same-origin proxy route
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Stable provider / provenance id — the registry's `providerId` for the England HMLR-INSPIRE source. */
export const GB_OS_INSPIRE_PROVIDER_ID = 'gb-os-inspire';

/** The same-origin proxy route the browser calls (never HMLR / OS directly — C57 CSP + INSPIRE is a
 *  per-LPA download besides). The proxy owns the exact upstream and the OSGB36→WGS84 reprojection. */
export const GB_INSPIRE_PARCEL_PATH = '/api/parcel/gb';

/**
 * The HM Land Registry INSPIRE Index Polygons publication the proxy forwards to. ⚠ NOT a single national
 * WFS: INSPIRE Index Polygons are published as **per-LPA ATOM feeds → GML downloads** under OGL v3. The
 * same-origin proxy `/api/parcel/gb` must aggregate these (or a pre-baked national polygon service) and
 * answer a point query, returning WGS84 GeoJSON. LIVE-PROBE BEFORE PROD: confirm the current download
 * host + feed shape + that OGL v3 permits our redistribution (all `CONVERGENT-SECONDARY` today — the
 * endpoint is documented in the atlas, NOT re-probed here). See gb/JURISDICTIONS/ENGLAND.md §3.
 */
export const HMLR_INSPIRE_DOWNLOAD_BASE =
    'https://use-land-property.service.gov.uk/datasets/inspire';

/** The INSPIRE Cadastral-Parcels-style feature type HMLR publishes its ownership index polygons as. */
export const GB_INSPIRE_LAYER = 'INSPIRE:CadastralParcel';

/** GB (England/Scotland/Wales) native CRS — OSGB36 / British National Grid. The proxy reprojects it. */
export const GB_NATIVE_CRS = 'EPSG:27700';

/** The CRS the proxy asks upstream to reproject into, so features arrive WGS84 lon/lat (no hand-rolled
 *  projection in this pure module). PROBE: confirm the download / proxy honours WGS84 output. */
export const GB_REQUEST_CRS = 'EPSG:4326';

/** The mandatory ownership general-boundary caveat, cited, carried verbatim on every resolved parcel. */
export const GB_GENERAL_BOUNDARY_CAVEAT =
    'HM Land Registry INSPIRE Index Polygon — OWNERSHIP recorded with GENERAL boundaries ' +
    '(s.60 Land Registration Act 2002). NOT a survey-grade cadastre and NOT a legal parcel edge; ' +
    'the extent shows the general position of ownership only. Confidence capped MEDIUM.';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// JURISDICTION PREDICATE — `isInEngland` (the routing predicate the registry keys on)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface GbBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * England's extent (the territory HMLR + OS serve for England; Scotland/Wales/NI route to their own
 * ownership registries later — RoS / HMLR-Wales / LPS). Coarse proximity gate ONLY — like every parcel
 * bbox it decides WHICH ownership source to try first, never an authorisation. West ≈ −6.5°W (Isles of
 * Scilly / Cornwall) · East ≈ 1.9°E (Norfolk/Suffolk coast) · South ≈ 49.8°N (Scilly/Channel coast) ·
 * North ≈ 55.9°N (the Anglo-Scottish border near Berwick / Cheviots). ⚠ The rectangle necessarily
 * clips a sliver of Wales (Cardiff ≈51.48°N/−3.18°W) and the Scottish border; a Welsh/Scottish click
 * that reaches the England proxy returns no HMLR-England polygon → the registry self-corrects to the
 * footprint (the documented coarse-router tradeoff). A polygon gate would be needed to trim precisely.
 */
export const ENGLAND_BBOX: GbBbox = {
    minLat: 49.8,
    maxLat: 55.9,
    minLon: -6.5,
    maxLon: 1.9,
};

/** True when a WGS84 point falls inside the coarse England bbox. Pure; never throws. */
export function isInEngland(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= ENGLAND_BBOX.minLat &&
        lat <= ENGLAND_BBOX.maxLat &&
        lon >= ENGLAND_BBOX.minLon &&
        lon <= ENGLAND_BBOX.maxLon
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PARCEL MODEL — normalised to a WGS84 lat/lon ring, general-boundary-honest
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface GbLatLon {
    readonly lat: number;
    readonly lon: number;
}

/**
 * Fact-based match tier — CAPPED AT `medium` by construction (the UK honesty invariant). There is
 * deliberately NO `high` member: an ownership general boundary can never earn the survey-grade tier the
 * ES/IT/CH cadastres do. `medium` = the click falls inside the ownership polygon; `low` = nearest/miss.
 */
export type GbParcelMatchTier = 'medium' | 'low';

/** Whether `areaM2` came from an INSPIRE attribute or was shoelace-derived from the ring (C57 §2.1). */
export type GbParcelAreaSource = 'inspire-attribute' | 'derived-from-ring';

/**
 * A resolved England ownership-extent parcel — GENERAL-BOUNDARY geometry + identity only (no envelope).
 * `generalBoundary` is ALWAYS true and `confidence` is ALWAYS `medium`/`low`, never `high` (the invariant).
 */
export interface GbInspireParcel {
    /** The ownership-extent boundary as a WGS84 lat/lon ring (outer ring; closing vertex may be dropped). */
    readonly ring: ReadonlyArray<GbLatLon>;
    /** The INSPIRE polygon identifier (`INSPIREID` / gml id) — the join key back to the HMLR index. */
    readonly inspireId: string;
    /** The Local Planning Authority the INSPIRE feed was published for, when resolvable, else null. */
    readonly localAuthority: string | null;
    /** Ownership-extent area in m² — from an INSPIRE attribute when published, else shoelace-derived. */
    readonly areaM2: number;
    /** Whether `areaM2` came from an INSPIRE attribute or was derived from the ring (honesty). */
    readonly areaSource: GbParcelAreaSource;
    /** Provenance tag — always the provider id. */
    readonly source: string;
    /**
     * ⚠ ALWAYS true — this is an OWNERSHIP general boundary (s.60 LRA 2002), NOT a survey cadastre.
     * The flag exists so the L5 card can never mislabel this extent as a legal / surveyed parcel edge.
     */
    readonly generalBoundary: true;
    /** The cited general-boundary caveat (verbatim `GB_GENERAL_BOUNDARY_CAVEAT`). */
    readonly caveat: string;
    /** Fact-based confidence — CAPPED MEDIUM: `medium` when the click is inside the polygon, else `low`. */
    readonly confidence: GbParcelMatchTier;
}

/** Why a GB parcel resolution refused. Closed vocabulary — operationally distinct (mirrors BE/FR/NL). */
export type GbParcelRefusalReason =
    /** The point is outside the loose England bbox — nothing to query. */
    | 'out-of-england'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless / bad-JSON response. */
    | 'endpoint-unreachable'
    /** The upstream returned zero ownership polygons at the point (no INSPIRE extent published here). */
    | 'no-parcel-here'
    /** A body came back in native EPSG:27700 (not the requested WGS84) — refuse, never fabricate lat/lon. */
    | 'crs-unhandled'
    /** A body was returned but no feature with an INSPIRE id + a ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type GbParcelResolution =
    | { readonly ok: true; readonly parcel: GbInspireParcel }
    | { readonly ok: false; readonly reason: GbParcelRefusalReason };

/** Injectable dependencies so the provider is unit-testable without the network (mirrors `FlandersParcelDeps`). */
export interface GbInspireDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `GB_INSPIRE_PARCEL_PATH`). */
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

/** Shoelace area (m²) of a WGS84 ring via a local equirectangular projection at the ring's mean latitude.
 *  Deterministic; adequate for a parcel-scale sanity area when the INSPIRE attribute is absent. */
export function ringAreaM2(ring: ReadonlyArray<GbLatLon>): number {
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
        twice += a.lon * mPerDegLon * (b.lat * mPerDegLat) - b.lon * mPerDegLon * (a.lat * mPerDegLat);
    }
    return Math.abs(twice) / 2;
}

/** Ray-casting point-in-polygon on a WGS84 ring (lon=x, lat=y). Pure; tolerant of an open ring. */
export function pointInRing(lat: number, lon: number, ring: ReadonlyArray<GbLatLon>): boolean {
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
 * Parse a GeoJSON coordinate ring (`[[lon, lat], ...]`) into a validated `GbLatLon[]` (drops bad
 * vertices). Guards against a native-EPSG:27700 body: OSGB36 easting/northing are ~10^5–10^6, so any
 * |x|>180 signals the response was NOT reprojected to WGS84 → returns null (the caller refuses
 * `crs-unhandled` rather than emit projected metres as if they were degrees).
 */
export function parseGeoJsonRing(raw: unknown): GbLatLon[] | null {
    if (!Array.isArray(raw)) return [];
    const ring: GbLatLon[] = [];
    for (const pair of raw) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = toFiniteNum(pair[0]);
        const lat = toFiniteNum(pair[1]);
        if (lon === null || lat === null) continue;
        // WGS84 sanity: a projected (27700) coordinate lands far outside degree bounds → CRS not handled.
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
        ring.push({ lat, lon });
    }
    return ring;
}

/** A parsed INSPIRE ownership-extent feature — identity + ring, before point-in-polygon disposition. */
export interface GbInspireFeature {
    readonly ring: GbLatLon[];
    readonly inspireId: string | null;
    readonly localAuthority: string | null;
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
        if (v !== undefined && v !== null && v !== '') return v;
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
 * Parse an HMLR INSPIRE Index Polygons WFS/GeoJSON `GetFeature` response into its ownership-extent
 * features. PURE + deterministic — no I/O, no guess. Returns one entry per polygon (0, 1, or many — the
 * resolver decides disposition). Tolerant of the INSPIRE id living in `INSPIREID` / `inspireId` / the
 * feature-level `id`, and of a local-authority attribute (`lpa` / `localAuthority` / `LAD` when present).
 * Exported so the parse is unit-testable in isolation from `fetch`.
 *
 * ⚠ LIVE-PROBE the exact property names before prod: INSPIRE Index Polygon GML publishes the id as
 * `INSPIREID` (or a `gml:id`); the local authority is NOT always on the feature (the per-LPA download
 * context supplies it) — all read here case-insensitively / defensively.
 */
export function parseInspirePolygonFeatures(json: unknown): GbInspireFeature[] {
    if (!json || typeof json !== 'object') return [];
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const out: GbInspireFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { id?: unknown; properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        const idRaw =
            prop(props, 'INSPIREID', 'inspireId', 'INSPIRE_ID', 'inspireid', 'gml_id', 'fid') ??
            (typeof feat.id === 'string' || typeof feat.id === 'number' ? feat.id : undefined);
        const inspireId = idRaw === undefined ? null : String(idRaw).length > 0 ? String(idRaw) : null;

        const laRaw = prop(props, 'localAuthority', 'lpa', 'LAD', 'lad', 'administrativeUnit', 'council');
        const localAuthority =
            laRaw === undefined ? null : String(laRaw).length > 0 ? String(laRaw) : null;

        const areaM2Attr = toFiniteNum(prop(props, 'areaValue', 'AREA', 'area', 'SHAPE_Area', 'shape_area'));

        out.push({ ring, inspireId, localAuthority, areaM2Attr, crsUnhandled });
    }
    return out;
}

/** True when a parsed feature is usable: an INSPIRE id AND a ≥3-vertex ring. */
function hasUsableParcel(f: GbInspireFeature): boolean {
    return f.inspireId !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the ownership-extent parcel at a WGS84 point (never throws)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the England ownership-extent parcel at a WGS84 point from HMLR INSPIRE Index Polygons (through
 * the same-origin `/api/parcel/gb` proxy, which forwards a point query and returns WGS84 GeoJSON). NEVER
 * throws — every failure is a typed refusal (see the header honesty properties). GENERAL-BOUNDARY-ONLY:
 * returns the ownership extent + INSPIRE id + local authority + area, `generalBoundary:true`, confidence
 * capped MEDIUM — NEVER an envelope, NEVER `high`.
 *
 * @param point WGS84 `{ lat, lon }` of the map click.
 */
export async function fetchParcelAtPoint(
    point: GbLatLon,
    deps: GbInspireDeps = {},
): Promise<GbParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
    span.setAttribute('pryzm.parcel.provider', GB_OS_INSPIRE_PROVIDER_ID);
    try {
        const lat = point?.lat;
        const lon = point?.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInEngland(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-england');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-england' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? GB_INSPIRE_PARCEL_PATH;
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
            console.warn('[gb-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = parseInspirePolygonFeatures(json);
        if (features.length === 0) {
            span.setAttribute('resultFields', 'no-parcel-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-parcel-here' };
        }
        // A geometry came back but in native 27700 (not the requested WGS84) — refuse, never fabricate.
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
        const parcel: GbInspireParcel = {
            ring: chosen.ring,
            inspireId: chosen.inspireId!,
            localAuthority: chosen.localAuthority,
            areaM2,
            areaSource: areaFromAttr !== null ? 'inspire-attribute' : 'derived-from-ring',
            source: GB_OS_INSPIRE_PROVIDER_ID,
            // THE INVARIANT — always an ownership general boundary; confidence capped MEDIUM, never HIGH.
            generalBoundary: true,
            caveat: GB_GENERAL_BOUNDARY_CAVEAT,
            confidence: inside ? 'medium' : 'low',
        };
        span.setAttribute('resultFields', 'parcel');
        span.setAttribute('pryzm.parcel.inspireId', parcel.inspireId);
        span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
        span.setAttribute('pryzm.parcel.confidence', parcel.confidence);
        span.setAttribute('pryzm.parcel.generalBoundary', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, parcel };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[gb-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
