// LANE ME-OPEN — ISRAEL · the ONE impure seam of the IL adapter: a FetchOutcome-classified POST to
// govmap's keyless `IdentifyByXY`, plus the WGS84→ITM projection of the query point.
//
// MEASURED FACTS THIS MODULE ENCODES (re-probe before "fixing" any of them — live 2026-09-02, UA
// PRYZM-Research/1.0; transcript audit/intl-parcels/2026-09-02/transcripts-me-open/il-govmap-telaviv.json):
//   1. Endpoint `https://ags.govmap.gov.il/Identify/IdentifyByXY`, POST application/json, ANONYMOUS
//      — no token, no key, no registration. HTTP 200, t≈0.56 s from a foreign IP.
//   2. The body speaks ITM (EPSG:2039) ONLY — `x`/`y` are Israeli-grid metres, and the `centroid`
//      + `extent` it returns are ITM too. The WGS84 click is projected in `ilItm.ts`; there is no
//      lon/lat mode on this API. The me-sweep VANTAGE finding is about the BULK shapefile
//      (parcel_all.zip 403s from a foreign IP) — the QUERY endpoint here is NOT fenced
//      (bulk-vs-query-endpoint: the two are different products; do not conflate them).
//   3. SHAPE: `{errorCode:0, status:0, data:[{ LayerName:"PARCEL_ALL", Result:[{ tabs:[{fields:[
//      {FieldName:"מספר גוש",FieldValue:"6952"}, {FieldName:"חלקה",FieldValue:"139"}, …]}],
//      centroid:{x,y}, extent:{xmin,ymin,xmax,ymax} }]}]}`. A sea/empty point answers 200 with an
//      empty `Result` (durable `absent`), NOT an error — failure ≠ absence (C57 §1.5).
//   4. LICENCE — UNREAD (me-sweep flags the bulk resource "Other (Open)" but the licence of THIS
//      query API is not stated on the endpoint). Carried YELLOW in `ilSources.ts`, never assumed
//      open (brief: "several licences UNREAD — flag, do not assume open").
//
// FetchOutcome end-to-end: every failure mode is a typed outcome, never a throw.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import { wgs84ToItm } from './ilItm.js';

const tracer = trace.getTracer('pryzm.siteintel.il');

/** govmap point-identify — KEYLESS (measured 2026-09-02). */
export const IL_GOVMAP_IDENTIFY_ENDPOINT = 'https://ags.govmap.gov.il/Identify/IdentifyByXY';

/** The registered cadastral-parcels layer on govmap (gush/helka). */
export const IL_PARCEL_LAYER_NAME = 'PARCEL_ALL';

/** Identify search tolerance, in ITM metres — mirrors the me-sweep probe (`mapTolerance:10`). */
export const IL_IDENTIFY_TOLERANCE_M = 10;

/** Injectable dependencies so the IL provider is unit-testable without the network. */
export interface IlFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** The POST body `IdentifyByXY` expects, built from an ITM point. */
export function buildIlIdentifyBody(itmEast: number, itmNorth: number): string {
    return JSON.stringify({
        x: itmEast,
        y: itmNorth,
        mapTolerance: IL_IDENTIFY_TOLERANCE_M,
        layers: [{ LayerType: 0, LayerName: IL_PARCEL_LAYER_NAME, LayerFilter: '' }],
    });
}

/**
 * Identify the parcel at a WGS84 point via govmap. Projects the click to ITM (`ilItm.ts`), POSTs,
 * and returns the raw parsed JSON body or a typed refusal — NEVER throws. A point that will not
 * project (non-finite / out of domain) is a `transient` naming the reason, never a silent (0,0)
 * query at the ITM origin.
 *
 *   • found    → the parsed JSON body (the parser in `ilParcelProvider.ts` interprets it)
 *   • transient→ un-projectable point / network / HTTP / non-JSON / govmap errorCode ≠ 0
 */
export async function ilGovmapIdentifyAtWgs84Point(
    lat: number,
    lon: number,
    deps: IlFetchDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan('pryzm.siteintel.il.identify', async (span): Promise<FetchOutcome<unknown>> => {
        span.setAttribute('il.lat', Number.isFinite(lat) ? lat : Number.NaN);
        span.setAttribute('il.lon', Number.isFinite(lon) ? lon : Number.NaN);
        try {
            const itm = wgs84ToItm(lat, lon);
            if (!itm) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'unprojectable-point' });
                return fetchTransient(`unprojectable-point: WGS84 (${lat},${lon}) has no ITM image`);
            }
            span.setAttribute('il.itmEast', itm.east);
            span.setAttribute('il.itmNorth', itm.north);
            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                return fetchTransient('endpoint-unreachable: no fetch implementation');
            }
            let res: Response;
            try {
                res = await fetchImpl(IL_GOVMAP_IDENTIFY_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json, */*' },
                    body: buildIlIdentifyBody(itm.east, itm.north),
                });
            } catch (e) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                return fetchTransient(
                    `endpoint-unreachable: ${IL_GOVMAP_IDENTIFY_ENDPOINT} (${e instanceof Error ? e.message : String(e)})`,
                );
            }
            const bodyText = await res.text().catch(() => '');
            if (!res.ok) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(`upstream-failed: HTTP ${res.status} from ${IL_GOVMAP_IDENTIFY_ENDPOINT}`);
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(bodyText);
            } catch {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                return fetchTransient(`upstream-failed: non-JSON body from ${IL_GOVMAP_IDENTIFY_ENDPOINT}`);
            }
            const errorCode = (parsed as { errorCode?: unknown })?.errorCode;
            if (typeof errorCode === 'number' && errorCode !== 0) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'govmap-error' });
                return fetchTransient(`upstream-failed: govmap errorCode ${errorCode}`);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return fetchFound(parsed);
        } finally {
            span.end();
        }
    });
}
