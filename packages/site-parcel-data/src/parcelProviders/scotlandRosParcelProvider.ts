// UNITED KINGDOM / SCOTLAND — `fetchParcelAtPoint`: the Registers of Scotland (RoS) **Cadastral Map**
// parcel-routing provider. Phase-4 (gb), the SECOND GB jurisdiction after England — wires Scotland's
// registered-ownership polygons so GB's PARCEL + DATA-SOURCES axes go from `not-assessed` to `measured`
// for Scotland (behind `isInScotland`). England already landed as `gbOsInspireParcelProvider.ts`; Wales
// (HM Land Registry Wales) and Northern Ireland (LPS) are the SAME OS-tier ownership pattern, wired later
// behind the gb/JURISDICTIONS atlas (RATE Phase C). This file is a DELIBERATE MIRROR of the England
// exemplar — same honesty cap, same never-throws contract, same CRS guard — differing only in the
// jurisdiction predicate, the RoS identity fields, and the Scotland-specific coverage caveat.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE UK HONESTY INVARIANT — read before changing ANYTHING in this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The Registers of Scotland Cadastral Map is a REGISTRATION INDEX / OWNERSHIP boundary layer recorded
// with GENERAL BOUNDARIES (Land Registration etc. (Scotland) Act 2012 — the cadastral units are plotted
// on the Ordnance Survey base map; the plotted edge shows the *general position* of the title extent, NOT
// a surveyed legal boundary). Despite the word "Cadastral" in its name, it is **NOT a survey-grade
// engineering cadastre** the way France (PCI), Spain (Catastro), Denmark (Matriklen), or Switzerland
// (Amtliche Vermessung) are. The UK — Scotland included — has NO national survey cadastre; by policy,
// not by data defect.
//
// CONSEQUENCE, ENCODED HERE AND NON-NEGOTIABLE (RATE-IMPLEMENTATION-PLAN.md §Phase-C;
// GEOSPATIAL-DATA-INVENTORY.md; JURISDICTIONS/SCOTLAND.md §3):
//   • Every resolved parcel carries `generalBoundary: true` and a cited caveat string.
//   • Confidence is CAPPED AT **MEDIUM**, by construction — it can NEVER be `high`, even when the click
//     falls squarely inside a returned polygon and the local authority resolves. A real cadastre earns
//     `high` on a point-in-parcel fact; a registration general-boundary NEVER does, because the edge is
//     not a surveyed fact to be `high` about. `medium` (inside) vs `low` (nearest/miss) is the only
//     spread. This asymmetry vs the ES/IT/CH providers IS THE POINT.
//   • `SctParcelMatchTier` has NO `high` member — the cap is a COMPILE-TIME invariant, exactly as
//     England's `GbParcelMatchTier`.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// COVERAGE HONESTY — registered land ≠ the whole landscape (the Sasine legacy)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Scotland is mid-migration from the older deeds-based **General Register of Sasines** to the map-based
// **Land Register**. Only land that has been registered in the Land Register has a plotted cadastral-map
// unit; land still recorded only in the Sasine register has NO polygon here. So a click on Sasine-only
// (or wholly unregistered) land returns ZERO features → a `no-parcel-here` refusal → the registry falls
// to the OSM footprint. That is HONEST coverage, not a failure: absence of a RoS polygon is a real
// "not registered on the map here", never a fabricated ring. (Empty and failed are DIFFERENT typed
// values here — `no-parcel-here` vs `endpoint-unreachable` — see the refusal union.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// SCOPE — what this provider is and is NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THIS provider resolves the registered ownership-extent polygon under a click (routing / footprint-
// fallback-plus). It is GEOMETRY + identity ONLY — the RoS Cadastral Map carries no FAR, no height, no
// envelope (Scottish planning is discretionary under NPF4 + Local Development Plans; there is no numeric
// by-right envelope as data — RATE §Phase-D).
//
// The OTHER OS-open layers are CONTEXT, not this parcel provider, wired elsewhere (RATE Phase A):
//   • OS Open Buildings / OS Open Roads / OS Open Greenspace / OS Open Rivers → CONTEXT, NOT this provider.
//   • AddressBase / UPRN → the national property-identifier addressing spine, NOT this provider.
// ⚠ OS MasterMap / OS Highways / OS Building Heights / AddressBase Premium are LICENSED (the
//   redistribution trap) — deliberately NOT used here. Only the OGL-v3 OPEN products + the RoS INSPIRE feed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES (mirror `gbOsInspireParcelProvider` / `resolveFlandersParcel`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure /
//      out-of-Scotland point / Sasine-only click resolves to a TYPED REFUSAL, so the registry falls to
//      the OSM footprint — the L5 map shows an honest "no parcel here", never a fabricated ring, never a
//      crash.
//   2. GENERAL-BOUNDARY-ONLY (the invariant above). No envelope fields, ever. `generalBoundary: true`
//      always. Confidence capped MEDIUM.
//   3. NO FABRICATED COORDINATES. RoS Cadastral Map geometry is native EPSG:27700 (OSGB36 / British
//      National Grid — easting/northing in metres, ~10^5–10^6). The proxy requests WGS84 so features
//      arrive as lon/lat (the DK 25832 / BE 31370 server-side reprojection seam). If a body ever arrives
//      in native projected metres the parse REFUSES `crs-unhandled` rather than emit hand-rolled (and
//      therefore wrong) lat/lon. We do NOT fabricate an OSGB36→WGS84 projection here.
//
// LAYERING (C57 §1.9 / CSP): the fetch through the same-origin proxy `/api/parcel/gb-sct` is the ONE
// impure seam — NEVER browser → RoS / OS directly (CSP `connect-src`). `parseRosCadastralFeatures` is
// PURE + deterministic and is what the fixture test exercises. Injectable `fetchImpl`. OTel span
// `pryzm.parcel.fetchParcelAtPoint` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInScotland→gb-sct-ros in `parcelProviders/registry.ts` (single-writer).
//   Place it AFTER the England (`gb-os-inspire`) row so the Anglo-Scottish border band (54.6–55.9°N, where
//   ENGLAND_BBOX and SCOTLAND_BBOX overlap) routes an English click to HMLR first; a Scottish click north
//   of 55.9°N (Edinburgh 55.95°N) is Scotland-only. The exact PARCEL_JURISDICTIONS row + import line are in
//   the Phase-4 report and in gb/RATE-IMPLEMENTATION-PLAN.md (Scotland PARCEL → wired-pending-probe).
//   Ready-to-paste row:
//
//     {
//         // GB / Scotland — Registers of Scotland Cadastral Map. `kind:'cadastral'` for ROUTING only (it
//         // routes to a proxy); the OWNERSHIP general-boundary honesty + MEDIUM cap live in the parcel
//         // confidence (generalBoundary:true), NOT in this enum — NEVER scored HIGH like ES/IT/CH.
//         regionCode: 'GB-SCT',
//         countryName: 'United Kingdom (Scotland)',
//         providerId: 'gb-sct-ros',
//         label: 'Registers of Scotland Cadastral Map (Scotland · ownership, general boundaries)',
//         proxyPath: '/api/parcel/gb-sct',
//         kind: 'cadastral',
//         contains: isInScotland,
//         note: 'Registers of Scotland Cadastral Map (registered ownership INDEX extents, OGL/RoS terms), EPSG:27700 → WGS84. ⚠ OWNERSHIP with GENERAL BOUNDARIES (Land Registration etc. (Scotland) Act 2012) — NOT a survey cadastre; confidence capped MEDIUM (generalBoundary:true), NEVER survey-grade like FR/ES/DK/CH. Sasine→Land-Register migration incomplete → registered land ≠ whole landscape (a Sasine-only click returns no polygon → footprint). CONVERGENT-SECONDARY: endpoint + redistribution terms NOT live-probed.',
//     },
//   with:  import { isInScotland } from './scotlandRosParcelProvider.js';
//
// Strategic context — gb/RATE-IMPLEMENTATION-PLAN.md §Phase-C · gb/GEOSPATIAL-DATA-INVENTORY.md ·
// gb/JURISDICTIONS/SCOTLAND.md §3 · C57 (parcel) · C63 (the 7-axis scorecard: this makes PARCEL +
// DATA-SOURCES assessable for Scotland — capped MEDIUM by the general-boundary rule).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PUBLIC CONSTANTS — the RoS knowledge + the same-origin proxy route
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Stable provider / provenance id — the registry's `providerId` for the Scotland RoS Cadastral Map source. */
export const GB_SCT_ROS_PROVIDER_ID = 'gb-sct-ros';

