// E1d — ESTONIA (EE) ADAPTER · the ONE impure seam: a FetchOutcome-classified WFS GET.
//
// REPORT §J: "Core stays country-agnostic; ONLY adapters know sources, schemas, semantics,
// documents." This module is the EE adapter's fetch layer — it knows the two Estonian WFS
// services, their measured quirks, and NOTHING about rules or business logic (that is
// `eeRuleMapper.ts`, which is pure).
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-01, transcripts in
// audit/europe-site-intel/2026-08-31/impl/lane-e1d-adapter-rework.md — re-run them before
// "fixing" any of these):
//
//   1. TWO SERVICES, TWO SERVER STACKS:
//      • Maa-amet public geoserver `gsavalik.envir.ee/geoserver` (GeoServer) — cadastre
//        (`kataster:ky_kehtiv`), ETAK↔EHR pre-joined buildings
//        (`etak_tuletis:etak_ehr_hooned`), restrictions workspaces. Keyless.
//      • PLANK/PLANIS plan register `livekluster.ehr.ee/api/mapserver2d/v1/mapserver`
//        (MapServer) — `dp_hoonestus` / `dp_krunt` / `dp_kehtiv` / `detailplaneering` /
//        `yp_maakasutus`. Keyless. (PLANK stopped accepting submissions Jan 2026; the WFS
//        continues as the valid-plans service under PLANIS — lane 4 EE-1 regime note. Watch
//        for URL churn after June 2026.)
//   2. CRS: native L-EST97 / EPSG:3301 everywhere. AXIS-ORDER TRAP (measured): GeoServer CQL
//      filter geometry uses NATIVE axis order — POINT(northing easting) — while its GeoJSON
//      OUTPUT is [easting, northing]. An (E,N) CQL point returns 0 features SILENTLY (probed:
//      POINT(658365.9 6473113.1) → 0, POINT(6473113.1 658365.9) → the parcel). Never "fix"
//      the argument order here without re-running that probe pair.
//   3. WGS84 ENTRY: both services accept `bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,
//      urn:ogc:def:crs:EPSG::4326` and reproject SERVER-SIDE (probed on both). So no
//      hand-rolled projection exists anywhere in this adapter (the mml/dk lesson: a
//      hand-rolled L-EST97 transform would be silently wrong; C58 §1.4).
//   4. FAILURE SHAPE: a wrong layer name returns HTTP 400 + `ows:ExceptionReport` naming the
//      layer verbatim on BOTH stacks (GeoServer: "Feature type kataster:ky_wrongname unknown";
//      MapServer: "TYPENAME 'dp_wrongname' doesn't exist in this server."). This module
//      classifies that as a TRANSIENT refusal carrying the server's own text — a
//      misconfiguration must never read as "no data here" (§CONTEXT-DATA-HONESTY).
//   5. PLANK serves numeric attributes as STRINGS ("17.4", "2.1"), empty as "" — the parse
//      rules live in `eeRuleMapper.ts`, not here.
//
// FetchOutcome end-to-end (C57 §1.5): every failure mode is a typed outcome, never a throw,
// and EMPTY and FAILURE are DIFFERENT VALUES:
//   • network throw / timeout        → transient  ("endpoint-unreachable: <endpoint>")
//   • non-OK HTTP                    → transient  (names endpoint + status; an ExceptionReport
//                                                  body adds the server's own exception text,
//                                                  so a wrong layer name refuses BY NAME)
//   • OK but unparsable body         → transient  (names endpoint)
//   • OK, parsed, zero features      → absent     (names layer + query — a DURABLE
//                                                  "nothing here", cacheable, not retryable)
//   • OK, parsed, ≥1 feature         → found
//
// Licence: Estonian open-data licence (custom, NOT CC — attribution + keep licence text,
// commercial use + redistribution allowed, no share-alike), GREEN —
// https://geoportaal.maaruum.ee/opendata-licence (lane 4 EE-2, fetched 2026-08-31).
// Attribution org: Maa-amet is now Maa- ja Ruumiamet (2025 merger).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.ee');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * Maa-amet (Maa- ja Ruumiamet) public geoserver base — cadastre, ETAK↔EHR buildings,
 * restrictions. Keyless; PROBED LIVE 2026-09-01 (parcel 78401:101:7194 and 79504:004:0020
 * both resolved). ⚠ Browser use requires a same-origin proxy (C57 CSP) — this base is for
 * server/node use; the registry row records the proxy as not-yet-wired.
 */
