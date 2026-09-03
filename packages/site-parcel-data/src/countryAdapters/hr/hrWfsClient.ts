// LANE HR — CROATIA (HR) ADAPTER · the ONE impure seam: a FetchOutcome-classified WFS GET.
//
// REPORT §J: "Core stays country-agnostic; ONLY adapters know sources, schemas, semantics,
// documents." This module is the HR adapter's fetch layer — it knows the ONE Croatian cadastral
// WFS this adapter uses, its measured quirks, and NOTHING about rules or business logic (HR has
// no machine-readable rule pack — see hrSources.ts / the index header).
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03; transcripts in
// audit/europe-adapters-2/2026-09-02/hr-transcripts/PROBES.md — re-run them before "fixing" any):
//
//   1. THE SERVICE: DGU / Uređena zemlja INSPIRE GeoServer at
//      `api.uredjenazemlja.hr/services/inspire`. TWO cadastral-parcel channels live here:
//        • cp/wfs  → `cp:CadastralParcel` — the INSPIRE COMPLEX (app-schema 4.0) type. Keyless
//          GetCapabilities + DescribeFeatureType (HTTP 200), but GetFeature returned HTTP 400
//          `ORA-01000: maximum open cursors exceeded` on EVERY attempt (26 backoff retries over
//          ~520 s never cleared) — the app-schema→Oracle mapping saturates cursors. NOT usable.
//        • cp_wms/wfs → `cp_wms:CP.CadastralParcel` — the SIMPLE feature type behind the WMS.
//          Keyless, reliable, returns geometry + national identifiers. THIS is the adapter's
//          channel (HR_PARCEL_LAYER below).
//   2. CRS: native HTRS96/TM = EPSG:3765 everywhere (DefaultCRS on both feature types). A WGS84
//      bbox filter is honoured and the server reprojects the FILTER; with NO `srsName` the OUTPUT
//      geometry stays native 3765 (`crs` echoed `urn:ogc:def:crs:EPSG::3765`), GeoJSON coords
//      [easting, northing]. The adapter does NO projection of its own (the mml/dk lesson: a
//      hand-rolled 3765 transform would be silently wrong; C58 §1.4).
//      ⭐ MEASUREMENT ADDED 2026-09-03 (lane PROXY-LEGS): `srsName=EPSG:4326` IS honoured for
//      OUTPUT too (crs echoed urn:…::4326, [lon,lat] degrees, identifiers intact) — the
//      /api/parcel/hr proxy leg uses exactly that, so NO reprojection module exists anywhere.
//      This adapter deliberately keeps the native-3765 request shape (fact 3 unchanged); "3765
//      output" describes THIS module's no-srsName requests, never a limitation of the service.
//   3. WGS84 ENTRY axis order: `bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,urn:ogc:def:crs:EPSG::4326`
//      — lat,lon (the urn/EPSG axis order). PROBED: a Zagreb click in this order returns the
//      parcel; the OUTPUT stays native 3765 (measured).
//   4. FAILURE SHAPE: an Oracle cursor error / wrong layer returns HTTP 400 + `ows:ExceptionReport`
//      carrying the server's own text (`ORA-01000…`, or `Feature type … unknown`). This module
//      classifies that as a TRANSIENT refusal carrying that text — an upstream DB saturation or a
//      misconfiguration must NEVER read as "no parcel here" (§CONTEXT-DATA-HONESTY).
//
// FetchOutcome end-to-end (C57 §1.5): every failure is a typed outcome, never a throw, and EMPTY
// and FAILURE are DIFFERENT VALUES:
//   • network throw / timeout        → transient  ("endpoint-unreachable: <endpoint>")
//   • non-OK HTTP (incl. ORA-01000)  → transient  ("upstream-failed: …" + the server's own text)
//   • OK but unparsable body         → transient  ("upstream-failed: …")
//   • OK, parsed, zero features      → absent     ("no-feature: <query>" — a durable "nothing here")
//   • OK, parsed, ≥1 feature         → found
//
// Licence: the parcel channel rides Croatia's INSPIRE download-service terms ("uz registraciju i
// prihvaćanje uvjeta" per NIPP src 1129) — answered KEYLESS this session; the DKP open channel is
// the ATOM feed under data.gov.hr's Otvorena dozvola (GREEN). Colour YELLOW on the WFS row until
// the licence TEXT is read (the sweep's "Licence id not captured — confirm at implementation").

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.hr');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * DGU / Uređena zemlja INSPIRE GeoServer — the SIMPLE-feature cadastral WFS (the workspace behind
 * the WMS). Keyless; PROBED LIVE 2026-09-03 (Zagreb → k.č. 2379, k.o. CENTAR 335240). ⚠ Browser
 * use requires a same-origin proxy (C57 CSP) — this base is for server/node use; the registry row
 * records the proxy as not-yet-wired.
 */
