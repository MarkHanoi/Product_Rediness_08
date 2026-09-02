// LANE PT-ZONEID (demo gap G4, audit/demo-esfrpt/2026-09-02/DEMO-READINESS.md) — THE ONE IMPURE
// SEAM of the Portugal zone-identity adapter: a FetchOutcome-classified GET against the DGT's
// national OGC API `crus` collection.
//
// ⭐ THE CHANNEL DISCOVERY THIS MODULE ENCODES (measured 2026-09-02, transcripts in
// audit/demo-esfrpt/2026-09-02/ + the lane findings file). The PT recon
// (docs/04-reference/jurisdictions/pt/findings/PORTUGAL-DATA-RECON.md §4.7) verified CRUS as a
// PER-DICOFRE Hexagon WFS family (`SDISNITWFSCRUS_<DTCC>_1/WFService.aspx`) that is severely slow
// (132–200 s per request, one hard 502 after 204 s) and whose FeatureType NAME is per-municipality
// (`gmgml:CRUS_Porto_V`), so a national resolver on that channel needs a GetCapabilities round-trip
// per município. Its own NEXT.md item 9.3 asked "does the DGT OGC API carry a CRUS collection?" —
// unanswered until now. **IT DOES**: `ogcapi.dgterritorio.gov.pt/collections/crus`
// ("CRUS Portugal Continental", storageCrs EPSG:3763, items served in CRS84 lon/lat), and it is
// FAST — 0.27–0.83 s per point-bbox items query at four probe points on 2026-09-02, versus the
// WFS family's minutes. This module therefore wires the OGC API channel; the per-DICOFRE WFS stays
// the recon-verified SECONDARY witness, documented in `ptSources.ts`'s header, deliberately
// NOT wired (two channels answering one question would need a disagreement policy nobody has
// specified — and the slow channel adds nothing the fast one lacks; the schemas match field-for-
// field, modulo snake_case renames measured below).
//
// MEASURED FACTS THIS MODULE ENCODES (re-run the probes before "fixing" any of these):
//   1. Items query `GET /collections/crus/items?bbox=<lon±ε>,<lat±ε>&f=json&limit=10` answers
//      HTTP 200 with a GeoJSON FeatureCollection carrying `numberReturned`/`numberMatched`.
//      Properties measured at Lisboa/Porto/Évora (verbatim keys): `fid`, `dtcc`, `municipio`,
//      `classificacao_e_qualificacao`, `classe_2021`, `categoria_2021`, `escala_origem`, `fonte`,
//      `area_ha`, `autor`, `data_pub_origem`, `registo_ou_deposito`, `situacao_pdm`, `codigo`.
//      ⭐ `registo_ou_deposito` is the SNIT legal-deposit reference (recon §4.4 `IDDEPOSITO` —
//      Porto's came back `01.13.12/PDM/03/2021/93`, byte-identical to the recon's WMS probe), and
//      `situacao_pdm` ("Vigente") is the in-force stamp — BOTH absent from the per-DICOFRE WFS
//      schema, so the OGC API channel is strictly RICHER, not just faster.
//   2. TRANSIENT IS REAL HERE: the first collection-metadata GET of 2026-09-02 answered
//      `502 Proxy Error` (HTML body) and the retry answered 200 in 0.19 s. A 5xx or an HTML body
//      MUST classify `transient`, never `absent` (§CONTEXT-DATA-HONESTY) — the sea-vs-outage
//      distinction is the entire point of this adapter's outcome typing.
//   3. BBOX AXIS ORDER IS SPEC-FIXED, NOT HEDGED. OGC API — Features Part 1 fixes `bbox` to
//      lon,lat order for the default CRS84; measured working at all four probe points. This is
//      UNLIKE the WFS bbox-axis trap the DK client hedges (`dkPlandataClient.ts` measured fact 2):
//      no silent-zero axis swap exists on this channel, so no hedge is coded — adding one would
//      imply a failure mode the channel does not have.
//   4. A tiny bbox INTERSECTS more than it CONTAINS: the Lisboa Baixa probe returned 2 polygons
//      for a ±0.0001° box (a zone boundary runs through the block). The CALLER must pick the
//      polygon that CONTAINS the point (client-side even-odd test) — bbox membership alone would
//      let a neighbouring zone answer, which is a wrong-zone citation (the L-652 class).
//   5. Geometry arrives as Polygon/MultiPolygon in CRS84 `[lon, lat]` degree pairs (measured:
//      first Évora coordinate `[-7.905…, 38.559…]`). No reprojection is done or needed here.
//
// LAYERING: browser paths must go through a same-origin proxy (CSP `connect-src`), exactly as
// `/api/parcel/pt` does for the SNIC cadastre — `PT_CRUS_PROXY_PATH` documents the route a server
// owner should mount, forwarding to `buildPtCrusPointUrl`'s upstream VERBATIM. This client is the
// node/server seam (the DK shape: one endpoint, two runtimes).
//
// L-12874 TOKEN DISCIPLINE (the lane brief's hard rule): every `transient` reason in this
// directory uses a prefix from the L0 `TRANSIENT_FETCH_REASONS` table VERBATIM
// (`endpoint-unreachable` / `upstream-failed` / `timeout` / `network-error`), and every `absent`
// reason uses the FetchOutcome doc's own genuine-absence family (`no-feature`, `no-point`,
// `degenerate-geometry`). NO minted vocabulary — specifically NOT `mapper-refused:`, which four
// sibling adapters emit but which is NOT in the L0 table (that is L-12874's open defect, and this
// lane declines to ship recurrence six while the R-batch freeze blocks seeding it).
//
// FetchOutcome end-to-end (C57 §1.5): every failure mode is a typed outcome, never a throw, and
// EMPTY and FAILURE are DIFFERENT VALUES.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.pt');

