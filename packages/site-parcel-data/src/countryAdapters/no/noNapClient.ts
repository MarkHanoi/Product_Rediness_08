// E7-NO — NORWAY (NO) · impure seam #2 of 2: NAP, the national arealplankartlosning
// (Direktoratet for byggkvalitet), read through WMS `GetFeatureInfo` with
// `INFO_FORMAT=application/json`.
//
// WHY A WMS AND NOT A WFS — MEASURED, NOT ASSUMED (2026-09-01):
//   • The Geonorge kartkatalog record for the national "Reguleringsplaner" dataset
//     (uuid dac27348-5c2e-4a6a-9497-c4c792108cae) names exactly two distributions:
//     `ServiceDistributionUrlForDataset` = the NAP WMS (protocol `OGC:WMS`), and
//     `DistributionUrl` = the NAP download API. There is no WFS row, and none is served:
//     `.../services/wfs/reguleringsplaner` -> HTTP 404 (the NAP shell page).
//   • The OLD Geonorge planning endpoints are RETIRED: `wfs.geonorge.no/skwms1/
//     wfs.reguleringsplaner` -> `*** UKJENT APPLIKASJON ***`; `wms.geonorge.no/skwms1/
//     wms.reguleringsplaner` -> HTTP 500 `msLoadMap(): Unable to access file`. Both measured.
//   • `WMS DescribeLayer` DOES name an internal GeoServer WFS —
//     `http://ca-opr-nap-geoserver-prod/geoserver/reguleringsplaner/wfs` — but that host is
//     an internal container name and does not resolve publicly. So GetFeatureInfo is not a
//     shortcut past a WFS; it is the ONLY keyless machine channel that exists.
//   • THE BULK PATH IS GATED, and the gate is machine-declared:
//     `nedlasting/api/capabilities/<uuid>` -> `"accessConstraintRequiredRole":
//     "nd.filnedlasting"` — the Norge digitalt file-download role. Recorded, not worked around.
//
// ⛔ THREE SILENT-EMPTY TRAPS, ALL MEASURED, ALL ENCODED HERE. Each one returns HTTP 200 with
// `{"features":[]}` or an empty-looking body, i.e. is INDISTINGUISHABLE from "no plan here"
// unless the client refuses first (SS-CONTEXT-DATA-HONESTY; the same class as L-716):
//
//   T1. SCALE CLIFF. GetFeatureInfo answers only below an UNDOCUMENTED scale. Measured on one
//       feature that certainly exists (Bergen `rparealformalomrade`, objid 3117), 101px wide:
//         half-window  40 m -> 1:2,829  -> 1 feature
//         half-window 100 m -> 1:7,072  -> 1 feature
//         half-window 200 m -> 1:14,144 -> 1 feature
//         half-window 400 m -> 1:28,289 -> 1 feature
//         half-window 800 m -> 1:56,577 -> **0 features**
//         half-window 1600 m-> 1:113,154-> **0 features**
//       The advertised `MaxScaleDenominator` on that layer's group is 5,000,000 — two orders
//       of magnitude off. {@link noNapGetFeatureInfo} REFUSES a window wider than
//       {@link NO_NAP_MAX_HALF_WINDOW_M} by name rather than returning a false empty.
//
//   T2. WRONG CRS IS SILENT. Passing `CRS=EPSG:4326` with a UTM-metre BBOX returns HTTP 200
//       and `{"features":[]}` — no exception, no warning. So a CRS mistake reads as "Norway
//       is unplanned here". This module accepts ONLY the CRS tokens it has probed and refuses
//       anything else BEFORE the request.
//
//   T3. LAYER-NOT-DEFINED ARRIVES AS **HTTP 200**. `QUERY_LAYERS=arealformal_vn9` returns
//       HTTP 200, `Content-Type: text/xml`, body
//       `<ServiceException code="LayerNotDefined">Could not find layer
//       reguleringsplaner:arealformal_vn9</ServiceException>`. `res.ok` is TRUE. The body is
//       inspected for a ServiceExceptionReport before any JSON parse, and the refusal carries
//       the server's own text so a misconfiguration names itself.
//
// ⛔ FOURTH MEASURED TRAP, HANDLED IN THE MAPPER NOT HERE: the ONE number the envelope needs,
// `utnytting.utnyttingstall`, is serialised as a Java array identity string
// (`[Ljava.lang.Double;@493a67bb`) in EVERY machine format — `application/json`,
// `application/vnd.ogc.gml`, `text/xml; subtype=gml/3.1.1` AND `text/plain` — while
// `text/html` renders the real value (`2,540`). The hash differs on every request, proving it
// is `Object.toString()` on a fresh array, not data. 6 of 6 filled instances across 3 Bergen
// plans. {@link NO_NAP_JAVA_ARRAY_SENTINEL_RE} detects it; `noRuleMapper.ts` turns it into a
// tier-6 UNKNOWN that says so. ⛔ THE HTML IS NOT ADOPTED AS A CHANNEL: it is a human
// presentation template, it locale-formats numbers with a comma, and scraping it would mint a
// rival transport for one field. E8 owns document/prose extraction; this lane refuses.
//
// LAYER VOCABULARY IS DECLARED, NOT DISCOVERED (control 9 / §6-E): the emitted rule set is
// keyed off {@link NO_NAP_QUERY_LAYERS} — the layers GetCapabilities advertises — so a server
// that omits a layer from one answer cannot silently delete a parameter from the result.
//
// ⚠ HOST NOTE, RECORDED HONESTLY: the endpoint below is `nap.**ft**.dibk.no`. That is the host
// Geonorge's own catalogue publishes for the national dataset, and it answers keylessly today.
// The bare production host `nap.dibk.no` returned **HTTP 523** on three separate probes this
// session. `DescribeLayer` names the backend `ca-opr-nap-geoserver-**prod**`, so the FT
// front-end fronts a production GeoServer. This is a dated fact, not an endorsement — the
// source row's probe log is where a host change lands, never a silent URL edit.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.no');

