// FINLAND (national) — `mmlParcelProvider`: the Maanmittauslaitos (NLS / National Land Survey of
// Finland) Kiinteistörekisteri cadastral parcel provider on the OGC API Features `kiinteisto-avoin`
// service. Phase-4 (fi) · Phase B of the fi RATE roadmap — wires PARCEL + the DATA-SOURCES
// cadastre-parcel slot for the WHOLE of Finland (mainland; Åland excluded — see property 3).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — "Finland = Denmark-lite, the second fully-automated country"
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The MML Kiinteistörekisteri (cadastral index) is Finland's authoritative national cadastre. Its
// open "simple-features" product (`kiinteisto-avoin/simple-features/v3`) publishes the parcel
// POLYGON (`palsta`) carrying the cadastral identifier `kiinteistötunnus`, the municipality code
// (kuntanumero, the leading 3 digits of the tunnus), and geometry — CC BY 4.0, OGC API Features
// GeoJSON. So a Finnish map click can resolve a REAL cadastral parcel, exactly as a Barcelona click
// resolves a Catastro parcel and a Copenhagen click resolves a Matrikel parcel.
//
// This is the SECOND fully-automated country after Denmark, and the ONLY one whose sole founder
// friction is a SELF-SERVICE key: unlike Denmark's Datafordeler (MitID-gated → indefinitely
// deferred) or Sweden's BankID wall, the MML open-data key is *create-it-yourself online* at
// `omatili.maanmittauslaitos.fi` — no eID, no contract, no email approval. This provider is built
// AHEAD of the founder's key so it is live the instant `MML_API_KEY` is pasted as a repo secret.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// KEY-GATING — self-service, injected SERVER-SIDE by the proxy (read before wiring `server/*`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The MML OGC API requires `MML_API_KEY`, but this provider NEVER sees it: like Denmark's
// `dkMatrikelProxy`, the credential is carried SERVER-SIDE by the same-origin proxy `/api/parcel/fi`,
// which injects it on the upstream hop. The browser calls only the same-origin proxy (C57 CSP forbids
// browser → maanmittauslaitos.fi directly). The AUTH SHAPE the proxy must apply upstream (MML
// documents both; the proxy should prefer HTTP Basic and fall back to the query param):
//
//   • HTTP Basic — username = the API key, password = BLANK. i.e.
//         Authorization: Basic base64("<MML_API_KEY>:")
//     (note the trailing colon — an empty password; this is the documented NLS shape).
//   • OR query param — append `?api-key=<MML_API_KEY>` to the OGC items URL.
//
// If the proxy is NOT yet wired, or `MML_API_KEY` is unset / rejected (401/403), the proxy returns a
// non-OK (or a `{ ok:false }` body) → this provider resolves to a typed refusal → the registry falls
// to the OSM footprint. GRACEFUL — never a crash, never a fabricated parcel, never a footprint
// mislabelled as a legal parcel (C58 §1.4). `buildMmlItemsUrl` documents the exact upstream OGC
// request the proxy must forward (and a keyed live probe can hit directly).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES — read before changing this file (mirror `flandersGrbParcelProvider` /
// `agenziaEntrateParcelProvider`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. IT NEVER THROWS. Every miss / unreachable proxy / unset-or-rejected key / non-OK / malformed
//      body / parse failure / out-of-Finland point returns a typed REFUSAL (not an exception), so the
//      L5 map shows an honest "no parcel here" and the registry falls to the footprint — never a crash.
//   2. GEOMETRY-ONLY. The open "simple" MML product publishes the parcel BOUNDARY + `kiinteistötunnus`
//      + area, and NOTHING about ownership (the Lainhuuto register is a PAID tier — never here) or the
//      buildable envelope (FAR/height live in the Ryhti/kaavatietomalli rule pack — Phase A, never
//      here). This is the SAME caveat Spain's Catastro and Denmark's Matrikel carry. `confidence` is
//      `high` ONLY on the categorical facts: geometry from the cadastre + point-inside-parcel.
//   3. MAINLAND ONLY — ÅLAND EXCLUDED. Åland (Ahvenanmaa) maintains its OWN land registry by statute
//      (README §2.1 caveat 2); its cadastral exposure via the MML API is unconfirmed. `isInFinland`
//      subtracts the Åland box so a click there is NOT misrouted to a cadastre that may not serve it.
//   4. NO FABRICATED COORDINATES. MML is native EPSG:3067 (ETRS-TM35FIN, projected metres). The proxy
//      requests WGS84 (`crs=EPSG:4326`) from the OGC API so features arrive as lon/lat — the SAME
//      server-side reprojection seam DK (25832) / NL / NO / FR / BE (31370) use. If a body ever arrives
//      in native 3067 metres the parse REFUSES `crs-unhandled` rather than emit projected metres as if
//      they were degrees (a hand-rolled TM35FIN→WGS84 would be silently wrong).
//
// LAYERING (C58 §1.9): the fetch (through the same-origin `/api/parcel/fi` proxy) is the ONE impure
// seam; `parseMmlParcelFeatures` is PURE + deterministic and is what the fixture test exercises.
// Injectable `fetchImpl`. OTel span `pryzm.parcel.resolveFinlandParcel` (C58 §1.10 / P8).
//
// TODO(orchestrator): register isInFinland→mml in `parcelProviders/registry.ts` (single-writer). The
//   exact PARCEL_JURISDICTIONS entry + `isInFinland` import line are in the Phase-4 report and in
//   `fi/RATE-IMPLEMENTATION-PLAN.md` (Phase B). This provider does NOT edit the registry / index /
//   server. Ready-to-paste registry row:
//
//     {
//         regionCode: 'FI',
//         countryName: 'Finland',
//         providerId: 'mml',
//         label: 'Kiinteistörekisteri (Finland · Maanmittauslaitos)',
//         proxyPath: '/api/parcel/fi',
//         kind: 'cadastral',
//         contains: isInFinland,           // import { isInFinland } from './mmlParcelProvider.js'
//         note: 'MML kiinteisto-avoin OGC API Features (PalstanSijaintitiedot), EPSG:3067 → WGS84. ' +
//               'KEY-GATED (self-service): needs a free MML_API_KEY (create at omatili.maanmittauslaitos.fi) ' +
//               'carried server-side by the proxy as HTTP Basic (key as username / blank password). ' +
//               'Resolves real Finnish parcels once the key is set; else null → OSM footprint. Åland excluded.',
//     },
//
//   (Place the FI row anywhere before the universal fallback — FINLAND_BBOX does not overlap any
//    existing cadastral box, so ordering is not load-bearing here.)
//
// Strategic context — docs/04-reference/jurisdictions/fi/RATE-IMPLEMENTATION-PLAN.md (Phase B),
// fi/README.md §2.1 (MML cadastre), fi/NEXT.md §3.2 (the key blocker), fi/FOUNDER-BLOCKERS.md (row 1),
// the DK deferred-stub (key-gated shape) + BE/IT providers (canonical pattern), C57/C58 §1.2/§1.4/§1.10.

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PUBLIC CONSTANTS — the OGC API knowledge + the same-origin proxy route
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Stable provider / provenance id — the registry's `providerId` for the MML cadastre. */
export const MML_PARCEL_PROVIDER_ID = 'mml';

