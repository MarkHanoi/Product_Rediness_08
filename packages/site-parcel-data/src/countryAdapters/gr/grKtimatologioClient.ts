// LANE GR — GREECE (GR) ADAPTER · the ONE impure seam: a FetchOutcome-classified ArcGIS REST
// `query` against the Hellenic Cadastre (Ελληνικό Κτηματολόγιο) operating-cadastre parcels.
// Mirrors the LT exemplar's boundary (`lt/ltArcgisClient.ts`): this module knows the Greek
// endpoints and their MEASURED shape and NOTHING about rules or business logic.
//
// ── WHY THIS REUSES `providers/containers/arcgisRest.ts` RATHER THAN RE-IMPLEMENTING IT ──────
// (grep-first, C84 EI-9.) That shared container was read in full before this file was written.
// The Hellenic Cadastre publishes its parcels as an ArcGIS ONLINE hosted FeatureServer, which
// answers the container's GET point-intersect verbatim — so the point-click path calls
// `queryArcgisRestPointIntersect` DIRECTLY, and this file adds only (a) the FetchOutcome
// classification the container deliberately does not do (it returns `{ok:false, detail}`, which
// conflates EMPTY with FAILURE at the type level; C57 §1.5 requires `absent ≠ transient` as
// DIFFERENT VALUES), and (b) a small GET `where=` query for the by-KAEK lookup — the one shape
// the container has no form for (its point/envelope forms both require a geometry). No second
// retry ladder is minted here — the container owns §ARCGIS-TRANSIENT-RETRY.
//
// ── MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03; bodies recorded at
// __tests__/fixtures/gr-athens-2026-09-03/recorded-live-2026-09-03.json — re-run before
// "fixing" any of these) ────────────────────────────────────────────────────────────────────
//   1. HOST + STACK: `services-eu1.arcgis.com/40tFGWzosjaLJpmn` (the Hellenic Cadastre's ArcGIS
//      Online organisation, KEYLESS). Discovered by tracing the official public viewer
//      `maps.ktimatologio.gr` (Experience Builder) -> its runtime config `cdn/2/config.json`.
//      ⚠ The OLD INSPIRE ArcGIS path `gis.ktimanet.gr/inspire/rest/services/...` cited in the EU
//      INSPIRE geoportal record now returns HTTP 404 (the geoportal was migrated to a Next.js
//      app) — do NOT resurrect it; the AGOL org above is the live channel.
//   2. FIVE PARCEL LAYERS, ONE per cadastre lifecycle stage (γεωτεμάχια = parcels):
//      • LEITOURGOUN  (λειτουργούν  = OPERATING — the completed, functioning cadastre) <- consumed
//      • ANARTHSH     (ανάρτηση     = under public display / compilation)
//      • PROKATARKTIKA(προκαταρκτικά= preliminary)
//      • APOKLEISTIKES(αποκλειστικές= exclusive-use)  • DOULEIES (δουλειές = easements)
//      This adapter reads the OPERATING layer — the authoritative, in-force fabric. A point with
//      no OPERATING parcel may still be under ANARTHSH (see GR_INCOMPLETE_CADASTRE_CAVEAT).
//   3. IDENTIFIER: `KAEK` — Κωδικός Αριθμός Εθνικού Κτηματολογίου, the 12-digit national cadastre
//      code (Athens/Syntagma = "050095701001", measured). Carried OPAQUE — never split into
//      νομός/ΟΤΑ/τομέας/ΟΤ components (that grammar is not served, and inventing it would be the
//      [[fake-more-capable-than-real]] defect).
//   4. AREA is SERVED: the `AREA` field is the register's own m² (Syntagma 10 839.77 m², matches
//      PERIMETER 404.3 m). It is NOT `Shape__Area`, which is the Web-Mercator-distorted area
//      (17 487 m² for the same parcel — the ~1.6x 38°N Mercator scale-factor). This adapter
//      carries `AREA` verbatim and computes NO geometry (so requesting a WGS84 ring for the map
//      click is safe — it is NOT the Madrid/Murcia measure-after-reprojection trap).
//   5. CRS: the hosted layer stores in EPSG:3857; it reprojects SERVER-SIDE. The click path asks
//      `inSR=4326&outSR=4326` and gets a WGS84 ring back (`spatialReference {wkid:4326}`,
//      measured) — the normalise target every euCadastreProxy row already uses.
//   6. FAILURE SHAPE: an invalid field returns **HTTP 200** with
//      `{"error":{"code":400,"message":"Cannot perform query. Invalid query parameters.",
//      "details":["'Invalid field: NOTAFIELD' parameter is invalid"]}}` (measured). The shared
//      container maps that to `{ok:false}`, and this module classifies it TRANSIENT
//      (`upstream-failed`) carrying the server's own message — a misquery can never read as
//      "no parcel here" (§CONTEXT-DATA-HONESTY).
//
// FetchOutcome end-to-end (C57 §1.5) — EMPTY and FAILURE are DIFFERENT VALUES:
//   • container {ok:false}                 -> transient (`upstream-failed`, names detail + url)
//   • container {ok:true}, zero features   -> absent    (a DURABLE "nothing here", cacheable)
//   • container {ok:true}, >=1 feature     -> found
//
// Licence: open access via the Hellenic Cadastre public geoportal/viewer; the exact licence text
// was NOT captured this pass (the sweep flagged "licence id not confirmed"). The source row keeps
// `colour: YELLOW`, `verifiedDate: null` to match that honesty — see grSources.ts.

import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import {
    queryArcgisRestPointIntersect,
    type ArcgisRestFeature,
    type ArcgisRestQueryResult,
} from '../../providers/containers/arcgisRest.js';

