// E7-FI — THE FINLAND COUNTRY ADAPTER (REPORT section J shape), built on the Estonia exemplar
// (`countryAdapters/ee/index.ts`) — same boundary, same FetchOutcome discipline, same R1
// mint-what-you-cite contract, same separation of the ONE impure fetch seam from a pure mapper.
// Where FI deviates from EE it is because the SOURCE differs, and every deviation is named:
//
//   • JURISDICTION — EE mints `eeJurisdiction.ts`. FI ADOPTS `parcelProviders/
//     mmlParcelProvider.ts`'s existing `FINLAND_BBOX` / `ALAND_EXCLUSION` / `isInFinland` and
//     mints nothing. Copying the sibling shape would have been recurrence SIX of the bbox
//     drift the family verdict logged as three/four/five, and it would have DROPPED the Åland
//     subtraction. See `fiJurisdiction.ts`.
//
//   • SOURCE ROWS — EE mints `eeSources.ts`; FI CONSUMES `sourceRegistry/fi.ts` and adds one
//     row (`fiSourceRefs.ts`), with the DK `assertEndpoint` drift guard adopted rather than a
//     comment claiming the strings match.
//
//   • NO PARCEL LEG. EE and LT resolve a parcel first. Finland's cadastral authority ALREADY
//     EXISTS — `parcelProviders/mmlParcelProvider.ts`, the MML Kiinteistorekisteri OGC API —
//     and is key-gated behind a self-service `MML_API_KEY` that is unset here. Minting a
//     second FI parcel provider would be exactly the rival the standing review rule rejects,
//     so this adapter is keyed by a WGS84 POINT instead. When the key lands, the chain gains a
//     parcel leg by CALLING `resolveFinlandParcel`, never by re-implementing it.
//
//   • NO ZONE, NO PRESCRIPTION MINTED. EE mints a Prescription (a DRAWN building field inside
//     a detail plan). Ryhti's open channel draws nothing: it serves the plan's OUTER BOUNDARY
//     and the plan's identity. Minting a Zone or Prescription from a plan outline would assert
//     a land-use zone or an ordinance line that does not exist — the same error LT's header
//     refuses for ASGR consolidation polygons. The rules cite the minted PLAN and carry the
//     boundary inline.
//
//   • THE ANSWER IS PLURAL AND STAYS PLURAL. EE resolves one hoonestusala per parcel. In
//     Finland 27 of 29 sampled points lie inside MORE THAN ONE valid detail plan (mean 2.93,
//     max 6), all stamped in force, with no served rung. This adapter returns every one of
//     them and picks none. See {@link FI_APPLICABILITY_LADDER}.
//
// ══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS ADAPTER CAN AND CANNOT ANSWER — read this before wiring it to an envelope
// ══════════════════════════════════════════════════════════════════════════════════════════
// CAN: "which valid Finnish plans govern this point, what kind are they, are they legally
//       effective, when were they approved, and where is the PDF that states their
//       provisions" — nationally, keyless, CC BY 4.0, for the 12.66% of municipalities that
//       have delivered.
// CANNOT: any building-right number. Not one. The Ryhti open channel serves no FAR, no
//       storeys, no height, no GFA, no use code — see `FI_RYHTI_UNSERVED_PARAMETERS`. An
//       envelope computed from this adapter alone would have no numeric input at all, and
//       this adapter deliberately emits no tier-6 placeholders that could be mistaken for one.
//
// section J CONFORMANCE MAP:
//   country      -> 'FI'
//   sources()    -> FI_ADAPTER_SOURCES (registry rows + the one additive attachment row)
//   parcel       -> NOT WIRED, deliberately. `parcelProviders/mmlParcelProvider.ts` is the
//                   existing authority (key-gated). Controls 2 and 5: no rival.
//   buildings    -> NOT WIRED. ⚠ DISCOVERY, recorded not actioned (control 10): the
//                   `ryhti_building` GeoServer workspace at the SAME host answers HTTP 200
//                   with five collections — `avoimet_rakennukset` (Valmiit rakennukset),
//                   `avoimet_lupa_rakennukset` (Rakennushankkeet), `open_building`,
//                   `open_address`, `open_address_deleted`. It is NOT in `sourceRegistry/fi.ts`
//                   and is NOT in the E5 sweep. Wiring it is a buildings-lane job; the finding
//                   is written up in impl/lane-e7-fi.md.
//   planGeometry -> resolveFiPlansAtWgs84Point / resolveFiPointPlans / resolveFiPlanByPermanentId
//   rules        -> kind: 'structured' — resolveFiPointChain below
//   documents    -> minted `SiteIntelDocument` entities per attachment; the provisions PDFs
//                   ride `planProvisionsDocument` rules at tier 2
//   precedence   -> FI_APPLICABILITY_LADDER, recorded as DATA with its honest caveat
//   vocabulary   -> FI_RULE_VOCABULARY (fiRuleMapper.ts)
//
// SEAM-E1BC-FETCHCHAIN (inherited verbatim from the EE exemplar's header — the same open seam,
// not a new one): REPORT section J sketches `rules.fetch(parcel): FetchOutcome<Rule[]>`; this
// adapter serves `rules.fetchChain(lat, lon, deps?, nowIso?)`, richer (it carries the minted
// Plan/Document referents the R1 contract requires alongside the rules) and keyed by a point
// rather than a parcel, because Finland's parcel authority is key-gated elsewhere. The shared
// SDK type is E1bc's to mint; guessing it here would mint a rival core interface from a lane.
// When it lands, reconcile HERE — never by editing core to match an adapter.
//
// Everything is FetchOutcome end-to-end (C57 section 1.5): a fetch that fails names the
// endpoint and the reason; EMPTY and FAILURE are DIFFERENT VALUES.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import type {
    FetchOutcome,
    SiteIntelDocument,
    SiteIntelPlan,
    SiteIntelRule,
    SiteIntelSource,
} from '@pryzm/schemas';
import {
    FI_RYHTI_ABSENCE_CAVEAT,
    resolveFiPlansAtWgs84Point,
    type FiPlanIndexFeature,
} from './fiPlanProvider.js';
import {
    FI_RYHTI_UNSERVED_PARAMETERS,
    mapFiPlanIndexFeatureToRules,
    type FiUnservedParameter,
} from './fiRuleMapper.js';
import { FI_RYHTI_COLLECTIONS, type FiRyhtiDeps } from './fiRyhtiClient.js';
import { FI_ADAPTER_SOURCES } from './fiSourceRefs.js';