/** Human-facing source label for the parcel info card / attribution (CC BY 4.0 © Maanmittauslaitos). */
export const MML_PARCEL_PROVIDER_LABEL = 'Kiinteistörekisteri (Finland · Maanmittauslaitos)';

/**
 * The same-origin proxy route the browser calls (never maanmittauslaitos.fi directly — C57 CSP, and
 * the key must be injected server-side besides). The proxy owns `MML_API_KEY` and the auth shape.
 */
export const MML_PARCEL_PATH = '/api/parcel/fi';

/**
 * The MML open-cadastre OGC API Features base the proxy forwards to. Documented in `fi/README.md §2.1`
 * and `fi/NEXT.md §3.2` (CC BY 4.0; self-service key; nightly refresh by 02:00; available 24/7).
 * ⚠ LIVE-PROBE BEFORE PROD: the exact collection id + field names are `stated`, not yet GetFeatures-
 * verified (no key obtained yet — NEXT §3.2); the proxy owns the exact base URL and auth.
 */
export const MML_OGC_FEATURES_BASE =
    'https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3';

/**
 * The OGC API Features collection carrying the parcel POLYGON. In the MML cadastral model the physical
 * parcel piece is the `palsta`; `PalstanSijaintitiedot` is its location (geometry) collection.
 * ⚠ LIVE-PROBE: confirm the exact collection id via `GET {base}/collections` once the key is obtained
 * (NEXT §3.2) — candidates are `PalstanSijaintitiedot` (parcel polygon) vs. `RekisteriyksikonTietopiste`
 * (register-unit info point, tunnus-bearing but not a polygon). The proxy may query both and join.
 */
