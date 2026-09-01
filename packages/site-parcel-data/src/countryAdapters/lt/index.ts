// E6-LT — THE LITHUANIA COUNTRY ADAPTER (REPORT §J shape), built on the Estonia exemplar
// (`countryAdapters/ee/index.ts`) — same boundary, same FetchOutcome discipline, same R1
// mint-what-you-cite contract, same separation of the ONE impure fetch seam from a pure mapper.
// Where LT deviates from EE it is because the SOURCE differs, and every deviation is named:
//
//   • SOURCE ROWS — EE mints `eeSources.ts`; LT CONSUMES `sourceRegistry/lt.ts` and adds one
//     row (`ltSourceRefs.ts`). The registry did not exist when EE was written; minting a second
//     LT registry today would be the rival, not the copy.
//   • MINTED REFERENT — EE mints a `Prescription` (a DRAWN building field inside a detail
//     plan). ASGR draws nothing: it is a CONSOLIDATION of functional zones, so the honest
//     referent is a `SiteIntelZone` whose `planId` is the document the register itself names as
//     having set that zone. Minting a "prescription" from a consolidation polygon would assert
//     a drawn ordinance line that does not exist.
//   • AXIS ORDER — EE's GML `posList` needed a native (northing easting) swap. Esri JSON is
//     [x, y] on both sides of the wire. DO NOT copy the EE swap here.
//   • PLAN DATES — EE leaves `inForceFrom` null because PLANK serves no in-force axis; the LT
//     register serves `ISIGALIOJO` explicitly, so LT fills it. Neither adapter guesses.
//
// §J CONFORMANCE MAP:
//   country      → 'LT'
//   sources()    → LT_ADAPTER_SOURCES (registry rows + the one additive `ribos` row)
//   parcel       → resolveLtParcelByKadastroNr / resolveLtParcelAtWgs84Point
//   buildings    → NOT WIRED. Deliberate, per E4 control 2 (nothing outside approved scope
//                  without a demonstrated failure) and control 10: lane 4 LT-3 records that
//                  Lithuania publishes NO open national 3D building model, that building
//                  footprints live in GRPK and per-building storeys in the (priced) Real
//                  Property Register, and that LiDAR is behind a signed-licence gate. Those are
//                  GATES and DERIVATIONS, not a keyless layer this lane could wire honestly.
//                  The parcel row's own `pastat_sk` (building COUNT) is carried on the parcel as
//                  the one building fact the open service does serve.
//   planGeometry → resolveLtAsgrForRing / resolveLtAsgrAtWgs84Point / resolveLtTpdRegisterRow
//   rules        → kind: 'structured' — resolveLtParcelChain below
//   documents    → the `ribos` row carries TPD_URL (the document card), surfaced verbatim on
//                  every classification rule's `source.document`; no separate retriever is
//                  needed for the structured path
//   precedence   → LT_APPLICABILITY_LADDER, recorded as DATA with its honest caveat
//   vocabulary   → LT_RULE_VOCABULARY (ltRuleMapper.ts)
//
// §SEAM-E1BC-FETCHCHAIN (inherited verbatim from the EE exemplar's header — the same open
// seam, not a new one): REPORT §J sketches `rules.fetch(parcel): FetchOutcome<Rule[]>`; this
// adapter serves `rules.fetchChain(kadastroNr, deps?, nowIso?)`, richer (it carries the minted
// Plan/Zone referents the R1 contract requires alongside the rules) and keyed by national id.
// The shared SDK type is E1bc's to mint; guessing it here would mint a rival core interface
// from a lane. When it lands, reconcile HERE — never by editing core to match an adapter.
//
// Everything is FetchOutcome end-to-end (C57 §1.5): a fetch that fails names the endpoint and
// the reason; EMPTY and FAILURE are DIFFERENT VALUES.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import type {
    FetchOutcome,
    SiteIntelPlan,
    SiteIntelRule,
    SiteIntelSource,
    SiteIntelZone,
} from '@pryzm/schemas';
import {
    ltAsgrCitedTpdIds,
    resolveLtAsgrForRing,
    resolveLtTpdRegisterRow,
    type LtAsgrPolygon,
    type LtTpdRegisterRow,
} from './ltAsgrProvider.js';
import { resolveLtParcelByKadastroNr, type LtCadastralParcel } from './ltParcelProvider.js';
import { mapLtAsgrPolygonToRules } from './ltRuleMapper.js';
import { LT_ADAPTER_SOURCES } from './ltSourceRefs.js';
import type { LtArcgisDeps } from './ltArcgisClient.js';