const tracer = trace.getTracer('pryzm.siteintel.fi');

/**
 * section J `precedence: ApplicabilityLadder` — Finland's, as data.
 *
 * ⚠ THE HONEST CAVEAT, and the reason no per-rule `rank` is emitted: unlike Denmark's
 * byggefelt -> delomraade -> lokalplan -> ramme ladder, which a consumer must RESOLVE, and
 * unlike Lithuania's, which the state has ALREADY APPLIED before serving, Finland's ladder
 * exists in statute and has been applied by NOBODY in the served data. The register publishes
 * overlapping instruments, every one stamped `13 Voimassa`, with no rung and no consolidation.
 * What this ladder records is therefore the LEGAL ordering a human must apply — not an
 * algorithm this adapter ran, and not one it is licensed to run.
 */
export const FI_APPLICABILITY_LADDER = [
    {
        step: 'asemakaava (detail plan) — pub_valid_ld_plan_ix_gs',
        mode:
            'the instrument that carries rakennusoikeus. THE OPEN CHANNEL SERVES ITS BOUNDARY ' +
            'AND IDENTITY ONLY: no FAR, storeys, height, GFA or use code exists as an ' +
            'attribute (measured — 0 occurrences in 6,282 features). The numbers are in the ' +
            'kaavamaaraykset PDF -> extraction pipeline (tier 2 address, tier 4->5 values)',
    },
    {
        step: 'a LATER asemakaavan muutos over an earlier asemakaava',
        mode:
            'UNRESOLVED IN THE SERVED DATA. 27 of 29 sampled points lie inside >1 valid detail ' +
            'plan (mean 2.93, max 6); all carry lifecycle 13 Voimassa; the register serves no ' +
            'rung, and approval_date is null or the 1900-01-01 sentinel on 1,446 of 6,282 ' +
            'features so date ordering is not reliably available either. Carry all; pick none',
    },
    {
        step: 'yleiskaava / osayleiskaava (master plan) — pub_valid_lm_plan_ix_gs',
        mode:
            'guides where no asemakaava applies, and can itself be a building-permit basis ' +
            '(oikeusvaik_YK codes 11/12/13/14). Its legal force IS served per feature and ' +
            'rides every master-plan rule as R5 normativeForce, verbatim',
    },
    {
        step: 'maakuntakaava (regional plan)',
        mode:
            'NOT SERVED on this channel at all — the open workspace has four collections and ' +
            'none of them is the regional-plan index, even though RY_Kaavalaji codes 1/11/12 ' +
            'exist for it. An absent capability, not an empty layer',
    },
    {
        step: 'no plan feature at this point',
        mode: FI_RYHTI_ABSENCE_CAVEAT,
    },
] as const;