export const MML_PARCEL_COLLECTION = 'PalstanSijaintitiedot';

/** MML's native projected CRS (ETRS-TM35FIN). The proxy asks the OGC API to reproject to WGS84. */
export const MML_NATIVE_CRS = 'EPSG:3067';

/**
 * The CRS the proxy asks the OGC API to return, so features arrive as WGS84 lon/lat and this pure
 * module needs no hand-rolled TM35FIN projection (the DK/NL/NO/FR/BE server-side reprojection seam).
 * OGC API Features encodes this as a URI: `http://www.opengis.net/def/crs/EPSG/0/4326`.
 * ⚠ LIVE-PROBE: confirm the MML service advertises EPSG:4326 in the collection's `crs` list; if it
 * only serves native 3067 the PROXY must proj4-reproject (as `dkMatrikelProxy` does for 25832).
 */
export const MML_REQUEST_CRS = 'EPSG:4326';

/** Half-size (metres) of the point BBOX the proxy queries around a click. ~40 m covers a parcel. */
export const FI_PARCEL_QUERY_BUFFER_M = 40;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// JURISDICTION PREDICATE — `isInFinland` (Åland excluded), national analogue of the city predicates
// ──────────────────────────────────────────────────────────────────────────────────────────────

interface Bbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

function within(b: Bbox, lat: number, lon: number): boolean {
    return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

/**
 * Finland mainland (the extent the MML national cadastre serves). Coarse rectangle — a proximity gate
 * that only decides WHICH cadastre to try; the OGC API's own empty result is the real "no parcel here"
 * answer. West ≈ 20.5°E · East ≈ 31.6°E (Ilomantsi / Russian border) · South ≈ 59.7°N (Hanko) ·
 * North ≈ 70.1°N (Nuorgam / northernmost point).
 */
export const FINLAND_BBOX: Bbox = { minLat: 59.7, maxLat: 70.1, minLon: 20.5, maxLon: 31.6 };

/**
 * Åland (Ahvenanmaa) — the ONE Finnish territory whose cadastre is NOT (confirmed) the MML API: it runs
 * its OWN statutory land registry (property 3 / README §2.1). Coarse exclusion box (≈19.3–21.0°E,
 * 59.7–60.5°N). A click here is routed away from the mainland cadastre until Åland is confirmed
 * independently (NEXT §3.6). Note the box's east edge (21.0°E) overlaps FINLAND_BBOX's west edge
 * (20.5°E) — the mainland archipelago west of Turku (~21.5°E+) stays included; only the Åland islands
 * proper are excluded (a conscious coarse-router tradeoff, like Italy's AP Bolzano exclusion).
 */
export const ALAND_EXCLUSION: Bbox = { minLat: 59.7, maxLat: 60.5, minLon: 19.3, maxLon: 21.0 };

/**
 * True when a WGS84 point is served by the mainland MML cadastre: inside the Finland box AND outside
 * the Åland own-registry exclusion (property 3). The predicate the registry routes on. Pure; never throws.
 */
export function isInFinland(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (!within(FINLAND_BBOX, lat, lon)) return false;
    if (within(ALAND_EXCLUSION, lat, lon)) return false;
    return true;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE CADASTRAL PARCEL MODEL — package-local (mirrors the IT/DK `CadastralParcel`), WGS84 lat/lon ring
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point. */
export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/** Fact-based match tier — `high` requires the click to fall inside the returned parcel ring; never
 *  derived from an invented numeric cutoff (mirrors the IT/BE providers). */
export type FinlandParcelMatchTier = 'high' | 'medium' | 'low';

/** Whether `areaM2` is the OGC-attribute-declared registry area or shoelace-derived from the ring. */
export type FinlandAreaSource = 'mml-attribute' | 'derived-from-ring';

/** A resolved Finnish cadastral parcel — GEOMETRY + identity only (no ownership, no envelope). */
export interface CadastralParcel {
    /** The parcel boundary as a WGS84 lat/lon ring (outer ring; closing vertex not guaranteed). */
    readonly ring: ReadonlyArray<LatLon>;
    /** The cadastral identifier `kiinteistötunnus` (property-unit id, e.g. `091-021-0001-0001`). */
    readonly kiinteistotunnus: string;
    /** The municipality code (kuntanumero — leading 3-digit token of the tunnus), or null. */
    readonly municipality: string | null;
    /** Parcel area in m² — from the MML attribute when published, else shoelace-derived from the ring. */
    readonly areaM2: number;
    /** Whether `areaM2` came from an MML attribute or was derived from the ring (C57 §2.1 honesty). */
    readonly areaSource: FinlandAreaSource;
    /** Provenance tag — always `mml`. */
    readonly source: string;
    /** Fact-based confidence: `high` when the geometry parsed AND the click is inside the parcel. */
    readonly confidence: FinlandParcelMatchTier;
}

/** Why a Finland parcel resolution refused. Closed vocabulary — operationally distinct (mirrors BE). */
export type FinlandParcelRefusalReason =
    /** The point is outside the loose Finland box (or inside Åland) — nothing to query. */
    | 'out-of-finland'
    /** No `fetch`, the proxy could not be reached, or it returned a non-OK / bodyless response. */
    | 'endpoint-unreachable'
    /**
     * The proxy signalled the MML key is unset or rejected (HTTP 401/403, or a `{ ok:false, reason:
     * 'no-api-key' }` body). Distinct from `endpoint-unreachable` so the "self-service key not yet
     * pasted" state is observable in a trace — the ONE founder-actionable blocker for Finland.
     */
    | 'no-api-key'
    /** The OGC API returned zero parcel polygons at the point (no parcel published here). */
    | 'no-parcel-here'
    /** A body came back in native EPSG:3067 metres (not the requested WGS84) — refuse, never fabricate. */
    | 'crs-unhandled'
    /** A body was returned but no feature with a tunnus + ≥3-vertex ring could be parsed. */
    | 'unparsable-response';

export type FinlandParcelResolution =
    | { readonly ok: true; readonly parcel: CadastralParcel }
    | { readonly ok: false; readonly reason: FinlandParcelRefusalReason };

/** Injectable dependencies so the resolver is unit-testable without the network (mirrors BE/IT). */
export interface MmlParcelDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `MML_PARCEL_PATH`). */
    readonly pathBase?: string;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — parse, point-in-polygon, area (no I/O, deterministic)
// ──────────────────────────────────────────────────────────────────────────────────────────────

function toFiniteNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/**
 * The municipality (kuntanumero) is the leading 3-digit token of the `kiinteistötunnus`
 * (`091-021-0001-0001` → `091`; or the 14-digit compact `09102100010001` → `091`). Extract it when
 * present, else null. ⚠ LIVE-PROBE: confirm the tunnus delivery format from a live GetFeatures — MML
 * may serve the hyphenated or the zero-padded compact form (both handled here).
 */
export function municipalityFromTunnus(tunnus: string | null | undefined): string | null {
    if (!tunnus) return null;
    const s = String(tunnus).trim();
    const hyphen = /^(\d{3})-/.exec(s);
    if (hyphen) return hyphen[1]!;
    const compact = /^(\d{3})\d{4,}/.exec(s);
    if (compact) return compact[1]!;
    return null;
}

/**
 * Parse a GeoJSON coordinate ring (`[[lon, lat], ...]`) into a validated LatLon[] (drops bad vertices).
 * Guards against a native-EPSG:3067 body: ETRS-TM35FIN easting/northing are ~10^5–10^7, so any |x|>180
 * signals the response was NOT reprojected to WGS84 → returns null (the caller refuses `crs-unhandled`
 * rather than emit projected metres as if they were degrees). Mirrors `parseGeoJsonRing` (BE/31370).
 */
export function parseGeoJsonRing(raw: unknown): LatLon[] | null {
    if (!Array.isArray(raw)) return [];
    const ring: LatLon[] = [];
    for (const pair of raw) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const lon = toFiniteNum(pair[0]);
        const lat = toFiniteNum(pair[1]);
        if (lon === null || lat === null) continue;
        // WGS84 sanity: a projected (3067) coordinate lands far outside degree bounds → CRS not handled.
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
        ring.push({ lat, lon });
    }
    return ring;
}

