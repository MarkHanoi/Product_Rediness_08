// E7-FI — FINLAND (FI) · the PLAN-INDEX provider: parse one Ryhti plan-index feature (pure)
// and resolve the plans covering a WGS84 point / a national permanent plan identifier.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// WHAT RYHTI SERVES, AND WHAT IT DOES NOT — the whole lane in one paragraph
// ══════════════════════════════════════════════════════════════════════════════════════════
// The open Ryhti channel serves a plan INDEX: the plan's outer BOUNDARY polygon plus its
// identity, type, lifecycle status, temporal axes and attached PDFs. It serves NO plan
// objects (kaavakohteet) and NO plan provisions (kaavamaaraykset) as structured attributes.
// The 33 served fields were censused across ALL 6,282 valid-plan features on 2026-09-01 and
// contain zero occurrences of `tehokkuusluku`, `kerrosluku`, `kayttotarkoitus`,
// `rakennusoikeus`, `kerrosala` or `korkeus`.
//
// ⭐ THAT CENSUS CLOSES A NAMED, DATED, OPEN QUESTION IN THIS REPO.
// `parcelProviders/mmlParcelProvider.ts:631-645` carries `RYHTI_IX_PROBE_URL` +
// `RYHTI_ATTRIBUTE_FIELDS` — a documented, deliberately-UNRUN probe whose own header calls it
// "the single rate-defining Finland unknown ... whether Ryhti serves STRUCTURED numeric plan
// attributes (FAR / storeys) or only a plan index + PDF link", naming the exact three fields
// to CONFIRM PRESENT and the two outcomes. THIS LANE RAN THAT URL VERBATIM. All three fields
// are ABSENT. **The answer is the file's own Outcome B: index-only, the Hamburg B-Plan
// pattern.** Finland is NOT a second Denmark on the legislation axis today. Do not re-open
// that question from a hopeful reading of "Ryhti is live" — it is live, and it is an index.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// THE TWO KINDS OF NOTHING (the brief's control-9 split, made structural here)
// ══════════════════════════════════════════════════════════════════════════════════════════
//   CASE 1 — "the field exists and is empty for this plan."  A DECLARED field carrying null,
//            an empty JSON array, or a placeholder. It is a per-feature fact and it becomes a
//            VISIBLE tier-6 UNKNOWN rule. Measured across 6,282 features:
//              approval_date            null 1,143 · sentinel 303
//              documents                null   907
//              period_of_validity_end   null 6,282  (declared, universally empty)
//              period_of_validity_begin sentinel 3,673
//   CASE 2 — "the system does not serve this field yet."  There is no field to be empty. It
//            is an ABSENT CAPABILITY of the source and it is recorded in the source row and
//            in `FI_RYHTI_UNSERVED_PARAMETERS` (fiRuleMapper.ts) — NEVER as a rule. Emitting
//            a tier-6 `floorAreaRatio` rule here would assert that this source has an FAR
//            column that happens to be empty. It does not have one.
// Collapsing the two is precisely what control 9 forbids, and a filling system makes the
// collapse cheap: both look like "no number" at the call site.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// THE SENTINEL — measured, not assumed (the LT MIN_APZELD standard)
// ══════════════════════════════════════════════════════════════════════════════════════════
// `1900-01-01` is a PLACEHOLDER in this register, and it is the sentinel-zero defect wearing
// a date. Measured over all 6,282 valid-plan features (2026-09-01):
//     time_of_initiation        5,986 / 6,282 = 95.3%   — and the ONLY pre-1950 value at all
//     date_of_validity          5,654 / 6,282 = 90.0%   — next-earliest distinct: 1897, 1947
//     period_of_validity_begin  3,673 / 6,282 = 58.5%
// A spike, not a distribution. And the dispositive control: **4,240 features carry the
// `date_of_validity` sentinel WHILE ALSO carrying a real `approval_date`** — the same row
// knows a genuine 2014 approval and still claims validity from 1 January 1900.
//
// A SECOND, INDEPENDENT ARM catches register CORRUPTION rather than placeholders:
// `AK-004907` ("Kortteli 29 osa, Kirkonseutu", Hameenkyro) serves
// `approval_date = "1068-06-28Z"` — an eleventh-century approval date, almost certainly a
// transposed 1968. It passes the ISO regex cleanly. Measured: **exactly 1** pre-1800 value
// across 5 date fields x 6,282 features, against an approval-date distribution running
// 1940s 17 · 1950s 51 · 1960s 148 · 1970s 554 · 1980s 1,087 · 1990s 996 · 2000s 924 ·
// 2010s 766 · 2020s 285, with only 4 genuine pre-1930 approvals. So the 1800 floor rejects
// ONE corrupt value and zero genuine ones. Both arms yield UNKNOWN, never a dropped row.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchFound, type FetchOutcome, type JsonValue } from '@pryzm/schemas';
import {
    FI_NATIVE_CRS,
    FI_NATIVE_CRS_RESPONSE_URN,
    FI_RYHTI_COLLECTIONS,
    fiRyhtiBboxParams,
    fiRyhtiGetFeatures,
    fiRyhtiItemsUrl,
    fiRyhtiPermanentIdCql,
    type FiRyhtiCollection,
    type FiRyhtiDeps,
    type FiRyhtiFeature,
} from './fiRyhtiClient.js';