/**
 * One resolved plan with its rules AND the minted referents those rules cite — the
 * structured-rules unit of the FI chain. The R1 referent contract is carried IN the result:
 * every `applicability.basis` ref in `rules` resolves to `plan` right here, and every
 * `provenance.source.document` resolves to one of `documents`.
 */
export interface FiResolvedPlan {
    readonly feature: FiPlanIndexFeature;
    /** The minted `SiteIntelPlan` the rules cite, or null (referent ladder fell to geometry). */
    readonly plan: SiteIntelPlan | null;
    /** The minted attachment Documents. */
    readonly documents: readonly SiteIntelDocument[];
    readonly rules: readonly SiteIntelRule[];
}

/** The full chain for one WGS84 point: point -> valid plan indexes -> rules + referents. */
export interface FiPointChain {
    readonly lat: number;
    readonly lon: number;
    /**
     * Detail plans (asemakaava) with mapped rules. `absent` = no valid detail plan is
     * PUBLISHED here (carrying {@link FI_RYHTI_ABSENCE_CAVEAT}), which is NOT the same as
     * "no detail plan applies" — 87% of Finnish municipalities have delivered nothing.
     */
    readonly detailPlans: FetchOutcome<readonly FiResolvedPlan[]>;
    /** Master plans (yleiskaava/osayleiskaava) with mapped rules. */
    readonly masterPlans: FetchOutcome<readonly FiResolvedPlan[]>;
    /**
     * CASE 2 of the control-9 split, carried on every chain result: the building-right
     * parameters this SOURCE does not serve at all. NEVER rules — see fiRuleMapper's header.
     */
    readonly unservedParameters: readonly FiUnservedParameter[];
}

