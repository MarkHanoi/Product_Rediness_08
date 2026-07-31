// PORTUGAL (Continente) — `fetchParcelAtPoint`: the DGT **Cadastro Predial** (Carta Cadastral Digital /
// SNIC) parcel-routing provider. Phase-4 (pt) — wires Portugal's national cadastral-parcel geometry so
// the PARCEL + DATA-SOURCES axes go from `not-assessed` to `measured` for mainland Portugal, behind
// `isInPortugal`. Mirrors the landed IT (`agenziaEntrateParcelProvider`) / BE (`flandersGrbParcelProvider`)
// / GB (`gbOsInspireParcelProvider`) pattern EXACTLY: package-local `CadastralParcel`, injectable
// `fetchImpl`, a typed refusal union, never-throws, one OTel span, a same-origin `/api/parcel/pt` proxy,
// and a CRS guard (EPSG:3763 projected metres → refuse, never fabricate lat/lon).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROBE RESULT — VERIFIED-LIVE 2026-07-31 (this is a real live probe, not CONVERGENT-SECONDARY)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The founder-supplied inventory (`pt/PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md`) reported the DGT platform
// as CONVERGENT-SECONDARY. This provider was written AFTER a direct live probe (2026-07-31) that pins the
// real endpoints — and corrects one inventory assumption:
//
//   • The **DGT OGC API platform** (`https://ogcapi.dgterritorio.gov.pt/`) is LIVE and serves CAOP
//     (`municipios`, `freguesias` — the DICOFRE routing analogue, join key attribute `dtmnfr`), COS, and
//     30 cm orthophotos, storageCrs **EPSG:3763**, WGS84/4326 offered. BUT it carries **NO parcel
//     collection** — Cadastro Predial is NOT on the OGC API (inventory over-scoped it there).
//   • **Cadastro Predial (Continente)** parcels are on a SEPARATE INSPIRE WFS — the SNIC GeoServer
//     `https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows`, typeName **`inspire:cadastralparcel`**,
//     **licence CC BY 4.0** (declared on the WFS GetCapabilities itself), 1,789,404 features nationally.
//     A `GetFeature` with `srsName=EPSG:4326&outputFormat=application/json` RETURNS GeoJSON in real WGS84
//     degrees (`[-7.5534, 39.6713]`) — so the server-side reprojection seam works (the DK/BE/NL/NO seam),
//     and this pure module needs no hand-rolled projection. The DescribeFeatureType schema confirms the
//     attributes used below: `inspireid` (e.g. `PT.DGT.CP.AAA001318684`), `nationalcadastralreference`,
//     `label` (the NIC, e.g. `AAA 001 318 684`), `areavalue` (m²), `administrativeunit` (município code,
//     e.g. `051102`).
//
// ⚠ PROXY NOT YET WIRED server-side (like IT `/api/parcel/it` / BE `/api/parcel/be-vlg`): until `server/*`
// forwards `/api/parcel/pt` to the SNIC WFS (with `srsName=EPSG:4326`), `fetchParcelAtPoint` refuses
// `endpoint-unreachable` and the registry falls to the OSM footprint — graceful, never a crash, never a
// guess. `buildDgtCadastralWfsUrl` documents the exact upstream request the proxy must issue.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PORTUGAL HONESTY INVARIANT — read before changing ANYTHING in this file
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Cadastro Predial is a REAL survey-grade cadastre (unlike the UK general-boundary index), so `high`
// confidence IS earned on a point-in-parcel fact. BUT its **national coverage is INCOMPLETE**: the Carta
// Cadastral is **mainland (Continente) only** (Açores + Madeira run their own cadastres — Madeira on
// `geoservices.madeira.gov.pt`), and it is built out **per-município** (CGPR/SiNErGIC), so many municípios
// — and parts of the Lisbon/Porto urban cores — have **no published parcel yet** (README §2.1 standing #1
// blocker). CONSEQUENCE, ENCODED HERE AND NON-NEGOTIABLE:
//   1. NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure /
//      out-of-Portugal point resolves to a TYPED REFUSAL, so the registry falls to the OSM footprint.
//   2. COVERAGE IS HONEST, NEVER FABRICATED. A click in an UNMAPPED área returns `no-parcel-here` (the
//      WFS's own zero-result), NOT a fabricated ring. "no cadastre published here" and "no parcel here"
//      are the same honest value — we never invent a parcel to paper over a coverage gap. Every resolved
//      parcel carries the cited `PT_COVERAGE_CAVEAT` so the L5 card can never overstate national coverage.
//   3. GEOMETRY-ONLY. Cadastro Predial publishes the parcel BOUNDARY + NIC + área — NO ownership, NO
//      buildable (FAR / cércea / índice) data. Those live in the (per-PDM, OCR-gated) rule packs, never
//      here — the same caveat Spain's Catastro carries.
//   4. NO FABRICATED COORDINATES. The WFS DefaultCRS is **EPSG:3763** (PT-TM06 / ETRS89 — easting/northing
//      in metres, ~10^5–10^6). The proxy requests WGS84 so features arrive lon/lat. If a body ever arrives
//      in native projected 3763 the parse REFUSES `crs-unhandled` rather than emit hand-rolled (and
//      therefore wrong) lat/lon. We do NOT reproject 3763→WGS84 in this pure module.
//
// LAYERING (C57 §1.9 / CSP): the fetch through the same-origin proxy `/api/parcel/pt` is the ONE impure
// seam — NEVER browser → snicws.dgterritorio.gov.pt directly (CSP `connect-src`), exactly as the EU
// cadastre providers call `/api/parcel/{fr,nl,no,de-nrw}`. `parseDgtCadastralFeatures` is PURE +
// deterministic and is what the fixture test exercises. Injectable `fetchImpl`. OTel span
// `pryzm.parcel.fetchParcelAtPoint` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInPortugal→dgt-cadastro-predial in `parcelProviders/registry.ts`
//   (single-writer; this provider does NOT edit it). Ready-to-paste row + import in the Phase-4 report and
//   in pt/RATE-IMPLEMENTATION-PLAN.md (PARCEL axis → wired-pending-probe). Also relocate PORTUGAL_BBOX /
//   isInPortugal into countryBbox.ts for parity with the other predicates, or import from here.
//
// Strategic context — pt/RATE-IMPLEMENTATION-PLAN.md §Phase-A · pt/PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md ·
// pt/NEXT.md §3.1 (cadastral-regime coverage, the #1 blocker) · C57 (parcel) · C63 (the 7-axis scorecard:
// this makes PARCEL + DATA-SOURCES assessable for mainland Portugal, coverage-bounded).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PUBLIC CONSTANTS — the WFS knowledge + the same-origin proxy route (probed 2026-07-31)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Stable provider / provenance id — the registry's `providerId` for the DGT Cadastro Predial source. */
export const DGT_PARCEL_PROVIDER_ID = 'dgt-cadastro-predial';

