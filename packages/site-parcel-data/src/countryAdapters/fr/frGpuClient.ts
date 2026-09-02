// LANE FR-ZONEID (demo gap G3) — FRANCE (FR) · the ONE impure seam: a FetchOutcome-classified
// GET against the national Géoportail de l'urbanisme (GPU) via API Carto, keyless.
//
// WHAT THIS MODULE IS — AND DELIBERATELY IS NOT. It fetches ZONE IDENTITY (which planning zone,
// under which instrument, from which règlement document) for any WGS84 point in metropolitan
// France. It carries NO numeric articles: hauteur / emprise / retraits live in the règlement
// PDF, which is the E8 French reader's job (today honestly `no-reader-configured`). Fetching a
// number here would be the L-616 overstatement with a national citation attached.
//
// MEASURED FACTS THIS MODULE ENCODES (live probes; re-run them before "fixing" any of these):
//   1. Endpoint `https://apicarto.ign.fr/api/gpu/<module>?geom=<GeoJSON Point>` — anonymous,
//      no token, no registration. Probed 2026-08-31 (lane FR-1, 3 points), 2026-09-01 (E8
//      scout, zone-urba 6/6 cities), 2026-09-02 (this lane: Lyon Presqu'île → UCe1b live;
//      Pardines secteur-cc → "N" live; Solignat municipality → is_rnu:true; Golfe du Lion sea
//      point → 0 features on `municipality`). GeoJSON `coordinates` are [lon, lat] (GeoJSON
//      order, verified live — the Lyon point answers in this order).
//   2. THREE RUNGS COVER FRANCE NATIONALLY, and they are DIFFERENT ANSWERS (this lane's
//      2026-09-02 discovery — the brief's own rural point has NO zone-urba):
//        • `zone-urba`   — PLU/PLUi/POS/PSMV zones: libelle, typezone, idurba, nomfic/urlfic.
//        • `secteur-cc`  — carte communale sectors: libelle, typesect, idurba (`…_CC_…`).
//          The brief's rural Auvergne point (45.5636, 3.1856) is EMPTY on zone-urba but a
//          real secteur "N" of carte communale 63268_CC_20190221 (Pardines) — reading rung 1
//          alone would misreport CC communes (~thousands nationally) as unplanned.
//        • `municipality` — commune identity + `is_rnu` flag: an RNU commune is ITSELF an
//          answer (national rules apply), never a coverage gap (lane FR-1 doctrine). A sea /
//          non-French point returns 0 features here — the honest absent.
//   3. ZERO FEATURES arrives as HTTP 200 `{"features":[],"totalFeatures":0,…}` (measured at
//      both rural points and the sea point) — an EMPTY, not a failure. Classifying it
//      `transient` would put honest RNU/sea answers on an endless retry card; classifying a
//      5xx `absent` would be the failure≠empty conflation §CONTEXT-DATA-HONESTY forbids.
//   4. `urlfic` is filled 3/6 and per-zone-addressable 1/6 (E8 scout) — naming ≠ addressing.
//      The `#page=` anchor appears on EITHER `urlfic` (Marseille) or `nomfic` (Nice); the
//      pure mapper parses it off whichever field carries it (frZoneIdentity.ts).
//
// Licence: Licence Ouverte / Etalab 2.0 (IGN Géoplateforme / GPU) — GREEN, attribution.
// ⚠ Browser use requires a same-origin proxy (C57 CSP) — this base is the server/node seam,
// exactly like `EE_GEOSERVER_BASE` / `DK_PLANDATA_WFS_ENDPOINT`. The registry row records the
// proxy as not-yet-wired.
//
// FetchOutcome end-to-end (C57 §1.5): every failure mode is a typed outcome, never a throw,
// and EMPTY and FAILURE are DIFFERENT VALUES:
//   • no fetch impl / network throw  → transient  ("endpoint-unreachable: <url> …")
//   • non-OK HTTP (5xx, 4xx)         → transient  ("upstream-failed: HTTP <status> from <url>")
//   • OK but unparsable / shapeless  → transient  ("upstream-failed: … from <url>")
//   • OK, parsed, zero features      → absent     ("no-feature: gpu/<module> @ <lat>,<lon>")
//   • OK, parsed, ≥1 feature         → found      (verbatim property bags)
// No new refusal-token spelling is minted (L-12874): the transient prefixes above are the
// L0 `TRANSIENT_FETCH_REASONS` vocabulary; `no-feature:` is the siblings' genuine-absence
// spelling (dk/ee/lt/pl).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.fr');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * API Carto GPU module base (IGN Géoplateforme) — keyless per-point queries over the national
 * Géoportail de l'urbanisme. Probed live 2026-08-31 / 2026-09-01 / 2026-09-02 (header §1).
 * The bulk sibling for bakes is WFS `data.geopf.fr/wfs` `wfs_du:zone_urba` (5,000-feature
 * cap) — per-parcel queries belong here, exactly as lane FR-1 recorded.
 */