/* ────────────────────────────── endpoints (measured 2026-09-02) ─────────────────── */

/** The DGT national OGC API root (keyless; CC BY 4.0 read on SNIG record 517c5023… 2026-09-02). */
export const PT_CRUS_OGCAPI_ENDPOINT = 'https://ogcapi.dgterritorio.gov.pt';

/** The national CRUS collection id — "CRUS Portugal Continental" (answers NEXT.md item 9.3: YES). */
export const PT_CRUS_COLLECTION = 'crus';

/**
 * Same-origin proxy route a browser build must use (CSP `connect-src` — the `/api/parcel/pt`
 * precedent). NOT yet mounted server-side; until it is, browser callers refuse
 * `endpoint-unreachable` and only node/server callers (this seam) reach the upstream.
 */
export const PT_CRUS_PROXY_PATH = '/api/pt/crus';

/**
 * Half-width (degrees) of the point-query bbox — ~11 m, the same order as the DK client's
 * measured half-width. Small enough that the containment pick (measured fact 4) has few
 * candidates; never zero, because a degenerate bbox is undefined behaviour across servers.
 */
export const PT_CRUS_BBOX_HALF_DEG = 0.0001;

/** `limit` on the items query — the Baixa probe measured 2 candidates; 10 is generous headroom. */
export const PT_CRUS_POINT_LIMIT = 10;

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every PT resolver is unit-testable without the network. */
export interface PtFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** One ring: closed or open [lon, lat] pair sequence, verbatim from the served GeoJSON. */
export type PtLonLatRing = ReadonlyArray<readonly [number, number]>;

/**
 * One CRUS feature, parsed just far enough to be used: the verbatim attribute bag plus the
 * polygon set (each entry = one polygon's rings, shell + holes) for the containment pick.
 */
export interface PtCrusRawFeature {
    readonly properties: Record<string, unknown>;
    readonly polygons: ReadonlyArray<ReadonlyArray<PtLonLatRing>>;
}

/** Build the items URL for a tiny bbox around (lat, lon) — measured shape, facts 1 and 3. */
export function buildPtCrusPointUrl(lat: number, lon: number): string {
    const d = PT_CRUS_BBOX_HALF_DEG;
    const params = new URLSearchParams({
        // OGC API — Features fixes bbox to lon,lat order for the default CRS84 (fact 3).
        bbox: `${lon - d},${lat - d},${lon + d},${lat + d}`,
        f: 'json',
        limit: String(PT_CRUS_POINT_LIMIT),
    });
    return `${PT_CRUS_OGCAPI_ENDPOINT}/collections/${PT_CRUS_COLLECTION}/items?${params.toString()}`;
}

/**
 * The classified GET every PT leg goes through. Returns the parsed JSON body or a typed
 * refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer.
 * The 502-Proxy-Error-HTML witness of 2026-09-02 (fact 2) travels the `upstream-failed` branch.
 */
