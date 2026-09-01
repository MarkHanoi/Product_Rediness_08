// E7-FI — FINLAND (FI) ADAPTER · the ONE impure seam: a FetchOutcome-classified OGC API
// Features GET against the Ryhti (SYKE) national built-environment information system.
//
// REPORT §J: "Core stays country-agnostic; ONLY adapters know sources, schemas, semantics,
// documents." This module knows the Finnish endpoints and their MEASURED quirks, and NOTHING
// about rules (that is `fiRuleMapper.ts`, which is pure).
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// MEASURED FACTS THIS MODULE ENCODES — live probes 2026-09-01, transcripts in
// audit/europe-site-intel/2026-08-31/impl/lane-e7-fi-transcripts/. RE-RUN THEM before
// "fixing" any of these; each was measured with its own falsification control.
// ══════════════════════════════════════════════════════════════════════════════════════════
//
//  1. ONE OPEN WORKSPACE, FOUR COLLECTIONS, ALL PLAN *INDEXES*.
//     `.../geoserver/ryhti_plan/ogc/features/v1/collections` -> exactly 4:
//       pub_valid_ld_plan_ix_gs  "Asemakaavahakemisto"            5,635 features
//       pub_valid_lm_plan_ix_gs  "Yleiskaavahakemisto"              647 features
//       pub_prep_ld_plan_ix_gs   "Valmisteilla olevat asemakaavat"    0 features
//       pub_prep_lm_plan_ix_gs   "Valmisteilla olevat yleiskaavat"    0 features
//     THE TWO `prep` COLLECTIONS ARE DECLARED, SERVED, AND EMPTY. That is the brief's first
//     case (the thing EXISTS and is empty). It is NOT the same fact as the missing
//     plan-object service (case two — see FI_RYHTI_UNSERVED_PARAMETERS in fiRuleMapper.ts).
//
//  2. WMS DOES **NOT** EXPOSE A HIDDEN PLAN-OBJECT LAYER — the "GetCapabilities is not an
//     inventory" check was run and came back NEGATIVE. `ryhti_plan/wms?...GetCapabilities`
//     lists 8 `<Name>` elements, but four of them (`pub_valid_ld_plan`, `pub_prep_ld_plan`,
//     `pub_valid_lm_plan`, `pub_prep_lm_plan`) sit inside `<Style>` blocks titled "Ryhti
//     plan" — they are STYLE names, not layers. WMS and WFS/OGC-API expose the SAME four
//     `_ix_gs` index layers. Recorded because the near-miss is exactly the shape that
//     produces false "hidden layer" claims.
//
//  3. `offset` IS SILENTLY IGNORED; THE PAGING PARAMETER IS `startIndex`.
//     MEASURED: `?limit=2000&offset=0` / `&offset=2000` / `&offset=4000` returned
//     BYTE-IDENTICAL pages (identical feature-id arrays, identical download sizes). The
//     server's OWN `next` link echoes `offset=0` back and appends `startIndex=2000`.
//     `?startIndex=2000` -> a different page; `?startIndex=4000` -> 1,635 features
//     (2000+2000+1635 = 5,635 = numberMatched). A paginator written to the OGC API Features
//     standard's `offset` reads page one forever and concludes the dataset holds 2,000 rows.
//     {@link fiRyhtiItemsUrl} therefore emits `startIndex` and NEVER `offset`.
//     (`skipGeometry=true` is likewise accepted and ignored — geometry always comes back.)
//
//  4. bbox AXIS ORDER IS CRS84 (lon,lat) AND A SWAP FAILS **SILENTLY**.
//     MEASURED with its control: `bbox=27.6770,62.8924,27.6771,62.8925` (lon,lat) -> 4
//     features; `bbox=62.8924,27.6770,62.8925,27.6771` (lat,lon) -> **HTTP 200, 0 features,
//     no error**. The same silent-zero trap as EE's CQL POINT(N E) and the Madrid EPSG:4326
//     case. Never reorder the arguments of {@link fiRyhtiBboxParams} without re-running BOTH
//     halves of that pair.
//
//  5. NATIVE CRS IS AVAILABLE AND IS WHAT WE MEASURE IN.
//     `crs=http://www.opengis.net/def/crs/EPSG/0/3067` -> coordinates in ETRS-TM35FIN metres
//     plus an explicit `"crs":{"type":"name","properties":{"name":"urn:ogc:def:crs:EPSG::3067"}}`
//     block; without it the response is CRS84 degrees and `"crs":null`. The bbox stays CRS84
//     while the OUTPUT is 3067 — probed together, 4 features either way. This is the
//     WGS84-entry / native-measurement seam EE/DK/NL already use, done server-side, so this
//     adapter contains no projection math (C58 section 1.4).
//
//  6. FAILURE SHAPES ARE **JSON DOCUMENTS**, NOT GeoJSON, AND NOT `ows:ExceptionReport`.
//     Unknown collection   -> HTTP 404 {"type":"NotFound","title":"Unknown collection <name>"}
//     Illegal CQL property -> HTTP 400 {"type":"InvalidParameterValue","title":"Illegal
//                             property name: <field> for feature type <collection>"}
//     Both are misconfigurations and both classify TRANSIENT carrying the server's own
//     `title` — a wrong collection name must never read as "no plan here"
//     (CONTEXT-DATA-HONESTY). The EE `extractOwsExceptionText` shape does not apply here;
//     this is a different server dialect and gets its own extractor, not a borrowed one.
//
//  7. `filter-lang=cql2-text` WORKS, including `LIKE` against
//     `administrative_area_identifiers` — which is served as a JSON *string* (`"[\"297\"]"`),
//     not a real array, so `LIKE '%297%'` is the working municipality filter.
//
//  8. PAGE CAP 2,000. `limit=10000` returns 2,000 and reports `numberMatched` as 2,000 on
//     that request while `limit=1` reports the true 5,635. Do not read `numberMatched` off an
//     over-limit request.
//
//  9. DATES CARRY A TRAILING `Z` — `"1995-08-22Z"`, not `"1995-08-22"`. That is a date with a
//     timezone designator and it FAILS `IsoDateStringSchema` (`/^\d{4}-\d{2}-\d{2}$/`).
//     Normalisation is the mapper's job, not the client's — see `fiRuleMapper.ts`.
//
// 10. `/items/{featureId}` RETURNS A FeatureCollection, NOT A Feature. Probed: reading
//     `.properties` off that response yields `undefined`. This adapter therefore never uses
//     the single-item path; it filters on `permanent_plan_identifier` instead.
//
// LICENCE: CC BY 4.0 — "Aineisto kuuluu SYKEn avoimiin aineistoihin (CC BY 4.0) avoimen
// tietosisallon osalta" (ckan.ymparisto.fi package_show for
// `rakennetun-ympariston-tietojarjestelman-kaavatiedot`, fetched 2026-09-01). Keyless on the
// open channel; non-open products require a tietolupa via ryhti@syke.fi.
//
// RETRY: this adapter adopts NO retry ladder and deliberately so — `src/net/
// retryWhileUnreachable.ts` exists, is FetchOutcome-typed and tested, and has zero consumers
// in countryAdapters/ (family verdict, "Recorded, NOT actioned"). Adopting it here would make
// this the first and only country to retry, which is a policy decision for the transient-retry
// owner, not for a country lane. Stated rather than left silent (convention B).
//
// FetchOutcome end-to-end (C57 section 1.5) — EMPTY and FAILURE are DIFFERENT VALUES:
//   - no fetch impl / network throw   -> transient  ("endpoint-unreachable: <url>")
//   - non-OK HTTP                     -> transient  ("upstream-failed: ..." + server title)
//   - OK but unparsable / not GeoJSON -> transient  ("upstream-failed: ...")
//   - OK, parsed, zero features       -> absent     ("no-feature: <queryLabel>")
//   - OK, parsed, >=1 feature         -> found

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.siteintel.fi');