/* ────────────────────────────── endpoints ──────────────────────────────────────── */

/**
 * NAP reguleringsplaner WMS. Keyless; PROBED LIVE 2026-09-01 (GetCapabilities 1.3.0, 54
 * layers; GetFeatureInfo at Bergen -> 5 real plan features with geometry).
 */
export const NO_NAP_REGULERINGSPLANER_WMS =
    'https://nap.ft.dibk.no/services/wms/reguleringsplaner';

/**
 * NAP kommuneplaner WMS — probed live (HTTP 200, WMS 1.3.0). NOT consumed by this lane's
 * chain: the kommuneplan arm is its own vocabulary and its own fill census, and adding it
 * here without measuring it would be the scope expansion control 10 forbids. Recorded so the
 * next lane starts from a probed endpoint rather than a search.
 */
export const NO_NAP_KOMMUNEPLANER_WMS = 'https://nap.ft.dibk.no/services/wms/kommuneplaner';

/**
 * The NAP download API (Geonorge Nedlasting API v3). PROBED: the root answers HTTP 200
 * keylessly, but `capabilities/<uuid>` declares
 * `"accessConstraintRequiredRole": "nd.filnedlasting"` — a Norge digitalt agreement gate.
 * Recorded as the GATE, never called by this adapter.
 */
export const NO_NAP_DOWNLOAD_API = 'https://nap.ft.dibk.no/services/nedlasting/api/';

/** The Norge digitalt role the bulk download demands, verbatim from the capabilities JSON. */
export const NO_NAP_DOWNLOAD_REQUIRED_ROLE = 'nd.filnedlasting';

/* ────────────────────────────── measured constraints ───────────────────────────── */

/**
 * The CRS tokens this module has PROBED on the NAP WMS and will send. `EPSG:25833` is the
 * one the chain uses (it is the CRS Matrikkelen already answers in, so nothing is projected).
 * ⛔ Anything not in this set is refused BEFORE the request — trap T2 makes a wrong CRS
 * indistinguishable from "no plan here".
 */
export const NO_NAP_PROBED_CRS = Object.freeze(['EPSG:25833', 'EPSG:3857'] as const);
export type NoNapCrs = (typeof NO_NAP_PROBED_CRS)[number];

/**
 * Widest half-window (metres) at which GetFeatureInfo has been MEASURED to still answer.
 * 400 m answered (1:28,289); 800 m returned a false empty (1:56,577). The chain queries at
 * {@link NO_NAP_CHAIN_HALF_WINDOW_M}; this is the hard refusal ceiling.
 */
export const NO_NAP_MAX_HALF_WINDOW_M = 400;

/**
 * The half-window the chain actually uses: 40 m around the parcel's own
 * `representasjonspunkt`. A click, not a search — and deep inside the measured safe band.
 */
export const NO_NAP_CHAIN_HALF_WINDOW_M = 40;

/** Pixel width/height every GetFeatureInfo uses (the scale readings above assume 101). */
export const NO_NAP_GFI_PIXELS = 101;

