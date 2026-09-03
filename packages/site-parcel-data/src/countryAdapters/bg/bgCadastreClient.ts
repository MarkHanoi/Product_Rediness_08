// LANE BG — BULGARIA (BG) ADAPTER · the ONE impure seam: a FetchOutcome-classified ArcGIS REST
// `query` against the GCCA/AGKK (Агенция по геодезия, картография и кадастър) INSPIRE
// Cadastral-Parcels service. Mirrors the GR exemplar's boundary (`gr/grKtimatologioClient.ts`):
// this module knows the Bulgarian endpoints and their MEASURED shape and NOTHING about rules or
// business logic.
//
// ── WHY THIS REUSES `providers/containers/arcgisRest.ts` RATHER THAN RE-IMPLEMENTING IT ──────
// (grep-first, C84 EI-9.) That shared container was read in full before this file was written. The
// GCCA INSPIRE parcel service is an ArcGIS **MapServer** with `capabilities: Data,Map,Query`, whose
// `<base>/<layerId>/query` answers the container's GET point-intersect verbatim (the container's
// header says it serves FeatureServer OR MapServer) — so the point-click path calls
// `queryArcgisRestPointIntersect` DIRECTLY, and this file adds only (a) the FetchOutcome
// classification the container deliberately does not do (it returns `{ok:false, detail}`, which
// conflates EMPTY with FAILURE at the type level; C57 §1.5 requires `absent ≠ transient` as
// DIFFERENT VALUES), and (b) a small GET `where=` query for the by-reference lookup — the one shape
// the container has no form for (its point/envelope forms both require a geometry). No second retry
// ladder is minted here — the container owns §ARCGIS-TRANSIENT-RETRY.
//
// ── MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03; bodies recorded at
// __tests__/fixtures/bg-sofia-2026-09-03/ — re-run before "fixing" any of these; transcript
// audit/europe-adapters-2/2026-09-02/lane-bg-transcripts/01-inspire-cadastre-probe.md) ────────
//   1. HOST + STACK: `https://inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer`
//      (the GCCA INSPIRE endpoint, KEYLESS). Discovered via the national INSPIRE geoportal
//      `inspire.egov.bg` → its GeoNetwork catalog record "Cadastral parcels - GCCA".
//      ⚠ Do NOT use `arcgis.cadastre.bg` (the KAIS app backend): it is WAF-guarded (F5 "Request
//      Rejected"), allowing only the service root + `/export` and returning HTTP 403 for every
//      attribute/geometry path (`/query`, `/identify`, `/<layer>`, `WFSServer`, `WMSServer`). The
//      `inspire.cadastre.bg` host is NOT so guarded — its REST `query` answers even the default
//      (non-browser) UA, so this container's Node `fetch` reaches it.
//   2. ONE PARCEL LAYER: id `0`, name `CP.CadastralParcel` (esriGeometryPolygon). Fields:
//      `nationalcadastralref` (the id, e.g. "68134.100.5" — EKATTE settlement code + кадастрален
//      район + parcel) · `id_localid` · `id_namespace` ("BG.CP") · `areavalue` (register m²) ·
//      `areavalue_uom` ("m2") · `label` · `admunit` · `validfrom` · `beginlifespanversion`.
//   3. IDENTIFIER: `nationalcadastralref` — the Bulgarian cadastral identifier (идентификатор).
//      Carried OPAQUE — never split into EKATTE/район/parcel components (that grammar is not served
//      as fields, and inventing it would be the [[fake-more-capable-than-real]] defect).
//   4. AREA is SERVED: `areavalue` is the register's own m² (Sofia 68134.100.5 = 3499 m²). This
//      adapter carries it verbatim and computes NO geometry area (never the Madrid/Murcia
//      measure-after-reprojection trap).
//   5. CRS: the layer stores in EPSG:4258 (ETRS89) and reprojects SERVER-SIDE. The click path asks
//      `inSR=4326&outSR=4326` and gets a WGS84 ring back (`spatialReference {wkid:4326}`, measured)
//      — the normalise target every euCadastreProxy row already uses. The WMS also advertises the
//      native EPSG:7801 (BGS2005) for anyone needing metres.
//   6. FAILURE SHAPE: an invalid field returns **HTTP 200** with
//      `{"error":{"code":400,"message":"Failed to execute query.","details":[]}}` (measured). The
//      shared container maps that to `{ok:false}`, and this module classifies it TRANSIENT
//      (`upstream-failed`) — a misquery can never read as "no parcel here" (§CONTEXT-DATA-HONESTY).
//   7. A SECOND KEYLESS CHANNEL, the sweep-confirmed WMS view service, is pinned here as a pure URL
//      builder + geo+json parser (buildBgWmsGetFeatureInfoUrl / parseBgWmsGetFeatureInfo). The
//      official INSPIRE **download (WFS)** extension is DISABLED for parcels (GetCapabilities →
//      ExceptionReport "No operation…"), so the REST query + the WMS GetFeatureInfo are the two
//      working keyless channels; the REST query is primary because it also returns geometry (the
//      WMS GFI returns attributes with geometry=null).
//
// FetchOutcome end-to-end (C57 §1.5) — EMPTY and FAILURE are DIFFERENT VALUES:
//   • container {ok:false}                 → transient (`upstream-failed`, names detail + label)
//   • container {ok:true}, zero features   → absent    (a DURABLE "nothing here", cacheable)
//   • container {ok:true}, ≥1 feature      → found
//
// Licence: keyless service access via the GCCA INSPIRE endpoint; the exact data-REUSE licence text
// was NOT captured this pass (the sweep flagged BG "licence/open-data status only partial", and the
// official PDF extract is a PAID service). The source row keeps `colour: YELLOW`,
// `verifiedDate: null` to match that honesty — see bgSources.ts.

