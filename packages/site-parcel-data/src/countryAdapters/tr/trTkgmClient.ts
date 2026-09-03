// LANE ME-OPEN — TURKEY · the ONE impure seam of the TR adapter: a FetchOutcome-classified GET to
// TKGM's keyless point→parcel GeoJSON endpoint.
//
// MEASURED FACTS THIS MODULE ENCODES (re-probe before "fixing" any — live 2026-09-02, UA
// PRYZM-Research/1.0; transcript audit/intl-parcels/2026-09-02/transcripts-me-open/tr-tkgm-istanbul-kadikoy.json):
//   1. Endpoint `https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel/{lat}/{lon}` — path params in
//      LAT/LON order (decimal degrees, dot separator). ANONYMOUS (no token). HTTP 200, t≈0.46 s from
//      a foreign IP.
//   2. Returns a single GeoJSON `Feature`: geometry Polygon in WGS84 (lon,lat), properties carrying
//      ilAd/ilceAd/mahalleAd (province/district/quarter), adaNo/parselNo (block/parcel — the national
//      key), alan (area m², a STRING), pafta (sheet), zeminKmdurum (tenure), nitelik (the character
//      string — for condominium parcels it carries the storey count in text, "11 Katli" = 11-storey).
//   3. ⭐ THE 404 IS SEMANTIC, NOT A FENCE: a point with no parcel answers HTTP 404 with body
//      `{"Message":"Parsel Bulunamadı: Enlem = … - Boylam=…"}` (measured me-sweep §10). That is a
//      durable `absent` — "no parcel here" — NOT a `transient`. Conflating the two would read a real
//      no-parcel answer as an outage (failure ≠ absence, C57 §1.5).
//   4. LICENCE — UNREAD: `parselsorgu.tkgm.gov.tr` is an SPA shell (no static terms). Keyless ≠
//      licensed, and TKGM's BULK/WMS products are normally priced+protocol-gated — the QUERY endpoint
//      being keyless is the bulk-vs-query-endpoint lesson, not a licence grant. Carried YELLOW in
//      `trSources.ts`; probe: read the app's usage-terms modal / TKGM protocol terms before prod.
//
// FetchOutcome end-to-end: every failure mode is a typed outcome, never a throw.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.tr');

/** TKGM point→parcel base — KEYLESS (measured 2026-09-02). */
export const TR_TKGM_PARSEL_BASE = 'https://cbsapi.tkgm.gov.tr/megsiswebapi.v3/api/parsel';

/** Injectable dependencies so the TR provider is unit-testable without the network. */
export interface TrFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** Build the TKGM parcel-at-point URL. ⚠ Path order is LAT then LON (measured). */
export function buildTrParselUrl(lat: number, lon: number): string {
    return `${TR_TKGM_PARSEL_BASE}/${lat}/${lon}`;
}

/**
 * Fetch the TKGM parcel GeoJSON at a WGS84 point. Returns the parsed body, a durable `absent` on the
 * semantic 404, or a typed `transient` — NEVER throws.
 *
 *   • found    → the parsed GeoJSON Feature body (the parser in `trParcelProvider.ts` interprets it)
 *   • absent   → HTTP 404 "Parsel Bulunamadı" (no parcel here — durable)
 *   • transient→ network / other non-200 / non-JSON body
 */
export async function trTkgmParselAtWgs84Point(
    lat: number,
    lon: number,
    deps: TrFetchDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan('pryzm.siteintel.tr.parsel', async (span): Promise<FetchOutcome<unknown>> => {
        span.setAttribute('tr.lat', Number.isFinite(lat) ? lat : Number.NaN);
        span.setAttribute('tr.lon', Number.isFinite(lon) ? lon : Number.NaN);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'non-finite-point' });
            span.end();
            return fetchTransient(`non-finite-point: (${lat},${lon})`);
        }
        const url = buildTrParselUrl(lat, lon);
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
            // The semantic miss: 404 "Parsel Bulunamadı" is a durable absence, not a failure.
            if (res.status === 404) {
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(`no-parcel: TKGM 404 @ ${lat},${lon}` + (bodyText ? ` — ${bodyText.slice(0, 120)}` : ''));
            }
            if (!res.ok) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}`);
            }
            try {
                const parsed: unknown = JSON.parse(bodyText);
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchFound(parsed);
            } catch {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
            }
        } finally {
            span.end();
        }
    });
}
