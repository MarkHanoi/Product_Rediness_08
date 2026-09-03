// LANE SK — SLOVAKIA (SK) ADAPTER · the ONE impure seam: a FetchOutcome-classified ArcGIS REST
// `query` against the ÚGKK/GKÚ ESKN cadastre (Elektronické služby katastra nehnuteľností).
// Mirrors the GR/LT exemplars' boundary (`gr/grKtimatologioClient.ts`, `lt/ltArcgisClient.ts`):
// this module knows the Slovak endpoint and its MEASURED shape and NOTHING about rules or business
// logic.
//
// ── WHY THIS REUSES `providers/containers/arcgisRest.ts` RATHER THAN RE-IMPLEMENTING IT ──────────
// (grep-first, C84 EI-9.) That shared container was read in full before this file was written. The
// ÚGKK ESKN cadastre publishes its C-parcels as an ArcGIS 10.91 MapServer, which answers the
// container's GET point-intersect verbatim (measured 2026-09-03) — so the point-click path calls
// `queryArcgisRestPointIntersect` DIRECTLY, and this file adds only (a) the FetchOutcome
// classification the container deliberately does not do (it returns `{ok:false, detail}`, which
// conflates EMPTY with FAILURE at the type level; C57 §1.5 requires `absent ≠ transient` as
// DIFFERENT VALUES), and (b) a small GET `objectIds=…` query for the by-register-C-id lookup — the
// one shape the container has no form for (its point/envelope forms both require a geometry). No
// second retry ladder is minted here — the container owns §ARCGIS-TRANSIENT-RETRY.
//
// ── MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03; bodies recorded at
// __tests__/fixtures/sk-bratislava-2026-09-03/recorded-live-2026-09-03.json — re-run before
// "fixing" any of these) ─────────────────────────────────────────────────────────────────────────
//   1. HOST + STACK: `kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer` — ArcGIS 10.91
//      MapServer, `copyrightText: "© Úrad geodézie, kartografie a katastra SR"`, KEYLESS. The
//      ESKN REST *directory listing* is nginx-403 (WAF), but named services answer normally.
//   2. LAYER 9 = "Plocha parcely C" (the C-register parcel AREA polygons), the queryable Feature
//      Layer (`capabilities: Map,Query,Data`, `esriGeometryPolygon`). The parent id 4 "Parcela C"
//      is a GROUP layer (no geometry). C-parcels are the legal registered fabric (KN); the E-parcels
//      (former land-register) are a sibling service and are NOT consumed here.
//   3. IDENTITY: `PARCEL_NUMBER` (parcelné číslo, string e.g. "15") within `CADASTRAL_UNIT_ID`
//      (katastrálne územie numeric id, e.g. 2933) — the citizen-facing cadastral identity. `ID`
//      (esriFieldTypeOID, e.g. 2090872505) is the register-C parcel primary key. `FOLIO_ID` is the
//      list vlastníctva (LV / title-deed) id. `DESCRIPTIVE_AREA_OF_PARCEL` is the register's own
//      m² (Výmera SPI) — carried VERBATIM, NEVER derived from the ring (the Madrid/Murcia
//      measure-after-reprojection trap). `CADASTRAL_UNIT_ID` is a NUMERIC code; the katastrálne
//      územie NAME is a codelist join not served on this layer — carried opaque, never invented.
//   4. CRS: the layer stores in EPSG:3857 (Web Mercator; the national CRS is S-JTSK/EPSG:5514). It
//      reprojects SERVER-SIDE. The click path asks `inSR=4326&outSR=4326` and gets a WGS84 ring
//      back (`spatialReference {wkid:4326}`, measured) — the normalise target every euCadastreProxy
//      row already uses.
//   5. ⛔ THE WAF BLOCKS ATTRIBUTE `where=` QUERIES. A `?where=…` request (even `where=1=1`)
//      returns an nginx **HTTP 403** HTML error page ("An error occurred…"), a SQL-injection guard
//      posture — NOT an ArcGIS error body. `objectIds=<n>` is NOT SQL and IS allowed (HTTP 200
//      JSON, measured). So the by-id lookup here uses `objectIds`, never `where` — a by-`where`
//      resolver would 403 on every call ([[committed-is-not-reachable]]). This is a MEASURED
//      constraint of the SK public endpoint, not a design preference.
//   6. FAILURE-vs-EMPTY: a point with no C-parcel (e.g. outside SK coverage) returns **HTTP 200**
//      with `features: []` (durable ABSENT). Transport throw / non-OK HTTP / the WAF 403 all mean
//      "the source did not answer" → TRANSIENT. Empty and failure are DIFFERENT VALUES.
//
// FetchOutcome end-to-end (C57 §1.5) — EMPTY and FAILURE are DIFFERENT VALUES:
//   • container {ok:false} / non-OK HTTP / WAF 403  -> transient (`upstream-failed`, names detail)
//   • container {ok:true}, zero features            -> absent    (a DURABLE "nothing here")
//   • container {ok:true}, >=1 feature              -> found
//
// Licence: the Slovak cadastral parcels are a formal EU HIGH-VALUE DATASET (Open Data Directive
// 2019/1024, HVD Implementing Regulation (EU) 2023/138 — Geospatial/Cadastral-parcels), mandated
// free + machine-readable, and the datasets are CC-BY-tagged on data.gov.sk (rest-of-europe sweep
// 2026-08-31). The EXACT licence text of THIS REST endpoint was not captured this pass, so the
// source row keeps `colour: YELLOW`, `verifiedDate: null` — an honest "read the endpoint terms
// before relying on redistribution", never a GREEN this lane cannot back. See skSources.ts.