export const EE_GEOSERVER_BASE = 'https://gsavalik.envir.ee/geoserver';

/**
 * PLANK/PLANIS plan-register WFS (MapServer on the ehitisregister cluster). Keyless; PROBED
 * LIVE 2026-09-01 (dp_hoonestus at Kopli tn 2 → tihedus 2.1 / protsent 61 / korgus 17.4 /
 * sbp 3500). Endpoint published at planeerimine.ee (lane 4 EE-1).
 */
export const EE_PLANK_WFS_BASE = 'https://livekluster.ehr.ee/api/mapserver2d/v1/mapserver';

/** Native CRS of every Estonian national service — L-EST97. Query and measure in it (lane 4 EE-2). */
export const EE_NATIVE_CRS = 'EPSG:3301';

/** The urn CRS token both services accept for lat,lon-ordered WGS84 bboxes (probed on both). */
export const EE_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/** The urn CRS token for native-ordered (N,E) bboxes on the PLANK MapServer (probed). */
export const EE_NATIVE_URN = 'urn:ogc:def:crs:EPSG::3301';

/**
 * Geometry column of every PLANK MapServer layer — MEASURED via DescribeFeatureType on
 * `dp_hoonestus` (2026-09-01): the one gml element is `msGeometry:GeometryPropertyType`.
 * (The GeoServer workspaces differ: cadastre uses `geom`, buildings use `shape` — three
 * services, three column names, all measured, none guessable.)
 */
export const EE_PLANK_GEOMETRY_COLUMN = 'msGeometry';

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every EE provider is unit-testable without the network. */
export interface EeWfsDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as both Estonian services deliver it (properties bag + geometry). */
export interface EeWfsFeature {
    readonly properties: Record<string, unknown>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/**
 * Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back.
 * Both stacks name the offending layer verbatim in this text (measured fact 4 above) — carrying
 * it into the outcome is what makes a wrong-layer refusal SELF-NAMING.
 */
export function extractOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport')) return null;
    const m = /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body);
    return m ? m[1]!.trim() : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * The classified GET every EE provider goes through. Returns the parsed feature list or a
 * typed refusal — NEVER throws, and never lets an upstream failure masquerade as an empty
 * answer. `queryLabel` is the human-readable description of what was asked (layer + filter),
 * so `absent` reasons are specific enough to act on.
 */
export async function eeWfsGetFeatures(
    url: string,
    queryLabel: string,
    deps: EeWfsDeps = {},
): Promise<FetchOutcome<readonly EeWfsFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.wfsGetFeatures', async (span): Promise<FetchOutcome<readonly EeWfsFeature[]>> => {
        span.setAttribute('ee.query', queryLabel);
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
                // A wrong layer name lands HERE (HTTP 400 + ExceptionReport on both stacks) —
                // the refusal carries the server's own text, so it names the layer.
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
            const clean: EeWfsFeature[] = [];
            for (const f of features) {
                if (f && typeof f === 'object' && typeof (f as EeWfsFeature).properties === 'object') {
                    clean.push(f as EeWfsFeature);
                }
            }
            if (clean.length === 0) {
                // The source ANSWERED and there is genuinely nothing here — a durable coverage
                // fact, distinct from every failure above (§CONTEXT-DATA-HONESTY).
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(`no-feature: ${queryLabel}`);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttribute('ee.features', clean.length);
            return fetchFound(clean as readonly EeWfsFeature[]);
        } finally {
            span.end();
        }
    });
}

/* ────────────────────────────── URL builders (pure) ───────────────────── */

/** GeoServer GetFeature URL with a CQL filter (kataster / etak_tuletis workspaces). */
export function buildGeoserverCqlUrl(
    workspace: string,
    typeName: string,
    cql: string,
    count: number,
): string {
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        count: String(count),
        outputFormat: 'application/json',
        cql_filter: cql,
    });
    return `${EE_GEOSERVER_BASE}/${workspace}/ows?${p.toString()}`;
}