/**
 * The reguleringsplan layers this adapter queries, at ONE vertikalnivaa. The DECLARED
 * vocabulary (GetCapabilities), so an answer that omits a layer cannot silently delete a
 * parameter from the emitted rule set.
 */
export const NO_NAP_LAYER_SUFFIXES = Object.freeze([
    'arealformal',
    'rpomrade',
    'hensynssoner',
    'bestemmelsesomrader',
    'rpregulerthoyde',
    'rpjuridisklinje',
    'rpjuridiskpunkt',
    'rppaskrift',
] as const);

/**
 * The five SOSI vertical levels NAP publishes as layer groups (`vertikalniva_1` … `_5`).
 * ⛔ A CHAIN THAT QUERIES ONLY `_vn1` SYSTEMATICALLY RETURNS TUNNELS. Measured at Bergen teig
 * 4601-167/714: `_vn1` returned a 2023 Bybanen TUNNEL plan, `_vn2` (on the ground) returned a
 * different plan entirely — the 1983 "BERGENHUS. STØLEN/LADEGÅRDEN/ROTHAUGEN". Two plans, two
 * levels, one parcel. This is the DECLARED level vocabulary, and the chain walks all of it.
 */
export const NO_NAP_VERTICAL_LEVELS = Object.freeze([1, 2, 3, 4, 5] as const);
export type NoVerticalLevel = (typeof NO_NAP_VERTICAL_LEVELS)[number];

/**
 * The 22 real feature types behind the 8 advertised `_vn1` group layers, from
 * `WMS DescribeLayer` (probed 2026-09-01). ⭐ GetCapabilities is not an inventory: the single
 * advertised `hensynssoner_vn1` expands to EIGHT hensynssone types and
 * `bestemmelsesomrader_vn1` to SEVEN. Carried as DATA because the returned feature ids are
 * prefixed with these names — the adapter classifies on them, and a name that is not here is
 * a national schema change the mapper must not absorb silently.
 */
export const NO_NAP_VN1_FEATURE_TYPES = Object.freeze([
    'rbformalomrade_vn1',
    'rparealformalomrade_vn1',
    'rpomrade_vn1',
    'rpregulerthoyde_vn1',
    'rpangitthensynsone_vn1',
    'rpbandleggingsone_vn1',
    'rpdetaljeringsone_vn1',
    'rpfaresone_vn1',
    'rpgjennomforingsone_vn1',
    'rpinfrastruktursone_vn1',
    'rpsikringsone_vn1',
    'rpstoysone_vn1',
    'rbrestriksjonomrade_vn1',
    'rbbevaringomrade_vn1',
    'rbfareomrade_vn1',
    'rbfornyelseomrade_vn1',
    'rbrekkefolgeomrade_vn1',
    'rpbestemmelseomrade_vn1',
    'pblmidlbygganleggomrade_vn1',
    'rpjuridisklinje_vn1',
    'rppaskrift_vn1',
    'rpjuridiskpunkt_vn1',
] as const);

/**
 * ⛔ The Java-array identity string NAP emits in place of `utnytting.utnyttingstall` in every
 * machine format. `[L<class>;@<hex>` is `Object.toString()` on a Java array — an identity
 * hash, not a value: it differs between two requests for the SAME feature (measured
 * `@1997c7f1` / `@5faa3c69` / `@493a67bb` on objid 3117/3062).
 */
