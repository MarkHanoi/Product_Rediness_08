// E6-LT — LITHUANIA (LT) ADAPTER · the ONE impure seam: a FetchOutcome-classified ArcGIS REST
// `query`. Mirrors the EE exemplar's boundary exactly (`ee/eeWfsClient.ts`): this module knows
// the Lithuanian endpoints and their MEASURED quirks and NOTHING about rules or business logic
// (that is `ltRuleMapper.ts`, which is pure).
//
// ── WHY THIS IS NOT A RIVAL OF `providers/containers/arcgisRest.ts` (grep-first, C84 EI-9) ──
// That container was read in full before this file was written. It proves the ArcGIS honesty
// doctrine this file inherits VERBATIM ("ArcGIS returns HTTP 200 with an `{"error": {...}}`
// payload on a bad request, which is a FAILURE, not an empty answer") and this module reuses
// its `ArcgisRestFeature` type rather than re-declaring one. What it does NOT have, measured
// 2026-09-01, is any of the three query shapes Lithuania needs:
//   • an attribute-only `where` query with no geometry (parcel by `kadastro_nr`; TPD by
//     `TPD_ID`) — both its exported forms REQUIRE a geometry;
//   • a POLYGON-ring intersect (the ASGR-at-parcel query) — it offers point and envelope only,
//     and an envelope over-covers (the EE lane measured exactly that failure: a ring bbox
//     returned 6 features from 3 different plans where the exact intersect returned 2);
//   • POST — it is GET-only, and a cadastral ring does not reliably fit a URL.
// It also returns `{ok:false, detail}`, which conflates EMPTY with FAILURE at the type level;
// E4 control 7 + C57 §1.5 require `FetchOutcome`, where `absent` and `transient` are DIFFERENT
// VALUES. Extending the container would be the right long-term home for the three shapes, but
// it is a SHARED file this lane may not edit (barrel protocol) — the reconciliation is queued
// in the findings file, not performed here.
//
// ── MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-01; transcripts in
// audit/europe-site-intel/2026-08-31/impl/lane-e6-lt-transcripts/ — re-run them before
// "fixing" any of these) ────────────────────────────────────────────────────────────────────
//   1. TWO SERVICES, ONE DIALECT (ArcGIS REST 11.1):
//      • VTPSI/TPDR `tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/…` —
//        `ASGR/MapServer/0` (consolidated valid regulations) and `ribos/MapServer/0`
//        (registered TPD boundaries = the plan register). Keyless.
//      • Registru centras parcels republished by Statistics Lithuania —
//        `osp-sdg.stat.gov.lt/arcgis/rest/services/ntr_sklypai/FeatureServer/0`. Keyless.
//   2. CRS: native LKS-94 / EPSG:3346 everywhere (the service reports
//      `spatialReference {wkid: 2600, latestWkid: 3346}` — READ `latestWkid`; 2600 is the
//      deprecated code and measuring after a reprojection is the Madrid trap this repo already
//      paid for). Every query below passes `inSR=3346&outSR=3346`: no client-side projection
//      exists anywhere in this adapter.
//   3. FAILURE SHAPE: an unknown field name returns **HTTP 200** with
//      `{"error":{"code":400,"message":"Unable to complete operation.",
//      "details":["Unable to perform query operation."]}}` — MEASURED (a `kad_nr=` where-clause
//      against a layer whose column is `kadastro_nr`). Classified TRANSIENT carrying the
//      server's own code+message, so a misconfiguration can never read as "no data here"
//      (§CONTEXT-DATA-HONESTY).
//   4. POST, not GET: the ASGR query carries a parcel ring as `geometry`; an
//      `application/x-www-form-urlencoded` POST is the shape the service accepts for it
//      (probed) and the only one that survives a large ring.
//   5. NO RETRY HERE, DELIBERATELY. `arcgisRest.ts` owns the §ARCGIS-TRANSIENT-RETRY policy;
//      duplicating a second backoff ladder would be the rival this repo keeps paying for. A
//      transient is returned as a transient and the caller may retry.
//
// FetchOutcome end-to-end (C57 §1.5) — EMPTY and FAILURE are DIFFERENT VALUES:
//   • network throw / timeout          → transient ("endpoint-unreachable: <url>")
//   • non-OK HTTP                      → transient (names url + status)
//   • HTTP 200 + ArcGIS `error` body   → transient (names the service's own code + message)
//   • OK but unparsable / no features  → transient (names url)
//   • OK, parsed, zero features        → absent    (names layer + query — a DURABLE
//                                                   "nothing here", cacheable, not retryable)
//   • OK, parsed, >=1 feature          → found
//
// Licence: "Duomenys yra vieši. Naudojant būtina nurodyti savininką." (public; attribution to
// the owner required) — VTPSI LEIP specification 2024-06-18, Table 19 row 10, fetched
// 2026-09-01 from
// https://www.geoportal.lt/download/Specifikacijos/VTPSI_LEIP_specifikacija_20240628.pdf
// The registry rows for these endpoints are `sourceRegistry/lt.ts` (LT_SOURCES) — this adapter
// CONSUMES that registry and does not mint a second one (C84 EI-9).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { ArcgisRestFeature } from '../../providers/containers/arcgisRest.js';

