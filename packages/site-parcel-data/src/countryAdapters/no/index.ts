// E7-NO — THE NORWAY COUNTRY ADAPTER (REPORT §J shape), built on the E7 family verdict's §6
// conventions and on the EE exemplar's file layout.
//
// §J CONFORMANCE MAP:
//   country      → 'NO'
//   sources()    → NO_ADAPTER_SOURCES (the registry's cadastre row + this lane's three probed
//                  additive rows: the keyless NAP WMS, the role-gated NAP bulk arm, and the
//                  SOSI codelist register)
//   parcel       → resolveNoTeigerAtWgs84Point / resolveNoTeigerAtNativePoint
//   planGeometry → resolveNoPlanFeaturesAtLevel / resolveNoPlanFeaturesAllLevels
//   rules        → kind: 'structured' — resolveNoParcelChain below
//   documents    → the RpOmråde `link` (the kommune planregister card, where the BESTEMMELSER
//                  live) travels VERBATIM on every rule's `source.document`; no separate
//                  retriever exists for the structured path, and the PROSE inside those
//                  documents is E8's, with its own gate battery — this lane does not read it
//   precedence   → NO_APPLICABILITY_LADDER (data + honest caveat)
//   vocabulary   → NO_RULE_VOCABULARY (noRuleMapper.ts)
//
// ⭐ THE CHAIN NEEDS NO PROJECTION AND NO GEOMETRY MATH, AND THAT IS A NORWEGIAN GIFT, NOT A
// DESIGN CHOICE. Matrikkelen serves each teig's own `representasjonspunkt` — a state-published
// representative point — in EPSG:25833, and NAP's WMS accepts EPSG:25833. So the plan query is
// a point query on a point the state published, in the CRS both services already speak. EE had
// to replace a vertex-mean centroid with a server-side ring intersection precisely because a
// computed centroid falls outside a concave parcel and silently queries the neighbour; Norway
// never poses that problem.
//
// ⭐ AND THE CHAIN WALKS ALL FIVE VERTICAL LEVELS. A Norwegian parcel can sit under several
// plans at once, at different `vertikalnivå`. MEASURED at Bergen teig 4601-167/714: a 2023
// light-rail TUNNEL plan at level 1 and a different 1983 SURFACE plan at level 2. Merging them
// would read a tunnel as development rights; querying only level 1 would return the tunnel and
// call it the zoning. Each level is its own typed outcome and they are never merged.
//
// ⛔ THE PARCEL LEG IS BLOCKED TODAY BY A SHARED-FILE DEFECT, NOT BY NORWAY. The package's only
// XML scanner (`parsers/appGml/xmlScan.ts`) rejects the well-formed element name `app:område`
// because its `NAME_RE` is ASCII-only, so `resolveNoParcelChain` returns a self-naming
// transient. The one-line fix is queued for the orchestrator in
// `impl/barrel-additions-no.txt`; `noAdapter.test.ts` PINS the defect so the pin fails loudly
// when it lands. The PLAN leg is unaffected — it is JSON — and
// {@link resolveNoPlanChainAtNativePoint} resolves a real Norwegian zone end-to-end today.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
    type FetchOutcome,
    type SiteIntelPlan,
    type SiteIntelPrescription,
    type SiteIntelRule,
    type SiteIntelSource,
    type SiteIntelZone,
} from '@pryzm/schemas';
import { NO_NATIVE_CRS, type NoFetchDeps } from './noMatrikkelClient.js';
import {
    NO_NAP_CHAIN_HALF_WINDOW_M,
    type NoNapPoint,
    type NoVerticalLevel,
} from './noNapClient.js';
import { resolveNoTeigerAtWgs84Point, type NoCadastralTeig } from './noParcelProvider.js';
import {
    resolveNoPlanFeaturesAllLevels,
    type NoPlanArea,
    type NoPlanFeatureSet,
    type NoZoneArea,
} from './noPlanProvider.js';
import {
    mapNoPlanAreaToRules,
    mapNoPlanObjectToPrescription,
    mapNoZoneToRules,
    noPlanEntityId,
} from './noRuleMapper.js';
import { NO_ADAPTER_SOURCES } from './noSourceRefs.js';