import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    queryArcgisRestPointIntersect,
    type ArcgisRestFeature,
    type ArcgisRestQueryResult,
} from '../../providers/containers/arcgisRest.js';

const tracer = trace.getTracer('pryzm.siteintel.sk');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/** The ÚGKK/GKÚ ESKN cadastre MapServer root (keyless). */
export const SK_ESKN_KN_SERVICE =
    'https://kataster.skgeodesy.sk/eskn/rest/services/VRM/kn/MapServer';
/** Layer 9 — "Plocha parcely C" (C-register parcel area polygons), the queryable feature layer. */
export const SK_PARCEL_C_LAYER_ID = 9;

/**
 * Native storage CRS of the hosted layer (EPSG:3857 / Web Mercator). The national CRS is
 * S-JTSK / EPSG:5514. The click path never measures in either — geometry comes back in WGS84
 * (`outSR=4326`) and area is the served register value — so this constant is documentation, not a
 * value this adapter reprojects through.
 */
export const SK_LAYER_STORAGE_CRS = 'EPSG:3857';
/** The CRS this adapter's parcel rings are expressed in (server-side reprojected). */
export const SK_RING_CRS = 'EPSG:4326';

/**
 * The `outFields` this adapter asks for — explicit, never `*` (a widened upstream column must be a
 * deliberate adapter change, not a silent widening of what downstream code may read).
 */
export const SK_PARCEL_OUT_FIELDS = [
    'ID',
    'PARCEL_NUMBER',
    'CADASTRAL_UNIT_ID',
    'DESCRIPTIVE_AREA_OF_PARCEL',
    'FOLIO_ID',
    'NATURE_OF_LAND_USE_ID',
    'VALID_TO_DATE',
].join(',');

/* ────────────────────────────── deps + classify ───────────────────────── */

/** Injectable dependencies so every SK provider is unit-testable without the network. */
export interface SkArcgisDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
    /** Request timeout in ms (default 30_000). */
    readonly timeoutMs?: number;
}

/** The `query` endpoint URL for the C-parcel layer — pure, so a test can assert the address. */
export function skParcelQueryUrl(): string {
    return `${SK_ESKN_KN_SERVICE}/${SK_PARCEL_C_LAYER_ID}/query`;
}