export const FR_GPU_APICARTO_BASE = 'https://apicarto.ign.fr/api/gpu';

/** The three GPU modules of the national identity ladder, most specific first (header §2). */
export const FR_GPU_MODULES = ['zone-urba', 'secteur-cc', 'municipality'] as const;
export type FrGpuModule = (typeof FR_GPU_MODULES)[number];

/**
 * LANE FR-STEP4 — the FULL point-queryable module set the no-extraction product reads
 * (brief §4.1 route table). Superset of the identity ladder; every module probed live
 * 2026-09-02 at Paris 11e (48.8585, 2.3785):
 *   • `document`          → 1 feature: name/du_type/partition/gpu_doc_id/gpu_status.
 *     ⚠ MEASURED DISCREPANCY vs the brief: /document serves NO `datappro` and NO `etat` —
 *     those live in `doc_urba` (the attribute table), reachable live via the WFS fallback
 *     (`frWfsDocUrbaByIdurba` below). Reported, not worked around silently (brief §1.5).
 *   • `prescription-surf` → 5 features (typepsc/stypepsc/libelle/txt/nature verbatim).
 *   • `assiette-sup-s`    → 5 features (suptype/nomsuplitt/typeass/fichier — the acte PDF
 *     rides the assiette row itself).
 *     ⚠ MEASURED: `/acte-sup?geom=` IGNORES the geometry (returned 5000 of 89,002 national
 *     rows) — actes are non-spatial. The acte citation therefore comes from the assiette's
 *     own `fichier`/`partition`, never from a per-point /acte-sup call.
 */
export const FR_GPU_POINT_MODULES = [
    ...FR_GPU_MODULES,
    'document',
    'prescription-surf',
    'prescription-lin',
    'prescription-pct',
    'assiette-sup-s',
    'assiette-sup-l',
    'assiette-sup-p',
] as const;
export type FrGpuPointModule = (typeof FR_GPU_POINT_MODULES)[number];

/** UA sent on every server-side GPU request (the probe/demo lanes' measured convention). */
export const FR_GPU_USER_AGENT = 'PRYZM-Research/1.0';

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every FR provider is unit-testable without the network. */
export interface FrFetchDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as API Carto delivers it (attributes bag; geometry unused here). */
export interface FrGpuFeature {
    readonly properties: Record<string, unknown>;
}

/**
 * Build the API Carto GPU point-query URL for one module. The `geom` parameter is a GeoJSON
 * Point — coordinates in GeoJSON [lon, lat] order (measured fact 1; the Lyon probe answers
 * in this order and this order only).
 */
export function buildFrGpuPointUrl(module: FrGpuPointModule, lat: number, lon: number): string {
    const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] });
    const params = new URLSearchParams({ geom });
    return `${FR_GPU_APICARTO_BASE}/${module}?${params.toString()}`;
}

/**
 * The classified GET every FR leg goes through. Returns the raw parsed JSON body or a typed
 * refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer
 * (`queryLabel` names module + point so `absent` reasons are actionable).
 */