const tracer = trace.getTracer('pryzm.siteintel.gr');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/** The Hellenic Cadastre ArcGIS Online organisation root (keyless). */
export const GR_KTIMATOLOGIO_AGOL_BASE =
    'https://services-eu1.arcgis.com/40tFGWzosjaLJpmn/arcgis/rest/services';

/**
 * The OPERATING-cadastre parcel FeatureServer (γεωτεμάχια που λειτουργούν). PROBED LIVE
 * 2026-09-03: `?f=json` -> Feature Layer, `geometryType: esriGeometryPolygon`,
 * `capabilities: "Query"`, `maxRecordCount: 2000`; fields KAEK · MAIN_USE · PERCENTAGE · DESCR ·
 * PROP_VERT · PROP_HOR · LINK · AREA · PERIMETER.
 */
export const GR_PARCEL_SERVICE =
    `${GR_KTIMATOLOGIO_AGOL_BASE}/GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer`;
export const GR_PARCEL_LAYER_ID = 0;

/**
 * Native storage CRS of the hosted layer (EPSG:3857 / Web Mercator). The click path never
 * measures in it — geometry comes back in WGS84 (`outSR=4326`) and AREA is the served register
 * value — so this constant is documentation, not a value this adapter reprojects through.
 */
export const GR_LAYER_STORAGE_CRS = 'EPSG:3857';
/** The CRS this adapter's parcel rings are expressed in (server-side reprojected). */
export const GR_RING_CRS = 'EPSG:4326';

/**
 * The `outFields` this adapter asks for — explicit, never `*` (a widened upstream column must be a
 * deliberate adapter change, not a silent widening of what downstream code may read).
 */
export const GR_PARCEL_OUT_FIELDS = [
    'KAEK',
    'MAIN_USE',
    'PERCENTAGE',
    'DESCR',
    'PROP_VERT',
    'PROP_HOR',
    'LINK',
    'AREA',
    'PERIMETER',
].join(',');

/* ────────────────────────────── deps + classify ───────────────────────── */

/** Injectable dependencies so every GR provider is unit-testable without the network. */
export interface GrArcgisDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
    /** Request timeout in ms (default 30_000). */
    readonly timeoutMs?: number;
}

/** The `query` endpoint URL for the parcel layer — pure, so a test can assert the address. */
export function grParcelQueryUrl(): string {
    return `${GR_PARCEL_SERVICE}/${GR_PARCEL_LAYER_ID}/query`;
}

/**
 * Classify a WGS84 POINT-intersect against the operating-parcel layer into a FetchOutcome.
 * Delegates the network + retry + ArcGIS-error-body detection to the shared container, then
 * splits its `{ok:false}` (FAILURE -> transient) from `{ok:true, features:[]}` (durable ABSENCE).
 * NEVER throws.
 */
export async function grParcelPointQuery(
    lat: number,
    lon: number,
    queryLabel: string,
    deps: GrArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.gr.parcelPointQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            span.setAttribute('gr.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(
                        `endpoint-unreachable: no fetch implementation (${grParcelQueryUrl()})`,
                    );
                }
                const res = await queryArcgisRestPointIntersect({
                    fetchImpl,
                    serviceBase: GR_PARCEL_SERVICE,
                    layerId: GR_PARCEL_LAYER_ID,
                    lat,
                    lon,
                    inSR: 4326,
                    outSR: 4326,
                    outFields: GR_PARCEL_OUT_FIELDS,
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
 * The by-KAEK lookup — a GET `where=KAEK='…'` query. The shared container has no attribute-only
 * form (both its shapes require a geometry), so this is the ONE hand-built request in the file.
 * Same honesty contract: an ArcGIS 200-with-`error` body is a FAILURE, never an empty answer.
 */
export async function grParcelWhereQuery(
    where: string,
    queryLabel: string,
    deps: GrArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.gr.parcelWhereQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            const url = grParcelQueryUrl();
            span.setAttribute('gr.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                const qs = new URLSearchParams({
                    where,
                    outFields: GR_PARCEL_OUT_FIELDS,
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
                const errDetail = extractGrArcgisError(body);
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
                span.setAttribute('gr.features', features.length);
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
        // "the source did not give a usable answer" -> transient, carrying the container's detail.
        span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
        return fetchTransient(`upstream-failed: ${res.detail} — ${queryLabel}`);
    }
    if (res.features.length === 0) {
        span.setStatus({ code: SpanStatusCode.OK });
        return fetchAbsent(`no-feature: ${queryLabel}`);
    }
    span.setAttribute('gr.features', res.features.length);
    span.setStatus({ code: SpanStatusCode.OK });
    return fetchFound(res.features);
}

/* ────────────────────────────── pure body readers ─────────────────────── */

/** The ArcGIS 200-with-`error` detail, or null when the body is a normal answer. */
export function extractGrArcgisError(parsed: unknown): string | null {
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

/** SQL string-literal escaping for a `where` clause (single quote doubled). KAEK is digits-only,
 *  so this is belt-and-braces — but interpolating a caller string unescaped is a latent defect. */
export function grSqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/** Non-empty trimmed string, or null. */
export function grStr(attrs: Record<string, unknown>, key: string): string | null {
    const v = attrs[key];
    if (typeof v === 'string') {
        const s = v.trim();
        return s === '' ? null : s;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Finite number, or null. */
export function grNum(attrs: Record<string, unknown>, key: string): number | null {
    const v = attrs[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/** The outer ring of an esri polygon, `[lon, lat]` pairs exactly as served. `[]` when absent. */
export function grEsriOuterRing(geometry: unknown): Array<readonly [number, number]> {
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