/** The same-origin proxy route the browser calls (never RoS / OS directly — C57 CSP). The proxy owns the
 *  exact upstream and the OSGB36→WGS84 reprojection. */
export const GB_SCT_PARCEL_PATH = '/api/parcel/gb-sct';

/**
 * The Registers of Scotland Cadastral Map publication the proxy forwards to. ⚠ PROBE: the exact host +
 * feed shape are documented, NOT live-probed. RoS publishes the Cadastral Map (registered land) via
 * Scotland's INSPIRE / OS-aligned services; the same-origin proxy `/api/parcel/gb-sct` must answer a
 * point query and return WGS84 GeoJSON. LIVE-PROBE BEFORE PROD: confirm the current endpoint + feed shape
 * + that the RoS/OGL terms permit our redistribution (all `CONVERGENT-SECONDARY` today — the endpoint is
 * documented in the atlas, NOT re-probed here). See gb/JURISDICTIONS/SCOTLAND.md §3.
 */
export const ROS_CADASTRAL_MAP_BASE =
    'https://www.ros.gov.uk/data-and-services';

/** The RoS Cadastral-Map / INSPIRE feature type Scotland publishes its registered ownership units as. PROBE. */
export const GB_SCT_ROS_LAYER = 'ros:CadastralParcel';