export async function ptGetJson(
    url: string,
    queryLabel: string,
    deps: PtFetchDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan('pryzm.siteintel.pt.getJson', async (span): Promise<FetchOutcome<unknown>> => {
        span.setAttribute('pt.query', queryLabel);
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
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                // 5xx/4xx → TRANSIENT, never empty (fact 2: a real 502 was measured on this host).
                return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}`);
            }
            try {
                const parsed: unknown = JSON.parse(body);
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchFound(parsed);
            } catch {
                // An HTML error page behind a 200 is an upstream failure, not "no data here".
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
            }
        } finally {
            span.end();
        }
    });
}

/**
 * PURE: read a parsed items body into raw features. A body without a `features` array, or a
 * candidate feature whose geometry cannot be read as Polygon/MultiPolygon `[lon,lat]` rings,
 * is an UPSTREAM failure (we cannot decide containment, so neither `found` nor a durable
 * `absent` would be honest) — never a silent drop of the unreadable candidate.
 */
export function parsePtCrusItemsBody(
    parsed: unknown,
    url: string,
): FetchOutcome<readonly PtCrusRawFeature[]> {
    const features = (parsed as { features?: unknown }).features;
    if (!Array.isArray(features)) {
        return fetchTransient(`upstream-failed: no features array from ${url}`);
    }
    const clean: PtCrusRawFeature[] = [];
    for (const f of features) {
        const props = (f as { properties?: unknown })?.properties;
        if (props === null || typeof props !== 'object' || Array.isArray(props)) {
            return fetchTransient(`upstream-failed: feature without a properties object from ${url}`);
        }
        const polygons = parsePolygonSet((f as { geometry?: unknown }).geometry);
        if (polygons === null) {
            const fid = (props as Record<string, unknown>)['fid'];
            return fetchTransient(
                `upstream-failed: unreadable CRUS geometry (fid ${String(fid ?? '?')}) from ${url}`,
            );
        }
        clean.push({ properties: props as Record<string, unknown>, polygons });
    }
    return fetchFound(clean);
}

/** Read a GeoJSON Polygon/MultiPolygon into a polygon set, or null when it is neither. */
function parsePolygonSet(
    geometry: unknown,
): ReadonlyArray<ReadonlyArray<PtLonLatRing>> | null {
    const g = geometry as { type?: unknown; coordinates?: unknown } | null | undefined;
    if (!g || typeof g !== 'object') return null;
    if (g.type === 'Polygon') {
        const rings = parseRings(g.coordinates);
        return rings === null ? null : [rings];
    }
    if (g.type === 'MultiPolygon') {
        if (!Array.isArray(g.coordinates)) return null;
        const polygons: Array<ReadonlyArray<PtLonLatRing>> = [];
        for (const poly of g.coordinates) {
            const rings = parseRings(poly);
            if (rings === null) return null;
            polygons.push(rings);
        }
        return polygons;
    }
    return null;
}

function parseRings(coordinates: unknown): ReadonlyArray<PtLonLatRing> | null {
    if (!Array.isArray(coordinates)) return null;
    const rings: PtLonLatRing[] = [];
    for (const ring of coordinates) {
        if (!Array.isArray(ring)) return null;
        const pairs: Array<readonly [number, number]> = [];
        for (const pos of ring) {
            if (!Array.isArray(pos) || typeof pos[0] !== 'number' || typeof pos[1] !== 'number') {
                return null;
            }
            pairs.push([pos[0], pos[1]]);
        }
        rings.push(pairs);
    }
    return rings;
}

/**
 * Fetch the CRUS features whose polygons INTERSECT the tiny bbox around a WGS84 point.
 *
 *   • found     → ≥1 feature (verbatim attribute bags + parsed polygon sets). ⚠ INTERSECTION,
 *                 not containment — the caller MUST still pick the containing polygon (fact 4).
 *   • absent    → the collection answered 200 with zero features (durable: open sea, or land
 *                 outside every vigente PDM's CRUS transcription).
 *   • transient → network / HTTP / non-JSON / unreadable geometry (names the endpoint).
 */
export async function ptCrusFeaturesAtPoint(
    lat: number,
    lon: number,
    deps: PtFetchDeps = {},
): Promise<FetchOutcome<readonly PtCrusRawFeature[]>> {
    const url = buildPtCrusPointUrl(lat, lon);
    const got = await ptGetJson(url, `crus @ ${lat},${lon}`, deps);
    if (got.status !== 'found') return got as FetchOutcome<readonly PtCrusRawFeature[]>;
    const features = parsePtCrusItemsBody(got.value, url);
    if (features.status !== 'found') return features;
    if (features.value.length === 0) {
        return fetchAbsent(`no-feature: crus @ ${lat},${lon} (0 features in point bbox)`);
    }
    return features;
}