/** The same-origin proxy route the browser calls (never snicws.dgterritorio.gov.pt directly — C57 CSP). */
export const DGT_PARCEL_PATH = '/api/parcel/pt';

/**
 * The DGT SNIC (Sistema Nacional de Informação Cadastral) INSPIRE GeoServer the proxy forwards to.
 * VERIFIED-LIVE 2026-07-31 (WFS 2.0.0 GetCapabilities returned `inspire:cadastralparcel`, CC BY 4.0).
 */
export const DGT_CADASTRO_WFS_ENDPOINT =
    'https://snicws.dgterritorio.gov.pt/geoserver/inspire/ows';

/** The Cadastro Predial feature type (WFS 2.0 `typeNames`). VERIFIED-LIVE 2026-07-31. */
export const DGT_CADASTRO_TYPENAME = 'inspire:cadastralparcel';

/** WFS version (INSPIRE download service). */
export const DGT_WFS_VERSION = '2.0.0';

/** The WFS's native (default) CRS — PT-TM06 / ETRS89, easting/northing in metres. The proxy reprojects it. */
export const DGT_NATIVE_CRS = 'EPSG:3763';

/**
 * The CRS the proxy asks the SNIC WFS to reproject the response into, so features arrive as WGS84 lon/lat
 * and this pure module needs no hand-rolled projection. PROBED 2026-07-31: `srsName=EPSG:4326` returns
 * real degrees even though the GetCapabilities lists only 3763 in its formal CRS list (GeoServer honours
 * the reprojection). If a future server build stops honouring it, the parse refuses `crs-unhandled`.
 */
export const DGT_REQUEST_CRS = 'EPSG:4326';

/** Half-size (metres) of the point-BBOX the proxy queries around a click. ~40 m covers a parcel. */
export const PT_PARCEL_QUERY_BUFFER_M = 40;

