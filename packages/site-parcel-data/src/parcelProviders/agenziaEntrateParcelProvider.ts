// ITALY (national) — `agenziaEntrateParcelProvider`: the Agenzia delle Entrate INSPIRE Catasto WFS
// parcel provider. Phase-4 · the highest-ROI Italy move (RATE-IMPLEMENTATION-PLAN.md Phase A).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Italy is *Spain-like for parcels*: ONE national keyless cadastre answers for the whole territory,
// exactly the shape `catastroParcelProvider` (ES) turned on. The Agenzia delle Entrate — Direzione
// Centrale Servizi Catastali publishes cadastral geometry through an INSPIRE Cartografia Catastale
// **WFS 2.0** (`owfs01.php`, layer `CP:CadastralParcel`), keyless, **CC BY 4.0**, and
// **VERIFIED-LIVE 2026-07-24** (GetCapabilities + GetFeature returned real parcels for Rome/H501,
// Milan/F205, Turin/L219 — `it/ITALY-GEOSPATIAL-DATA-INVENTORY.md §2`). Wiring this flips PARCEL
// selection ON nationally in one data addition — the same move that turned on ES/FR/NL/NO/CH/DK.
//
// This turns a WGS84 map click into the REAL `CadastralParcel` under the cursor:
//   { geometry (WGS84 ring) · cadastralCode · comune · province · areaM2 · source · confidence }
// (the model RATE Phase A.1 specifies).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAYERING / TRANSPORT (C57 §1.9 / CSP) — read before changing the fetch
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The provider owns the WFS 2.0 knowledge (typename, version, BBOX construction, srsName) and the
// deterministic GeoJSON parse + point-in-polygon selection. The single impure hop is a `fetch`
// through the **same-origin proxy** `/api/parcel/it` — NEVER browser → agenziaentrate.gov.it
// directly (C57 CSP `connect-src`), exactly as `chGrundnutzungProvider` calls `/api/ch/grundnutzung`
// and the EU cadastre providers call `/api/parcel/{fr,nl,no,de-nrw}`. The proxy forwards a point-BBOX
// `GetFeature` to the Agenzia Entrate WFS (see `buildAgenziaEntrateWfsUrl`) and returns the GeoJSON.
// The `fetchImpl` is injectable so the whole thing is unit-testable with zero network.
//
// ⚠ PROXY NOT YET WIRED server-side (like Madrid `/api/madrid/condiciones` was): until
// `server/*` forwards `/api/parcel/it`, `fetchParcelAtPoint` resolves null and the registry falls to
// the OSM footprint — graceful, never a crash, never a guess. `buildAgenziaEntrateWfsUrl` documents
// the exact upstream request the proxy must issue (and a live probe can hit directly).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// HONESTY PROPERTIES (mirror `chGrundnutzungProvider` / `catastroParcelProvider`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. NEVER THROWS. Every miss / unreachable endpoint / non-OK / malformed body / parse failure /
//      out-of-Italy point resolves to `null`, so the registry falls to the footprint — never a crash.
//   2. GEOMETRY-ONLY. The INSPIRE cadastre publishes the parcel BOUNDARY + reference + area. It carries
//      NO ownership and NO buildable (FAR/height) data — the SAME caveat as Spain's Catastro. Those
//      live in the (per-city) envelope packs, never here. `confidence.match` is `high` ONLY on the
//      categorical facts INSPIRE geometry + point-inside-parcel + comune resolved (never an invented
//      numeric cutoff — the C58 §16 explainability the feature serves).
//   3. AP TRENTO + BOLZANO ARE EXCLUDED. Trentino-Alto Adige/Südtirol runs its OWN cadastre (the
//      statutory *Libro Fondiario* / *Catasto tavolare*), NOT the Agenzia Entrate WFS. `isInItaly`
//      subtracts that box so a click there is NOT misrouted to a cadastre that does not serve it
//      (RATE Phase A.4). Bolzano's own ZoningElement/cadastre is a separate future provider.
//
// CRS: the WFS declares **EPSG:6706** (RDN2008 / ETRS89 geographic 2D — lat,lon in degrees). At BIM
// scale ETRS89↔WGS84 is a sub-metre datum agreement, so NO reprojection is needed — only axis-order
// normalisation, and `orientToWgs84` does it robustly (Italy's lat∈[35,48] and lon∈[6,19] ranges are
// disjoint, so each pair is oriented unambiguously regardless of the server's declared axis order —
// this also absorbs the GeoJSON-lon,lat vs INSPIRE-lat,lon discrepancy). If a future endpoint returns
// a PROJECTED CRS (ETRS89/UTM 32-33N), that is the ONE thing needing a real reprojection — flagged.
//
// OTel span `pryzm.parcel.fetchParcelAtPoint` (C58 §1.10 / P8). PURE parse (`parseCadastralParcelGeoJson`)
// exported for fixture tests.
//
// Strategic context — it/RATE-IMPLEMENTATION-PLAN.md Phase A · it/ITALY-GEOSPATIAL-DATA-INVENTORY.md §2 ·
// C57 (parcel) · C63 (the 7-axis scorecard: this move makes PARCEL + DATA-SOURCES assessable).

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('pryzm.parcel');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PUBLIC CONSTANTS — the WFS knowledge + the same-origin proxy route
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The same-origin proxy route the browser calls (never agenziaentrate.gov.it directly — C57 CSP). */
export const AGENZIA_ENTRATE_PARCEL_PATH = '/api/parcel/it';