/** GB (England/Scotland/Wales) native CRS — OSGB36 / British National Grid. The proxy reprojects it. */
export const GB_SCT_NATIVE_CRS = 'EPSG:27700';

/** The CRS the proxy asks upstream to reproject into, so features arrive WGS84 lon/lat (no hand-rolled
 *  projection in this pure module). PROBE: confirm the download / proxy honours WGS84 output. */
export const GB_SCT_REQUEST_CRS = 'EPSG:4326';

/** The mandatory ownership general-boundary caveat, cited, carried verbatim on every resolved parcel. */
export const GB_SCT_GENERAL_BOUNDARY_CAVEAT =
    'Registers of Scotland Cadastral Map — OWNERSHIP recorded with GENERAL boundaries ' +
    '(Land Registration etc. (Scotland) Act 2012). NOT a survey-grade cadastre and NOT a legal parcel ' +
    'edge; the extent shows the general position of the registered title only, and registered land does ' +
    'not cover the whole landscape (Sasine→Land-Register migration incomplete). Confidence capped MEDIUM.';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// JURISDICTION PREDICATE — `isInScotland` (the routing predicate the registry keys on)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SctBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Scotland's extent (the territory RoS + OS serve for Scotland). Coarse proximity gate ONLY — like every
 * parcel bbox it decides WHICH ownership source to try first, never an authorisation. South ≈ 54.6°N (the
 * Mull of Galloway) · North ≈ 60.9°N (Out Stack, Shetland) · West ≈ −8.7°W (St Kilda / Outer Hebrides) ·
 * East ≈ −0.7°W (easternmost Shetland / the Aberdeenshire coast). ⚠ The rectangle overlaps the top of
 * `ENGLAND_BBOX` in the border band (54.6–55.9°N): an English click that reaches the Scotland proxy returns
 * no RoS-Scotland polygon → the registry self-corrects to the footprint (the documented coarse-router
 * tradeoff). Registry ORDER (England before Scotland) makes the border band route to HMLR first; each
 * country's INTERIOR (Edinburgh 55.95°N; Newcastle 54.97°N) routes to its own source. A polygon gate would
 * be needed to trim the border precisely.
 */
export const SCOTLAND_BBOX: SctBbox = {
    minLat: 54.6,
    maxLat: 60.9,
    minLon: -8.7,
    maxLon: -0.7,
};