/** Read a property case-insensitively from a GeoJSON feature `properties` bag (MML field casing varies). */
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

/** A parsed MML parcel feature — the identity fields the layer publishes plus its ring. */
export interface MmlParcelFeature {
    readonly ring: LatLon[];
    readonly kiinteistotunnus: string | null;
    readonly municipality: string | null;
    readonly areaM2Attr: number | null;
    /** True when a geometry object was present but its ring came back in a non-WGS84 CRS (native 3067). */
    readonly crsUnhandled: boolean;
}

/**
 * Parse an MML `PalstanSijaintitiedot` OGC API Features GeoJSON response into its parcel features. PURE
 * + deterministic — no I/O, no guess. Returns one entry per polygon the API returned (0, 1, or many —
 * the resolver decides disposition). Tolerant of the FeatureCollection being passed directly or wrapped
 * (`{ geojson }` / `{ features }`) and of the property casing the MML build uses.
 *
 * ⚠ LIVE-PROBE the exact property names before prod (NEXT §3.2): MML publishes the identifier as
 * `kiinteistotunnus` / `kiinteistotunnuksenEsitysmuoto` and the area as `rekisteriyksikonPalstanPintaala`
 * / `pintaAla` (or none — some collections carry geometry only). All read case-insensitively here, but a
 * keyed GetFeatures must confirm which the `kiinteisto-avoin` v3 service emits.
 */