/**
 * The Agenzia delle Entrate INSPIRE Cartografia Catastale WFS base the proxy forwards to.
 * ⚠ LIVE-PROBE BEFORE PROD: the host subdomain (`wms.` vs `wfs.`) and the exact `owfs01.php` path
 * must be confirmed against a fresh GetCapabilities — the inventory verified the SERVICE live
 * (2026-07-24) but this constant is the documented target, not a re-probed URL.
 */
export const AGENZIA_ENTRATE_WFS_BASE =
    'https://wms.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';

/** The INSPIRE Cadastral-Parcels feature type (WFS 2.0 `typeNames`). */
export const AGENZIA_ENTRATE_PARCEL_TYPENAME = 'CP:CadastralParcel';

/** WFS version (INSPIRE download service). */
export const AGENZIA_ENTRATE_WFS_VERSION = '2.0.0';

/**
 * The CRS the WFS advertises for this layer: RDN2008 / ETRS89 geographic 2D, axis order lat,lon.
 * ETRS89↔WGS84 is a sub-metre datum agreement at BIM scale → no reprojection, only axis normalisation.
 */
export const AGENZIA_ENTRATE_SRS = 'EPSG:6706';

/** Half-size (metres) of the point-BBOX the proxy queries around a click. ~40 m covers a parcel. */
export const IT_PARCEL_QUERY_BUFFER_M = 40;

// ──────────────────────────────────────────────────────────────────────────────────────────────
// JURISDICTION PREDICATE — `isInItaly` (national analogue of `isInSpain`), AP-excluded
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point. */
export interface ItLatLon {
    readonly lat: number;
    readonly lon: number;
}

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
 * Italy: mainland + Sicily + Sardinia + minor islands (incl. Lampedusa ≈35.5°N/12.6°E). The extent the
 * Agenzia Entrate WFS serves. Coarse rectangle — a proximity gate that only decides WHICH cadastre to
 * try; the WFS's own null-result is the real "no parcel here" answer.
 */
export const ITALY_BBOX: Bbox = { minLat: 35.4, maxLat: 47.15, minLon: 6.5, maxLon: 18.7 };

/**
 * Trentino-Alto Adige / Südtirol (AP Trento + AP Bolzano) — the ONE Italian territory whose cadastre
 * is NOT the Agenzia Entrate WFS (statutory *Catasto tavolare* / Libro Fondiario). Coarse exclusion box
 * (deliberately conservative; a polygon gate would be needed to trim the Trentino valleys precisely).
 */
export const TRENTINO_ALTO_ADIGE_EXCLUSION: Bbox = {
    minLat: 45.67,
    maxLat: 47.15,
    minLon: 10.38,
    maxLon: 12.48,
};