/** True when a WGS84 point falls inside the coarse Scotland bbox. Pure; never throws. */
export function isInScotland(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= SCOTLAND_BBOX.minLat &&
        lat <= SCOTLAND_BBOX.maxLat &&
        lon >= SCOTLAND_BBOX.minLon &&
        lon <= SCOTLAND_BBOX.maxLon
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PARCEL MODEL — normalised to a WGS84 lat/lon ring, general-boundary-honest
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SctLatLon {
    readonly lat: number;
    readonly lon: number;
}

/**
 * Fact-based match tier — CAPPED AT `medium` by construction (the UK honesty invariant). There is
 * deliberately NO `high` member: a registration general boundary can never earn the survey-grade tier the
 * ES/IT/CH cadastres do. `medium` = the click falls inside the registered ownership polygon; `low` =
 * nearest/miss.
 */
export type SctParcelMatchTier = 'medium' | 'low';

/** Whether `areaM2` came from a RoS attribute or was shoelace-derived from the ring (C57 §2.1). */
export type SctParcelAreaSource = 'ros-attribute' | 'derived-from-ring';

/**
 * A resolved Scotland registered-ownership parcel — GENERAL-BOUNDARY geometry + identity only (no
 * envelope). `generalBoundary` is ALWAYS true and `confidence` is ALWAYS `medium`/`low`, never `high`
 * (the invariant).
 */
export interface SctRosParcel {
    /** The ownership-extent boundary as a WGS84 lat/lon ring (outer ring; closing vertex may be dropped). */
    readonly ring: ReadonlyArray<SctLatLon>;
    /** The RoS cadastral-unit / title identifier (title number / cadastral unit ref) — the join key back
     *  to the Land Register. */
    readonly cadastralUnitId: string;
    /** The local authority the registered unit sits in, when resolvable, else null. */
    readonly localAuthority: string | null;
    /** Ownership-extent area in m² — from a RoS attribute when published, else shoelace-derived. */
    readonly areaM2: number;
    /** Whether `areaM2` came from a RoS attribute or was derived from the ring (honesty). */
    readonly areaSource: SctParcelAreaSource;
    /** Provenance tag — always the provider id. */
    readonly source: string;
    /**
     * ⚠ ALWAYS true — this is an OWNERSHIP general boundary (Land Registration etc. (Scotland) Act 2012),
     * NOT a survey cadastre. The flag exists so the L5 card can never mislabel this extent as a legal /
     * surveyed parcel edge.
     */
    readonly generalBoundary: true;
    /** The cited general-boundary caveat (verbatim `GB_SCT_GENERAL_BOUNDARY_CAVEAT`). */
    readonly caveat: string;
    /** Fact-based confidence — CAPPED MEDIUM: `medium` when the click is inside the polygon, else `low`. */
    readonly confidence: SctParcelMatchTier;
}

/** Why a Scotland parcel resolution refused. Closed vocabulary — operationally distinct (mirrors GB/BE/FR). */
export type SctParcelRefusalReason =
    /** The point is outside the loose Scotland bbox — nothing to query. */
    | 'out-of-scotland'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless / bad-JSON response. */
    | 'endpoint-unreachable'
    /** The upstream returned zero ownership polygons at the point — unregistered / Sasine-only land here. */
    | 'no-parcel-here'
    /** A body came back in native EPSG:27700 (not the requested WGS84) — refuse, never fabricate lat/lon. */
    | 'crs-unhandled'
    /** A body was returned but no feature with a RoS id + a ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type SctParcelResolution =
    | { readonly ok: true; readonly parcel: SctRosParcel }
    | { readonly ok: false; readonly reason: SctParcelRefusalReason };

/** Injectable dependencies so the provider is unit-testable without the network (mirrors `GbInspireDeps`). */
export interface SctRosDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `GB_SCT_PARCEL_PATH`). */
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
 *  Deterministic; adequate for a parcel-scale sanity area when the RoS attribute is absent. */
