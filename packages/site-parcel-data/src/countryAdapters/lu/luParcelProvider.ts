// LANE LU-PARCEL — LUXEMBOURG (LU) · the PARCEL arm: ACT / INSPIRE `cp:CP.CadastralParcel` WFS.
//
// ⛔ WHY THIS EXISTS ALONGSIDE luPagProvider.ts, AND WHY IT IS NOT THE SAME SOURCE (C84 EI-9 —
// one authority per concept). The E7-LU lane wired the RULES half from the national PAG
// GeoPackage (data.public.lu, `luPagProvider.ts`). It deliberately did NOT wire a parcel provider
// off that file, and its reasoning was correct: PAG_PAG_FOND_DE_PLAN.NUM_CADAST is NOT a key
// ("N/A" on 4.9%, 15,110 duplicate (commune,number) groups, no cadastral SECTION served), so a
// key-join parcel lookup off the bulk GPKG would return the wrong polygon silently. That verdict
// ("LU has no parcel source") was about the GPKG channel — it was never a survey of the ACT
// cadastre. This module wires a DIFFERENT, LIVE source: the Administration du cadastre et de la
// topographie (ACT) INSPIRE Cadastral Parcels download service. It is a keyless WFS 2.0 point
// query that returns the parcel UNDER the click with its harmonized `national_cadastral_reference`
// — the click-to-select answer the GPKG could not give. The RULES half stays on luPagProvider; the
// two are joined by geometry (point ∈ parcel), never by the ambiguous NUM_CADAST key.
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03; transcripts in
// audit/demo-esfrpt/2026-09-02/lane-lu-parcel.md — re-run them before "fixing" any):
//
//   1. THE SERVICE: `https://wms.inspire.geoportail.lu/geoserver/wfs` — the Luxembourg INSPIRE
//      GeoServer (ACT). WFS 2.0.0 GetCapabilities 200 (1.44 MB), keyless. Layer
//      `cp:CP.CadastralParcel` (Title "Cadastral Parcel"). ⚠ `wfs.geoportail.lu` (the host the
//      E7-LU lane probed and recorded as "000/0 bytes") does NOT resolve — the live WFS lives on
//      the `wms.inspire.` host, which is why the earlier "no live query service" reading was about
//      the PAG channel only. Licence: the GetCapabilities carries the string "CC0"; the dataset is
//      the same CC0 1.0 confirmed at the deed in luSources.ts. Colour GREEN.
//   2. THE POINT QUERY IS A BBOX, NOT A CQL INTERSECTS. A `cql_filter=INTERSECTS(geometry,POINT(..))`
//      returns 0 at a KNOWN-interior point: the CQL geometry literal carries no SRID, so GeoServer
//      reads it in the layer's native CRS (EPSG:2169 / LUREF metres), where a lon/lat degree pair
//      falls outside Luxembourg → empty. A WGS84 bbox with the AUTHORITY urn form is honoured and
//      the server reprojects the FILTER (measured). So the click path is a small lat,lon urn bbox.
//   3. OUTPUT CRS: `srsName=EPSG:4326` returns WGS84 GeoJSON, coords [lon,lat] degrees (probed —
//      the served ring for 075F00461001970 begins [6.12935,49.61062]). Unlike the HR/EE adapters
//      (which keep native output and do NOT reproject), LU asks for WGS84 output ON PURPOSE — see
//      fact 4: the click MUST be resolved by point-in-polygon, and PIP needs the ring in the same
//      CRS as the click. `area` (m²) is served as an attribute, so WGS84 output costs no accuracy.
//   4. LU PARCELS ARE DENSE — features[0] IS THE WRONG PARCEL. A ~5 m click window straddles 3–4
//      parcels, and the service returns them in feature-id order, NOT spatial order. MEASURED: at
//      the founder's click (49.61195,6.12926) features[0] = 075F00138000000 but the CONTAINING
//      parcel is 075F00137000000; at Esch (49.496,5.981) features[0] = 039A00604016543 but the
//      container is 039A00606016640. So this module does POINT-IN-POLYGON selection (the containing
//      ring; else the nearest centroid) — the exact discipline the same-origin proxy's
//      `pickCandidate` uses — never features[0]. The window is kept SMALL (±~11 m, count 30) for a
//      second measured reason: a coarse bbox (the shared proxy HALF_DEG ±38 m) truncates a dense
//      old-town block past `count` and drops the true container OUT of the returned set, so PIP
//      then mis-picks a neighbour. Small window + point-in-polygon is what resolves LU correctly.
//   5. A point on the PUBLIC ROAD NETWORK (domaine public) is genuinely un-parcelled — the exact
//      coordinate 49.611,6.129 has no containing parcel. That is an honest "nearest parcel" answer
//      (nearest centroid), not a failure; a true coverage gap is a 200-empty FeatureCollection.
//
// FetchOutcome end-to-end (C57 §1.5) — EMPTY and FAILURE are DIFFERENT VALUES:
//   • network throw / no fetch impl   → transient  ("endpoint-unreachable: <endpoint>")
//   • non-OK HTTP / OWS ExceptionReport→ transient  ("upstream-failed: …" + the server's own text)
//   • OK but unparsable / no features  → transient  ("upstream-failed: …")
//   • OK, parsed, zero features        → absent     ("no-parcel: <query>" — a durable "nothing here")
//   • OK, parsed, ≥1 feature           → found      (the point-in-polygon / nearest parcel)

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.lu');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * The Luxembourg INSPIRE GeoServer (ACT). Keyless; PROBED LIVE 2026-09-03. ⚠ Browser use requires
 * a same-origin proxy (C57 CSP) — this base is for server/node use; the registry row wires the
 * `/api/parcel/lu` proxy leg (server/jurisdiction/euCadastreProxy.js).
 */