export function parseMmlParcelFeatures(input: unknown): MmlParcelFeature[] {
    if (!input || typeof input !== 'object') return [];
    const root = input as Record<string, unknown>;
    const fc =
        (Array.isArray(root.features) ? root : null) ??
        (root.geojson && typeof root.geojson === 'object'
            ? (root.geojson as Record<string, unknown>)
            : null);
    const features = fc && Array.isArray(fc.features) ? fc.features : null;
    if (!features) return [];

    const out: MmlParcelFeature[] = [];
    for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const feat = f as { properties?: unknown; geometry?: unknown };
        const props = (feat.properties ?? null) as Record<string, unknown> | null;

        const rawRing = outerRingCoords(feat.geometry);
        const parsed = rawRing === null ? [] : parseGeoJsonRing(rawRing);
        const crsUnhandled = parsed === null; // ring existed but was not WGS84
        const ring = parsed ?? [];

        const tunnusRaw = prop(
            props,
            'kiinteistotunnuksenEsitysmuoto',
            'kiinteistotunnus',
            'kiinteistotunnusEsitysmuoto',
            'tunnus',
        );
        const kiinteistotunnus =
            typeof tunnusRaw === 'string' && tunnusRaw.length > 0
                ? tunnusRaw
                : tunnusRaw != null
                  ? String(tunnusRaw)
                  : null;
        const municipality = municipalityFromTunnus(kiinteistotunnus);
        const areaM2Attr = toFiniteNum(
            prop(props, 'rekisteriyksikonPalstanPintaala', 'pintaAla', 'pintaala', 'area'),
        );

        out.push({ ring, kiinteistotunnus, municipality, areaM2Attr, crsUnhandled });
    }
    return out;
}

/** Shoelace area (m²) of a WGS84 ring via a local equirectangular projection at the ring's centroid
 *  latitude. Deterministic; adequate for a parcel-scale sanity area when the MML attribute is absent. */
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