/**
 * Classify a WGS84 POINT-intersect against the C-parcel layer into a FetchOutcome. Delegates the
 * network + retry + ArcGIS-error-body detection to the shared container, then splits its
 * `{ok:false}` (FAILURE -> transient) from `{ok:true, features:[]}` (durable ABSENCE). NEVER throws.
 */
export async function skParcelPointQuery(
    lat: number,
    lon: number,
    queryLabel: string,
    deps: SkArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.sk.parcelPointQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            span.setAttribute('sk.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(
                        `endpoint-unreachable: no fetch implementation (${skParcelQueryUrl()})`,
                    );
                }
                const res = await queryArcgisRestPointIntersect({
                    fetchImpl,
                    serviceBase: SK_ESKN_KN_SERVICE,
                    layerId: SK_PARCEL_C_LAYER_ID,
                    lat,
                    lon,
                    inSR: 4326,
                    outSR: 4326,
                    outFields: SK_PARCEL_OUT_FIELDS,
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
 * The by-register-C-id lookup — a GET `objectIds=<id>` query. ⛔ NOT a `where=` query: the SK ESKN
 * WAF returns HTTP 403 for any `where=` clause (measured 2026-09-03); `objectIds` is not SQL and is
 * allowed. The shared container has no attribute-only form (both its shapes require a geometry), so
 * this is the ONE hand-built request in the file. Same honesty contract: a non-OK HTTP (the WAF
 * included) or an ArcGIS 200-with-`error` body is a FAILURE, never an empty answer.
 */
export async function skParcelByObjectIdQuery(
    registerCId: number,
    queryLabel: string,
    deps: SkArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.sk.parcelByObjectIdQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            const url = skParcelQueryUrl();
            span.setAttribute('sk.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                const qs = new URLSearchParams({
                    objectIds: String(registerCId),
                    outFields: SK_PARCEL_OUT_FIELDS,
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
                    return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url} (${queryLabel})`);
                }
                let body: unknown;
                try {
                    body = await res.json();
                } catch {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
                }
                const errDetail = extractSkArcgisError(body);
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
                span.setAttribute('sk.features', features.length);
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
        // Container failure = transport throw / non-OK HTTP (the WAF 403 included) / ArcGIS
        // 200-with-error body. All are "the source did not give a usable answer" -> transient,
        // carrying the container's detail.
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
        return fetchTransient(`upstream-failed: ${res.detail} — ${queryLabel}`);
    }
    if (res.features.length === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
        return fetchAbsent(`no-feature: ${queryLabel}`);
    }
    span.setAttribute('sk.features', res.features.length);
    span.setStatus({ code: SpanStatusCode.OK });
    return fetchFound(res.features);
}

/* ────────────────────────────── pure body readers ─────────────────────── */

/** The ArcGIS 200-with-`error` detail, or null when the body is a normal answer. */
export function extractSkArcgisError(parsed: unknown): string | null {
    if (parsed === null || typeof parsed !== 'object') return null;
    const err = (parsed as { error?: unknown }).error;
    if (err === null || typeof err !== 'object') return null;
    const e = err as { code?: unknown; message?: unknown; details?: unknown };
    const details = Array.isArray(e.details) ? ` (${e.details.map(String).join('; ')})` : '';
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

/** Non-empty trimmed string, or null. A numeric attribute is stringified (identity-preserving). */
export function skStr(attrs: Record<string, unknown>, key: string): string | null {
    const v = attrs[key];
    if (typeof v === 'string') {
        const s = v.trim();
        return s === '' ? null : s;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Finite number, or null. */
export function skNum(attrs: Record<string, unknown>, key: string): number | null {
    const v = attrs[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** The outer ring of an esri polygon, `[lon, lat]` pairs exactly as served. `[]` when absent. */
export function skEsriOuterRing(geometry: unknown): Array<readonly [number, number]> {
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