export async function frGpuGetJson(
    url: string,
    queryLabel: string,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<unknown>> {
    return tracer.startActiveSpan('pryzm.siteintel.fr.gpuGetJson', async (span): Promise<FetchOutcome<unknown>> => {
        span.setAttribute('fr.query', queryLabel);
        try {
            const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
            if (typeof fetchImpl !== 'function') {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                return fetchTransient(`endpoint-unreachable: no fetch implementation (${url})`);
            }
            let res: Response;
            try {
                res = await fetchImpl(url, {
                    headers: { Accept: 'application/json, */*', 'User-Agent': FR_GPU_USER_AGENT },
                });
            } catch (e) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'network-error' });
                return fetchTransient(
                    `endpoint-unreachable: ${url} (${e instanceof Error ? e.message : String(e)})`,
                );
            }
            const body = await res.text().catch(() => '');
            if (!res.ok) {
                // 5xx AND 4xx are both "the source did not answer the question" — a GPU 502
                // must never read as "no plan here" (acceptance arm 3 of this lane's brief).
                span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                const excerpt = body.length > 0 ? ` — ${body.slice(0, 160)}` : '';
                return fetchTransient(`upstream-failed: HTTP ${res.status} from ${url}${excerpt}`);
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
 * Fetch the GPU features of ONE ladder module at a WGS84 point.
 *
 *   • found     → ≥1 feature (attribute bags, verbatim)
 *   • absent    → 200 with zero features (durable — measured fact 3; cacheable)
 *   • transient → network / HTTP / unparsable / shapeless body (names the endpoint)
 */
export async function frGpuFeaturesAtPoint(
    module: FrGpuPointModule,
    lat: number,
    lon: number,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<readonly FrGpuFeature[]>> {
    const url = buildFrGpuPointUrl(module, lat, lon);
    const got = await frGpuGetJson(url, `gpu/${module} @ ${lat},${lon}`, deps);
    return classifyFeatureCollection(got, url, `no-feature: gpu/${module} @ ${lat},${lon}`);
}

/** Shared FeatureCollection → typed outcome classifier (API Carto and the WFS fallback agree). */
function classifyFeatureCollection(
    got: FetchOutcome<unknown>,
    url: string,
    absentReason: string,
): FetchOutcome<readonly FrGpuFeature[]> {
    if (got.status !== 'found') return got as FetchOutcome<readonly FrGpuFeature[]>;
    const features = (got.value as { features?: unknown }).features;
    if (!Array.isArray(features)) {
        return fetchTransient(`upstream-failed: no features array from ${url}`);
    }
    const clean: FrGpuFeature[] = [];
    for (const f of features) {
        const props = (f as { properties?: unknown })?.properties;
        if (props !== null && typeof props === 'object' && !Array.isArray(props)) {
            clean.push({ properties: props as Record<string, unknown> });
        }
    }
    if (clean.length === 0) {
        return fetchAbsent(absentReason);
    }
    return fetchFound(clean);
}

/* ────────────────────── the direct-WFS fallback (brief §4.1) ──────────────────────
 *
 * "API Carto is a proxy with no availability guarantee … Implement a direct
 * `data.geopf.fr/wfs/ows` fallback using the layer names above." (FR-MODULE-BUILD-BRIEF §4.1,
 * an architectural REQUIREMENT.) The fallback fires ONLY on a transient API Carto outcome —
 * an EMPTY API answer is an answer and is never second-guessed (failure ≠ empty).
 *
 * MEASURED FACTS (live 2026-09-02, FR-STEP4 probes — re-run before "fixing"):
 *   • CQL `INTERSECTS(the_geom, POINT(lat lon))` — axis order for EPSG:4326 CQL literals is
 *     LAT LON (POINT(48.8585 2.3785) → UG at Paris 11e; lon-lat order returned 0 features).
 *     ⚠ OPPOSITE of the BBOX-parameter order (lon,lat — heightSources.mjs `fetchBdTopo`,
 *     live-verified 2026-07-24). Both orders are measured; neither is a typo.
 *   • `wfs_du:doc_urba` is served as a NON-SPATIAL attribute layer and carries the fields
 *     API Carto /document lacks: `etat` ('03' Paris), `datappro` ('20260616'), nomreg/nomplan/
 *     nomrapp, typedoc (⚠ serves 'PLUI' where /document serves 'PLUi' — the TYPEDOC case-split
 *     the Phase 0 report measured at 612/3, normalise before comparing).
 */
export const FR_GPU_WFS_FALLBACK_BASE = 'https://data.geopf.fr/wfs/ows';

/** API-Carto-module → data.geopf.fr WFS layer (the brief §4.1 backing-layer column, verbatim). */
export const FR_GPU_WFS_LAYERS: Readonly<Record<FrGpuPointModule, string>> = {
    'zone-urba': 'wfs_du:zone_urba',
    'secteur-cc': 'wfs_du:secteur_cc',
    municipality: 'wfs_du:municipality',
    document: 'wfs_du:document',
    'prescription-surf': 'wfs_du:prescription_surf',
    'prescription-lin': 'wfs_du:prescription_lin',
    'prescription-pct': 'wfs_du:prescription_pct',
    'assiette-sup-s': 'wfs_sup:assiette_sup_s',
    'assiette-sup-l': 'wfs_sup:assiette_sup_l',
    'assiette-sup-p': 'wfs_sup:assiette_sup_p',
};

/** The doc_urba attribute layer — ETAT/DATAPPRO home (joined by idurba, not by point). */
export const FR_DOC_URBA_WFS_LAYER = 'wfs_du:doc_urba';

/** Build the direct-WFS point query for one module (CQL INTERSECTS, LAT LON — measured). */
export function buildFrGpuWfsPointUrl(module: FrGpuPointModule, lat: number, lon: number): string {
    const params = new URLSearchParams({
        SERVICE: 'WFS',
        VERSION: '2.0.0',
        REQUEST: 'GetFeature',
        TYPENAMES: FR_GPU_WFS_LAYERS[module],
        SRSNAME: 'EPSG:4326',
        CQL_FILTER: `INTERSECTS(the_geom,POINT(${lat} ${lon}))`,
        COUNT: '50',
        OUTPUTFORMAT: 'application/json',
    });
    return `${FR_GPU_WFS_FALLBACK_BASE}?${params.toString()}`;
}

/** Fetch one module's features at a point over the DIRECT WFS (the §4.1 fallback transport). */
export async function frWfsFeaturesAtPoint(
    module: FrGpuPointModule,
    lat: number,
    lon: number,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<readonly FrGpuFeature[]>> {
    const url = buildFrGpuWfsPointUrl(module, lat, lon);
    const got = await frGpuGetJson(url, `wfs/${FR_GPU_WFS_LAYERS[module]} @ ${lat},${lon}`, deps);
    return classifyFeatureCollection(
        got,
        url,
        `no-feature: wfs/${FR_GPU_WFS_LAYERS[module]} @ ${lat},${lon}`,
    );
}

/**
 * API Carto first; the direct WFS ONLY when API Carto is transient (did not answer). An API
 * Carto EMPTY is an answer and never triggers the fallback. When BOTH transports fail the
 * outcome is transient and names both — availability loss must never read as an absence
 * (§CONTEXT-DATA-HONESTY; this lane's falsification control 9).
 */
export async function frGpuFeaturesAtPointWithFallback(
    module: FrGpuPointModule,
    lat: number,
    lon: number,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<readonly FrGpuFeature[]>> {
    const primary = await frGpuFeaturesAtPoint(module, lat, lon, deps);
    if (primary.status !== 'transient') return primary;
    const fallback = await frWfsFeaturesAtPoint(module, lat, lon, deps);
    if (fallback.status === 'transient') {
        return fetchTransient(
            `endpoint-unreachable: gpu/${module} failed on BOTH transports — apicarto (${primary.reason}) and direct WFS (${fallback.reason})`,
        );
    }
    return fallback;
}

/**
 * Fetch the `doc_urba` row(s) for one instrument id over the direct WFS — the ETAT/DATAPPRO
 * join API Carto's /document does not serve (measured discrepancy, header of
 * FR_GPU_POINT_MODULES). Callers MUST dedupe deterministically: `doc_urba` idurba is NOT
 * unique (Phase 0: 23,885 rows / 14,109 distinct — procedure/partition duplication).
 */
export async function frWfsDocUrbaByIdurba(
    idurba: string,
    deps: FrFetchDeps = {},
): Promise<FetchOutcome<readonly FrGpuFeature[]>> {
    const safe = idurba.replace(/'/g, "''");
    const params = new URLSearchParams({
        SERVICE: 'WFS',
        VERSION: '2.0.0',
        REQUEST: 'GetFeature',
        TYPENAMES: FR_DOC_URBA_WFS_LAYER,
        CQL_FILTER: `idurba='${safe}'`,
        COUNT: '20',
        OUTPUTFORMAT: 'application/json',
    });
    const url = `${FR_GPU_WFS_FALLBACK_BASE}?${params.toString()}`;
    const got = await frGpuGetJson(url, `wfs/doc_urba idurba=${idurba}`, deps);
    return classifyFeatureCollection(got, url, `no-feature: wfs/doc_urba idurba=${idurba}`);
}