const tracer = trace.getTracer('pryzm.siteintel.no');

/**
 * §J `precedence: ApplicabilityLadder` — Norway's, AS DATA and with its caveat. It is NOT
 * emitted as a per-rule R1 `rank`: NAP serves no rank axis, and `plantype` (30/34/35 observed)
 * is not rankable until the `Plantype` codelist is resolved — which the national register does
 * NOT publish under `plan/reguleringsplan` (measured: 7 codelists there, Plantype not among
 * them). Ranking on unresolved codes would be a guess wearing a type.
 */
export const NO_APPLICABILITY_LADDER = [
    {
        step: 'reguleringsplan (detaljregulering / områderegulering) — RpArealformålOmråde + bestemmelser',
        mode:
            'DIRECT structured attributes where NAP carries them; the numeric limits are mostly ' +
            'NOT in the attributes (utnyttingstall filled on 2 of 24 sampled) and live in the ' +
            'bestemmelser document named on every rule',
    },
    {
        step: 'hensynssoner + bestemmelsesområder (8 + 7 SOSI types) riding the same plan',
        mode: 'DIRECT geometry + code; minted as Prescriptions, never merged into the zone',
    },
    {
        step: 'kommuneplanens arealdel (the municipal master plan)',
        mode:
            'NOT CONSUMED BY THIS ADAPTER. Its NAP WMS was probed live (HTTP 200) but its ' +
            'vocabulary and fill were not measured, and adding it unmeasured would be the scope ' +
            'expansion control 10 forbids. It is the fallback where no reguleringsplan exists.',
    },
    {
        step: 'statlige planretningslinjer / plan- og bygningsloven + TEK',
        mode: 'national baseline, entirely document-borne — not in NAP, not in this adapter',
    },
    {
        step: 'not-in-NAP disambiguation',
        mode:
            'absent from NAP is NOT proof a parcel is unplanned: ingestion is partial — MEASURED ' +
            '5 of 9 sampled city windows carried geometry and OSLO DID NOT. Confirm against the ' +
            "kommune's own planregister (mandatory online since 1 July 2025) before claiming " +
            'vacancy.',
    },
] as const;

/** One formålområde resolved with its rules AND the minted referents those rules cite. */
export interface NoResolvedZone {
    readonly zone: NoZoneArea;
    /** The RpOmråde the zone's `arealplanId` joined to, at the same level, or null. */
    readonly planArea: NoPlanArea | null;
    readonly planEntity: SiteIntelPlan | null;
    readonly zoneEntity: SiteIntelZone | null;
    readonly rules: readonly SiteIntelRule[];
}

/** Everything one vertical level resolved to. Each leg is its OWN outcome. */
export interface NoResolvedLevel {
    readonly level: NoVerticalLevel;
    /** The raw typed feature set, or the level's own refusal. */
    readonly features: FetchOutcome<NoPlanFeatureSet>;
    /** Zones with mapped rules; carries the mapper's structural refusal if it fired. */
    readonly zones: FetchOutcome<readonly NoResolvedZone[]>;
    /** Plan-level rules (lifecycle codes + the provisions pointer), one set per RpOmråde. */
    readonly planRules: FetchOutcome<readonly SiteIntelRule[]>;
    /**
     * The Plan entities the plan-level rules cite. ⭐ THIS FIELD EXISTS BECAUSE THE SUITE
     * CAUGHT ITS ABSENCE: with only `zones` carrying minted entities, a level whose plan has NO
     * formålområde (measured — Bergen's 1983 surface plan at vn2) emitted `planRules` citing
     * `plan:no-plan-4601-5380000` while the result carried no such entity. That is precisely
     * the dangling-referent defect R1 exists to stop, and the "every basis ref resolves in the
     * same result" test failed by name on it before this field was added.
     */
    readonly planEntities: readonly SiteIntelPlan[];
    /** Hensynssoner / bestemmelsesområder / juridiske linjer minted as Prescriptions. */
    readonly prescriptions: readonly SiteIntelPrescription[];
}