/* ────────────────────────────── endpoints ─────────────────────────────── */

/**
 * The Ryhti open OGC API Features base. `sourceRegistry/fi.ts`'s `fi-ryhti-plan-ogcapi` row
 * pins `${FI_RYHTI_OGCAPI_BASE}/collections`; `fiSourceRefs.ts` ASSERTS that equality at
 * module load rather than claiming it in a comment (the DK `assertEndpoint` shape).
 */
export const FI_RYHTI_OGCAPI_BASE =
    'https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1';

/**
 * The attachment retrieval service every served `documents[].uri` points into. PROBED
 * 2026-09-01: `.../planattachmentdocument/54f4e444-b9ab-4547-b458-709b9a6c4747/file` ->
 * HTTP 200, 11,738,411 bytes, `application/pdf`, magic `%PDF-1.4`, KEYLESS. This is the ONLY
 * open route to Finnish plan PROVISIONS today.
 */
export const FI_RYHTI_ATTACHMENT_BASE =
    'https://uri.rakennetunymparistontietojarjestelma.fi/planattachmentdocument';

/** ETRS-TM35FIN — the native CRS of every Finnish national service. Measure in it (fact 5). */
export const FI_NATIVE_CRS = 'EPSG:3067';

/** The OGC CRS URI form the Ryhti server accepts for {@link FI_NATIVE_CRS} (fact 5). */
export const FI_NATIVE_CRS_URI = 'http://www.opengis.net/def/crs/EPSG/0/3067';

