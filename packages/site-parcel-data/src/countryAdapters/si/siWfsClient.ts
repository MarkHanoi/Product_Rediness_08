// LANE SI — SLOVENIA (SI) ADAPTER · the ONE impure seam: a FetchOutcome-classified WFS GET.
//
// REPORT §J: "Core stays country-agnostic; ONLY adapters know sources, schemas, semantics,
// documents." This module is the SI adapter's fetch layer — it knows the ONE Slovenian cadastral
// WFS, its measured quirks, and NOTHING about rules or business logic.
//
// MEASURED FACTS THIS MODULE ENCODES (live probes 2026-09-03 — re-run them before "fixing" any):
//
//   1. ONE SERVICE, ONE STACK: GURS Kataster nepremičnin (the merged land+building cadastre)
//      served as a GeoServer WFS 2.0 at `ipi.eprostor.gov.si/wfs-si-gurs-kn/ows`. KEYLESS. The
//      parcel layer is `SI.GURS.KN:PARCELE`. (The same host serves the MNVP planning WFS
//      `wfs-si-mnvp-pa` — regulation lines/surfaces + land use, the ENVELOPE-GEOMETRY channel; that
//      is the rules half, recorded in siSources.ts, NOT queried here.)
//   2. CRS: native D96/TM = EPSG:3794 everywhere. GetCapabilities advertises ONLY EPSG:3794 (no
//      4326, no CRS84). BUT the server reprojects on request — MEASURED both ways at Ljubljana:
//        • a WGS84 `bbox=<latMin>,<lonMin>,<latMax>,<lonMax>,urn:ogc:def:crs:EPSG::4326` is
//          accepted and reprojected SERVER-SIDE (the query point need not be in 3794);
//        • WITHOUT `srsName`, output geometry comes back in NATIVE 3794 (the `crs` block reads
//          `urn:ogc:def:crs:EPSG::3794`); WITH `srsName=EPSG:4326`, output is WGS84 [lon,lat].
//      So NO hand-rolled projection exists anywhere in this adapter (the mml/dk lesson: a
//      hand-rolled D96/TM transform would be silently wrong; C58 §1.4). The PACKAGE provider keeps
//      the native 3794 ring on the object (the EE `NativeCrsGeometry` discipline); the browser proxy
//      (`server/jurisdiction/euCadastreProxy.js` `si` row) is the one that passes `srsName=EPSG:4326`
//      for a WGS84 ring, exactly as the EE proxy does over EE's projected L-EST97.
//   3. FAILURE SHAPE: a wrong layer name returns HTTP 400 + `ows:ExceptionReport` naming the layer
//      verbatim ("Feature type SI.GURS.KN:PARCELE_WRONGNAME unknown", MEASURED). This module
//      classifies that as a TRANSIENT refusal carrying the server's own text — a misconfiguration
//      must never read as "no data here" (§CONTEXT-DATA-HONESTY).
//   4. IDENTITY: a parcel is keyed by `EID_PARCELA` (stable machine id, e.g. "100100001379837235")
//      and read by humans as `KO_ID + ST_PARCELE` (cadastral municipality + parcel number, e.g.
//      "1725 2468/4"). Exact identity resolve uses a CQL `EID_PARCELA='…'` filter (MEASURED → 1
//      feature).
//
// FetchOutcome end-to-end (C57 §1.5): every failure mode is a typed outcome, never a throw, and
// EMPTY and FAILURE are DIFFERENT VALUES:
//   • network throw / timeout / no fetch → transient  ("endpoint-unreachable: <endpoint>")
//   • non-OK HTTP / 200 ExceptionReport  → transient  ("upstream-failed: …", carries the server's
//                                                       own exception text so a wrong layer refuses
//                                                       BY NAME)
//   • OK but unparsable body             → transient  ("upstream-failed: …")
//   • OK, parsed, zero features          → absent     ("no-feature: <label>" — DURABLE nothing-here)
//   • OK, parsed, ≥1 feature             → found
//
// Licence: GURS Kataster nepremičnin open data — CC BY 4.0, GREEN (sweep 2026-08-31 · census
// 2026-09-02; e-prostor "Access to geodetic data" / JGP public services). Attribution org:
// Geodetska uprava Republike Slovenije (GURS), under MNVP.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.si');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * GURS Kataster nepremičnin WFS base (GeoServer). Keyless; PROBED LIVE 2026-09-03 (Ljubljana →
 * parcel PARCELE.100100001379837235, KO 1725 Ajdovščina, ST_PARCELE 2468/4, 1896 m²). ⚠ Browser
 * use requires a same-origin proxy (C57 CSP) — this base is for server/node use; the registry row
 * routes through `/api/parcel/si` (euCadastreProxy.js `si` row).
 */