/** The full NO chain for one point: parcel → anchor → plan features → rules, per level. */
export interface NoParcelChain {
    /** Every teig the click window touched, in served order (a boundary click touches several). */
    readonly teiger: readonly NoCadastralTeig[];
    /** The point the plan legs were queried at — the state's own representasjonspunkt. */
    readonly anchor: NoNapPoint;
    /** One entry per DECLARED vertical level, never merged. */
    readonly levels: readonly NoResolvedLevel[];
}

/** The chain without the cadastre leg — a native-CRS point straight into NAP. */
export interface NoPlanChain {
    readonly anchor: NoNapPoint;
    readonly levels: readonly NoResolvedLevel[];
}

function resolveLevels(
    results: ReadonlyArray<{ readonly level: NoVerticalLevel; readonly outcome: FetchOutcome<NoPlanFeatureSet> }>,
    fetchedAtIso: string,
): readonly NoResolvedLevel[] {
    return results.map(({ level, outcome }) => {
        if (outcome.status !== 'found') {
            return {
                level,
                features: outcome,
                zones: outcome,
                planRules: outcome,
                planEntities: [],
                prescriptions: [],
            };
        }
        const set = outcome.value;
        // Join zones to their plan by the national key, WITHIN the same level. A plan area from
        // another level is a different instrument (measured at Bergen) and must never join.
        const planByKey = new Map<string, NoPlanArea>();
        for (const pa of set.planAreas) {
            if (pa.arealplanId !== null) planByKey.set(noPlanEntityId(pa.arealplanId), pa);
        }
        let zones: FetchOutcome<readonly NoResolvedZone[]>;
        try {
            const resolved: NoResolvedZone[] = [];
            for (const z of set.zones) {
                const planArea = z.arealplanId !== null ? (planByKey.get(noPlanEntityId(z.arealplanId)) ?? null) : null;
                const mapped = mapNoZoneToRules(z, planArea, fetchedAtIso);
                resolved.push({
                    zone: z,
                    planArea,
                    planEntity: mapped.plan,
                    zoneEntity: mapped.zone,
                    rules: mapped.rules,
                });
            }
            zones = { status: 'found', value: resolved };
        } catch (e) {
            zones = {
                status: 'transient',
                reason: `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
        let planRules: FetchOutcome<readonly SiteIntelRule[]>;
        const planEntities: SiteIntelPlan[] = [];
        try {
            const rules: SiteIntelRule[] = [];
            for (const pa of set.planAreas) {
                const mapped = mapNoPlanAreaToRules(pa, fetchedAtIso);
                if (mapped.plan !== null) planEntities.push(mapped.plan);
                rules.push(...mapped.rules);
            }
            planRules = { status: 'found', value: rules };
        } catch (e) {
            planRules = {
                status: 'transient',
                reason: `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
            };
        }
        // Prescriptions hang off the zone they sit in when there is exactly one, else off the
        // plan. Never off "the nearest" — proximity is not applicability.
        const soleZoneRef =
            zones.status === 'found' && zones.value.length === 1 ? (zones.value[0]!.zoneEntity?.id ?? null) : null;
        const solePlanRef = set.planAreas.length === 1 && set.planAreas[0]!.arealplanId !== null
            ? noPlanEntityId(set.planAreas[0]!.arealplanId!)
            : null;
        const ref = soleZoneRef ?? solePlanRef;
        const prescriptions: SiteIntelPrescription[] = [];
        if (ref !== null) {
            for (const obj of set.objects) {
                const p = mapNoPlanObjectToPrescription(obj, ref);
                if (p !== null) prescriptions.push(p);
            }
        }
        return { level, features: outcome, zones, planRules, planEntities, prescriptions };
    });
}

/**
 * Resolve the plan legs at a NATIVE (EPSG:25833) point — the arm that works today, and the one
 * `noAdapter.test.ts` proves end-to-end against recorded state bytes.
 */