const tracer = trace.getTracer('pryzm.siteintel.lt');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * VTPSI TPDR service root (ArcGIS REST 11.1, keyless). PROBED LIVE 2026-09-01:
 * `ASGR/MapServer?f=json` → 200, `mapName: "ASGR"`, one Feature Layer (id 0),
 * `spatialReference {wkid:2600, latestWkid:3346}`, `maxRecordCount: 2000`.
 */
export const LT_TPDR_SERVICES_BASE =
    'https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas';

/** ASGR — the national consolidated valid-regulations layer. */
export const LT_ASGR_SERVICE = `${LT_TPDR_SERVICES_BASE}/ASGR/MapServer`;
export const LT_ASGR_LAYER_ID = 0;

/** `ribos` — registered TPD boundaries; the plan REGISTER this adapter joins for plan identity. */
export const LT_TPDR_RIBOS_SERVICE = `${LT_TPDR_SERVICES_BASE}/ribos/MapServer`;
export const LT_TPDR_RIBOS_LAYER_ID = 0;

/**
 * Registru centras NTR parcels, republished as open data by Statistics Lithuania. PROBED LIVE
 * 2026-09-01 (both 20-parcel-baseline LT parcels resolved by `kadastro_nr`).
 */
export const LT_PARCEL_SERVICE =
    'https://osp-sdg.stat.gov.lt/arcgis/rest/services/ntr_sklypai/FeatureServer';
export const LT_PARCEL_LAYER_ID = 0;

/**
 * Native CRS of every Lithuanian national service — LKS-94. Query and measure in it
 * (lane 4 LT-2: "query in it, never after reprojection").
 *
 * ⚠ The services report `{"wkid":2600,"latestWkid":3346}`. 2600 is the deprecated EPSG code
 * for the same system; `3346` is the current one and the only value this adapter emits.
 */
export const LT_NATIVE_CRS = 'EPSG:3346';
export const LT_NATIVE_WKID = 3346;

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every LT provider is unit-testable without the network. */
export interface LtArcgisDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
    /** Request timeout in ms (default 30_000). */
    readonly timeoutMs?: number;
}

/**
 * An ArcGIS `query` parameter bag. Values are stringified as given — the CALLER decides
 * `outFields`, `where`, `geometry`, `returnGeometry`; this module adds only the invariant
 * `f=json`.
 */
export type LtArcgisQueryParams = Readonly<Record<string, string>>;

/** The `query` endpoint URL for one layer — pure, so a test can assert the address. */
export function ltArcgisQueryUrl(serviceBase: string, layerId: number): string {
    return `${serviceBase}/${layerId}/query`;
}

/**
 * Extract the ArcGIS 200-with-`error` body detail, or null when the body is a normal answer.
 * Carrying the service's OWN code + message is what makes a wrong-field refusal SELF-NAMING
 * (measured fact 3) — the same doctrine `providers/containers/arcgisRest.ts` states for its
 * `{ok:false}` form.
 */
export function extractArcgisErrorDetail(parsed: unknown): string | null {
    if (parsed === null || typeof parsed !== 'object') return null;
    const err = (parsed as { error?: unknown }).error;
    if (err === null || typeof err !== 'object') return null;
    const e = err as { code?: unknown; message?: unknown; details?: unknown };
    const details = Array.isArray(e.details) ? ` (${e.details.map(String).join('; ')})` : '';
    return `ArcGIS ${e.code ?? '?'}: ${e.message ?? 'error'}${details}`;
}

/**
 * The classified POST every LT provider goes through. Returns the parsed feature list or a
 * typed refusal — NEVER throws, and never lets an upstream failure masquerade as an empty
 * answer. `queryLabel` describes what was asked (layer + filter), so `absent` reasons are
 * specific enough to act on.
 */