export const LU_PARCEL_WFS_BASE = 'https://wms.inspire.geoportail.lu/geoserver/wfs';

/** The INSPIRE Cadastral-Parcel layer (harmonized `national_cadastral_reference` + geometry). */
export const LU_PARCEL_LAYER = 'cp:CP.CadastralParcel';

/** The urn CRS token the service accepts for lat,lon-ordered WGS84 bboxes (measured fact 2). */
export const LU_PARCEL_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/** Provider/provenance id for the registry row + attribution. */
export const LU_PARCEL_PROVIDER_ID = 'lu-act-inspire-cp';
export const LU_PARCEL_PROVIDER_LABEL =
    'Parcelle cadastrale (Luxembourg · ACT — INSPIRE Cadastral Parcels)';

/**
 * The click window — SMALL on purpose (measured fact 4): ±~11 m and count 30 so the CONTAINING
 * parcel is in the returned set and never truncated out, which is what lets point-in-polygon pick
 * the right dense parcel instead of a neighbour.
 */
export const LU_PARCEL_CLICK_HALF_DEG = 0.0001;
export const LU_PARCEL_CLICK_COUNT = 30;

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every LU parcel call is unit-testable without the network. */
export interface LuParcelWfsDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as the Luxembourg service delivers it (properties bag + geometry). */
export interface LuParcelWfsFeature {
    readonly properties: Record<string, unknown>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/** A resolved Luxembourg cadastral parcel — identity + WGS84 geometry, nothing invented. */
export interface LuCadastralParcel {
    /** INSPIRE harmonized reference (`national_cadastral_reference`, e.g. `075F00137000000`). */
    readonly nationalCadastralReference: string;
    /** Local parcel label as drawn on the plan (`label`, e.g. `137` or `461/1970`), or null. */
    readonly label: string | null;
    /** Served registered area in m² (`area`, `area_uom` == "m2") — authoritative, never derived. */
    readonly areaM2: number | null;
    /** Cadastral SECTION code (`75F`), lifted from the served `zoning` LIMADM_SECTIONS.<sec> id, or null. */
    readonly section: string | null;
    /** Outer ring as served: [lon,lat] degrees in `crs`. */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    /** CRS of `ring` — always `EPSG:4326` (WGS84 output requested; see fact 3). */
    readonly crs: string;
    /** Provenance tag — always `lu-act-inspire-cp`. */
    readonly source: string;
}

/**
 * Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back — the
 * GeoServer names the offending cause verbatim, so carrying it makes a refusal SELF-NAMING.
 * (Copied per-adapter, never imported across country dirs — E7 §6-A.)
 */
export function extractLuOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport') && !body.includes('ServiceException')) return null;
    const m =
        /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body) ??
        /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(body);
    return m ? m[1]!.trim().replace(/\s+/g, ' ').slice(0, 300) : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * The classified GET the LU parcel provider goes through. Returns the parsed feature list or a
 * typed refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer.
 */