/**
 * The mandatory coverage caveat, cited, carried verbatim on every resolved parcel. Encodes the Portugal
 * honesty invariant (property 2): the cadastre is real + survey-grade BUT nationally INCOMPLETE.
 */
export const PT_COVERAGE_CAVEAT =
    'DGT Cadastro Predial (Continente), CC BY 4.0 — a real survey-grade cadastre, but national coverage ' +
    'is INCOMPLETE: mainland-only (Açores/Madeira run their own cadastres) and built out per-município ' +
    '(CGPR/SiNErGIC); many municípios and parts of the Lisbon/Porto urban cores have no published parcel ' +
    'yet. A click in an unmapped area returns an honest no-parcel-here refusal, never a fabricated ring. ' +
    'Geometry-only: carries NO ownership, FAR, or height.';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// JURISDICTION PREDICATE — `isInPortugal` (mainland/Continente extent the Cadastro Predial WFS serves)
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface PtBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/**
 * Portugal Continental (mainland) — the extent the DGT Cadastro Predial WFS serves. Taken from the WFS's
 * own declared WGS84 bounding box (probed 2026-07-31: lon −9.671..−6.039, lat 36.934..42.176), rounded
 * out slightly. Coarse proximity gate ONLY — like every parcel bbox it decides WHICH cadastre proxy to
 * try first, never an authorisation; the WFS's own null-result is the real "no parcel here" answer.
 * ⚠ MAINLAND ONLY: Açores (~37–40°N / 25–31°W) and Madeira (~32–33°N / 16–17°W) are DELIBERATELY excluded
 * — they run their own cadastres, so a click there is not misrouted to a WFS that does not serve it.
 */
export const PORTUGAL_BBOX: PtBbox = { minLat: 36.9, maxLat: 42.2, minLon: -9.6, maxLon: -6.1 };

/** True when a WGS84 point falls inside the coarse mainland-Portugal bbox. Pure; never throws. */
export function isInPortugal(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return (
        lat >= PORTUGAL_BBOX.minLat &&
        lat <= PORTUGAL_BBOX.maxLat &&
        lon >= PORTUGAL_BBOX.minLon &&
        lon <= PORTUGAL_BBOX.maxLon
    );
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PARCEL MODEL — normalised to a WGS84 lat/lon ring, coverage-honest
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Fact-based match tier. `high` requires the query point to fall inside the returned parcel AND a NIC —
 *  never derived from an invented numeric cutoff. Cadastro Predial IS a real cadastre, so `high` is earned. */
export type DgtParcelMatchTier = 'high' | 'medium' | 'low';

/** Whether `areaM2` came from the WFS `areavalue` attribute or was shoelace-derived (C57 §2.1 honesty). */
export type DgtParcelAreaSource = 'registry-declared' | 'derived-from-ring';

/** A resolved mainland-Portugal cadastral parcel — GEOMETRY + identity only (no envelope). */
export interface CadastralParcel {
    /** The parcel boundary as a WGS84 lat/lon ring (outer ring; closing vertex may be dropped). */
    readonly ring: ReadonlyArray<LatLon>;
    /** The Número de Identificação de Cadastro (NIC) — the prédio identifier (e.g. `AAA001318684`), or null. */
    readonly nic: string | null;
    /** The INSPIRE localId (`PT.DGT.CP.<NIC>`) — the join key back to the SNIC cadastre. */
    readonly inspireId: string;
    /** The município (administrativeunit) code the WFS publishes, when present, else null (DICOFRE-style). */
    readonly municipality: string | null;
    /** Parcel area in m² — from the WFS `areavalue` when published, else shoelace-derived (see `areaSource`). */
    readonly areaM2: number;
    /** Whether `areaM2` came from the registry attribute or was derived from the ring (honesty). */
    readonly areaSource: DgtParcelAreaSource;
    /** Provenance tag — always the provider id. */
    readonly source: string;
    /** The cited national-coverage caveat (verbatim `PT_COVERAGE_CAVEAT`). */
    readonly caveat: string;
    /** Fact-based confidence: `high` when the click is inside the parcel AND a NIC resolved. */
    readonly confidence: DgtParcelMatchTier;
}

/** Why a Portugal parcel resolution refused. Closed vocabulary — operationally distinct (mirrors BE/GB). */
export type DgtParcelRefusalReason =
    /** The point is outside the loose mainland-Portugal bbox — nothing to query. */
    | 'out-of-portugal'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless / bad-JSON response. */
    | 'endpoint-unreachable'
    /** The WFS returned zero parcels at the point (no cadastre published here — an honest coverage gap). */
    | 'no-parcel-here'
    /** A body came back in native EPSG:3763 (not the requested WGS84) — refuse, never fabricate lat/lon. */
    | 'crs-unhandled'
    /** A body was returned but no feature with an INSPIRE id + a ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type DgtParcelResolution =
    | { readonly ok: true; readonly parcel: CadastralParcel }
    | { readonly ok: false; readonly reason: DgtParcelRefusalReason };

/** Injectable dependencies so the provider is unit-testable without the network (mirrors `GbInspireDeps`). */
export interface DgtParcelDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `DGT_PARCEL_PATH`). */
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
 *  Deterministic; adequate for a parcel-scale sanity area when the WFS `areavalue` attribute is absent. */
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
        twice += a.lon * mPerDegLon * (b.lat * mPerDegLat) - b.lon * mPerDegLon * (a.lat * mPerDegLat);
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
 * Parse a GeoJSON coordinate ring (`[[lon, lat], ...]`) into a validated LatLon[] (drops bad vertices).
 * Guards against a native-EPSG:3763 body: PT-TM06 easting/northing are ~10^5–10^6, so any |x|>180 signals
 * the response was NOT reprojected to WGS84 → returns null (the caller refuses `crs-unhandled` rather than
 * emit projected metres as if they were degrees).
 */