const tracer = trace.getTracer('pryzm.siteintel.fi');

/* ────────────────────────────── date reading ──────────────────────────── */

/** The measured placeholder date (see the header). Not a fact — a "we do not know". */
export const FI_SENTINEL_DATE = '1900-01-01';

/**
 * Implausibility floor for a Finnish plan date. Justified by measurement, not taste: exactly
 * ONE value in the whole valid-plan corpus falls below it (`AK-004907` at `1068-06-28`), and
 * the four genuine pre-1930 approvals (1900s x2, 1910s x2) all sit above it.
 */
export const FI_IMPLAUSIBLE_DATE_FLOOR = '1800-01-01';

/** How a served date value was classified. Each member is a DIFFERENT fact about the source. */
export type FiDateReadingKind =
    /** A well-formed, plausible ISO calendar date. */
    | 'served'
    /** The field is declared and carries null / empty — case 1 emptiness. */
    | 'absent'
    /** The field carries the measured `1900-01-01` placeholder. */
    | 'sentinel'
    /** The field carries a date below the plausibility floor — register corruption. */
    | 'implausible'
    /** The field carries something that is not a date at all after `Z`-stripping. */
    | 'malformed';

/** One classified date field: the usable value (or null) plus WHY, plus the raw bytes. */
export interface FiDateReading {
    readonly kind: FiDateReadingKind;
    /** `YYYY-MM-DD`, or null for every kind except `served`. UNKNOWN, never 0, never "now". */
    readonly iso: string | null;
    /** Exactly what the register served, for the rule note. */
    readonly raw: string | null;
}

/**
 * PURE, TOTAL: classify one Ryhti date field.
 *
 * Ryhti serves dates with a trailing timezone designator — `"1995-08-22Z"` — which FAILS
 * `IsoDateStringSchema`'s `/^\d{4}-\d{2}-\d{2}$/`. The `Z` is stripped HERE, once, so no call
 * site can forget; every other outcome is an explicit kind rather than a silent null.
 */
export function readFiDate(raw: unknown): FiDateReading {
    if (raw === null || raw === undefined) return { kind: 'absent', iso: null, raw: null };
    if (typeof raw !== 'string') return { kind: 'malformed', iso: null, raw: String(raw) };
    const trimmed = raw.trim();
    if (trimmed === '') return { kind: 'absent', iso: null, raw: trimmed };
    // Strip the trailing timezone designator the register appends (measured fact 9).
    const bare = trimmed.endsWith('Z') ? trimmed.slice(0, -1) : trimmed;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bare)) {
        return { kind: 'malformed', iso: null, raw: trimmed };
    }
    if (bare === FI_SENTINEL_DATE) return { kind: 'sentinel', iso: null, raw: trimmed };
    if (bare < FI_IMPLAUSIBLE_DATE_FLOOR) {
        return { kind: 'implausible', iso: null, raw: trimmed };
    }
    return { kind: 'served', iso: bare, raw: trimmed };
}

/* ────────────────────────────── field readers ─────────────────────────── */

/** PURE: a trimmed non-empty string, or null. One reader, so no two call sites disagree. */
export function fiStr(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    return s === '' ? null : s;
}

/**
 * PURE: Ryhti serves several array-valued fields as JSON *strings*
 * (`"[\"297\"]"`, `"[]"`, `"[null]"`, or a genuine `null`). MEASURED: all THREE spellings of
 * empty occur in one corpus — `permanent_binding_plot_division_identifier` is `[null]` x
 * 4,611, `[]` x 7 and null x 1,017. They mean the same thing (nothing served) and are folded
 * here; the distinction is a serialisation artefact, not a planning fact.
 *
 * Returns `[]` for every empty spelling and for anything unparseable — TOTAL, never throws.
 */