import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    queryArcgisRestPointIntersect,
    type ArcgisRestFeature,
    type ArcgisRestQueryResult,
} from '../../providers/containers/arcgisRest.js';

const tracer = trace.getTracer('pryzm.siteintel.bg');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/** The GCCA/AGKK INSPIRE cadastral-parcel ArcGIS REST service root (keyless). PROBED LIVE 2026-09-03. */
export const BG_INSPIRE_CADASTRE_BASE =
    'https://inspire.cadastre.bg/arcgis/rest/services/Cadastral_Parcel/MapServer';
export const BG_PARCEL_LAYER_ID = 0;

/** The sweep-confirmed INSPIRE WMS view service (same service, WMS façade). GetFeatureInfo keyless. */
export const BG_INSPIRE_CADASTRE_WMS =
    'https://inspire.cadastre.bg/arcgis/services/Cadastral_Parcel/MapServer/WMSServer';
/** The queryable WMS layer name (Title `CP.CadastralParcel`). PROBED LIVE 2026-09-03. */
export const BG_WMS_LAYER = '0';

/** Native storage CRS of the layer (EPSG:4258 / ETRS89); the WMS also advertises EPSG:7801 (BGS2005). */
export const BG_LAYER_STORAGE_CRS = 'EPSG:4258';
/** The CRS this adapter's parcel rings are expressed in (server-side reprojected). */
export const BG_RING_CRS = 'EPSG:4326';

/**
 * The `outFields` this adapter asks for — explicit, never `*` (a widened upstream column must be a
 * deliberate adapter change, not a silent widening of what downstream code may read).
 */
export const BG_PARCEL_OUT_FIELDS = [
    'nationalcadastralref',
    'id_localid',
    'id_namespace',
    'areavalue',
    'areavalue_uom',
    'label',
    'admunit',
    'validfrom',
    'beginlifespanversion',
].join(',');

/* ────────────────────────────── deps + classify ───────────────────────── */

/** Injectable dependencies so every BG provider is unit-testable without the network (GR shape). */
export interface BgArcgisDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
    /** Request timeout in ms (default 30_000). */
    readonly timeoutMs?: number;
}

/** The `query` endpoint URL for the parcel layer — pure, so a test can assert the address. */
export function bgParcelQueryUrl(): string {
    return `${BG_INSPIRE_CADASTRE_BASE}/${BG_PARCEL_LAYER_ID}/query`;
}

/**
 * Classify a WGS84 POINT-intersect against the cadastral-parcel layer into a FetchOutcome.
 * Delegates the network + retry + ArcGIS-error-body detection to the shared container, then splits
 * its `{ok:false}` (FAILURE → transient) from `{ok:true, features:[]}` (durable ABSENCE). NEVER
 * throws.
 */