export async function luParcelWfsGetFeatures(
    url: string,
    queryLabel: string,
    deps: LuParcelWfsDeps = {},
): Promise<FetchOutcome<readonly LuParcelWfsFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lu.parcelWfsGetFeatures',
        async (span): Promise<FetchOutcome<readonly LuParcelWfsFeature[]>> => {
            span.setAttribute('lu.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                let res: Response;
                try {
                    res = await fetchImpl(url);
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                    return fetchTransient(
                        `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                    );
                }
                const body = await res.text().catch(() => '');
                if (!res.ok) {
                    const exc = extractLuOwsExceptionText(body);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                    );
                }
                const exc200 = extractLuOwsExceptionText(body);
                if (exc200 !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: ExceptionReport from ${url} — ${exc200}`);
                }
                let parsed: unknown;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
                }
                const features = (parsed as { features?: unknown }).features;
                if (!Array.isArray(features)) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: no features array from ${url}`);
                }
                const clean: LuParcelWfsFeature[] = [];
                for (const f of features) {
                    if (
                        f &&
                        typeof f === 'object' &&
                        typeof (f as LuParcelWfsFeature).properties === 'object'
                    ) {
                        clean.push(f as LuParcelWfsFeature);
                    }
                }
                if (clean.length === 0) {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-parcel: ${queryLabel}`);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute('lu.features', clean.length);
                return fetchFound(clean as readonly LuParcelWfsFeature[]);
            } finally {
                span.end();
            }
        },
    );
}

/* ────────────────────────────── URL builder (pure) ────────────────────── */

/**
 * The click GetFeature URL — a WGS84 (lat,lon urn-ordered) bbox around the point, WGS84 output.
 * The server reprojects the FILTER; `srsName=EPSG:4326` asks for WGS84 degrees back (measured
 * facts 2 + 3). The window is the small LU click window (fact 4).
 */
export function buildLuParcelClickUrl(lat: number, lon: number): string {
    const h = LU_PARCEL_CLICK_HALF_DEG;
    const bbox =
        `${lat - h},${lon - h},${lat + h},${lon + h},${LU_PARCEL_WGS84_URN}`;
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: LU_PARCEL_LAYER,
        srsName: 'EPSG:4326',
        count: String(LU_PARCEL_CLICK_COUNT),
        outputFormat: 'application/json',
        bbox,
    });
    return `${LU_PARCEL_WFS_BASE}?${p.toString()}`;
}

/* ────────────────────────────── pure geometry ─────────────────────────── */

/** The outer ring of a (Multi)Polygon as [lon,lat] pairs — GeoJSON is always [lon,lat]. */
export function luOuterRing(
    geom: LuParcelWfsFeature['geometry'],
): Array<readonly [number, number]> {
    if (!geom) return [];
    let coords: unknown = geom.coordinates;
    if (geom.type === 'MultiPolygon' && Array.isArray(coords)) coords = coords[0];
    const outer = Array.isArray(coords) ? coords[0] : null;
    const ring: Array<readonly [number, number]> = [];
    if (Array.isArray(outer)) {
        for (const pair of outer) {
            if (Array.isArray(pair) && pair.length >= 2) {
                const lonN = Number(pair[0]);
                const latN = Number(pair[1]);
                if (Number.isFinite(lonN) && Number.isFinite(latN)) ring.push([lonN, latN] as const);
            }
        }
    }
    return ring;
}

/** Ray-cast point-in-polygon over a [lon,lat] ring. Pure. */
export function luRingContains(
    ring: ReadonlyArray<readonly [number, number]>,
    lat: number,
    lon: number,
): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i]![0];
        const yi = ring[i]![1];
        const xj = ring[j]![0];
        const yj = ring[j]![1];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function luRingCentroid(
    ring: ReadonlyArray<readonly [number, number]>,
): { lat: number; lon: number } {
    let sx = 0;
    let sy = 0;
    for (const [lonN, latN] of ring) {
        sx += lonN;
        sy += latN;
    }
    return { lon: sx / ring.length, lat: sy / ring.length };
}

/**
 * The click resolver's selection rule, mirroring the same-origin proxy's `pickCandidate`: the
 * feature whose ring CONTAINS the point; else the nearest centroid (a road/boundary click still
 * yields a real parcel). Returns null only when no feature has a usable ring (≥3 verts).
 */