export function ringAreaM2(ring: ReadonlyArray<SctLatLon>): number {
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
export function pointInRing(lat: number, lon: number, ring: ReadonlyArray<SctLatLon>): boolean {
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
 * Parse a GeoJSON coordinate ring (`[[lon, lat], ...]`) into a validated `SctLatLon[]` (drops bad
 * vertices). Guards against a native-EPSG:27700 body: OSGB36 easting/northing are ~10^5–10^6, so any
 * |x|>180 signals the response was NOT reprojected to WGS84 → returns null (the caller refuses
 * `crs-unhandled` rather than emit projected metres as if they were degrees).
 */
export function parseGeoJsonRing(raw: unknown): SctLatLon[] | null {
    if (!Array.isArray(raw)) return [];
    const ring: SctLatLon[] = [];
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

/** A parsed RoS ownership-extent feature — identity + ring, before point-in-polygon disposition. */
export interface SctRosFeature {
    readonly ring: SctLatLon[];
    readonly cadastralUnitId: string | null;
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
 * Parse a Registers of Scotland Cadastral Map WFS/GeoJSON `GetFeature` response into its ownership-extent
 * features. PURE + deterministic — no I/O, no guess. Returns one entry per polygon (0, 1, or many — the
 * resolver decides disposition). Tolerant of the RoS id living in a title-number / cadastral-unit / gml
 * attribute, and of a local-authority attribute (`localAuthority` / `council` / `LAD` when present).
 * Exported so the parse is unit-testable in isolation from `fetch`.
 *
 * ⚠ PROBE the exact property names before prod: the RoS Cadastral Map field naming for the title number /
 * cadastral-unit reference and the local authority is NOT re-probed here — all read defensively /
 * case-insensitively.
 */
export function parseRosCadastralFeatures(json: unknown): SctRosFeature[] {
    if (!json || typeof json !== 'object') return [];
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const out: SctRosFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { id?: unknown; properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        const idRaw =
            prop(
                props,
                'titleNumber',
                'title_no',
                'TITLE_NO',
                'cadastralUnit',
                'cadastral_unit',
                'INSPIREID',
                'gml_id',
                'fid',
            ) ?? (typeof feat.id === 'string' || typeof feat.id === 'number' ? feat.id : undefined);
        const cadastralUnitId =
            idRaw === undefined ? null : String(idRaw).length > 0 ? String(idRaw) : null;

        const laRaw = prop(props, 'localAuthority', 'council', 'LAD', 'lad', 'administrativeUnit', 'lpa');
        const localAuthority =
            laRaw === undefined ? null : String(laRaw).length > 0 ? String(laRaw) : null;

        const areaM2Attr = toFiniteNum(prop(props, 'areaValue', 'AREA', 'area', 'SHAPE_Area', 'shape_area'));

        out.push({ ring, cadastralUnitId, localAuthority, areaM2Attr, crsUnhandled });
    }
    return out;
}

/** True when a parsed feature is usable: a RoS id AND a ≥3-vertex ring. */
function hasUsableParcel(f: SctRosFeature): boolean {
    return f.cadastralUnitId !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the ownership-extent parcel at a WGS84 point (never throws)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Scotland registered-ownership parcel at a WGS84 point from the RoS Cadastral Map (through
 * the same-origin `/api/parcel/gb-sct` proxy, which forwards a point query and returns WGS84 GeoJSON).
 * NEVER throws — every failure is a typed refusal (see the header honesty properties). GENERAL-BOUNDARY-
 * ONLY: returns the ownership extent + cadastral-unit id + local authority + area, `generalBoundary:true`,
 * confidence capped MEDIUM — NEVER an envelope, NEVER `high`.
 *
 * @param point WGS84 `{ lat, lon }` of the map click.
 */
export async function fetchParcelAtPoint(
    point: SctLatLon,
    deps: SctRosDeps = {},
): Promise<SctParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
    span.setAttribute('pryzm.parcel.provider', GB_SCT_ROS_PROVIDER_ID);
    try {
        const lat = point?.lat;
        const lon = point?.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInScotland(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-scotland');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-scotland' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? GB_SCT_PARCEL_PATH;
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
            console.warn('[gb-sct-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = parseRosCadastralFeatures(json);
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
        const parcel: SctRosParcel = {
            ring: chosen.ring,
            cadastralUnitId: chosen.cadastralUnitId!,
            localAuthority: chosen.localAuthority,
            areaM2,
            areaSource: areaFromAttr !== null ? 'ros-attribute' : 'derived-from-ring',
            source: GB_SCT_ROS_PROVIDER_ID,
            // THE INVARIANT — always an ownership general boundary; confidence capped MEDIUM, never HIGH.
            generalBoundary: true,
            caveat: GB_SCT_GENERAL_BOUNDARY_CAVEAT,
            confidence: inside ? 'medium' : 'low',
        };
        span.setAttribute('resultFields', 'parcel');
        span.setAttribute('pryzm.parcel.cadastralUnitId', parcel.cadastralUnitId);
        span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
        span.setAttribute('pryzm.parcel.confidence', parcel.confidence);
        span.setAttribute('pryzm.parcel.generalBoundary', true);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, parcel };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[gb-sct-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