export async function ltArcgisQuery(
    serviceBase: string,
    layerId: number,
    params: LtArcgisQueryParams,
    queryLabel: string,
    deps: LtArcgisDeps = {},
): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lt.arcgisQuery',
        async (span): Promise<FetchOutcome<readonly ArcgisRestFeature[]>> => {
            const url = ltArcgisQueryUrl(serviceBase, layerId);
            span.setAttribute('lt.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
                }
                const body = new URLSearchParams({ f: 'json', ...params }).toString();
                let res: Response;
                try {
                    res = await fetchImpl(url, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/x-www-form-urlencoded',
                            accept: 'application/json',
                        },
                        body,
                        signal: AbortSignal.timeout(deps.timeoutMs ?? 30_000),
                    });
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                    return fetchTransient(
                        `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                    );
                }
                const text = await res.text().catch(() => '');
                if (!res.ok) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}`);
                }
                let parsed: unknown;
                try {
                    parsed = JSON.parse(text);
                } catch {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
                }
                // MEASURED fact 3: a bad field name lands HERE with HTTP 200. A failure, never
                // an empty answer.
                const errDetail = extractArcgisErrorDetail(parsed);
                if (errDetail !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: ${errDetail} from ${url} — ${queryLabel}`,
                    );
                }
                const features = (parsed as { features?: unknown }).features;
                if (!Array.isArray(features)) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: no features array from ${url}`);
                }
                const clean: ArcgisRestFeature[] = [];
                for (const f of features) {
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
                if (clean.length === 0) {
                    // The source ANSWERED and there is genuinely nothing here — a durable
                    // coverage fact, distinct from every failure above.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-feature: ${queryLabel}`);
                }
                span.setAttribute('lt.features', clean.length);
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchFound(clean as readonly ArcgisRestFeature[]);
            } finally {
                span.end();
            }
        },
    );
}

/* ────────────────────────────── param builders (pure) ─────────────────── */

/**
 * An attribute-only `where` query — no geometry in, geometry optionally out. The shape the
 * container has no form for (see the header): parcel by `kadastro_nr`, TPD by `TPD_ID`.
 */
export function ltWhereParams(
    where: string,
    outFields: string,
    returnGeometry: boolean,
): LtArcgisQueryParams {
    const p: Record<string, string> = {
        where,
        outFields,
        returnGeometry: returnGeometry ? 'true' : 'false',
    };
    if (returnGeometry) p['outSR'] = String(LT_NATIVE_WKID);
    return p;
}

/**
 * An EXACT polygon-ring intersect, evaluated SERVER-SIDE — the ASGR-at-parcel query.
 *
 * `ring` is `[easting, northing]` pairs exactly as the parcel service serves them in EPSG:3346
 * (esri `rings[0]`); they are passed through UNCHANGED. There is no client-side geometry math
 * anywhere in this adapter, and no axis flip: esri JSON is `[x, y]` on both sides of the wire
 * (unlike the OGC/GML `posList` the EE lane had to reorder — do NOT copy the EE `n e` swap
 * here; it would silently query the wrong place).
 *
 * A bbox form is deliberately NOT offered: the EE lane MEASURED a ring-bbox over-covering by
 * 3x (6 features from 3 different plans where the exact intersect returned 2), and the same
 * over-cover on a CONSOLIDATED layer would attribute a neighbour's regulation to this plot.
 */
export function ltRingIntersectParams(
    ring: ReadonlyArray<readonly [number, number]>,
    outFields: string,
    returnGeometry: boolean,
): LtArcgisQueryParams {
    const geometry = JSON.stringify({
        rings: [ring.map(([x, y]) => [x, y])],
        spatialReference: { wkid: LT_NATIVE_WKID },
    });
    return {
        geometry,
        geometryType: 'esriGeometryPolygon',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: String(LT_NATIVE_WKID),
        outSR: String(LT_NATIVE_WKID),
        outFields,
        returnGeometry: returnGeometry ? 'true' : 'false',
    };
}

/**
 * A WGS84 point-intersect entry (the map-click path). The service reprojects SERVER-SIDE
 * (`inSR=4326`, `outSR=3346`) — geometry still comes back in the native CRS, so nothing this
 * adapter measures is ever expressed in degrees.
 */
export function ltWgs84PointParams(
    lat: number,
    lon: number,
    outFields: string,
): LtArcgisQueryParams {
    return {
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: '4326',
        outSR: String(LT_NATIVE_WKID),
        outFields,
        returnGeometry: 'true',
    };
}

/* ────────────────────────────── shared attribute readers (pure) ───────── */

/** Non-empty trimmed string, or null. */
export function ltStr(attrs: Record<string, unknown>, key: string): string | null {
    const v = attrs[key];
    if (typeof v === 'string') {
        const s = v.trim();
        return s === '' ? null : s;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Finite number, or null. */
export function ltNum(attrs: Record<string, unknown>, key: string): number | null {
    const v = attrs[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

/**
 * ArcGIS epoch-milliseconds date field → `YYYY-MM-DD`, or null.
 *
 * ⚠ UTC ONLY, deliberately. The ASGR layer descriptor carries
 * `"datesInUnknownTimezone": false` (measured 2026-09-01) and the register's dates are
 * calendar dates of legal acts; reading them in the RUNNING MACHINE's local zone would move
 * an approval date across midnight for anyone west of UTC. `toISOString().slice(0,10)` is the
 * only reading this adapter performs.
 */
export function ltEpochMsToIsoDate(value: unknown): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

/**
 * The outer ring of an esri polygon geometry, `[easting, northing]` pairs exactly as served.
 * Returns `[]` when the feature carries no usable ring — the caller decides what that means.
 */
export function ltEsriOuterRing(geometry: unknown): Array<readonly [number, number]> {
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
