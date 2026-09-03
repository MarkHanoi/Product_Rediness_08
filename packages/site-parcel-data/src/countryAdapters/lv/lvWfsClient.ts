// LANE LV — LATVIA (LV) ADAPTER · the ONE impure seam: a FetchOutcome-classified WFS GET.
//
// REPORT §J: "Core stays country-agnostic; ONLY adapters know sources, schemas, semantics,
// documents." This module is the LV adapter's fetch layer — it knows the Latvian national WFS,
// its measured quirks, and NOTHING about rules or business logic. It mirrors the Estonia
// exemplar's `eeWfsClient.ts` shape (GeoServer, same FetchOutcome discipline, same axis-safe
// WGS84 entry) and deviates ONLY where the SOURCE differs; every deviation is named below.
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03, transcripts in
// audit/europe-adapters-2/2026-09-02/lane-lv.md — re-run them before "fixing" any of these):
//
//   1. ONE SERVICE, ONE STACK: the geolatvija national geoportal GeoServer, workspace `vraa`, at
//      `https://geolatvija.lv/geoserver/vraa/wfs` (WFS 2.0.0). Keyless (ows:AccessConstraints
//      NONE, ows:Fees NONE). The endpoint was DISCOVERED from the geolatvija runtime-config
//      (`geoserverUrl: https://geolatvija.lv/geoserver`) + the SPA bundle's `/geoserver/vraa/wfs`
//      route — the data.gov.lv dataset `kadastralie-zemes-gabali-inspire` only links the
//      geolatvija VIEWER (geoProductId=175), never a bare WFS URL. `vraa:parcel` is the cadastral
//      land-unit layer (zemes vienība); `vraa:building` is footprints (ēkas); `vraa:parcel_part`
//      is zemes vienības daļas.
//   2. CRS: native LKS-92 / TM = EPSG:3059 (the layer's DefaultCRS, from GetCapabilities). WGS84
//      ENTRY: the service accepts `bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,
//      urn:ogc:def:crs:EPSG::4326` and reprojects SERVER-SIDE, and `srsName=urn:ogc:def:crs:
//      EPSG::4326` makes the OUTPUT WGS84 GeoJSON [lon,lat] (probed: Rīga → the Pils iela 23
//      parcel came back as a WGS84 MultiPolygon). So NO hand-rolled LKS-92 transform exists
//      anywhere in this adapter (the mml/dk lesson: a hand-rolled projection would be silently
//      wrong; C58 §1.4). The whole click path is done in WGS84 end-to-end; there is no native-axis
//      trap to fall into because native geometry is never requested.
//   3. FAILURE SHAPE: a wrong layer name returns HTTP 400 + `ows:ExceptionReport` (probed:
//      `vraa:parcel_WRONG` → HTTP 400, ExceptionReport). This module classifies that as a
//      TRANSIENT refusal carrying the server's own text — a misconfiguration must never read as
//      "no data here" (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
//   4. EMPTY: a point over water / unparcelled land returns HTTP 200 with an empty `features`
//      array (probed: a Gulf of Rīga point → 0 features). That is a DURABLE `absent`, distinct
//      from every failure above.
//
// Licence: CC-BY-4.0 (data.gov.lv dataset `kadastralie-zemes-gabali-inspire`, maintainer VZD /
// dati@vzd.gov.lv; license_id "CC-BY-4.0", license_url creativecommons.org/licenses/by/4.0 —
// read on the CKAN record 2026-09-03), GREEN. Attribution org: Valsts zemes dienests (VZD),
// served through VRAA's geolatvija portal.
//
// FetchOutcome end-to-end (C57 §1.5): every failure mode is a typed outcome, never a throw, and
// EMPTY and FAILURE are DIFFERENT VALUES:
//   • network throw / timeout / no-fetch → transient  ("endpoint-unreachable: <endpoint>")
//   • non-OK HTTP                        → transient  (names endpoint + status; an
//                                                      ExceptionReport body adds the server's own
//                                                      text so a wrong layer refuses BY NAME)
//   • OK but unparsable body             → transient  (names endpoint)
//   • OK, parsed, zero features          → absent     (names layer + query — cacheable, durable)
//   • OK, parsed, ≥1 feature             → found

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.lv');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * The geolatvija national geoportal GeoServer WFS, workspace `vraa`. Keyless; PROBED LIVE
 * 2026-09-03 (`vraa:parcel` at Rīga returned real cadastral land-units, and GetCapabilities
 * lists 200+ feature types incl. `vraa:parcel` / `vraa:building` / `vraa:parcel_part`).
 * ⚠ Browser use requires a same-origin proxy (C57 CSP) — this base is for server/node use; the
 * registry row records `/api/parcel/lv` as the same-origin proxy route (not yet wired server-side).
 */
