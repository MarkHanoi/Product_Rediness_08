// LANE DK (E1 verdict §G DK-parallel) · the ONE impure seam of the DK adapter: a
// FetchOutcome-classified GET against the two KEYLESS Danish endpoints.
//
// THE RE-PIN (deliverable 1): lane 2 §DK-1 measured the Plandata GeoServer WFS KEYLESS
// (the old `DkZoningProvider` design row assumed KEYED — only Datafordeler is keyed), and
// §DK-4 measured DAWA keyless for the parcel step. Both endpoints below were re-probed
// LIVE 2026-09-01 by this lane (transcripts:
// audit/europe-site-intel/2026-08-31/impl/lane-dk-transcripts/) — the probe log rides the
// typed source rows in `dkSources.ts`.
//
// MEASURED FACTS THIS MODULE ENCODES (re-run the probes before "fixing" any of these):
//   1. Endpoint `https://geoserver.plandata.dk/geoserver/wfs`, WFS 2.0.0 GetFeature,
//      `outputFormat=application/json` — anonymous, no token, no registration. SAME
//      endpoint the wired server proxy pins (`server/jurisdiction/plandataZoningProxy.js`
//      `PLANDATA_WFS_ENDPOINT`) — one endpoint, two runtimes (browser goes through the
//      proxy for CSP; this client is the server/node seam).
//   2. AXIS-ORDER HEDGE (measured live 2026-09-01, both baseline points): an EPSG:4326
//      bbox in `lon,lat` order returns the plan features; the `lat,lon` order returns
//      **0 features SILENTLY** (HTTP 200, empty collection — the same silent-axis trap as
//      the EE CQL probes). The proxy hedges by trying both orders; this client does the
//      same — a zero-feature answer on one order retries the swap before concluding
//      `absent` (a wrong axis order must never read as "no plan here").
//   3. Plan LIFECYCLE is first-class at the source: every theme exists in `_forslag` /
//      `_vedtaget` / `_aflyst` / `_med_historik` variants. This adapter queries the
//      `_vedtaget` (adopted) variants only — the queried lifecycle is data the mapper
//      mirrors, alongside the per-feature `status`/`planstatus` attribute where served.
//   4. FAILURE SHAPE: GeoServer answers wrong layer names with an `ows:ExceptionReport`
//      naming the layer — classified TRANSIENT carrying the server's own text, never
//      "no data here" (§CONTEXT-DATA-HONESTY; the eeWfsClient measured the same shape).
//
// FetchOutcome end-to-end (C57 §1.5): every failure mode is a typed outcome, never a
// throw, and EMPTY and FAILURE are DIFFERENT VALUES.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { PlandataLayer } from '../../providers/mapPlandataToZoningRecord.js';

const tracer = trace.getTracer('pryzm.siteintel.dk');

/* ────────────────────────────── endpoints (the re-pin) ─────────────────── */

/**
 * Plandata.dk national plan register — KEYLESS GeoServer WFS (lane 2 §DK-1; live
 * re-probed 2026-09-01). Same pin as the server proxy's `PLANDATA_WFS_ENDPOINT`.
 */
export const DK_PLANDATA_WFS_ENDPOINT = 'https://geoserver.plandata.dk/geoserver/wfs';

/** DAWA (Danmarks Adressers Web API) — KEYLESS; the parcel step needs no key at all. */
export const DK_DAWA_BASE = 'https://api.dataforsyningen.dk';

/**
 * Half-width (degrees) of the point query bbox — mirrors the proxy's measured
 * `PLANDATA_BBOX_HALF_DEG` (~17 m N-S), small enough to hit one plan polygon.
 */
export const DK_PLANDATA_BBOX_HALF_DEG = 0.00015;

/**
 * §DK-PLAN-LADDER (deliverable 3) — the four Plandata layers of the Danish applicability
 * ladder, MOST-SPECIFIC FIRST, with the R1 rank rung each layer's rules carry
 * (`{scheme: 'dk-plan-ladder', level}`, 1 = most specific). The ordering is lane 2 §DK-1's
 * measured precedence ("a per-parcel resolver must check byggefelt → delområde →
 * lokalplan → ramme, in that precedence order — this IS the Danish applicability ladder")
 * and matches the wired proxy's `PLANDATA_LAYERS` fallback order. RESOLUTION stays
 * ENGINE-side (verdict §F.7 / §G item 1b): the rung is a FACT emitted on each rule;
 * `evaluateZoneParameter` picks min level on one scheme and refuses ties.
 *
 * Rung 5 (the BR18 §168–186 statutory defaults where every layer is silent) is a DERIVED
 * step that no Plandata feature carries — it is recorded on `DK_APPLICABILITY_LADDER`
 * (index.ts) as data, not minted as a fake WFS layer here.
 */