/**
 * The `crs.properties.name` token the server stamps on a native-CRS response (fact 5), so the
 * provider can CONFIRM the projection it asked for rather than assume it was honoured.
 */
export const FI_NATIVE_CRS_RESPONSE_URN = 'urn:ogc:def:crs:EPSG::3067';

/** The four OPEN collections, verbatim (fact 1). A closed set — the collections doc was enumerated. */
export const FI_RYHTI_COLLECTIONS = {
    /** Asemakaavahakemisto — the VALID detail-plan index. 5,635 features (2026-09-01). */
    validDetailPlanIndex: 'pub_valid_ld_plan_ix_gs',
    /** Yleiskaavahakemisto — the VALID master-plan index. 647 features (2026-09-01). */
    validMasterPlanIndex: 'pub_valid_lm_plan_ix_gs',
    /** Valmisteilla olevat asemakaavat — DECLARED, SERVED, **0 features** (2026-09-01). */
    preparationDetailPlanIndex: 'pub_prep_ld_plan_ix_gs',
    /** Valmisteilla olevat yleiskaavat — DECLARED, SERVED, **0 features** (2026-09-01). */
    preparationMasterPlanIndex: 'pub_prep_lm_plan_ix_gs',
} as const;

export type FiRyhtiCollection =
    (typeof FI_RYHTI_COLLECTIONS)[keyof typeof FI_RYHTI_COLLECTIONS];

/** Server-side page cap, measured (fact 8). Requesting more silently truncates to this. */
export const FI_RYHTI_PAGE_CAP = 2000;

/* ────────────────────────────── outcome plumbing ──────────────────────── */

/** Injectable dependencies so every FI provider is unit-testable without the network. */
export interface FiRyhtiDeps {
    /** Override `globalThis.fetch` (tests inject a fake; node probes use the real one). */
    readonly fetchImpl?: typeof fetch;
}

/** A GeoJSON feature as the Ryhti OGC API delivers it (properties bag + geometry). */
export interface FiRyhtiFeature {
    readonly id?: string;
    readonly properties: Record<string, unknown>;
    readonly geometry: { readonly type: string; readonly coordinates: unknown } | null;
}

/** What one classified GET yields: the features plus the response-level CRS token, verbatim. */
export interface FiRyhtiFeaturePage {
    readonly features: readonly FiRyhtiFeature[];
    /**
     * The `crs.properties.name` the server stamped on the response (e.g.
     * `"urn:ogc:def:crs:EPSG::3067"`), or null when it sent `"crs":null` (its CRS84 default).
     * Carried VERBATIM so the provider can refuse geometry whose CRS it did not confirm,
     * rather than assume the requested CRS was honoured (fact 5).
     */
    readonly responseCrs: string | null;
    /** `numberMatched` as served. Unreliable on an over-limit request (fact 8). */
    readonly numberMatched: number | null;
}