async function resolveOneIndex(
    collection: (typeof FI_RYHTI_COLLECTIONS)[keyof typeof FI_RYHTI_COLLECTIONS],
    lat: number,
    lon: number,
    deps: FiRyhtiDeps,
    fetchedAtIso: string,
): Promise<FetchOutcome<readonly FiResolvedPlan[]>> {
    const outcome = await resolveFiPlansAtWgs84Point(collection, lat, lon, deps);
    if (outcome.status !== 'found') return outcome;
    try {
        const resolved: FiResolvedPlan[] = [];
        for (const feature of outcome.value.features) {
            const mapped = mapFiPlanIndexFeatureToRules(feature, fetchedAtIso);
            resolved.push({
                feature,
                plan: mapped.plan,
                documents: mapped.documents,
                rules: mapped.rules,
            });
        }
        return { status: 'found', value: resolved };
    } catch (e) {
        // The mapper's structural refusals (no mintable referent; a code outside a closed
        // state codelist) are carried as a transient NAMING the cause — never a silent drop,
        // and never an empty that reads as "no plan here".
        return {
            status: 'transient',
            reason: `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

/**
 * Resolve the chain for a WGS84 point: valid detail-plan index -> valid master-plan index ->
 * E1a rules + minted referents (pure mapper).
 *
 * PURE ORCHESTRATION of typed outcomes: every leg that fails names itself; a failed leg never
 * fabricates an empty; the two legs are INDEPENDENT (a point can have a detail plan and no
 * master plan, or the reverse, and both are ordinary Finnish situations, so neither failing
 * fails the chain); the mapper's structural refusals are caught and carried as a transient
 * naming the cause.
 */
export async function resolveFiPointChain(
    lat: number,
    lon: number,
    deps: FiRyhtiDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<FiPointChain>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.fi.resolvePointChain',
        async (span): Promise<FetchOutcome<FiPointChain>> => {
            try {
                span.setAttribute('fi.lat', lat);
                span.setAttribute('fi.lon', lon);
                // The parenthesised form — the only one that survives a caller passing a full
                // ISO timestamp (family verdict section 4 / L-12873, the DK defect).
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

                const detailPlans = await resolveOneIndex(
                    FI_RYHTI_COLLECTIONS.validDetailPlanIndex,
                    lat,
                    lon,
                    deps,
                    fetchedAtIso,
                );
                const masterPlans = await resolveOneIndex(
                    FI_RYHTI_COLLECTIONS.validMasterPlanIndex,
                    lat,
                    lon,
                    deps,
                    fetchedAtIso,
                );

                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'found',
                    value: {
                        lat,
                        lon,
                        detailPlans,
                        masterPlans,
                        unservedParameters: FI_RYHTI_UNSERVED_PARAMETERS,
                    },
                };
            } catch (e) {
                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: e instanceof Error ? e.message : String(e),
                });
                throw e;
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The assembled FI country adapter — the section J shape as a value. Field-for-field mapping to
 * the REPORT section J sketch is in the header; the shared SDK *type* is not this lane's to
 * mint — see SEAM-E1BC-FETCHCHAIN before "reconciling" this.
 */
export const fiCountryAdapter = {
    country: 'FI' as const,
    sources: (): readonly SiteIntelSource[] => FI_ADAPTER_SOURCES,
    rules: { kind: 'structured' as const, fetchChain: resolveFiPointChain },
    precedence: FI_APPLICABILITY_LADDER,
};

export { ALAND_EXCLUSION, FINLAND_BBOX, isInFinland } from './fiJurisdiction.js';
export {
    FI_NATIVE_CRS,
    FI_NATIVE_CRS_RESPONSE_URN,
    FI_NATIVE_CRS_URI,
    FI_RYHTI_ATTACHMENT_BASE,
    FI_RYHTI_COLLECTIONS,
    FI_RYHTI_OGCAPI_BASE,
    FI_RYHTI_PAGE_CAP,
    extractRyhtiErrorTitle,
    fiRyhtiBboxParams,
    fiRyhtiGetFeatures,
    fiRyhtiItemsUrl,
    fiRyhtiMunicipalityCql,
    fiRyhtiPermanentIdCql,
    type FiRyhtiCollection,
    type FiRyhtiDeps,
    type FiRyhtiFeature,
    type FiRyhtiFeaturePage,
    type FiRyhtiItemsQuery,
} from './fiRyhtiClient.js';
export {
    FI_IMPLAUSIBLE_DATE_FLOOR,
    FI_PLAN_BOUNDARY_CRS,
    FI_RYHTI_ABSENCE_CAVEAT,
    FI_SENTINEL_DATE,
    fiCodelistCode,
    fiJsonArray,
    fiStr,
    parseFiPlanIndexFeature,
    readFiDate,
    resolveFiPlanByPermanentId,
    resolveFiPlansAtWgs84Point,
    resolveFiPointPlans,
    type FiDateReading,
    type FiDateReadingKind,
    type FiPlanAttachment,
    type FiPlanIndexFeature,
    type FiPlanIndexResult,
    type FiPointPlans,
} from './fiPlanProvider.js';
export {
    FI_ATTACHMENT_KIND_CODES,
    FI_DIGITAL_ORIGIN_CODES,
    FI_LIFECYCLE_CODES,
    FI_MASTER_PLAN_LEGAL_EFFECT_CODES,
    FI_PLAN_TYPE_CODES,
    FI_PROVISION_ATTACHMENT_KINDS,
    FI_RANK_ABSENCE_REASON,
    FI_RULE_AUTHORITY,
    FI_RULE_DATASET,
    FI_RULE_VOCABULARY,
    FI_RYHTI_UNSERVED_PARAMETERS,
    FI_USESCOPE_ABSENCE_REASON,
    FI_VALUEBASIS_ABSENCE_REASON,
    fiDocumentEntityId,
    fiPlanEntityId,
    fiValidity,
    mapFiAttachmentsToDocuments,
    mapFiFeatureToPlan,
    mapFiPlanIndexFeatureToRules,
    resolveFiCode,
    type FiMappedRuleSet,
    type FiRuleVocabularyEntry,
    type FiUnservedParameter,
} from './fiRuleMapper.js';
export {
    FI_ADAPTER_ENDPOINT_BINDINGS,
    FI_ADAPTER_SOURCES,
    FI_HSY_SEUTURAMAVA_FINDING,
    FI_MML_PARCEL_SOURCE,
    FI_MML_PARCEL_SOURCE_ID,
    FI_RYHTI_ATTACHMENT_SOURCE_ID,
    FI_RYHTI_ATTACHMENT_SOURCES,
    FI_RYHTI_PLAN_SOURCE,
    FI_RYHTI_PLAN_SOURCE_ID,
} from './fiSourceRefs.js';