/**
 * Malta (Malta + Gozo + Comino) — a SOVEREIGN STATE that sits entirely inside `ITALY_BBOX`
 * (Sicily's southern tip is ≈36.65°N; Valletta is 35.90°N/14.51°E, Victoria/Gozo 36.04°N/14.24°E).
 * MEASURED 2026-09-04 (lane PARCEL-REACH round 3): `resolveParcelJurisdiction(35.8989, 14.5146)`
 * → `IT:cadastral` — a Maltese click was LABELLED ITALY and dispatched to the Agenzia delle Entrate
 * WFS, which cannot serve it and burns Italy's 25 s deadline before the OSM footprint appears. The
 * box is clear of every Italian island: Lampedusa (35.50°N, 12.60°E) and Pantelleria (36.78°N,
 * 11.95°E) lie west of 14.15°E, Pozzallo/Portopalo (36.7°N) lie north of 36.10°N.
 */
export const MALTA_EXCLUSION: Bbox = { minLat: 35.78, maxLat: 36.10, minLon: 14.15, maxLon: 14.60 };

/**
 * True when the WGS84 point is served by the national Agenzia Entrate cadastre: inside the Italy box
 * AND outside the AP Trento/Bolzano own-cadastre exclusion (property 3) AND outside Malta (another
 * country, not another register). The predicate the registry routes on — the national analogue of
 * `isInSpain`.
 */
export function isInItaly(lat: number, lon: number): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (!within(ITALY_BBOX, lat, lon)) return false;
    if (within(TRENTINO_ALTO_ADIGE_EXCLUSION, lat, lon)) return false;
    if (within(MALTA_EXCLUSION, lat, lon)) return false;
    return true;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE CADASTRAL PARCEL MODEL (RATE Phase A.1)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Fact-based match tier — built ONLY from categorical facts, never an invented numeric cutoff. */
export type CadastralParcelMatch = 'high' | 'medium' | 'low';

/** Whether `areaM2` is the WFS-declared registry area or shoelace-derived from the ring. */
export type CadastralAreaSource = 'registry-declared' | 'derived-from-ring';

/** Honesty-gated confidence for an Italian cadastral parcel. `high` iff all three facts hold. */
export interface CadastralParcelConfidence {
    readonly match: CadastralParcelMatch;
    /** The geometry came from the INSPIRE `CP:CadastralParcel` layer (an authoritative cadastre). */
    readonly inspireGeometry: boolean;
    /** The query point falls INSIDE the returned parcel ring (not merely nearest in the BBOX). */
    readonly pointInParcel: boolean;
    /** The comune (municipality) was resolved from the cadastral reference / attributes. */
    readonly comuneResolved: boolean;
    /** Did the WFS publish an official registry area, or did we shoelace the ring? */
    readonly areaSource: CadastralAreaSource;
}