const tracer = trace.getTracer('pryzm.siteintel.lt');

/**
 * §J `precedence: ApplicabilityLadder` — Lithuania's, as data.
 *
 * ⚠ THE HONEST CAVEAT, and the reason no per-rule `rank` is emitted: unlike Denmark's
 * byggefelt → delområde → lokalplan → ramme ladder, which a consumer must RESOLVE, Lithuania's
 * precedence has ALREADY BEEN APPLIED by the state before the data is served — ASGR is built by
 * merging valid documents so that "naujesni ir detalesnio lygmens dokumentai pakeičia senesnius
 * ir mažesnio detalumo" (newer and more detailed supersede older and coarser; VTPSI LEIP
 * specification 2024-06-18). What this ladder records is therefore the SHAPE of a consolidation
 * that has already happened, plus where to go when it yields nothing — not an algorithm to run.
 */
export const LT_APPLICABILITY_LADDER = [
    {
        step: 'ASGR consolidation polygon (aktuali suvestinė informacija apie galiojančius reglamentus)',
        mode:
            'DIRECT structured attributes, ALREADY consolidated by VTPSI (newer/more-detailed ' +
            'documents supersede older/coarser ones before service). Recommendation-grade: ' +
            '"rekomendacinio pobūdžio" rides every rule as R5 normativeForce',
    },
    {
        step: 'per-value provenance → the governing TPD (ribos register, by TPD_ID)',
        mode:
            'DIRECT for the four CLASSIFICATION fields, which carry their own source document, ' +
            'number, approval date and planning kind. NOT AVAILABLE for the four numeric ' +
            'regulation fields — ASGR attributes no document to them (measured 2026-09-01)',
    },
    {
        step: 'the TPD itself (document card via TPD_URL)',
        mode:
            'DIRECT reference; the LEGAL source, since ASGR is only a consolidation. Numeric ' +
            'limits absent from ASGR live in the plan document → extraction pipeline (tier 4→5)',
    },
    {
        step: 'no ASGR polygon / null numerics',
        mode:
            'absent != no regulation, and null != zero: 80.3% of the 175,570 national polygons ' +
            'carry no numeric regulation at all (measured 2026-09-01). Both are UNKNOWN and both ' +
            'are emitted as tier-6 rules, never dropped and never read as no-limit',
    },
] as const;

/**
 * One resolved ASGR consolidation polygon with its rules AND the minted referents those rules
 * cite — the structured-rules unit of the LT chain. The R1 referent contract is carried IN the
 * result: every `applicability.basis` ref in `rules` resolves to `zone` right here, and the
 * zone's `planId` resolves to one of `plans` (no consumer needs an out-of-band id registry).
 */
export interface LtResolvedRegulationZone {
    readonly polygon: LtAsgrPolygon;
    /** The register rows the polygon's cited TPD ids resolved to, keyed by TPD_ID. */
    readonly tpdRows: ReadonlyMap<number, LtTpdRegisterRow>;
    /** The minted `SiteIntelPlan` entities — one per DISTINCT cited TPD that resolved. */
    readonly plans: readonly SiteIntelPlan[];
    /** The minted `SiteIntelZone` the rules cite, or null (referent ladder fell to geometry). */
    readonly zone: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
}

