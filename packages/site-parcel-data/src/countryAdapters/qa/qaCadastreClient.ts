// LANE ME-OPEN — QATAR · the ONE impure seam of the QA adapter: a FetchOutcome-classified GET to the
// keyless CadastrePlots ArcGIS MapServer query.
//
// MEASURED FACTS THIS MODULE ENCODES (re-probe before "fixing" any — live 2026-09-02, UA
// PRYZM-Research/1.0; transcript audit/intl-parcels/2026-09-02/transcripts-me-open/qa-cadastreplots-doha.json):
//   1. Endpoint `https://services.gisqatar.org.qa/server/rest/services/Vector/CadastrePlots/MapServer/0/query`
//      — ArcGIS 10.x REST, ANONYMOUS (no token). HTTP 200, t≈0.76 s from a foreign IP.
//   2. GetCapabilities-is-not-an-inventory (ArcGIS edition): the `Vector` FOLDER listing does NOT
//      name CadastrePlots — the layer was discovered by enumerating the qmap WEBMAP, not the folder
//      (me-sweep §4). Address the service directly; do not trust the folder index.
//   3. The query returns geometry in WGS84 when asked (`inSR=4326&outSR=4326`,
//      spatialReference.wkid 4326) — no client reprojection needed (unlike IL's ITM).
//   4. SHAPE: `{features:[{attributes:{PIN, CDST_KEY, PD_NO, PDAREA, GFCODE, GLOBALID, …},
//      geometry:{rings:[[[lon,lat],…]]}}]}`. A sea/empty point answers 200 with `features:[]`
//      (durable `absent`). An ArcGIS error is a 200 body carrying `{error:{code,message}}` — a
//      transient, never "no plot here" (C57 §1.5).
//   5. LICENCE — UNREAD. No licence statement on the REST endpoint; keyless ≠ licensed (me-sweep §4:
//      "read gisqatar.org.qa terms + MME open-data policy before production use"). Carried YELLOW in
//      `qaSources.ts`.
//
// FetchOutcome end-to-end: every failure mode is a typed outcome, never a throw.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.qa');

/** CadastrePlots layer-0 query — KEYLESS (measured 2026-09-02). */
export const QA_CADASTRE_PLOTS_QUERY_ENDPOINT =
    'https://services.gisqatar.org.qa/server/rest/services/Vector/CadastrePlots/MapServer/0/query';

/** Injectable dependencies so the QA provider is unit-testable without the network. */
export interface QaFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** Build the CadastrePlots point-intersect query URL for a WGS84 point (geometry back in WGS84). */
export function buildQaCadastreQueryUrl(lat: number, lon: number): string {
    const params = new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: 'esriGeometryPoint',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
    });
    return `${QA_CADASTRE_PLOTS_QUERY_ENDPOINT}?${params.toString()}`;
}

/**
 * Fetch the CadastrePlots query body at a WGS84 point. Returns the raw parsed JSON or a typed refusal
 * — NEVER throws. An ArcGIS `{error:…}` body (which arrives HTTP 200) is classified `transient`
 * carrying the server's own message, never an empty answer.
 *
 *   • found    → the parsed JSON body (the parser in `qaParcelProvider.ts` interprets it)
 *   • transient→ network / HTTP / non-JSON / ArcGIS error-object body
 */
export async function qaCadastreQueryAtWgs84Point(
    lat: number,
    lon: number,
    deps: QaFetchDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan('pryzm.siteintel.qa.query', async (span): Promise<FetchOutcome<unknown>> => {
        span.setAttribute('qa.lat', Number.isFinite(lat) ? lat : Number.NaN);
        span.setAttribute('qa.lon', Number.isFinite(lon) ? lon : Number.NaN);
        const url = buildQaCadastreQueryUrl(lat, lon);
        try {
            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                return fetchTransient('endpoint-unreachable: no fetch implementation');
            }
            let res: Response;
            try {
                res = await fetchImpl(url, { headers: { Accept: 'application/json, */*' } });
            } catch (e) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                return fetchTransient(
                    `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                );
            }
            const bodyText = await res.text().catch(() => '');
            if (!res.ok) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}`);
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(bodyText);
            } catch {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
            }
            // ArcGIS reports errors as an HTTP-200 body carrying an `error` object.
            const err = (parsed as { error?: { code?: unknown; message?: unknown } })?.error;
            if (err && typeof err === 'object') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'arcgis-error' });
                return fetchTransient(
                    `upstream-failed: ArcGIS error ${String(err.code ?? '?')} — ${String(err.message ?? '')} from ${url}`,
                );
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return fetchFound(parsed);
        } finally {
            span.end();
        }
    });
}