/** A fetched Italian cadastral parcel, normalised to a WGS84 lat/lon ring. */
export interface CadastralParcel {
    /** The parcel boundary as a WGS84 lat/lon ring (outer ring; closing vertex dropped). */
    readonly ring: ReadonlyArray<ItLatLon>;
    /** The national cadastral reference (`nationalCadastralReference` / INSPIRE localId). */
    readonly cadastralCode: string;
    /** The comune Belfiore code (e.g. `H501` Rome, `F205` Milan) when resolvable, else null. */
    readonly comune: string | null;
    /** The province (when the source or the comune crosswalk supplies one; often null on raw WFS). */
    readonly province: string | null;
    /** Parcel area in m² (WFS `areaValue` when published, else shoelace-derived — see `areaSource`). */
    readonly areaM2: number;
    /** Provenance tag — always `agenzia-entrate` for this provider (L-373 credibility). */
    readonly source: string;
    /** Honesty-gated confidence (property 2). */
    readonly confidence: CadastralParcelConfidence;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PURE PARSE — INSPIRE CP:CadastralParcel GeoJSON → raw parcels (no I/O, deterministic)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** A parsed parcel before point-in-polygon disposition (one per WFS feature). */
export interface RawCadastralParcel {
    readonly ring: ItLatLon[];
    readonly cadastralCode: string;
    readonly comune: string | null;
    readonly province: string | null;
    /** Registry area (WFS `areaValue`) when published, else null (→ resolver shoelaces the ring). */
    readonly areaOfficialM2: number | null;
}

function toFiniteNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Case-insensitive property read over an INSPIRE properties bag (the WFS varies casing by build). */
function readProp(props: Record<string, unknown>, ...names: string[]): unknown {
    const lower = new Map<string, unknown>();
    for (const [k, v] of Object.entries(props)) lower.set(k.toLowerCase(), v);
    for (const n of names) {
        const hit = lower.get(n.toLowerCase());
        if (hit !== undefined && hit !== null && hit !== '') return hit;
    }
    return undefined;
}

/**
 * Orient a raw coordinate pair to `{lat, lon}` for Italy. Italy's lat∈[35,48] and lon∈[6,19] ranges are
 * DISJOINT, so whichever member falls in the lat band is the latitude — this absorbs both the WFS's
 * EPSG:6706 lat,lon axis order and any GeoJSON-conformant lon,lat, deterministically. Returns null when
 * neither ordering lands both members in Italy's ranges (a coordinate that is not a WGS84 Italian point).
 */
export function orientToWgs84(a: unknown, b: unknown): ItLatLon | null {
    const x = toFiniteNum(a);
    const y = toFiniteNum(b);
    if (x === null || y === null) return null;
    const isLat = (v: number) => v >= 34 && v <= 48;
    const isLon = (v: number) => v >= 5 && v <= 20;
    if (isLat(x) && isLon(y)) return { lat: x, lon: y }; // lat,lon (EPSG:6706 declared order)
    if (isLat(y) && isLon(x)) return { lat: y, lon: x }; // lon,lat (GeoJSON RFC-7946 order)
    return null;
}

/** Close/normalise a GeoJSON linear ring (array of [x,y]) into a WGS84 `ItLatLon[]`, or null if degenerate. */
function ringFromCoords(coords: unknown): ItLatLon[] | null {
    if (!Array.isArray(coords) || coords.length < 3) return null;
    const pts: ItLatLon[] = [];
    for (const pair of coords) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        const p = orientToWgs84(pair[0], pair[1]);
        if (p) pts.push(p);
    }
    // Drop a duplicated closing vertex.
    if (
        pts.length >= 2 &&
        pts[0]!.lat === pts[pts.length - 1]!.lat &&
        pts[0]!.lon === pts[pts.length - 1]!.lon
    ) {
        pts.pop();
    }
    return pts.length >= 3 ? pts : null;
}

/** Pull the outer ring out of a GeoJSON Polygon or (largest ring of a) MultiPolygon geometry. */
function outerRingOf(geometry: unknown): ItLatLon[] | null {
    if (!geometry || typeof geometry !== 'object') return null;
    const g = geometry as { type?: unknown; coordinates?: unknown };
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
        return ringFromCoords(g.coordinates[0]);
    }
    if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
        // Choose the polygon with the most vertices in its outer ring (the principal parcel body).
        let best: ItLatLon[] | null = null;
        for (const poly of g.coordinates) {
            if (!Array.isArray(poly)) continue;
            const ring = ringFromCoords(poly[0]);
            if (ring && (!best || ring.length > best.length)) best = ring;
        }
        return best;
    }
    return null;
}

/**
 * The Italian comune is encoded as the Belfiore code (e.g. `H501`) at the head of the national cadastral
 * reference / INSPIRE localId. Extract it when present (a leading letter + 3 digits token), else null.
 * ⚠ LIVE-PROBE: confirm the reference format against a fresh GetFeature — INSPIRE localId shapes vary.
 */
export function comuneFromReference(ref: string | null | undefined): string | null {
    if (!ref) return null;
    const m = /([A-Z]\d{3})/.exec(String(ref).toUpperCase());
    return m ? m[1]! : null;
}

/**
 * Parse an INSPIRE `CP:CadastralParcel` WFS 2.0 GeoJSON `GetFeature` response into raw parcels. PURE +
 * deterministic — no I/O, no guess. Tolerant of the FeatureCollection being passed directly or wrapped
 * (`{ geojson }` / `{ features }`), and of the property casing the WFS build uses. Returns one entry per
 * feature carrying a usable ring + a non-empty cadastral reference (features without either are dropped).
 *
 * ⚠ LIVE-PROBE the exact property names before prod: INSPIRE publishes the reference as
 * `nationalCadastralReference` / `NATIONALCADASTRALREFERENCE` / `INSPIREID_LOCALID` and the area as
 * `areaValue` / `AREAVALUE` depending on the server build — all are read here case-insensitively, but a
 * fresh GetFeature must confirm which the Agenzia Entrate `owfs01.php` emits.
 */