export function fiJsonArray(raw: unknown): readonly unknown[] {
    if (Array.isArray(raw)) return raw.filter((x) => x !== null && x !== undefined);
    const s = fiStr(raw);
    if (s === null) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(s);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x !== null && x !== undefined);
}

/**
 * PURE: the trailing `/code/<value>` segment of a `uri.suomi.fi` codelist URI, verbatim.
 * `"http://uri.suomi.fi/codelist/rytj/RY_Kaavalaji/code/31"` -> `"31"`. Returns null when the
 * value is not a codelist URI — a caller must then treat the code as UNKNOWN rather than
 * guess. Sub-codes are preserved verbatim: `RY_DigitaalinenAlkupera/code/0401` -> `"0401"`
 * (the codelist IS hierarchical — measured, 10 features carry the 4-digit form).
 */
export function fiCodelistCode(raw: unknown): string | null {
    const s = fiStr(raw);
    if (s === null) return null;
    const m = /\/code\/([^/]+)\/?$/.exec(s);
    return m ? m[1]! : null;
}

/* ────────────────────────────── the parsed feature ────────────────────── */

/** One attached document as the register serves it inside the `documents` JSON string. */
export interface FiPlanAttachment {
    /** Retrieval URI — PROBED keyless 2026-09-01: HTTP 200, `application/pdf`. */
    readonly uri: string;
    /** The uuid segment of the URI — the document's national identity. */
    readonly attachmentId: string | null;
    /** Finnish file name, verbatim (`"Kaavakartta ja kaavamaaraykset, 749-31-05-1107-1.pdf"`). */
    readonly nameFin: string | null;
    /** `RY_AsiakirjanLaji_YKAK` code, verbatim (`"05"`), or null. */
    readonly attachmentKindCode: string | null;
    /** MIME type as served — measured `application/pdf` on all 7,294 attachments. */
    readonly contentType: string | null;
}

/** One parsed Ryhti plan-index feature. Every field is what the register served, classified. */
export interface FiPlanIndexFeature {
    /** Which index this came from — detail (asemakaava) or master (yleiskaava). */
    readonly collection: FiRyhtiCollection;
    /** `permanent_plan_identifier`, the national id (`AK-001847` / `YK-000357`). */
    readonly permanentPlanIdentifier: string | null;
    /** `plan_key` — the system uuid. */
    readonly planKey: string | null;
    /** `producer_plan_identifier` — the municipality's own plan number, or null (591 of 5,635). */
    readonly producerPlanIdentifier: string | null;
    /** `RY_Kaavalaji` code, verbatim (`"31"`, `"33"`, `"39"`, `"21"`, `"23"`). */
    readonly planTypeCode: string | null;
    /** `plan_type_name_fin` — the state's own Finnish name, verbatim. */
    readonly planTypeNameFin: string | null;
    /** `kaavaelinkaari` lifecycle code, verbatim (measured: `"13"` = Voimassa on 100%). */
    readonly lifecycleStatusCode: string | null;
    /** `RY_DigitaalinenAlkupera` code, verbatim — the state's own fill-state declaration. */
    readonly digitalOriginCode: string | null;
    /** `oikeusvaik_YK` codes (master plans only) — the R5 legal-effect axis, verbatim. */
    readonly masterPlanLegalEffectCodes: readonly string[];
    /** `administrative_area_identifiers` — Tilastokeskus kunta codes. */
    readonly municipalityCodes: readonly string[];
    /** `original_administrative_area_identifiers` — differs on 71 features (mergers). */
    readonly originalMunicipalityCodes: readonly string[];
    readonly nameFin: string | null;
    readonly descriptionFin: string | null;
    readonly approvalDate: FiDateReading;
    readonly validityBegin: FiDateReading;
    readonly validityEnd: FiDateReading;
    readonly dateOfValidity: FiDateReading;
    readonly timeOfInitiation: FiDateReading;
    readonly attachments: readonly FiPlanAttachment[];
    /**
     * The plan BOUNDARY as served, in the CONFIRMED native CRS, or null when the server did
     * not stamp {@link FI_NATIVE_CRS_RESPONSE_URN} on the response. Null here is "we did not
     * confirm the projection", never "no geometry" — a CRS84 ring recorded as EPSG:3067 metres
     * is the silent-wrong-number defect (Madrid EPSG:4326), so it is refused instead.
     */
    readonly boundary: {
        readonly kind: 'Polygon' | 'MultiPolygon';
        /**
         * GeoJSON `coordinates`, uninterpreted. Typed `JsonValue` rather than `unknown`
         * because it came out of `JSON.parse` of the response body by construction — the
         * narrowing happens at the ONE parse boundary below, not at every call site.
         */
        readonly coordinates: JsonValue;
    } | null;
    /** The CRS token the server stamped, verbatim, or null. */
    readonly responseCrs: string | null;
    /** Everything the register served, untouched — for the note and for re-reading. */
    readonly raw: Record<string, unknown>;
}