export const HR_CP_WFS_BASE = 'https://api.uredjenazemlja.hr/services/inspire/cp_wms/wfs';

/** The parcel layer — simple cadastral parcels (ID · BROJ_CESTICE · MATICNI_BROJ_KO + geometry). */
export const HR_PARCEL_LAYER = 'cp_wms:CP.CadastralParcel';

/** The cadastral-zoning layer — carries `LABEL` = `"<koCode>-<KO NAME>"` (KO-name join; not the parcel leg). */
export const HR_ZONING_LAYER = 'cp_wms:CP.CadastralZoning';

/** Native CRS of every Croatian national cadastral service — HTRS96/TM. Measure in it, never after reprojection. */
export const HR_NATIVE_CRS = 'EPSG:3765';

/** The urn CRS token the service accepts for lat,lon-ordered WGS84 bboxes (probed). */
export const HR_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every HR provider is unit-testable without the network. */
export interface HrWfsDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as the Croatian service delivers it (properties bag + geometry). */
export interface HrWfsFeature {
    readonly properties: Record<string, unknown>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/**
 * Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back. The
 * GeoServer names the offending cause verbatim (the `ORA-01000…` DB saturation, a wrong layer) —
 * carrying it into the outcome is what makes a refusal SELF-NAMING. (Copied, not imported across
 * country directories — E7 §6-A: the shape is duplicated per adapter, never shared cross-country.)
 */
export function extractOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport') && !body.includes('ServiceException')) return null;
    const m =
        /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body) ??
        /<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/.exec(body);
    return m ? m[1]!.trim().replace(/\s+/g, ' ').slice(0, 300) : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * The classified GET every HR provider goes through. Returns the parsed feature list or a typed
 * refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer.
 * `queryLabel` describes what was asked (layer + filter) so `absent` reasons are specific.
 */
export async function hrWfsGetFeatures(
    url: string,
    queryLabel: string,
    deps: HrWfsDeps = {},
): Promise<FetchOutcome<readonly HrWfsFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.hr.wfsGetFeatures', async (span): Promise<FetchOutcome<readonly HrWfsFeature[]>> => {
        span.setAttribute('hr.query', queryLabel);
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
                // The ORA-01000 cursor saturation and a wrong-layer error both land HERE
                // (HTTP 400 + ExceptionReport) — the refusal carries the server's own text.
                const exc = extractOwsExceptionText(body);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(
                    `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                );
            }
            // GeoServer can also return HTTP 200 ExceptionReports for some malformed requests.
            const exc200 = extractOwsExceptionText(body);
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
            const clean: HrWfsFeature[] = [];
            for (const f of features) {
                if (f && typeof f === 'object' && typeof (f as HrWfsFeature).properties === 'object') {
                    clean.push(f as HrWfsFeature);
                }
            }
            if (clean.length === 0) {
                // The source ANSWERED and there is genuinely nothing here — a durable coverage
                // fact, distinct from every failure above (§CONTEXT-DATA-HONESTY).
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(`no-feature: ${queryLabel}`);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttribute('hr.features', clean.length);
            return fetchFound(clean as readonly HrWfsFeature[]);
        } finally {
            span.end();
        }
    });
}

/* ────────────────────────────── URL builders (pure) ───────────────────── */

/**
 * GetFeature URL with a WGS84 (lat,lon urn-ordered) bbox — the click path. The server reprojects
 * the FILTER; NO `srsName` is set, so the OUTPUT geometry stays native EPSG:3765 (measured fact 2).
 * `outputFormat=application/json` (GeoServer GeoJSON, coords [easting, northing] in 3765).
 */
export function buildHrWgs84BboxUrl(
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
        bbox: `${latMin},${lonMin},${latMax},${lonMax},${HR_WGS84_URN}`,
    });
    return `${HR_CP_WFS_BASE}?${p.toString()}`;
}