export function pickLuParcelFeature(
    features: readonly LuParcelWfsFeature[],
    lat: number,
    lon: number,
): LuParcelWfsFeature | null {
    let nearest: LuParcelWfsFeature | null = null;
    let nearestD = Number.POSITIVE_INFINITY;
    let sawRing = false;
    for (const f of features) {
        const ring = luOuterRing(f.geometry);
        if (ring.length < 3) continue;
        sawRing = true;
        if (luRingContains(ring, lat, lon)) return f;
        const ct = luRingCentroid(ring);
        const d = (ct.lat - lat) ** 2 + (ct.lon - lon) ** 2;
        if (d < nearestD) {
            nearestD = d;
            nearest = f;
        }
    }
    return sawRing ? nearest : null;
}

/* ────────────────────────────── pure parser ───────────────────────────── */

function luStr(v: unknown): string | null {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}
function luNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** The cadastral SECTION code lifted from the served `zoning` id (`…LIMADM_SECTIONS.75F` → `75F`). */
export function luSectionFromZoning(zoning: unknown): string | null {
    const s = luStr(zoning);
    if (s === null) return null;
    const m = /LIMADM_SECTIONS\.([A-Za-z0-9]+)/.exec(s);
    return m ? m[1]! : null;
}

/**
 * PURE: one `cp:CP.CadastralParcel` GeoJSON feature → `LuCadastralParcel`, or null if it has no
 * `national_cadastral_reference` and no usable ring (a feature that cannot be cited or drawn is not
 * a parcel we can return).
 */
export function parseLuParcelFeature(feature: LuParcelWfsFeature): LuCadastralParcel | null {
    const p = feature.properties;
    const ref = luStr(p['national_cadastral_reference']);
    if (ref === null) return null;
    const ring = luOuterRing(feature.geometry);
    if (ring.length < 3) return null;
    return {
        nationalCadastralReference: ref,
        label: luStr(p['label']),
        areaM2: luNum(p['area']),
        section: luSectionFromZoning(p['zoning']),
        ring,
        crs: 'EPSG:4326',
        source: LU_PARCEL_PROVIDER_ID,
    };
}

/* ────────────────────────────── the resolver ──────────────────────────── */

/**
 * Map a fetched feature list → the ONE resolved parcel (point-in-polygon; else nearest). A
 * non-found outcome passes through verbatim (empty ≠ failure); a found list with no usable feature
 * is a transient (the source answered with something we cannot cite). Typed exactly so the
 * discriminated union narrows — the `firstParcelOutcome` shape the EE/HR adapters use.
 */
export function pickedLuParcelOutcome(
    outcome: FetchOutcome<readonly LuParcelWfsFeature[]>,
    lat: number,
    lon: number,
): FetchOutcome<LuCadastralParcel> {
    if (outcome.status !== 'found') return outcome;
    const picked = pickLuParcelFeature(outcome.value, lat, lon);
    const parsed = picked === null ? null : parseLuParcelFeature(picked);
    if (parsed === null) {
        return fetchTransient(
            `upstream-failed: unparsable CP.CadastralParcel feature (@${lat},${lon})`,
        );
    }
    return fetchFound(parsed);
}

/**
 * Resolve the cadastral parcel at a WGS84 point (the registry click path). Fetches a small WGS84
 * bbox, then POINT-IN-POLYGON-selects the containing parcel (else the nearest) — never features[0]
 * (measured fact 4). NEVER throws; an unreachable endpoint / an OWS exception / a 200-empty gap
 * each come back as their own typed outcome (empty ≠ failure).
 */
export async function resolveLuParcelAtWgs84Point(
    lat: number,
    lon: number,
    deps: LuParcelWfsDeps = {},
): Promise<FetchOutcome<LuCadastralParcel>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lu.resolveParcelAtPoint',
        async (span): Promise<FetchOutcome<LuCadastralParcel>> => {
            try {
                span.setAttribute('lu.lat', lat);
                span.setAttribute('lu.lon', lon);
                const url = buildLuParcelClickUrl(lat, lon);
                const outcome = await luParcelWfsGetFeatures(
                    url,
                    `${LU_PARCEL_LAYER} @ ${lat.toFixed(6)},${lon.toFixed(6)}`,
                    deps,
                );
                const result = pickedLuParcelOutcome(outcome, lat, lon);
                if (result.status === 'found') {
                    span.setAttribute('lu.resolvedRef', result.value.nationalCadastralReference);
                    span.setStatus({ code: SpanStatusCode.OK });
                } else {
                    span.setStatus(
                        result.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: result.reason }
                            : { code: SpanStatusCode.OK },
                    );
                }
                return result;
            } finally {
                span.end();
            }
        },
    );
}