export function parseCadastralParcelGeoJson(input: unknown): RawCadastralParcel[] {
    if (!input || typeof input !== 'object') return [];
    const root = input as Record<string, unknown>;
    const fc =
        (Array.isArray(root.features) ? root : null) ??
        (root.geojson && typeof root.geojson === 'object' ? (root.geojson as Record<string, unknown>) : null);
    const features = fc && Array.isArray(fc.features) ? fc.features : null;
    if (!features) return [];

    const out: RawCadastralParcel[] = [];
    for (const feat of features) {
        if (!feat || typeof feat !== 'object') continue;
        const f = feat as { geometry?: unknown; properties?: unknown };
        const ring = outerRingOf(f.geometry);
        if (!ring) continue;

        const props =
            f.properties && typeof f.properties === 'object'
                ? (f.properties as Record<string, unknown>)
                : {};
        const refRaw = readProp(
            props,
            'nationalCadastralReference',
            'NATIONALCADASTRALREFERENCE',
            'INSPIREID_LOCALID',
            'inspireId_localId',
            'localId',
            'label',
            'LABEL',
        );
        const cadastralCode = typeof refRaw === 'string' ? refRaw : refRaw != null ? String(refRaw) : '';
        if (cadastralCode.length === 0) continue;

        const comuneRaw = readProp(props, 'administrativeUnit', 'ADMINISTRATIVEUNIT', 'comune', 'COMUNE');
        const comune =
            comuneFromReference(cadastralCode) ??
            (typeof comuneRaw === 'string' && comuneRaw.length > 0 ? comuneRaw : null);
        const provinceRaw = readProp(props, 'province', 'PROVINCIA', 'provincia', 'sigla_prov');
        const province = typeof provinceRaw === 'string' && provinceRaw.length > 0 ? provinceRaw : null;

        const areaOfficialM2 = toFiniteNum(readProp(props, 'areaValue', 'AREAVALUE', 'area', 'AREA'));

        out.push({ ring, cadastralCode, comune, province, areaOfficialM2 });
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// GEOMETRY HELPERS — point-in-polygon + shoelace area (pure)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Ray-cast point-in-polygon on a WGS84 lat/lon ring (degree space is fine for containment). */
export function pointInRing(ring: ReadonlyArray<ItLatLon>, lat: number, lon: number): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        const intersects =
            a.lat > lat !== b.lat > lat &&
            lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon;
        if (intersects) inside = !inside;
    }
    return inside;
}

/** Approximate ring area in m² via a local equirectangular projection at the ring's mean latitude. */
export function shoelaceAreaM2(ring: ReadonlyArray<ItLatLon>): number {
    if (ring.length < 3) return 0;
    const latMean = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
    const mPerDegLat = 110540;
    const mPerDegLon = 111320 * Math.cos((latMean * Math.PI) / 180);
    let acc = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i]!.lon * mPerDegLon;
        const yi = ring[i]!.lat * mPerDegLat;
        const xj = ring[j]!.lon * mPerDegLon;
        const yj = ring[j]!.lat * mPerDegLat;
        acc += xj * yi - xi * yj;
    }
    return Math.abs(acc) / 2;
}

/**
 * Select the parcel a click resolves to and build the `CadastralParcel`. Prefers a ring the point falls
 * INSIDE (property 2 → `pointInParcel: true`); if the BBOX returned parcels but none contain the point
 * (e.g. a click in a road gap), falls to the nearest-centroid parcel with `pointInParcel: false`, which
 * caps the match tier below `high`. Returns null only when there are no usable parcels at all.
 */