/** The full chain for one parcel: parcel → ASGR consolidation → TPD register → rules. */
export interface LtParcelChain {
    readonly parcel: LtCadastralParcel;
    /**
     * Regulation zones with mapped rules; `absent` = no ASGR polygon intersects this parcel
     * (carrying `LT_ASGR_ABSENCE_CAVEAT`), which is NOT the same as "no regulation applies".
     */
    readonly regulationZones: FetchOutcome<readonly LtResolvedRegulationZone[]>;
}

/**
 * Resolve the chain for a Lithuanian cadastral number: parcel (NTR) → ASGR polygons (exact
 * server-side ring intersection) → TPD register rows (TPD_ID join, fetched once per document
 * even when several polygons or several classification families cite it) → E1a rules + minted
 * referents (pure mapper).
 *
 * PURE ORCHESTRATION of typed outcomes: every leg that fails names itself; a failed leg never
 * fabricates an empty; the parcel leg failing fails the chain (there is nothing to hang the
 * rest on); the mapper's one structural refusal is caught and carried as a transient naming the
 * cause — never a silent drop.
 */
export async function resolveLtParcelChain(
    kadastroNr: string,
    deps: LtArcgisDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<LtParcelChain>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.lt.resolveParcelChain',
        async (span): Promise<FetchOutcome<LtParcelChain>> => {
            try {
                span.setAttribute('lt.kadastroNr', kadastroNr);
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

                const parcelOutcome = await resolveLtParcelByKadastroNr(kadastroNr, deps);
                if (parcelOutcome.status !== 'found') {
                    span.setStatus(
                        parcelOutcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: parcelOutcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return parcelOutcome;
                }
                const parcel = parcelOutcome.value;

                const asgrOutcome = await resolveLtAsgrForRing(parcel.ring, deps);
                if (asgrOutcome.status !== 'found') {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return {
                        status: 'found',
                        value: { parcel, regulationZones: asgrOutcome },
                    };
                }

                // TPD_ID → register-row outcome, fetched once per document across the whole
                // parcel (the baseline parcel's polygons cite 203143899 three times and 123025
                // once — four citations, two fetches).
                const rowCache = new Map<number, FetchOutcome<LtTpdRegisterRow>>();
                const rowFor = async (tpdId: number): Promise<LtTpdRegisterRow | null> => {
                    let outcome = rowCache.get(tpdId);
                    if (outcome === undefined) {
                        outcome = await resolveLtTpdRegisterRow(tpdId, deps);
                        rowCache.set(tpdId, outcome);
                    }
                    // absent/transient → no Plan is minted and the classification rules fall
                    // back to their own served approval date (still 'legal' — that date comes
                    // from ASGR, not from the register), with `document` left null rather than
                    // fabricated.
                    return outcome.status === 'found' ? outcome.value : null;
                };

                let regulationZones: FetchOutcome<readonly LtResolvedRegulationZone[]>;
                try {
                    const resolved: LtResolvedRegulationZone[] = [];
                    for (const polygon of asgrOutcome.value) {
                        const tpdRows = new Map<number, LtTpdRegisterRow>();
                        for (const tpdId of ltAsgrCitedTpdIds(polygon)) {
                            const row = await rowFor(tpdId);
                            if (row !== null) tpdRows.set(tpdId, row);
                        }
                        const mapped = mapLtAsgrPolygonToRules(polygon, tpdRows, fetchedAtIso);
                        resolved.push({
                            polygon,
                            tpdRows,
                            plans: mapped.plans,
                            zone: mapped.zone,
                            rules: mapped.rules,
                        });
                    }
                    regulationZones = { status: 'found', value: resolved };
                } catch (e) {
                    regulationZones = {
                        status: 'transient',
                        reason: `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
                    };
                }

                span.setStatus({ code: SpanStatusCode.OK });
                return { status: 'found', value: { parcel, regulationZones } };
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The assembled LT country adapter — the §J shape as a value. Field-for-field mapping to the
 * REPORT §J sketch is in the header; the shared SDK *type* is not this lane's to mint — see
 * §SEAM-E1BC-FETCHCHAIN before "reconciling" this.
 */
export const ltCountryAdapter = {
    country: 'LT' as const,
    sources: (): readonly SiteIntelSource[] => LT_ADAPTER_SOURCES,
    rules: { kind: 'structured' as const, fetchChain: resolveLtParcelChain },
    precedence: LT_APPLICABILITY_LADDER,
};

export { LITHUANIA_BBOX, isInLithuania } from './ltJurisdiction.js';
export {
    LT_ASGR_LAYER_ID,
    LT_ASGR_SERVICE,
    LT_NATIVE_CRS,
    LT_NATIVE_WKID,
    LT_PARCEL_LAYER_ID,
    LT_PARCEL_SERVICE,
    LT_TPDR_RIBOS_LAYER_ID,
    LT_TPDR_RIBOS_SERVICE,
    LT_TPDR_SERVICES_BASE,
    extractArcgisErrorDetail,
    ltArcgisQuery,
    ltArcgisQueryUrl,
    ltEpochMsToIsoDate,
    ltEsriOuterRing,
    ltNum,
    ltRingIntersectParams,
    ltStr,
    ltWgs84PointParams,
    ltWhereParams,
    type LtArcgisDeps,
    type LtArcgisQueryParams,
} from './ltArcgisClient.js';
export {
    LT_PARCEL_OUT_FIELDS,
    LT_PARCEL_PROVIDER_ID,
    LT_PARCEL_PROVIDER_LABEL,
    LT_UNPARCELLED_LAND_CAVEAT,
    parseLtParcelFeature,
    resolveLtParcelAtWgs84Point,
    resolveLtParcelByKadastroNr,
    type LtCadastralParcel,
    type LtParcelOverlapShare,
} from './ltParcelProvider.js';
export {
    LT_ASGR_ABSENCE_CAVEAT,
    LT_ASGR_CLASSIFICATION_FIELDS,
    LT_ASGR_NUMERIC_FIELDS,
    LT_ASGR_OUT_FIELDS,
    LT_TPDR_RIBOS_OUT_FIELDS,
    ltAsgrCitedTpdIds,
    ltAsgrProvenanceColumnsMeasured,
    parseLtAsgrPolygon,
    parseLtTpdRegisterRow,
    resolveLtAsgrAtWgs84Point,
    resolveLtAsgrForRing,
    resolveLtTpdRegisterRow,
    type LtAsgrClassificationField,
    type LtAsgrClassifiedValue,
    type LtAsgrNumericField,
    type LtAsgrNumericValue,
    type LtAsgrPolygon,
    type LtTpdRegisterRow,
} from './ltAsgrProvider.js';
export {
    LT_ASGR_NORMATIVE_FORCE,
    LT_INTENSITY_UNIT_SCHEME,
    LT_INTENSITY_UNIT_UNRESOLVED,
    LT_RULE_AUTHORITY,
    LT_RULE_DATASET,
    LT_RULE_VOCABULARY,
    ltCompletenessCaveat,
    ltDeserialiseSingle,
    ltIntensityRefusalNote,
    ltPlanEntityId,
    ltZoneEntityId,
    mapLtAsgrPolygonToRules,
    mapLtAsgrPolygonToZone,
    mapLtTpdRowToPlan,
    readLtNumeric,
    type LtMappedRuleSet,
    type LtNumericReading,
    type LtRuleVocabularyEntry,
} from './ltRuleMapper.js';
export {
    LT_ADAPTER_ENDPOINT_BINDINGS,
    LT_ADAPTER_SOURCES,
    LT_ASGR_SOURCE_ID,
    LT_PARCEL_SOURCE_ID,
    LT_TPDR_RIBOS_SOURCE_ID,
    LT_TPDR_RIBOS_SOURCES,
} from './ltSourceRefs.js';