export const SI_KN_WFS_BASE = 'https://ipi.eprostor.gov.si/wfs-si-gurs-kn/ows';

/** The cadastral parcel layer — Kataster nepremičnin parcels. PROBED LIVE 2026-09-03. */
export const SI_PARCEL_LAYER = 'SI.GURS.KN:PARCELE';

/** Native CRS of the Slovenian cadastre — D96/TM. Query WGS84 (server reprojects); geometry OUT is this. */
export const SI_NATIVE_CRS = 'EPSG:3794';

/** The urn CRS token the service accepts for lat,lon-ordered WGS84 bboxes (probed, reprojected server-side). */
export const SI_WGS84_URN = 'urn:ogc:def:crs:EPSG::4326';

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every SI provider is unit-testable without the network. */
export interface SiWfsDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as the KN WFS delivers it (properties bag + geometry). */
export interface SiWfsFeature {
    readonly properties: Record<string, unknown>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/**
 * Pull the `ows:ExceptionText` out of an OGC ExceptionReport body, if that is what came back. The
 * KN GeoServer names the offending layer verbatim in this text (measured fact 3) — carrying it into
 * the outcome is what makes a wrong-layer refusal SELF-NAMING.
 */
export function extractSiOwsExceptionText(body: string): string | null {
    if (!body.includes('ExceptionReport')) return null;
    const m = /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/.exec(body);
    return m ? m[1]!.trim() : 'OGC ExceptionReport (no ExceptionText)';
}

/**
 * The classified GET every SI provider goes through. Returns the parsed feature list or a typed
 * refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer.
 * `queryLabel` is the human-readable description of what was asked (layer + filter), so `absent`
 * reasons are specific enough to act on.
 */
export async function siWfsGetFeatures(
    url: string,
    queryLabel: string,
    deps: SiWfsDeps = {},
): Promise<FetchOutcome<readonly SiWfsFeature[]>> {
    return tracer.startActiveSpan('pryzm.siteintel.si.wfsGetFeatures', async (span): Promise<FetchOutcome<readonly SiWfsFeature[]>> => {
        span.setAttribute('si.query', queryLabel);
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
                // A wrong layer name lands HERE (HTTP 400 + ExceptionReport) — the refusal carries
                // the server's own text, so it names the layer.
                const exc = extractSiOwsExceptionText(body);
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                return fetchTransient(
                    `upstream-failed: HTTP ${res.status} from ${url}` + (exc ? ` — ${exc}` : ''),
                );
            }
            // GeoServer can also return HTTP 200 ExceptionReports for some malformed requests.
            const exc200 = extractSiOwsExceptionText(body);
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
            const clean: SiWfsFeature[] = [];
            for (const f of features) {
                if (f && typeof f === 'object' && typeof (f as SiWfsFeature).properties === 'object') {
                    clean.push(f as SiWfsFeature);
                }
            }
            if (clean.length === 0) {
                // The source ANSWERED and there is genuinely nothing here — a durable coverage
                // fact, distinct from every failure above (§CONTEXT-DATA-HONESTY).
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchAbsent(`no-feature: ${queryLabel}`);
            }
            span.setStatus({ code: SpanStatusCode.OK });
            span.setAttribute('si.features', clean.length);
            return fetchFound(clean as readonly SiWfsFeature[]);
        } finally {
            span.end();
        }
    });
}

/* ────────────────────────────── URL builders (pure) ───────────────────── */

/**
 * KN WFS GetFeature URL with a WGS84 (lat,lon urn-ordered) bbox — server-side reprojection of the
 * QUERY; output geometry stays NATIVE 3794 (no `srsName`), the EE native-CRS discipline. `count`
 * caps the candidate set (a click can touch a few adjacent parcels).
 */
export function buildSiWgs84BboxUrl(
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
        typeNames: SI_PARCEL_LAYER,
        count: String(count),
        outputFormat: 'application/json',
        bbox: `${latMin},${lonMin},${latMax},${lonMax},${SI_WGS84_URN}`,
    });
    return `${SI_KN_WFS_BASE}?${p.toString()}`;
}

/**
 * KN WFS GetFeature URL with a CQL exact filter on `EID_PARCELA` (the stable machine id) — the
 * identity resolve path. MEASURED (2026-09-03): `EID_PARCELA='100100001379837235'` → 1 feature.
 * Output stays NATIVE 3794 (no `srsName`).
 */
export function buildSiEidCqlUrl(eid: string, count: number): string {
    const cql = `EID_PARCELA='${eid.replace(/'/g, '')}'`;
    const p = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: SI_PARCEL_LAYER,
        count: String(count),
        outputFormat: 'application/json',
        cql_filter: cql,
    });
    return `${SI_KN_WFS_BASE}?${p.toString()}`;
}