export function selectParcelAtPoint(
    parcels: ReadonlyArray<RawCadastralParcel>,
    lat: number,
    lon: number,
): CadastralParcel | null {
    if (parcels.length === 0) return null;

    let chosen: RawCadastralParcel | null = null;
    let pointInParcel = false;
    for (const p of parcels) {
        if (pointInRing(p.ring, lat, lon)) {
            chosen = p;
            pointInParcel = true;
            break;
        }
    }
    if (!chosen) {
        // No containing parcel — pick the nearest centroid (honest fallback, tier-capped).
        let bestD = Number.POSITIVE_INFINITY;
        for (const p of parcels) {
            const cLat = p.ring.reduce((s, q) => s + q.lat, 0) / p.ring.length;
            const cLon = p.ring.reduce((s, q) => s + q.lon, 0) / p.ring.length;
            const d = (cLat - lat) ** 2 + (cLon - lon) ** 2;
            if (d < bestD) {
                bestD = d;
                chosen = p;
            }
        }
    }
    if (!chosen) return null;

    const areaSource: CadastralAreaSource =
        chosen.areaOfficialM2 !== null ? 'registry-declared' : 'derived-from-ring';
    const areaM2 = chosen.areaOfficialM2 ?? shoelaceAreaM2(chosen.ring);

    const inspireGeometry = true; // it came from CP:CadastralParcel
    const comuneResolved = chosen.comune !== null;
    // HIGH iff INSPIRE geometry + point inside + comune resolved (property 2). Otherwise degrade.
    const match: CadastralParcelMatch =
        inspireGeometry && pointInParcel && comuneResolved
            ? 'high'
            : inspireGeometry && pointInParcel
              ? 'medium'
              : 'low';

    return {
        ring: chosen.ring,
        cadastralCode: chosen.cadastralCode,
        comune: chosen.comune,
        province: chosen.province,
        areaM2,
        source: 'agenzia-entrate',
        confidence: { match, inspireGeometry, pointInParcel, comuneResolved, areaSource },
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// WFS REQUEST BUILDER — documents the exact upstream GetFeature the proxy forwards / a probe hits
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the Agenzia Entrate WFS 2.0 `GetFeature` URL for the parcels intersecting a small BBOX around a
 * WGS84 point. BBOX axis order is `minLat,minLon,maxLat,maxLon` per EPSG:6706 (lat,lon) — RATE Phase A.1.
 * This is the request the SERVER PROXY must issue (browser CSP forbids calling it directly); exported so
 * the proxy and a live probe share one source of truth. `outputFormat=application/json` asks for GeoJSON.
 */
export function buildAgenziaEntrateWfsUrl(lat: number, lon: number): string {
    const dLat = IT_PARCEL_QUERY_BUFFER_M / 110540;
    const dLon = IT_PARCEL_QUERY_BUFFER_M / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
    const bbox = `${lat - dLat},${lon - dLon},${lat + dLat},${lon + dLon},urn:ogc:def:crs:EPSG::6706`;
    const q = new URLSearchParams({
        service: 'WFS',
        version: AGENZIA_ENTRATE_WFS_VERSION,
        request: 'GetFeature',
        typeNames: AGENZIA_ENTRATE_PARCEL_TYPENAME,
        srsName: `urn:ogc:def:crs:EPSG::6706`,
        outputFormat: 'application/json',
        count: '20',
        bbox,
    });
    return `${AGENZIA_ENTRATE_WFS_BASE}?${q.toString()}`;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PROVIDER — fetchParcelAtPoint (the one impure seam, never throws)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Injectable dependencies so the provider is unit-testable without the network. */
export interface AgenziaEntrateDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production uses the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Same-origin proxy path base (default `AGENZIA_ENTRATE_PARCEL_PATH`). */
    readonly pathBase?: string;
}

/** The Italy parcel provider surface (a superset of the ES ParcelProvider shape + registry hints). */
export interface AgenziaEntrateProvider {
    readonly id: string;
    readonly label: string;
    /** How a click resolves — Italy is a real national cadastre. */
    readonly kind: 'cadastral';
    /** The routing predicate the registry keys on (AP Trento/Bolzano excluded). */
    readonly isInItaly: (lat: number, lon: number) => boolean;
    /** Resolve the real cadastral parcel at a WGS84 point, or null. Signature mirrors `catastroParcelProvider`. */
    fetchParcelAtPoint(lon: number, lat: number, deps?: AgenziaEntrateDeps): Promise<CadastralParcel | null>;
}

/**
 * The Italy (Agenzia delle Entrate) parcel provider. `fetchParcelAtPoint` GETs the same-origin proxy for
 * the parcels around a WGS84 point, parses the INSPIRE GeoJSON, and point-in-polygon-selects the parcel
 * under the click. Resolves to null on empty query / out-of-Italy / network error / non-OK / non-JSON /
 * a miss — NEVER throws (property 1; a P8 OTel span is opened per call).
 *
 * Signature mirrors `catastroParcelProvider.fetchParcelAtPoint(lon, lat)` for drop-in registry parity.
 */
export const agenziaEntrateParcelProvider: AgenziaEntrateProvider = {
    id: 'agenzia-entrate',
    label: 'Catasto (Italy · Agenzia delle Entrate)',
    kind: 'cadastral',
    isInItaly,

    async fetchParcelAtPoint(
        lon: number,
        lat: number,
        deps: AgenziaEntrateDeps = {},
    ): Promise<CadastralParcel | null> {
        const span = tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
        span.setAttribute('pryzm.parcel.provider', 'agenzia-entrate');
        try {
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                span.setAttribute('pryzm.parcel.hit', false);
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }
            span.setAttribute('pryzm.parcel.lon', lon);
            span.setAttribute('pryzm.parcel.lat', lat);

            if (!isInItaly(lat, lon)) {
                // Outside the national cadastre's territory (incl. AP Trento/Bolzano) — nothing to query.
                span.setAttribute('pryzm.parcel.hit', false);
                span.setAttribute('pryzm.parcel.out_of_italy', true);
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }

            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setAttribute('pryzm.parcel.hit', false);
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }
            const base = deps.pathBase ?? AGENZIA_ENTRATE_PARCEL_PATH;
            const url =
                `${base}?lon=${encodeURIComponent(String(lon))}` +
                `&lat=${encodeURIComponent(String(lat))}`;

            let body: unknown = null;
            try {
                const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
                if (!res || !res.ok) {
                    console.warn('[gis] agenzia-entrate: proxy returned', res?.status, res?.statusText);
                    span.setAttribute('pryzm.parcel.hit', false);
                    span.setStatus({ code: SpanStatusCode.OK });
                    return null;
                }
                body = await res.json();
            } catch (err) {
                console.warn('[gis] agenzia-entrate: network/JSON error (non-fatal):', (err as Error)?.message ?? err);
                span.setAttribute('pryzm.parcel.hit', false);
                span.setStatus({ code: SpanStatusCode.OK });
                return null;
            }

            const parcels = parseCadastralParcelGeoJson(body);
            const parcel = selectParcelAtPoint(parcels, lat, lon);
            span.setAttribute('pryzm.parcel.hit', parcel !== null);
            if (parcel) {
                span.setAttribute('pryzm.parcel.cadastralCode', parcel.cadastralCode);
                span.setAttribute('pryzm.parcel.comune', parcel.comune ?? 'n/a');
                span.setAttribute('pryzm.parcel.match', parcel.confidence.match);
                console.log(
                    `[gis] agenzia-entrate: parcel ${parcel.cadastralCode} (~${parcel.areaM2.toFixed(0)} m², ` +
                    `${parcel.ring.length} pts, ${parcel.confidence.match})` +
                    (parcel.comune ? ` @ comune ${parcel.comune}` : ''),
                );
            } else {
                console.log(`[gis] agenzia-entrate: no parcel at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return parcel;
        } catch (err) {
            // Defensive: the whole path is best-effort — never throw into the caller.
            span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
            console.warn('[gis] agenzia-entrate: unexpected error (non-fatal):', (err as Error)?.message ?? err);
            return null;
        } finally {
            span.end();
        }
    },
};

// TODO(orchestrator): register isInItaly→agenzia-entrate as a `kind:'cadastral'` row in
// parcelProviders/registry.ts (proxyPath '/api/parcel/it') + import { isInItaly } from
// './agenziaEntrateParcelProvider.js' (or relocate ITALY_BBOX/isInItaly into countryBbox.ts for
// parity with the other predicates). The registry file is orchestrator-owned; this provider does
// not edit it. See the report for the exact line.
