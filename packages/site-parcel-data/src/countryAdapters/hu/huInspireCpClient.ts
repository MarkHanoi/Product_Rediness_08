// LANE HU — HUNGARY (HU) · the keyless INSPIRE Cadastral-Parcels WFS client. REAL and network-
// capable (fetch injectable), tested against RECORDED BYTES — never a spec-built fake
// ([[fake-more-capable-than-real]]). PROBED LIVE 2026-09-03 (transcript
// `audit/europe-adapters-2/2026-09-02/lane-hu-transcripts/01-inspire-cp-probe.md`).
//
// MEASURED FACTS (all 2026-09-03, from this machine):
//   • Endpoint `https://inspire.lechnerkozpont.hu/geoserver/CP/ows` — GeoServer WFS 2.0, HTTP 200,
//     `ows:Fees` NONE, `ows:AccessConstraints` NONE, provider "Lechner Knowledge Centre".
//   • FeatureType `CP:CP.CadastralParcels`, DefaultCRS `urn:ogc:def:crs:EPSG::23700` (HD72 / EOV).
//   • GeoJSON output default CRS is the NATIVE 23700 (E1a native-CRS discipline: query & measure in
//     EOV, never after reprojection — the Madrid EPSG:4326 silent-zero trap). A WGS84 bbox is
//     honoured for ROUTING (the server reprojects the bbox); the returned ring stays EOV.
//   • Coverage is the Mesterszállás sampling municipality only — 1774 features, all
//     `administrativeunit="Mesterszállás"` (see huParcelProvider.ts `HU_INSPIRE_CP_SAMPLE_COVERAGE`).
//
// This module is schema-agnostic transport: it returns raw WFS features as `found`, an honest
// `absent` when the service answers with an empty collection, and a `transient` when the source did
// not answer. The HU-specific re-interpretation of "empty outside the sample" as a DECLARED
// DEFERRAL lives one level up (huParcelProvider.ts), because that is a coverage judgement, not a
// transport fact.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.hu');

/** The keyless INSPIRE CP WFS OWS endpoint (Lechner GeoServer). */
export const HU_INSPIRE_CP_OWS = 'https://inspire.lechnerkozpont.hu/geoserver/CP/ows';
/** The single served feature type. PROBED LIVE 2026-09-03. */
export const HU_CP_LAYER = 'CP:CP.CadastralParcels';
/** Native CRS of the served geometry — HD72 / EOV. Geometry stays here; never reprojected in-package. */
export const HU_NATIVE_CRS = 'EPSG:23700';
/** WGS84 urn (lat,lon axis order) — used ONLY to express a routing bbox; output stays EOV. */
export const HU_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/** Injectable fetch so tests drive fixtures and node probes use the real one (EE `EeWfsDeps` shape). */
export interface HuWfsDeps {
    /** Override `globalThis.fetch`. */
    readonly fetchImpl?: typeof fetch;
}

/** One raw WFS GeoJSON feature — uninterpreted at this layer. */
export interface HuWfsFeature {
    readonly type?: string;
    readonly id?: string;
    readonly properties: Record<string, unknown>;
    readonly geometry?: {
        readonly type?: string;
        readonly coordinates?: unknown;
    } | null;
}

/** OWS ExceptionReport text extractor — a wrong layer / malformed request lands here (HTTP 200 or 4xx). */
export function extractHuOwsExceptionText(body: string): string | null {
    const m = /<(?:ows:)?ExceptionText>([\s\S]*?)<\/(?:ows:)?ExceptionText>/i.exec(body);
    if (m && m[1]) return m[1].trim();
    const m2 = /<(?:ows:)?Exception\b[^>]*exceptionCode="([^"]*)"/i.exec(body);
    if (m2 && m2[1]) return `exceptionCode=${m2[1]}`;
    return null;
}

/**
 * Build a GetFeature URL for a tiny WGS84 bbox click (urn axis order = lat,lon). Output is GeoJSON
 * in the NATIVE EOV CRS (no `srsName`, so the ring is not reprojected). `count` caps the response.
 */
export function buildHuCpWgs84BboxUrl(
    minLat: number,
    minLon: number,
    maxLat: number,
    maxLon: number,
    count = 1,
): string {
    const bbox = `${minLat},${minLon},${maxLat},${maxLon},${HU_WGS84_URN}`;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: HU_CP_LAYER,
        outputFormat: 'application/json',
        count: String(count),
        bbox,
    });
    return `${HU_INSPIRE_CP_OWS}?${params.toString()}`;
}

/**
 * Build a GetFeature URL filtering by `label` (the helyrajzi szám as served, e.g. `015`, `087/2`).
 * ⚠ SCOPED TO THE SAMPLE: `label` is unique only WITHIN a Hungarian município — it is NOT a national
 * key (the same hrsz recurs in every settlement), so this is a sample-area convenience for tests
 * and inspection, never a national by-id resolver. Output is native EOV GeoJSON.
 */
export function buildHuCpLabelUrl(label: string, count = 5): string {
    const cql = `label='${label.replace(/'/g, "''")}'`;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: HU_CP_LAYER,
        outputFormat: 'application/json',
        count: String(count),
        cql_filter: cql,
    });
    return `${HU_INSPIRE_CP_OWS}?${params.toString()}`;
}

/**
 * GET a WFS GetFeature URL and classify the outcome (EE `eeWfsGetFeatures` discipline):
 *   • network error / no fetch / non-OK / ExceptionReport / unparsable → `transient` (RETRYABLE);
 *   • HTTP 200 with an EMPTY feature array → `absent` (the source ANSWERED, nothing here — a
 *     DURABLE fact at the TRANSPORT layer; huParcelProvider decides whether that means a genuine
 *     in-sample gap or the out-of-sample deferral);
 *   • features present → `found`.
 * NEVER throws.
 */
export async function huCpGetFeatures(
    url: string,
    queryLabel: string,
    deps: HuWfsDeps = {},
): Promise<FetchOutcome<readonly HuWfsFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.hu.wfsGetFeatures', async (span): Promise<FetchOutcome<readonly HuWfsFeature[]>> => {
        span.setAttribute('hu.query', queryLabel);
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
                const exc = extractHuOwsExceptionText(body);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(
                    `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                );
            }
            const exc200 = extractHuOwsExceptionText(body);
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
            const clean: HuWfsFeature[] = [];
            for (const f of features) {
                if (f && typeof f === 'object' && typeof (f as HuWfsFeature).properties === 'object') {
                    clean.push(f as HuWfsFeature);
                }
            }
            if (clean.length === 0) {
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(`no-feature: ${queryLabel}`);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttribute('hu.features', clean.length);
            return fetchFound(clean as readonly HuWfsFeature[]);
        } finally {
            span.end();
        }
    });
}