export function parseGeoJsonRing(raw: unknown): LatLon[] | null {
    if (!Array.isArray(raw)) return [];
    const ring: LatLon[] = [];
    for (const pair of raw) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = toFiniteNum(pair[0]);
        const lat = toFiniteNum(pair[1]);
        if (lon === null || lat === null) continue;
        // WGS84 sanity: a projected (3763) coordinate lands far outside degree bounds → CRS not handled.
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
        ring.push({ lat, lon });
    }
    return ring;
}

/** A parsed Cadastro Predial feature — identity + ring, before point-in-polygon disposition. */
export interface DgtCadastralFeature {
    readonly ring: LatLon[];
    readonly inspireId: string | null;
    readonly nic: string | null;
    readonly municipality: string | null;
    readonly areaM2Attr: number | null;
    /** True when a geometry object was present but its ring came back in a non-WGS84 CRS. */
    readonly crsUnhandled: boolean;
}

/** Read a property case-insensitively from a GeoJSON feature `properties` bag (GeoServer emits lowercase). */
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

/** Strip whitespace from a NIC so `AAA 001 318 684` and `AAA001318684` compare equal (label vs reference). */
function normaliseNic(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).replace(/\s+/g, '');
    return s.length > 0 ? s : null;
}

/**
 * Parse a DGT `inspire:cadastralparcel` WFS `GetFeature` GeoJSON response into its features. PURE +
 * deterministic — no I/O, no guess. Returns one entry per polygon (0, 1, or many — the resolver decides
 * disposition). Tolerant of the SNIC GeoServer property names probed 2026-07-31 (`inspireid`,
 * `nationalcadastralreference`, `label`, `areavalue`, `administrativeunit`) read case-insensitively.
 * Exported so the parse is unit-testable in isolation from `fetch` (mirrors `parseInspirePolygonFeatures`).
 */
export function parseDgtCadastralFeatures(json: unknown): DgtCadastralFeature[] {
    if (!json || typeof json !== 'object') return [];
    const features = (json as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];
    const out: DgtCadastralFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { id?: unknown; properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        const idRaw =
            prop(props, 'inspireid', 'inspireId', 'INSPIREID') ??
            (typeof feat.id === 'string' || typeof feat.id === 'number' ? feat.id : undefined);
        const inspireId = idRaw === undefined ? null : String(idRaw).length > 0 ? String(idRaw) : null;

        // NIC — the prédio identifier. Prefer nationalcadastralreference / label; else derive from a
        // GENUINE INSPIRE localId of the form `PT.DGT.CP.<NIC>` (a bare numeric feature id is NOT a NIC).
        const cpTail = inspireId ? (/\.CP\.([^.\s]+)$/i.exec(inspireId)?.[1] ?? null) : null;
        const nic = normaliseNic(prop(props, 'nationalcadastralreference', 'label')) ?? normaliseNic(cpTail);

        const muniRaw = prop(props, 'administrativeunit', 'municipio', 'dicofre', 'dtmnfr');
        const municipality =
            muniRaw === undefined ? null : String(muniRaw).length > 0 ? String(muniRaw) : null;

        const areaM2Attr = toFiniteNum(prop(props, 'areavalue', 'area', 'shape_area'));

        out.push({ ring, inspireId, nic, municipality, areaM2Attr, crsUnhandled });
    }
    return out;
}