/** PURE, TOTAL: one raw feature -> the classified plan-index record. Never throws. */
export function parseFiPlanIndexFeature(
    feature: FiRyhtiFeature,
    collection: FiRyhtiCollection,
    responseCrs: string | null,
): FiPlanIndexFeature {
    const p = feature.properties;
    const crsConfirmed = responseCrs === FI_NATIVE_CRS_RESPONSE_URN;
    const g = feature.geometry;
    const boundary =
        crsConfirmed && g !== null && (g.type === 'Polygon' || g.type === 'MultiPolygon')
            ? {
                  kind: g.type as 'Polygon' | 'MultiPolygon',
                  // From JSON.parse of the GeoJSON body — see the field's doc comment.
                  coordinates: g.coordinates as JsonValue,
              }
            : null;
    const attachments: FiPlanAttachment[] = [];
    for (const entry of fiJsonArray(p['documents'])) {
        if (entry === null || typeof entry !== 'object') continue;
        const d = entry as Record<string, unknown>;
        const uri = fiStr(d['uri']);
        if (uri === null) continue;
        const idMatch = /planattachmentdocument\/([^/]+)\//.exec(uri);
        attachments.push({
            uri,
            attachmentId: idMatch ? idMatch[1]! : null,
            nameFin: fiStr(d['name_fin']),
            attachmentKindCode: fiCodelistCode(d['type_of_attachment']),
            contentType: fiStr(d['file_content_type']),
        });
    }
    return {
        collection,
        permanentPlanIdentifier: fiStr(p['permanent_plan_identifier']),
        planKey: fiStr(p['plan_key']),
        producerPlanIdentifier: fiStr(p['producer_plan_identifier']),
        planTypeCode: fiCodelistCode(p['plan_type']),
        planTypeNameFin: fiStr(p['plan_type_name_fin']),
        lifecycleStatusCode: fiCodelistCode(p['plan_life_cycle_status']),
        digitalOriginCode: fiCodelistCode(p['digital_origin']),
        masterPlanLegalEffectCodes: fiJsonArray(p['legal_effect_of_local_master_plan'])
            .map((v) => fiCodelistCode(v))
            .filter((v): v is string => v !== null),
        municipalityCodes: fiJsonArray(p['administrative_area_identifiers'])
            .map((v) => fiStr(v))
            .filter((v): v is string => v !== null),
        originalMunicipalityCodes: fiJsonArray(p['original_administrative_area_identifiers'])
            .map((v) => fiStr(v))
            .filter((v): v is string => v !== null),
        nameFin: fiStr(p['name_fin']),
        descriptionFin: fiStr(p['description_fin']),
        approvalDate: readFiDate(p['approval_date']),
        validityBegin: readFiDate(p['period_of_validity_begin']),
        validityEnd: readFiDate(p['period_of_validity_end']),
        dateOfValidity: readFiDate(p['date_of_validity']),
        timeOfInitiation: readFiDate(p['time_of_initiation']),
        attachments,
        boundary,
        responseCrs,
        raw: p,
    };
}

/** The native CRS every {@link FiPlanIndexFeature.boundary} is expressed in, when confirmed. */
export const FI_PLAN_BOUNDARY_CRS = FI_NATIVE_CRS;

/**
 * The caveat that rides an `absent` plan answer. Absent from the Ryhti index is NOT "no plan
 * here": the delivery obligation covers plans approved after 1.1.2024 with a FIVE-YEAR
 * transition, so national coverage of new plans begins 1.1.2029, and the valid-plan stock is
 * only present where a municipality (or the VOOKA conversion project) has delivered it.
 * MEASURED 2026-09-01: 39 of Finland's 308 municipalities (12.66%, against Tilastokeskus
 * `kunta_1_20260101`) appear in the two valid-plan indexes at all.
 */
export const FI_RYHTI_ABSENCE_CAVEAT =
    'absent from the Ryhti open index != no plan applies: the delivery obligation (laki ' +
    'rakennetun ymparistön tietojarjestelmasta) covers plans approved after 1.1.2024 with a ' +
    'five-year transition, so nationally complete new-plan coverage begins 1.1.2029; until ' +
    'then the index holds only what municipalities and the VOOKA conversion have delivered ' +
    '(measured 2026-09-01: 39 of 308 municipalities, 12.66%). A municipal plan register is ' +
    'the authority for the remainder — a confirmation step, never an assumption.';