export async function resolveNoPlanChainAtNativePoint(
    easting: number,
    northing: number,
    deps: NoFetchDeps = {},
    nowIso?: string,
    halfWindowM: number = NO_NAP_CHAIN_HALF_WINDOW_M,
): Promise<NoPlanChain> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.resolvePlanChainAtNativePoint',
        async (span): Promise<NoPlanChain> => {
            try {
                // The parenthesised form: it is the only one that survives a caller passing a
                // full ISO timestamp (E7 family verdict §4 / L-12873).
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);
                const anchor: NoNapPoint = { crs: NO_NATIVE_CRS, x: easting, y: northing };
                const results = await resolveNoPlanFeaturesAllLevels(anchor, deps, halfWindowM);
                span.setStatus({ code: SpanStatusCode.OK });
                return { anchor, levels: resolveLevels(results, fetchedAtIso) };
            } finally {
                span.end();
            }
        },
    );
}

/**
 * Resolve the full chain for a WGS84 click: teiger (Matrikkelen) → the first teig's own
 * `representasjonspunkt` → NAP plan features at all five levels → rules + minted referents.
 *
 * PURE ORCHESTRATION of typed outcomes. The parcel leg failing fails the chain — there is no
 * anchor to hang the rest on, and inventing one from the click point would query a location
 * the state did not publish. Every other leg is carried as its own FetchOutcome.
 */
export async function resolveNoParcelChain(
    lat: number,
    lon: number,
    deps: NoFetchDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<NoParcelChain>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.no.resolveParcelChain',
        async (span): Promise<FetchOutcome<NoParcelChain>> => {
            try {
                span.setAttribute('no.lat', lat);
                span.setAttribute('no.lon', lon);
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

                const teigOutcome = await resolveNoTeigerAtWgs84Point(lat, lon, deps);
                if (teigOutcome.status !== 'found') {
                    span.setStatus(
                        teigOutcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: teigOutcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return teigOutcome;
                }
                const teiger = teigOutcome.value;
                const anchorTeig = teiger.find((t) => t.representasjonspunkt !== null) ?? null;
                if (anchorTeig === null || anchorTeig.representasjonspunkt === null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'no-anchor' });
                    return {
                        status: 'transient',
                        reason:
                            `upstream-failed: ${teiger.length} teig(s) resolved at ${lat},${lon} but none ` +
                            'carried a representasjonspunkt. This adapter does NOT compute a centroid to ' +
                            'stand in for one — a computed point falls outside a concave parcel and ' +
                            "silently queries the neighbour's plan. Refusing by name.",
                    };
                }
                const anchor: NoNapPoint = {
                    crs: NO_NATIVE_CRS,
                    x: anchorTeig.representasjonspunkt[0],
                    y: anchorTeig.representasjonspunkt[1],
                };
                const results = await resolveNoPlanFeaturesAllLevels(anchor, deps);
                span.setStatus({ code: SpanStatusCode.OK });
                return {
                    status: 'found',
                    value: { teiger, anchor, levels: resolveLevels(results, fetchedAtIso) },
                };
            } finally {
                span.end();
            }
        },
    );
}

/** The assembled NO country adapter — the §J shape as a value. */
export const noCountryAdapter = {
    country: 'NO' as const,
    sources: (): readonly SiteIntelSource[] => NO_ADAPTER_SOURCES,
    rules: { kind: 'structured' as const, fetchChain: resolveNoParcelChain },
    precedence: NO_APPLICABILITY_LADDER,
};

/* ────────────────────────────── explicit public surface ────────────────────────── */