export const DK_PLANDATA_LAYERS: readonly {
    readonly layer: PlandataLayer;
    readonly typeName: string;
    readonly rankLevel: 1 | 2 | 3 | 4;
}[] = [
    { layer: 'byggefelt', typeName: 'pdk:theme_pdk_byggefelt_vedtaget', rankLevel: 1 },
    {
        layer: 'lokalplandelomraade',
        typeName: 'pdk:theme_pdk_lokalplandelomraade_vedtaget',
        rankLevel: 2,
    },
    { layer: 'lokalplan', typeName: 'pdk:theme_pdk_lokalplan_vedtaget', rankLevel: 3 },
    {
        layer: 'kommuneplanramme',
        typeName: 'pdk:theme_pdk_kommuneplanramme_vedtaget_v',
        rankLevel: 4,
    },
];

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every DK provider is unit-testable without the network. */
export interface DkFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as Plandata delivers it (attributes bag; geometry unused here). */
export interface DkWfsFeature {
    readonly properties: Record<string, unknown>;
}

/** Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back. */
export function extractDkOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport')) return null;
    const m = /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body);
    return m ? m[1]!.trim() : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * Build the Plandata WFS 2.0 GetFeature URL for a tiny bbox around (lon,lat) — the same
 * measured shape as the proxy's `buildPlandataWfsUrl` (WFS 2.0.0, JSON output,
 * `srsName=EPSG:4326`, count 5). `axis` selects the bbox coordinate order for the hedge
 * (measured fact 2): `'lonlat'` is the order that answers; `'latlon'` is the retry probe.
 */
export function buildDkPlandataPointUrl(
    typeName: string,
    lon: number,
    lat: number,
    axis: 'lonlat' | 'latlon',
): string {
    const d = DK_PLANDATA_BBOX_HALF_DEG;
    const minLon = lon - d;
    const maxLon = lon + d;
    const minLat = lat - d;
    const maxLat = lat + d;
    const bbox =
        axis === 'latlon'
            ? `${minLat},${minLon},${maxLat},${maxLon},EPSG:4326`
            : `${minLon},${minLat},${maxLon},${maxLat},EPSG:4326`;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
        count: '5',
        bbox,
    });
    return `${DK_PLANDATA_WFS_ENDPOINT}?${params.toString()}`;
}

/** DAWA parcel-at-point URL (keyless; measured 2026-09-01 on both baseline parcels). */
export function buildDkDawaJordstykkeUrl(lat: number, lon: number): string {
    const params = new URLSearchParams({ x: String(lon), y: String(lat) });
    return `${DK_DAWA_BASE}/jordstykker?${params.toString()}`;
}

/**
 * The classified GET every DK leg goes through. Returns the raw parsed JSON body or a
 * typed refusal — NEVER throws, and never lets an upstream failure masquerade as an
 * empty answer (`queryLabel` names layer + query so `absent` reasons are actionable).
 */
export async function dkGetJson(
    url: string,
    queryLabel: string,
    deps: DkFetchDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan('pryzm.siteintel.dk.getJson', async (span): Promise<FetchOutcome<unknown>> => {
        span.setAttribute('dk.query', queryLabel);
        try {
            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
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
            const body = await res.text().catch(() => '');
            if (!res.ok) {
                const exc = extractDkOwsExceptionText(body);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(
                    `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                );
            }
            const exc200 = extractDkOwsExceptionText(body);
            if (exc200 !== null) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(`upstream-failed: ExceptionReport from ${url} — ${exc200}`);
            }
            try {
                const parsed: unknown = JSON.parse(body);
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

/**
 * Fetch the Plandata features of ONE ladder layer at a WGS84 point, with the measured
 * axis hedge: query `lon,lat` first; on a clean zero retry `lat,lon` before concluding
 * `absent` (a wrong axis order returns 0 SILENTLY — measured fact 2 — so a single-order
 * zero is not yet a durable "no plan here").
 *
 *   • found    → ≥1 feature (attribute bags, verbatim)
 *   • absent   → BOTH orders answered 200 with zero features (durable; cacheable)
 *   • transient→ network / HTTP / ExceptionReport / unparsable body (names the endpoint)
 */
export async function dkPlandataLayerAtPoint(
    typeName: string,
    lat: number,
    lon: number,
    deps: DkFetchDeps = {},
): Promise<FetchOutcome<readonly DkWfsFeature[]>> {
    const parseFeatures = (parsed: unknown): readonly DkWfsFeature[] | null => {
        const features = (parsed as { features?: unknown }).features;
        if (!Array.isArray(features)) return null;
        const clean: DkWfsFeature[] = [];
        for (const f of features) {
            const props = (f as { properties?: unknown })?.properties;
            if (props !== null && typeof props === 'object' && !Array.isArray(props)) {
                clean.push({ properties: props as Record<string, unknown> });
            }
        }
        return clean;
    };
    for (const axis of ['lonlat', 'latlon'] as const) {
        const url = buildDkPlandataPointUrl(typeName, lon, lat, axis);
        const got = await dkGetJson(url, `${typeName} @ ${lat},${lon} (${axis})`, deps);
        if (got.status !== 'found') return got as FetchOutcome<readonly DkWfsFeature[]>;
        const features = parseFeatures(got.value);
        if (features === null) {
            return fetchTransient(`upstream-failed: no features array from ${url}`);
        }
        if (features.length > 0) return fetchFound(features);
        // clean zero on this order → hedge the axis before calling it absent
    }
    return fetchAbsent(`no-feature: ${typeName} @ ${lat},${lon} (both bbox axis orders)`);
}