export const NO_NAP_JAVA_ARRAY_SENTINEL_RE = /^\[L[A-Za-z0-9_.$]+;@[0-9a-fA-F]+$/;

/** True when a served attribute value is the Java-array identity leak rather than data. */
export function isNapJavaArraySentinel(raw: unknown): boolean {
    return typeof raw === 'string' && NO_NAP_JAVA_ARRAY_SENTINEL_RE.test(raw.trim());
}

/* ────────────────────────────── outcome plumbing ───────────────────────────────── */

import type { NoFetchDeps } from './noMatrikkelClient.js';
export type { NoFetchDeps };

/** One NAP GetFeatureInfo feature: the served id + property bag + geometry, uninterpreted. */
export interface NoNapFeature {
    /**
     * The WMS-assigned feature id, e.g. `rparealformalomrade_vn1.fid-4029c24c_...`.
     * ⛔ MEASURED UNSTABLE: the `fid-` half differs between two requests for the SAME object
     * (`fid-632a8e45_1a05dd178f4_-1bf5` vs `fid-4029c24c_1a05ddb7290_-3d19`, objid 3117). Use
     * it ONLY for the layer prefix; durable identity is `identifikasjon.lokalId` (a UUID) plus
     * `arealplanId`. Minted entity ids never derive from this string.
     */
    readonly id: string;
    /** The layer/feature-type prefix of {@link id} (the half that IS stable). */
    readonly featureType: string;
    readonly properties: Readonly<Record<string, unknown>>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/**
 * A point to query NAP at, in a PROBED CRS. There is deliberately no WGS84 arm: the chain
 * feeds this the Matrikkelen `representasjonspunkt`, which already arrives in EPSG:25833, so
 * no projection exists anywhere in this adapter.
 */
export interface NoNapPoint {
    readonly crs: NoNapCrs;
    /** First ordinate in the CRS's own axis order (easting for 25833/3857). */
    readonly x: number;
    /** Second ordinate (northing for 25833/3857). */
    readonly y: number;
}

/** Detect a WMS `ServiceExceptionReport` body (trap T3 arrives with HTTP 200). */
export function extractWmsServiceExceptionText(body: string): string | null {
    if (!body.includes('ServiceException')) return null;
    const m = /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(body);
    return m ? m[1]!.trim() : 'WMS ServiceExceptionReport (no text)';
}

/**
 * PURE: the GetFeatureInfo URL for a point + layer list. Square window of
 * `2 * halfWindowM` metres at {@link NO_NAP_GFI_PIXELS} px, queried at the centre pixel.
 */
export function buildNapGetFeatureInfoUrl(
    endpoint: string,
    point: NoNapPoint,
    layers: readonly string[],
    halfWindowM: number,
    featureCount: number,
): string {
    const bbox = [
        point.x - halfWindowM,
        point.y - halfWindowM,
        point.x + halfWindowM,
        point.y + halfWindowM,
    ].join(',');
    const layerList = layers.join(',');
    const centre = Math.floor(NO_NAP_GFI_PIXELS / 2);
    const p = new URLSearchParams({
        SERVICE: 'WMS',
        VERSION: '1.3.0',
        REQUEST: 'GetFeatureInfo',
        LAYERS: layerList,
        QUERY_LAYERS: layerList,
        CRS: point.crs,
        BBOX: bbox,
        WIDTH: String(NO_NAP_GFI_PIXELS),
        HEIGHT: String(NO_NAP_GFI_PIXELS),
        I: String(centre),
        J: String(centre),
        INFO_FORMAT: 'application/json',
        FEATURE_COUNT: String(featureCount),
    });
    return `${endpoint}?${p.toString()}`;
}

/** The `_vn<n>` layer names for one vertical level, from the declared suffix vocabulary. */
export function napLayersForLevel(level: NoVerticalLevel): readonly string[] {
    return NO_NAP_LAYER_SUFFIXES.map((s) => `${s}_vn${level}`);
}

/**
 * The classified GetFeatureInfo every NAP read goes through. NEVER throws; every failure mode
 * is a typed outcome; and the three silent-empty traps are refused BY NAME before they can
 * masquerade as "no plan here".
 */
export async function noNapGetFeatureInfo(
    point: NoNapPoint,
    layers: readonly string[],
    queryLabel: string,
    deps: NoFetchDeps = {},
    options: { readonly endpoint?: string; readonly halfWindowM?: number; readonly featureCount?: number } = {},
): Promise<FetchOutcome<readonly NoNapFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.napGetFeatureInfo',
        async (span): Promise<FetchOutcome<readonly NoNapFeature[]>> => {
            span.setAttribute('no.query', queryLabel);
            try {
                const endpoint = options.endpoint ?? NO_NAP_REGULERINGSPLANER_WMS;
                const halfWindowM = options.halfWindowM ?? NO_NAP_CHAIN_HALF_WINDOW_M;
                const featureCount = options.featureCount ?? 50;

                // ── T2: a CRS this adapter has not probed returns a SILENT empty. Refuse. ──
                if (!(NO_NAP_PROBED_CRS as readonly string[]).includes(point.crs)) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unprobed-crs' });
                    return fetchTransient(
                        `upstream-failed: NAP CRS '${point.crs}' has not been probed by this adapter ` +
                            `(probed: ${NO_NAP_PROBED_CRS.join(', ')}). Measured 2026-09-01: an unprobed ` +
                            'CRS returns HTTP 200 with an EMPTY FeatureCollection and no exception, so ' +
                            'sending it would report "no plan here" for a CRS mistake.',
                    );
                }
                // ── T1: beyond the measured scale cliff the service returns a FALSE empty. ──
                if (!Number.isFinite(halfWindowM) || halfWindowM <= 0 || halfWindowM > NO_NAP_MAX_HALF_WINDOW_M) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'window-too-wide' });
                    return fetchTransient(
                        `upstream-failed: NAP GetFeatureInfo half-window ${halfWindowM} m exceeds the ` +
                            `MEASURED answering band (<= ${NO_NAP_MAX_HALF_WINDOW_M} m at ` +
                            `${NO_NAP_GFI_PIXELS} px). Measured 2026-09-01 on a feature that exists: ` +
                            '400 m -> 1 feature (1:28,289); 800 m -> 0 features (1:56,577), with no ' +
                            'exception. A wider window would report a FALSE "no plan here".',
                    );
                }
                if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'bad-point' });
                    return fetchTransient(
                        `upstream-failed: NAP query point is not finite (${point.x}, ${point.y}) — ${queryLabel}`,
                    );
                }

                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(`endpoint-unreachable: no fetch implementation (${endpoint})`);
                }
                const url = buildNapGetFeatureInfoUrl(endpoint, point, layers, halfWindowM, featureCount);
                let res: Response;
                try {
                    res = await fetchImpl(url);
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                    return fetchTransient(
                        `endpoint-unreachable: ${endpoint} (${e instanceof Error ? e.message : String(e)})`,
                    );
                }
                const body = await res.text().catch(() => '');
                if (!res.ok) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    const exc = extractWmsServiceExceptionText(body);
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${endpoint}` + (exc ? ` — ${exc}` : ''),
                    );
                }
                // ── T3: LayerNotDefined arrives as HTTP 200 with an XML body. `res.ok` is true. ──
                const exc200 = extractWmsServiceExceptionText(body);
                if (exc200 !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(`upstream-failed: ServiceException from ${endpoint} — ${exc200}`);
                }
                let parsed: unknown;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: non-JSON body from ${endpoint} (${queryLabel})`);
                }
                const features = (parsed as { features?: unknown }).features;
                if (!Array.isArray(features)) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: no features array from ${endpoint} (${queryLabel})`);
                }
                const clean: NoNapFeature[] = [];
                for (const f of features) {
                    if (f === null || typeof f !== 'object') continue;
                    const rec = f as { id?: unknown; properties?: unknown; geometry?: unknown };
                    if (rec.properties === null || typeof rec.properties !== 'object') continue;
                    const id = typeof rec.id === 'string' ? rec.id : '';
                    const dot = id.indexOf('.');
                    clean.push({
                        id,
                        featureType: dot > 0 ? id.slice(0, dot) : id,
                        properties: rec.properties as Readonly<Record<string, unknown>>,
                        geometry:
                            rec.geometry !== null && typeof rec.geometry === 'object'
                                ? (rec.geometry as NoNapFeature['geometry'])
                                : null,
                    });
                }
                if (clean.length === 0) {
                    // Past all three traps, an empty answer is a DURABLE coverage fact.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-feature: ${queryLabel}`);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute('no.features', clean.length);
                return fetchFound(clean as readonly NoNapFeature[]);
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The coverage caveat carried VERBATIM on every NAP `absent`. NAP's own download API lists 375
 * areas including "Hele landet", but the SERVED reguleringsplan geometry is partial: measured
 * 2026-09-01 by rendering `rpomrade_vn1` over a 10 km window at nine city centres,
 * **five painted and four did not — and OSLO IS ONE OF THE FOUR.** An `absent` from NAP is
 * therefore NOT proof that no plan exists; it may be proof the kommune has not been ingested.
 */
export const NO_NAP_ABSENCE_CAVEAT =
    'absent = no reguleringsplan feature IN NAP at this point; NAP ingestion is PARTIAL — ' +
    'measured 2026-09-01, rpomrade_vn1 painted at Bergen/Trondheim/Stavanger/Tromsoe/Drammen and ' +
    'NOT at Oslo/Fredrikstad/Arendal/Kristiansand (5 of 9 city windows). Confirm against the ' +
    "kommune's own planregister before claiming a parcel is unplanned.";

/** The nine city windows that census was measured on, carried as data so a test can pin it. */
export const NO_NAP_COVERAGE_CENSUS_2026_09_01 = Object.freeze({
    measuredOn: '2026-09-01',
    method: 'GetMap rpomrade_vn1, EPSG:3857, 10 km window, 64x64 px, count non-transparent pixels',
    withData: Object.freeze(['Bergen', 'Trondheim', 'Stavanger', 'Tromsoe', 'Drammen'] as const),
    withoutData: Object.freeze(['Oslo', 'Fredrikstad', 'Arendal', 'Kristiansand'] as const),
});