export {
    NORWAY_BBOX,
    isInNorway,
    isInNoMatrikkelServiceExtent,
    NO_BBOX_SERVICE_GAP,
    NO_MATRIKKEL_SERVICE_BBOX,
    type NoBbox,
} from './noJurisdiction.js';
export {
    appChild,
    appText,
    buildTeigNativeBboxUrl,
    buildTeigWgs84BboxUrl,
    extractOwsExceptionText,
    nonAsciiNameFromScanDetail,
    noWfsGetMembers,
    readGmlExteriorRing,
    readGmlPos,
    NO_MATRIKKEL_WFS_BASE,
    NO_NATIVE_CRS,
    NO_NATIVE_URN,
    NO_TEIG_COUNT_HEADER_IS_UNRELIABLE,
    NO_TEIG_NAMESPACE,
    NO_TEIG_TYPENAME,
    NO_WGS84_URN,
    NO_XMLSCAN_NON_ASCII_BLOCKER_TOKEN,
    type NoGmlMember,
} from './noMatrikkelClient.js';
export {
    buildNapGetFeatureInfoUrl,
    extractWmsServiceExceptionText,
    isNapJavaArraySentinel,
    napLayersForLevel,
    noNapGetFeatureInfo,
    NO_NAP_ABSENCE_CAVEAT,
    NO_NAP_CHAIN_HALF_WINDOW_M,
    NO_NAP_COVERAGE_CENSUS_2026_09_01,
    NO_NAP_DOWNLOAD_API,
    NO_NAP_DOWNLOAD_REQUIRED_ROLE,
    NO_NAP_GFI_PIXELS,
    NO_NAP_JAVA_ARRAY_SENTINEL_RE,
    NO_NAP_KOMMUNEPLANER_WMS,
    NO_NAP_LAYER_SUFFIXES,
    NO_NAP_MAX_HALF_WINDOW_M,
    NO_NAP_PROBED_CRS,
    NO_NAP_REGULERINGSPLANER_WMS,
    NO_NAP_VERTICAL_LEVELS,
    NO_NAP_VN1_FEATURE_TYPES,
    type NoNapCrs,
    type NoNapFeature,
    type NoNapPoint,
    type NoVerticalLevel,
    type NoFetchDeps,
} from './noNapClient.js';
export {
    normaliseSrs,
    parseNoTeigElement,
    resolveNoTeigerAtNativePoint,
    resolveNoTeigerAtWgs84Point,
    NO_PARCEL_PROVIDER_ID,
    NO_PARCEL_PROVIDER_LABEL,
    type NoCadastralTeig,
    type NoMatrikkelenhet,
} from './noParcelProvider.js';
export {
    buildNoPlanFeatureSet,
    parseNoNapFeature,
    resolveNoPlanFeaturesAllLevels,
    resolveNoPlanFeaturesAtLevel,
    stripLevelSuffix,
    NO_NAP_KEYS,
    NO_PLAN_AREA_TYPES,
    NO_ZONE_TYPES,
    type NoArealplanId,
    type NoNapCommon,
    type NoPlanArea,
    type NoPlanFeatureSet,
    type NoPlanObject,
    type NoZoneArea,
} from './noPlanProvider.js';
export {
    mapNoPlanAreaToPlan,
    mapNoPlanAreaToRules,
    mapNoPlanObjectToPrescription,
    mapNoZoneAreaToZone,
    mapNoZoneToRules,
    noPlanEntityId,
    noPrescriptionEntityId,
    noValidity,
    noZoneEntityId,
    readNoIsoDate,
    readNoUtnyttingNumber,
    readUtnyttingstype,
    NO_RULE_AUTHORITY,
    NO_RULE_VOCABULARY,
    NO_SOSI_CODELIST_REGISTER,
    NO_UTNYTTINGSTYPE_CODELIST,
    NO_UTNYTTINGSTYPE_PROHIBITION_CODES,
    NO_UTNYTTINGSTYPE_SCHEME,
    type NoMappedRuleSet,
    type NoRuleVocabularyEntry,
    type NoUtnyttingReading,
} from './noRuleMapper.js';
export {
    NO_ADAPTER_ENDPOINT_BINDINGS,
    NO_ADAPTER_SOURCES,
    NO_ADDITIVE_SOURCES,
    NO_MATRIKKEL_SOURCE,
    NO_MATRIKKEL_SOURCE_ID,
    NO_NAP_BULK_SOURCE_ID,
    NO_NAP_SOURCE_ID,
    NO_SOSI_CODELIST_SOURCE_ID,
} from './noSourceRefs.js';