/** True when a parsed feature is usable: a tunnus AND a ≥3-vertex ring. */
function hasUsableParcel(f: MmlParcelFeature): boolean {
    return f.kiinteistotunnus !== null && f.ring.length >= 3;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// OGC ITEMS REQUEST BUILDER — documents the exact upstream request the proxy forwards / a probe hits
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the MML OGC API Features `items` URL for the parcels intersecting a small BBOX around a WGS84
 * point. This is the request the SERVER PROXY must forward (browser CSP + the server-injected key forbid
 * calling it directly); exported so the proxy and a keyed live probe share one source of truth. The proxy
 * ADDS the auth (HTTP Basic `<key>:` or `?api-key=`) — this builder deliberately carries NO key. OGC API
 * `bbox` axis order is `minLon,minLat,maxLon,maxLat`; `crs`/`bbox-crs` are the OGC CRS URIs for EPSG:4326.
 */
export function buildMmlItemsUrl(lat: number, lon: number): string {
    const dLat = FI_PARCEL_QUERY_BUFFER_M / 110_540;
    const dLon = FI_PARCEL_QUERY_BUFFER_M / (111_320 * Math.cos((lat * Math.PI) / 180) || 1);
    const crs84 = 'http://www.opengis.net/def/crs/EPSG/0/4326';
    const q = new URLSearchParams({
        // OGC API Features bbox is lon,lat order: minLon,minLat,maxLon,maxLat.
        bbox: `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`,
        'bbox-crs': crs84,
        crs: crs84,
        limit: '20',
        f: 'application/geo+json',
    });
    return `${MML_OGC_FEATURES_BASE}/collections/${MML_PARCEL_COLLECTION}/items?${q.toString()}`;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — resolve the parcel at a WGS84 point (never throws)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the Finnish cadastral parcel at a WGS84 point from the MML `kiinteisto-avoin` OGC API (through
 * the same-origin `/api/parcel/fi` proxy, which injects `MML_API_KEY` server-side, forwards a point
 * `items` query with `crs=EPSG:4326`, and returns GeoJSON). NEVER throws — every failure is a typed
 * refusal (see the header honesty properties). GEOMETRY-ONLY: returns boundary + tunnus + municipality +
 * area, never ownership or an envelope.
 *
 * @param lat EPSG:4326 latitude of the map click.
 * @param lon EPSG:4326 longitude of the map click.
 */
export async function resolveFinlandParcel(
    lat: number,
    lon: number,
    deps: MmlParcelDeps = {},
): Promise<FinlandParcelResolution> {
    const span = tracer.startSpan('pryzm.parcel.resolveFinlandParcel');
    span.setAttribute('pryzm.parcel.provider', MML_PARCEL_PROVIDER_ID);
    try {
        if (!isInFinland(lat, lon)) {
            span.setAttribute('resultFields', 'out-of-finland');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-finland' };
        }
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.lon', lon);

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('resultFields', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? MML_PARCEL_PATH;
        const url =
            `${base}?lat=${encodeURIComponent(String(lat))}` +
            `&lon=${encodeURIComponent(String(lon))}`;

        let json: unknown;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                // Distinguish the self-service-key blocker (401/403) from a generic outage, so the
                // "MML_API_KEY not yet pasted" state is observable — the ONE founder-actionable gate.
                const status = res?.status;
                const reason: FinlandParcelRefusalReason =
                    status === 401 || status === 403 ? 'no-api-key' : 'endpoint-unreachable';
                span.setAttribute('resultFields', reason);
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason };
            }
            json = await res.json();
        } catch (fetchErr) {
            span.setAttribute('resultFields', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn('[fi-parcel] fetch failed (non-fatal):', (fetchErr as Error)?.message ?? fetchErr);
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        // A proxy that is wired but has no key may answer 200 with a `{ ok:false, reason:'no-api-key' }`
        // envelope instead of a GeoJSON body — honour it as the key blocker, not an unparsable response.
        if (json && typeof json === 'object' && (json as { ok?: unknown }).ok === false) {
            const bodyReason = (json as { reason?: unknown }).reason;
            const reason: FinlandParcelRefusalReason =
                bodyReason === 'no-api-key' ? 'no-api-key' : 'endpoint-unreachable';
            span.setAttribute('resultFields', reason);
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason };
        }

        const features = parseMmlParcelFeatures(json);
        if (features.length === 0) {
            span.setAttribute('resultFields', 'no-parcel-here');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-parcel-here' };
        }
        // A geometry came back but in native 3067 metres (not the requested WGS84) — refuse, never fabricate.
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
        const parcel: CadastralParcel = {
            ring: chosen.ring,
            kiinteistotunnus: chosen.kiinteistotunnus!,
            municipality: chosen.municipality,
            areaM2,
            areaSource: areaFromAttr !== null ? 'mml-attribute' : 'derived-from-ring',
            source: MML_PARCEL_PROVIDER_ID,
            // HIGH only when the click falls inside the parcel (a categorical fact, not a cutoff).
            confidence: inside ? 'high' : 'medium',
        };
        span.setAttribute('resultFields', 'parcel');
        span.setAttribute('pryzm.parcel.kiinteistotunnus', parcel.kiinteistotunnus);
        span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
        span.setAttribute('pryzm.parcel.confidence', parcel.confidence);
        span.setStatus({ code: SpanStatusCode.OK });
        return { ok: true, parcel };
    } catch (err) {
        // Defensive: the whole path is best-effort — never throw into the caller.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn('[fi-parcel] unexpected error (non-fatal):', (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}

/** The Finland (MML Kiinteistörekisteri) parcel provider — canonical shape, key-gated (self-service). */
export const mmlParcelProvider = {
    id: MML_PARCEL_PROVIDER_ID,
    label: MML_PARCEL_PROVIDER_LABEL,
    proxyPath: MML_PARCEL_PATH,
    kind: 'cadastral' as const,
    isInFinland,
    /** Resolve the real Finnish parcel at a WGS84 point, or a typed refusal. Never throws. */
    resolveFinlandParcel,
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// RYHTI PROBE — documented reader stub for the "second-Denmark" gate (Phase A · NOT WIRED · UNPROBED)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The single rate-defining Finland unknown is whether the Ryhti national planning platform serves
// STRUCTURED numeric plan attributes (FAR / storeys) or only a plan index + PDF link. This decides
// whether Finland is a "second Denmark" on the LEGISLATION axis (structured, NO OCR) or reverts to a
// PDF-extraction climb. The Ryhti plan OGC API is confirmed LIVE + PUBLIC + no-auth at the
// endpoint/collection level (fi/README §2.2), but the item-level `properties` are UNREAD (a tooling
// gap, not access — fi/NEXT §3.1). This stub documents the exact probe; it does NOT claim it works.
//
// THE PROBE (fi/NEXT §3.1/§8 — run in any GeoJSON-capable env; open, no auth):
//   GET https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1
//         /collections/pub_valid_ld_plan_ix_gs/items?limit=1
//       -H "Accept: application/geo+json"
//   then inspect the feature's `properties` for these EXACT fields (the "second-Denmark" gate):
//     • `tehokkuusluku`   → FAR (tehokkuusluku e = floor area / plot area)   ← CONFIRM PRESENT
//     • `kerrosluku`      → storeys / building height in floors               ← CONFIRM PRESENT
//     • `kayttotarkoitus` → land-use / zoning purpose code                    ← CONFIRM PRESENT
//   Outcome A (fields present) → Ryhti = structured attributes → wire a kaavatietomalli OGC reader as
//     the FI regional-zone-GIS provider (Phase A); every value passes the L-449 human-verification gate
//     before it serves `confidence: structured`. Outcome B (only planId + geometry + PDF link) →
//     index-only (Hamburg B-Plan pattern) → the LEGISLATION gain reverts to the Phase-4 PDF pipeline.
//
// ⚠ HONESTY: the constant below is the documented target, NOT a re-probed result. No RATE cell moves,
// and no Ryhti reader is wired, until this GET actually runs and the fields are confirmed present.
// Ship the probe before the fix (§CONTEXT-DATA-HONESTY).

/** The exact open, no-auth Ryhti `_ix_` item GET to run — the rate-defining "second-Denmark" probe. */
export const RYHTI_IX_PROBE_URL =
    'https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1' +
    '/collections/pub_valid_ld_plan_ix_gs/items?limit=1';

/** The three `properties` fields to CONFIRM PRESENT in the probe response (unconfirmed until run). */
export const RYHTI_ATTRIBUTE_FIELDS = {
    /** FAR — tehokkuusluku e (floor area / plot area). */
    far: 'tehokkuusluku',
    /** Storeys / height in floors — kerrosluku. */
    storeys: 'kerrosluku',
    /** Land-use / zoning purpose code — kayttotarkoitus. */
    useCode: 'kayttotarkoitus',
} as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════
// TERRAIN NOTE — MML DEM / WCS uses the SAME self-service key (Phase C · documented, not built here)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// The SAME `MML_API_KEY` obtained for this parcel provider ALSO unblocks Finnish TERRAIN: the MML
// elevation model is served from the `avoin-paikkatieto.maanmittauslaitos.fi` family (WCS `korkeusmalli`
// / OGC Coverages), key-gated with the identical auth shape (HTTP Basic `<key>:` or `?api-key=`). So one
// self-service credential lights up two C63 axes (PARCEL + TERRAIN) — the highest-leverage single key in
// the country (fi/FOUNDER-BLOCKERS row 1; RATE plan Phase C). Wiring, when built (NOT here — a full
// terrain provider is out of scope for this file): point the existing terrain bake at the MML WCS through
// a same-origin proxy that injects the key server-side, then run `terrain.verify.mjs` to move Helsinki's
// TERRAIN rung 50→100. This file deliberately builds ONLY the parcel provider; the terrain wiring is
// documented so the founder's key is known to unblock both at once.