/** GeoServer GetFeature URL with a WGS84 (lat,lon urn-ordered) bbox — server-side reprojection. */
export function buildGeoserverWgs84BboxUrl(
    workspace: string,
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
        bbox: `${latMin},${lonMin},${latMax},${lonMax},${EE_WGS84_URN}`,
    });
    return `${EE_GEOSERVER_BASE}/${workspace}/ows?${p.toString()}`;
}

/** PLANK MapServer GetFeature URL with a native (N,E urn-ordered) or WGS84 (lat,lon) bbox. */
export function buildPlankBboxUrl(
    typeName: string,
    bbox: readonly [number, number, number, number],
    crsUrn: string,
): string {
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typenames: typeName,
        outputFormat: 'geojson',
        bbox: `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]},${crsUrn}`,
    });
    return `${EE_PLANK_WFS_BASE}?${p.toString()}`;
}

/**
 * PLANK MapServer GetFeature URL with an OGC Filter-XML `Intersects` over the given ring —
 * the EXACT parcel-ring query that replaced the centroid representative point (supplement §9
 * flag 1; a vertex-mean centroid can fall OUTSIDE a concave parcel and silently query the
 * neighbour). The intersection runs SERVER-SIDE against the served ring, so the adapter does
 * no geometry math at all (grep 2026-09-01 found no point-on-surface solver in core to adopt;
 * this is the supplement's bbox-query alternative upgraded to exact intersects, probed live).
 *
 * MEASURED (2026-09-01, Kopli tn 2): posList in NATIVE axis order — `northing easting` — over
 * `msGeometry` returns exactly the parcel's 2 hoonestusalas; the (E N) control returns
 * 0 features SILENTLY (the same axis trap as the GeoServer CQL POINT probe pair); the plain
 * ring-BBOX form returned 6 features from 3 different plans (bbox over-cover, measured).
 * `ring` is [easting, northing] pairs exactly as the cadastre serves GeoJSON.
 */
export function buildPlankIntersectsRingUrl(
    typeName: string,
    ring: ReadonlyArray<readonly [number, number]>,
): string {
    const posList = ring.map(([e, n]) => `${n} ${e}`).join(' ');
    const filter =
        `<Filter xmlns:gml="http://www.opengis.net/gml/3.2"><Intersects>` +
        `<PropertyName>${EE_PLANK_GEOMETRY_COLUMN}</PropertyName>` +
        `<gml:Polygon srsName="${EE_NATIVE_URN}"><gml:exterior><gml:LinearRing>` +
        `<gml:posList>${posList}</gml:posList>` +
        `</gml:LinearRing></gml:exterior></gml:Polygon></Intersects></Filter>`;
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typenames: typeName,
        outputFormat: 'geojson',
        filter,
    });
    return `${EE_PLANK_WFS_BASE}?${p.toString()}`;
}

/**
 * GeoServer GetFeature URL with a CQL `INTERSECTS` over the given ring (same rationale and
 * axis trap as {@link buildPlankIntersectsRingUrl}). MEASURED (2026-09-01, Kopli tn 2): CQL
 * `POLYGON((northing easting, …))` on `etak_tuletis:etak_ehr_hooned`/`shape` returns the
 * parcel's 3 buildings; the (E N) control returns 0 silently.
 */
export function buildGeoserverIntersectsRingUrl(
    workspace: string,
    typeName: string,
    geometryColumn: string,
    ring: ReadonlyArray<readonly [number, number]>,
    count: number,
): string {
    const poly = ring.map(([e, n]) => `${n} ${e}`).join(',');
    const cql = `INTERSECTS(${geometryColumn},POLYGON((${poly})))`;
    return buildGeoserverCqlUrl(workspace, typeName, cql, count);
}

/**
 * PLANK MapServer GetFeature URL with an OGC Filter-XML attribute equality (MapServer has no
 * CQL; the Filter form is the MEASURED working shape for the `detailplaneering` sysid join).
 */
export function buildPlankAttributeFilterUrl(
    typeName: string,
    property: string,
    literal: string | number,
): string {
    const filter =
        `<Filter><PropertyIsEqualTo><PropertyName>${property}</PropertyName>` +
        `<Literal>${literal}</Literal></PropertyIsEqualTo></Filter>`;
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typenames: typeName,
        outputFormat: 'geojson',
        filter,
    });
    return `${EE_PLANK_WFS_BASE}?${p.toString()}`;
}