/**
 * Pull the server's own `title` out of a Ryhti JSON error document (fact 6). Returns null when
 * the body is not one of those documents, so a caller can tell "the server explained itself"
 * from "the server returned something else entirely".
 */
export function extractRyhtiErrorTitle(body: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const o = parsed as { type?: unknown; title?: unknown };
    if (typeof o.title !== 'string' || o.title === '') return null;
    // A GeoJSON FeatureCollection also carries `type`; an error document carries `title` and
    // no `features`. Requiring `title` (above) plus the absence of `features` separates them.
    if ('features' in o) return null;
    return typeof o.type === 'string' ? `${o.type}: ${o.title}` : o.title;
}

/**
 * The classified GET every FI provider goes through. Returns the parsed page or a typed
 * refusal — NEVER throws, and never lets an upstream failure masquerade as an empty answer.
 * `queryLabel` describes what was asked (collection + filter) so an `absent` reason is
 * specific enough to act on.
 */
export async function fiRyhtiGetFeatures(
    url: string,
    queryLabel: string,
    deps: FiRyhtiDeps = {},
): Promise<FetchOutcome<FiRyhtiFeaturePage>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.fi.ryhtiGetFeatures',
        async (span): Promise<FetchOutcome<FiRyhtiFeaturePage>> => {
            span.setAttribute('fi.query', queryLabel);
            try {
                const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
                if (typeof fetchImpl !== 'function') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-fetch' });
                    return fetchTransient(
                        `endpoint-unreachable: no fetch implementation (${url})`,
                    );
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
                    // A wrong collection name (404) or an illegal CQL property (400) lands
                    // HERE, carrying the server's own title so the refusal NAMES the cause.
                    const title = extractRyhtiErrorTitle(body);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: HTTP ${res.status} from ${url}` +
                            (title !== null ? ` — ${title}` : ''),
                    );
                }
                // A 200 carrying an error document (defensive: not observed, but the 400/404
                // shapes prove the server can emit them and a silent misread would be worse).
                const title200 = extractRyhtiErrorTitle(body);
                if (title200 !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: error document with HTTP 200 from ${url} — ${title200}`,
                    );
                }
                let parsed: unknown;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: non-JSON body from ${url}`);
                }
                const doc = parsed as {
                    features?: unknown;
                    crs?: unknown;
                    numberMatched?: unknown;
                };
                if (!Array.isArray(doc.features)) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'unparsable' });
                    return fetchTransient(`upstream-failed: no features array from ${url}`);
                }
                const clean: FiRyhtiFeature[] = [];
                for (const f of doc.features) {
                    if (
                        f !== null &&
                        typeof f === 'object' &&
                        typeof (f as FiRyhtiFeature).properties === 'object' &&
                        (f as FiRyhtiFeature).properties !== null
                    ) {
                        clean.push(f as FiRyhtiFeature);
                    }
                }
                const crsHolder =
                    doc.crs !== null && typeof doc.crs === 'object'
                        ? (doc.crs as { properties?: { name?: unknown } }).properties
                        : undefined;
                const crsName =
                    crsHolder !== null && typeof crsHolder === 'object'
                        ? crsHolder.name
                        : undefined;
                const page: FiRyhtiFeaturePage = {
                    features: clean,
                    responseCrs: typeof crsName === 'string' && crsName !== '' ? crsName : null,
                    numberMatched:
                        typeof doc.numberMatched === 'number' ? doc.numberMatched : null,
                };
                if (clean.length === 0) {
                    // The source ANSWERED and there is genuinely nothing here — a durable
                    // coverage fact, distinct from every failure above.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(`no-feature: ${queryLabel}`);
                }
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute('fi.features', clean.length);
                return fetchFound(page);
            } finally {
                span.end();
            }
        },
    );
}

/* ────────────────────────────── URL builders (pure) ───────────────────── */

/** Query knobs for {@link fiRyhtiItemsUrl}. Every field maps to one measured server behaviour. */
export interface FiRyhtiItemsQuery {
    /** CRS84 bbox as `[lonMin, latMin, lonMax, latMax]` — lon FIRST (fact 4). */
    readonly bboxCrs84?: readonly [number, number, number, number];
    /** CQL2-text filter (fact 7), e.g. `permanent_plan_identifier='AK-000480'`. */
    readonly cql2?: string;
    /** Page size; clamped to {@link FI_RYHTI_PAGE_CAP} (fact 8). */
    readonly limit?: number;
    /** Emitted as `startIndex`, NEVER as `offset` — `offset` is ignored (fact 3). */
    readonly startIndex?: number;
    /** Ask for native ETRS-TM35FIN output (fact 5). Default true — we measure in native CRS. */
    readonly nativeCrs?: boolean;
}

/**
 * Build a Ryhti `/items` URL. PURE. The three traps are encoded here so no call site can
 * reintroduce them: `startIndex` (not `offset`), lon-first bbox, and the native-CRS request.
 */
export function fiRyhtiItemsUrl(
    collection: FiRyhtiCollection,
    q: FiRyhtiItemsQuery = {},
): string {
    const p = new URLSearchParams({ f: 'json' });
    if (q.bboxCrs84 !== undefined) {
        // lon,lat,lon,lat — CRS84. The (lat,lon) control returns HTTP 200 + 0 features.
        p.set('bbox', q.bboxCrs84.join(','));
    }
    if (q.cql2 !== undefined) {
        p.set('filter-lang', 'cql2-text');
        p.set('filter', q.cql2);
    }
    p.set('limit', String(Math.min(q.limit ?? 10, FI_RYHTI_PAGE_CAP)));
    if (q.startIndex !== undefined && q.startIndex > 0) {
        // NOT `offset` — see fact 3. The server ignores `offset` without complaint.
        p.set('startIndex', String(q.startIndex));
    }
    if (q.nativeCrs !== false) p.set('crs', FI_NATIVE_CRS_URI);
    return `${FI_RYHTI_OGCAPI_BASE}/collections/${collection}/items?${p.toString()}`;
}

/**
 * A degenerate CRS84 bbox around a WGS84 point — the Ryhti open channel has no
 * point-intersects operation, so a tiny bbox IS the point query. `halfSideDeg` defaults to
 * 1e-5 degrees (about 1.1 m N-S and 0.5 m E-W at 62N), small enough that the answer is "the
 * plans at this point" rather than "the plans near it".
 *
 * Argument order is (lat, lon) — the caller's natural order — while the OUTPUT tuple is
 * lon-first, the server's order. That asymmetry is deliberate and is exactly the trap fact 4
 * documents; the swap control is in the test suite.
 */
export function fiRyhtiBboxParams(
    lat: number,
    lon: number,
    halfSideDeg = 1e-5,
): readonly [number, number, number, number] {
    // Rounded to 7 decimals (about 1 cm) so the emitted URL is DETERMINISTIC. Without this,
    // `62.89245 - 1e-5` serialises as `62.89243999999999` and the same logical query produces
    // a different URL string — which breaks fixture replay and cache keys for no benefit at a
    // 1e-5-degree resolution.
    const r = (v: number): number => Math.round(v * 1e7) / 1e7;
    return [
        r(lon - halfSideDeg),
        r(lat - halfSideDeg),
        r(lon + halfSideDeg),
        r(lat + halfSideDeg),
    ];
}

/** CQL2-text municipality filter — the JSON-string `LIKE` form measured in fact 7. */
export function fiRyhtiMunicipalityCql(kuntaCode: string): string {
    return `administrative_area_identifiers LIKE '%${kuntaCode}%'`;
}

/** CQL2-text filter on the national permanent plan identifier (`AK-001847` / `YK-000357`). */
export function fiRyhtiPermanentIdCql(permanentPlanIdentifier: string): string {
    return `permanent_plan_identifier='${permanentPlanIdentifier}'`;
}