/* ────────────────────────────── resolvers ─────────────────────────────── */

/** A plan-index query result: the parsed features plus which collection answered. */
export interface FiPlanIndexResult {
    readonly collection: FiRyhtiCollection;
    readonly features: readonly FiPlanIndexFeature[];
    /** `numberMatched` as served, when the request was within the page cap. */
    readonly numberMatched: number | null;
}

async function resolveIndex(
    collection: FiRyhtiCollection,
    url: string,
    queryLabel: string,
    deps: FiRyhtiDeps,
): Promise<FetchOutcome<FiPlanIndexResult>> {
    const outcome = await fiRyhtiGetFeatures(url, queryLabel, deps);
    if (outcome.status !== 'found') return outcome;
    return fetchFound({
        collection,
        features: outcome.value.features.map((f) =>
            parseFiPlanIndexFeature(f, collection, outcome.value.responseCrs),
        ),
        numberMatched: outcome.value.numberMatched,
    });
}

/**
 * Resolve the VALID plans of one index covering a WGS84 point.
 *
 * ⚠ THE ANSWER IS ROUTINELY MORE THAN ONE PLAN, AND THIS FUNCTION NEVER PICKS. Measured over
 * 29 deterministic sample points drawn from the corpus itself: **27 of 29 (93.1%) fall inside
 * MORE THAN ONE valid detail plan**, mean 2.93, maximum 6. Every one of those plans carries
 * lifecycle status `13 = Voimassa` (in force) and the register serves NO precedence rung and
 * NO consolidation. Choosing one would be inventing the ordering the state has not published.
 * See `FI_APPLICABILITY_LADDER` in index.ts.
 */
export async function resolveFiPlansAtWgs84Point(
    collection: FiRyhtiCollection,
    lat: number,
    lon: number,
    deps: FiRyhtiDeps = {},
): Promise<FetchOutcome<FiPlanIndexResult>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.fi.resolvePlansAtPoint',
        async (span): Promise<FetchOutcome<FiPlanIndexResult>> => {
            try {
                span.setAttribute('fi.collection', collection);
                const bbox = fiRyhtiBboxParams(lat, lon);
                const url = fiRyhtiItemsUrl(collection, { bboxCrs84: bbox, limit: 50 });
                const label = `${collection} at WGS84 ${lat},${lon}`;
                const out = await resolveIndex(collection, url, label, deps);
                span.setStatus(
                    out.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: out.reason }
                        : { code: SpanStatusCode.OK },
                );
                return out;
            } finally {
                span.end();
            }
        },
    );
}

/** Resolve one plan by its national permanent identifier (`AK-001847` / `YK-000357`). */
export async function resolveFiPlanByPermanentId(
    collection: FiRyhtiCollection,
    permanentPlanIdentifier: string,
    deps: FiRyhtiDeps = {},
): Promise<FetchOutcome<FiPlanIndexResult>> {
    const url = fiRyhtiItemsUrl(collection, {
        cql2: fiRyhtiPermanentIdCql(permanentPlanIdentifier),
        limit: 10,
    });
    return resolveIndex(
        collection,
        url,
        `${collection} permanent_plan_identifier=${permanentPlanIdentifier}`,
        deps,
    );
}

/**
 * Resolve BOTH valid indexes at a point — the honest Finnish answer, because an asemakaava and
 * a yleiskaava routinely both cover the same ground and the two are DIFFERENT instruments with
 * different legal force. Neither outcome fails the other: a point can have a detail plan and no
 * master plan, or the reverse, and both are ordinary.
 */
export interface FiPointPlans {
    /** Asemakaava (detail plan) index — the instrument that carries building rights. */
    readonly detail: FetchOutcome<FiPlanIndexResult>;
    /** Yleiskaava (master plan) index. */
    readonly master: FetchOutcome<FiPlanIndexResult>;
}

/** Resolve both valid plan indexes at a WGS84 point. Never throws. */
export async function resolveFiPointPlans(
    lat: number,
    lon: number,
    deps: FiRyhtiDeps = {},
): Promise<FiPointPlans> {
    const detail = await resolveFiPlansAtWgs84Point(
        FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
        lat,
        lon,
        deps,
    );
    const master = await resolveFiPlansAtWgs84Point(
        FI_RYHTI_COLLECTIONS.validMasterPlanIndex,
        lat,
        lon,
        deps,
    );
    return { detail, master };
}