/** True when a parsed feature is usable: an INSPIRE id AND a ≥3-vertex ring. */
function hasUsableParcel(f: DgtCadastralFeature): boolean {
    return f.inspireId !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// WFS REQUEST BUILDER — documents the exact upstream GetFeature the proxy forwards / a probe hits
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the DGT SNIC WFS 2.0 `GetFeature` URL for the parcels intersecting a small BBOX around a WGS84
 * point. This is the request the SERVER PROXY must issue (browser CSP forbids calling snicws directly);
 * exported so the proxy and a live probe share one source of truth. `srsName=EPSG:4326` asks the WFS to
 * reproject from its native 3763 (probed working 2026-07-31); BBOX axis order is `minLat,minLon,maxLat,
 * maxLon,EPSG:4326`. `outputFormat=application/json` asks for GeoJSON.
 */
export function buildDgtCadastralWfsUrl(lat: number, lon: number): string {
    const dLat = PT_PARCEL_QUERY_BUFFER_M / 110540;
    const dLon = PT_PARCEL_QUERY_BUFFER_M / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
    const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon},urn:ogc:def:crs:EPSG::4326`;
    const q = new URLSearchParams({
        service: 'WFS',
        version: DGT_WFS_VERSION,
        request: 'GetFeature',
        typeNames: DGT_CADASTRO_TYPENAME,
        srsName: 'urn:ogc:def:crs:EPSG::4326',
        outputFormat: 'application/json',
        count: '20',
        bbox,
    });
    return `${DGT_CADASTRO_WFS_ENDPOINT}?${q.toString()}`;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the parcel at a WGS84 point (never throws)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the mainland-Portugal cadastral parcel at a WGS84 point from DGT Cadastro Predial (through the
 * same-origin `/api/parcel/pt` proxy, which forwards a point query to the SNIC WFS with `srsName=EPSG:4326`
 * and returns WGS84 GeoJSON). NEVER throws — every failure is a typed refusal (see the header honesty
 * properties). GEOMETRY-ONLY + COVERAGE-HONEST: returns the boundary + NIC + município + área, with the
 * cited coverage caveat; NEVER an envelope, NEVER a fabricated ring for an unmapped área.
 *
 * @param lat EPSG:4326 latitude of the map click.
 * @param lon EPSG:4326 longitude of the map click.
 */
export async function fetchParcelAtPoint(
    lat: number,
    lon: number,
    deps: DgtParcelDeps = {},
): Promise<DgtParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
    span.setAttribute('pryzm.parcel.provider', DGT_PARCEL_PROVIDER_ID);
    try {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInPortugal(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-portugal');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-portugal' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? DGT_PARCEL_PATH;
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
            console.warn('[pt-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const features = parseDgtCadastralFeatures(json);
        if (features.length === 0) {
            span.setAttribute('resultFields', 'no-parcel-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-parcel-here' };
        }
        // A geometry came back but in native 3763 (not the requested WGS84) — refuse, never fabricate.
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
        // HIGH only when the click falls inside the parcel AND a NIC resolved (categorical facts, not a
        // cutoff). Inside-but-no-NIC → medium; nearest/miss → low. Cadastro Predial is a real cadastre, so
        // `high` IS earned here (contrast the UK general-boundary provider, which caps at medium).
        const confidence: DgtParcelMatchTier =
            inside && chosen.nic !== null ? 'high' : inside ? 'medium' : 'low';
        const parcel: CadastralParcel = {
            ring: chosen.ring,
            nic: chosen.nic,
            inspireId: chosen.inspireId!,
            municipality: chosen.municipality,
            areaM2,
            areaSource: areaFromAttr !== null ? 'registry-declared' : 'derived-from-ring',
            source: DGT_PARCEL_PROVIDER_ID,
            caveat: PT_COVERAGE_CAVEAT,
            confidence,
        };
        span.setAttribute('resultFields', 'parcel');
        span.setAttribute('pryzm.parcel.inspireId', parcel.inspireId);
        span.setAttribute('pryzm.parcel.nic', parcel.nic ?? 'n/a');
        span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
        span.setAttribute('pryzm.parcel.confidence', parcel.confidence);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, parcel };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[pt-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}