export const LV_VRAA_WFS_BASE = 'https://geolatvija.lv/geoserver/vraa/wfs';

/** Native CRS of the Latvian cadastre — LKS-92 / TM (from the layer DefaultCRS). Never queried in. */
export const LV_NATIVE_CRS = 'EPSG:3059';

/** The urn CRS token the service accepts for lat,lon-ordered WGS84 bboxes AND WGS84 output (probed). */
export const LV_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/** CRS tag carried on every parcel ring — WGS84, because the output is requested in EPSG:4326. */
export const LV_OUTPUT_CRS = 'EPSG:4326';

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every LV provider is unit-testable without the network. */
export interface LvWfsDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as the Latvian service delivers it (properties bag + geometry). */
export interface LvWfsFeature {
    readonly properties: Record<string, unknown>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/**
 * Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back.
 * The GeoServer names the offending layer verbatim in this text (measured fact 3 above) —
 * carrying it into the outcome is what makes a wrong-layer refusal SELF-NAMING.
 */
export function extractLvOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport')) return null;
    const m = /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body);
    if (m) return m[1]!.trim();
    // GeoServer 2.x sometimes carries the message as an attribute on ows:Exception.
    const a = /exceptionCode="([^"]+)"/.exec(body);
    return a ? `OGC ExceptionReport (${a[1]})` : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * The classified GET every LV provider goes through. Returns the parsed feature list or a typed
 * refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer.
 * `queryLabel` is the human-readable description of what was asked (layer + filter), so `absent`
 * reasons are specific enough to act on.
 */
export async function lvWfsGetFeatures(
    url: string,
    queryLabel: string,
    deps: LvWfsDeps = {},
): Promise<FetchOutcome<readonly LvWfsFeature[]>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lv.wfsGetFeatures',
        async (span): Promise<FetchOutcome<readonly LvWfsFeature[]>> => {
            span.setAttribute('lv.query', queryLabel);
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
                    // A wrong layer name lands HERE (HTTP 400 + ExceptionReport) — the refusal
                    // carries the server's own text, so it names the layer.
                    const exc = extractLvOwsExceptionText(body);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                    );
                }
                // GeoServer can also return HTTP 200 ExceptionReports for some malformed requests.
                const exc200 = extractLvOwsExceptionText(body);
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
                const clean: LvWfsFeature[] = [];
                for (const f of features) {
                    if (
                        f &&
                        typeof f === 'object' &&
                        typeof (f as LvWfsFeature).properties === 'object'
                    ) {
                        clean.push(f as LvWfsFeature);
                    }
                }
                if (clean.length === 0) {
                    // The source ANSWERED and there is genuinely nothing here — a durable coverage
                    // fact, distinct from every failure above (§CONTEXT-DATA-HONESTY).
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-feature: ${queryLabel}`);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute('lv.features', clean.length);
                return fetchFound(clean as readonly LvWfsFeature[]);
            } finally {
                span.end();
            }
        },
    );
}

/* ────────────────────────────── URL builders (pure) ───────────────────── */

/**
 * GeoServer GetFeature URL with a CQL filter over the `vraa` workspace, output in WGS84
 * (srsName=EPSG:4326). MEASURED shape (2026-09-03): `cql_filter=code='01000070006'` on
 * `vraa:parcel` returns exactly that cadastral land-unit.
 */
export function buildLvCqlUrl(typeName: string, cql: string, count: number): string {
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        count: String(count),
        outputFormat: 'application/json',
        srsName: LV_WGS84_URN,
        cql_filter: cql,
    });
    return `${LV_VRAA_WFS_BASE}?${p.toString()}`;
}

/**
 * GeoServer GetFeature URL with a WGS84 (lat,lon urn-ordered) bbox — the click path. The bbox is
 * reprojected server-side and the output is WGS84 GeoJSON (measured fact 2). `latMin,lonMin,
 * latMax,lonMax` is the WFS 2.0 order for the `urn:ogc:def:crs:EPSG::4326` axis convention
 * (probed: passing lat-first returns the parcel under the click; lon-first would miss it).
 */
export function buildLvWgs84BboxUrl(
    typeName: string,
    latMin: number,
    lonMin: number,
    latMax: number,
    lonMax: number,
    count: number,
): string {
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        count: String(count),
        outputFormat: 'application/json',
        srsName: LV_WGS84_URN,
        bbox: `${latMin},${lonMin},${latMax},${lonMax},${LV_WGS84_URN}`,
    });
    return `${LV_VRAA_WFS_BASE}?${p.toString()}`;
}