export async function bgParcelPointQuery(
    lat: number,
    lon: number,
    queryLabel: string,
    deps: BgArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.bg.parcelPointQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            span.setAttribute('bg.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(
                        `endpoint-unreachable: no fetch implementation (${bgParcelQueryUrl()})`,
                    );
                }
                const res = await queryArcgisRestPointIntersect({
                    fetchImpl,
                    serviceBase: BG_INSPIRE_CADASTRE_BASE,
                    layerId: BG_PARCEL_LAYER_ID,
                    lat,
                    lon,
                    inSR: 4326,
                    outSR: 4326,
                    outFields: BG_PARCEL_OUT_FIELDS,
                    timeoutMs: deps.timeoutMs ?? 30_000,
                });
                return classifyArcgis(res, queryLabel, span);
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The by-reference lookup — a GET `where=nationalcadastralref='…'` query. The shared container has
 * no attribute-only form (both its shapes require a geometry), so this is the ONE hand-built request
 * in the file. Same honesty contract: an ArcGIS 200-with-`error` body is a FAILURE, never an empty
 * answer.
 */
export async function bgParcelWhereQuery(
    where: string,
    queryLabel: string,
    deps: BgArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.bg.parcelWhereQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            const url = bgParcelQueryUrl();
            span.setAttribute('bg.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                const qs = new URLSearchParams({
                    where,
                    outFields: BG_PARCEL_OUT_FIELDS,
                    returnGeometry: 'true',
                    outSR: '4326',
                    f: 'json',
                }).toString();
                let res: Response;
                try {
                    res = await fetchImpl(`${url}?${qs}`, {
                        headers: { Accept: 'application/json' },
                        signal: AbortSignal.timeout(deps.timeoutMs ?? 30_000),
                    });
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                    return fetchTransient(
                        `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                    );
                }
                if (!res.ok) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}`);
                }
                let body: unknown;
                try {
                    body = await res.json();
                } catch {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
                }
                const errDetail = extractBgArcgisError(body);
                if (errDetail !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: ${errDetail} from ${url} — ${queryLabel}`);
                }
                const features = extractFeatures(body);
                if (features === null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: no features array from ${url}`);
                }
                if (features.length === 0) {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-feature: ${queryLabel}`);
                }
                span.setAttribute('bg.features', features.length);
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchFound(features);
            } finally {
                span.end();
            }
        },
    );
}

/** Split the shared container's result into found / absent / transient. */
function classifyArcgis(
    res: ArcgisRestQueryResult,
    queryLabel: string,
    span: Span,
): FetchOutcome<readonly ArcgisRestFeature[]> {
    if (!res.ok) {
        // Container failure = transport throw / non-OK HTTP / ArcGIS 200-with-error body. All are
        // "the source did not give a usable answer" → transient, carrying the container's detail.
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
        return fetchTransient(`upstream-failed: ${res.detail} — ${queryLabel}`);
    }
    if (res.features.length === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
        return fetchAbsent(`no-feature: ${queryLabel}`);
    }
    span.setAttribute('bg.features', res.features.length);
    span.setStatus({ code: SpanStatusCode.OK });
    return fetchFound(res.features);
}

/* ────────────────────── WMS GetFeatureInfo (sweep-confirmed view channel) ─── */

/**
 * Build a keyless WMS 1.3.0 GetFeatureInfo URL for a small click window centred on a WGS84 point.
 * Uses `CRS:84` (lon,lat — unambiguous; WMS 1.3.0 `EPSG:4326` is lat,lon and an easy silent trap)
 * and `application/geo+json`. PURE — so a test can assert the request shape without a network call.
 * The window half-width `dDeg` (default ~0.0015° ≈ 120 m) keeps the map scale finer than the
 * layer's MaxScaleDenominator (1:18899) so the queryable layer is visible.
 */
export function buildBgWmsGetFeatureInfoUrl(lat: number, lon: number, dDeg = 0.0015): string {
    const west = lon - dDeg;
    const east = lon + dDeg;
    const south = lat - dDeg;
    const north = lat + dDeg;
    const params = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.3.0',
        REQUEST: 'GetFeatureInfo',
        LAYERS: BG_WMS_LAYER,
        QUERY_LAYERS: BG_WMS_LAYER,
        CRS: 'CRS:84',
        BBOX: `${west},${south},${east},${north}`,
        WIDTH: '500',
        HEIGHT: '500',
        I: '250',
        J: '250',
        INFO_FORMAT: 'application/geo+json',
        FEATURE_COUNT: '5',
    });
    return `${BG_INSPIRE_CADASTRE_WMS}?${params.toString()}`;
}

/** One WMS GetFeatureInfo geo+json properties bag → the national cadastral reference, or null. */
export function parseBgWmsGetFeatureInfo(parsed: unknown): string | null {
    if (parsed === null || typeof parsed !== 'object') return null;
    const feats = (parsed as { features?: unknown }).features;
    if (!Array.isArray(feats) || feats.length === 0) return null;
    const first = feats[0];
    if (first === null || typeof first !== 'object') return null;
    const props = (first as { properties?: unknown }).properties;
    if (props === null || typeof props !== 'object') return null;
    const p = props as Record<string, unknown>;
    const ref = p['nationalCadastralReference'] ?? p['inspireId_localId'] ?? p['Unique identifier'];
    if (typeof ref === 'string' && ref.trim() !== '' && ref.trim().toUpperCase() !== 'NULL') {
        return ref.trim();
    }
    if (typeof ref === 'number' && Number.isFinite(ref)) return String(ref);
    return null;
}

/* ────────────────────────────── pure body readers ─────────────────────── */

/** The ArcGIS 200-with-`error` detail, or null when the body is a normal answer. */
export function extractBgArcgisError(parsed: unknown): string | null {
    if (parsed === null || typeof parsed !== 'object') return null;
    const err = (parsed as { error?: unknown }).error;
    if (err === null || typeof err !== 'object') return null;
    const e = err as { code?: unknown; message?: unknown; details?: unknown };
    const details = Array.isArray(e.details) && e.details.length > 0 ? ` (${e.details.map(String).join('; ')})` : '';
    return `ArcGIS ${e.code ?? '?'}: ${e.message ?? 'error'}${details}`;
}

/** The `features` array as clean `ArcgisRestFeature`s, or null when the body has no array. */
function extractFeatures(body: unknown): ArcgisRestFeature[] | null {
    const raw = (body as { features?: unknown }).features;
    if (!Array.isArray(raw)) return null;
    const clean: ArcgisRestFeature[] = [];
    for (const f of raw) {
        if (f !== null && typeof f === 'object') {
            const attrs = (f as { attributes?: unknown }).attributes;
            if (attrs !== null && typeof attrs === 'object') {
                clean.push({
                    attributes: attrs as Record<string, unknown>,
                    geometry: (f as { geometry?: unknown }).geometry,
                });
            }
        }
    }
    return clean;
}

/** SQL string-literal escaping for a `where` clause (single quote doubled). The cadastral
 *  reference is dotted digits, so this is belt-and-braces — but interpolating a caller string
 *  unescaped is a latent defect. */
export function bgSqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Non-empty trimmed string (with the served literal "Null" treated as absence), or null. */
export function bgStr(attrs: Record<string, unknown>, key: string): string | null {
    const v = attrs[key];
    if (typeof v === 'string') {
        const s = v.trim();
        return s === '' || s.toUpperCase() === 'NULL' ? null : s;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Finite number, or null. */
export function bgNum(attrs: Record<string, unknown>, key: string): number | null {
    const v = attrs[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** The outer ring of an esri polygon, `[lon, lat]` pairs exactly as served. `[]` when absent. */
export function bgEsriOuterRing(geometry: unknown): Array<readonly [number, number]> {
    const out: Array<readonly [number, number]> = [];
    if (geometry === null || typeof geometry !== 'object') return out;
    const rings = (geometry as { rings?: unknown }).rings;
    if (!Array.isArray(rings) || rings.length === 0) return out;
    const outer = rings[0];
    if (!Array.isArray(outer)) return out;
    for (const pair of outer) {
        if (Array.isArray(pair) && pair.length >= 2) {
            const x = Number(pair[0]);
            const y = Number(pair[1]);
            if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y] as const);
        }
    }
    return out;
}
