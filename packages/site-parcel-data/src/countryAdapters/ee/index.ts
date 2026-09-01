// E1d — THE ESTONIA COUNTRY ADAPTER (REPORT §J shape; plan §E1d; decision 6), REWORKED per
// E1-GATE-DECISION §F item 2 / verdict §G item 2 (the five named items — the draft survived
// the §9 boundary audit with a clean bill and was reworked, not rewritten).
//
// The first new-country adapter under the §J interface: "Core stays country-agnostic; ONLY
// adapters know sources, schemas, semantics, documents." This module ASSEMBLES the four EE
// arms into the §J shape and adds the one composed operation the acceptance names — the
// parcel → buildings → plan → rules chain — which is still pure ORCHESTRATION of typed
// fetches + the pure mapper: no business logic, no envelope math, no typology decisions,
// and (post-rework) NO geometry math either: the old `ringCentroid` vertex-mean is GONE
// (supplement §9 flag 1 — biased by vertex density and the kept closing vertex, and outside
// a concave parcel it silently queried the NEIGHBOUR). Every spatial leg now intersects the
// SERVED parcel ring server-side (grep 2026-09-01 found no point-on-surface solver in core
// geometry to adopt; the supplement's bbox-query alternative was probed and over-covered —
// 6 features from 3 plans — so the exact `Intersects` form, probed both stacks, is used).
//
// §J CONFORMANCE MAP (the interface is REPORT §J's TypeScript sketch):
//   country      → 'EE'
//   sources()    → EE_SOURCES (typed SiteIntelSource rows, dated probe logs)
//   parcel       → resolveEeParcelByTunnus / resolveEeParcelAtWgs84Point
//   buildings    → resolveEeBuildingsIntersectingRing (state-conflated ETAK↔EHR)
//   planGeometry → resolveEeHoonestusForRing / resolveEeKruntForRing / resolveEePlanRegisterRow
//   rules        → kind: 'structured' — resolveEeParcelChain below (FetchOutcome<EeParcelChain>)
//   documents    → the plan register row carries planviide (municipal doc URL) + PLANIS url —
//                  surfaced verbatim on every rule's source ref; no separate retriever needed
//                  for the structured path
//   precedence   → EE_APPLICABILITY_LADDER (dp ehitusõigus → üldplaneering → not-in-PLANK
//                  disambiguation), recorded as DATA + honest caveat
//   vocabulary   → EE_RULE_VOCABULARY (eeRuleMapper.ts)
//
// §SEAM-E1BC-FETCHCHAIN (rework item 5 — the signature seam, DOCUMENTED, not guessed):
// REPORT §J sketches `rules.fetch(parcel): FetchOutcome<Rule[]>`; this adapter serves
// `rules.fetchChain(tunnus, deps?, nowIso?): FetchOutcome<EeParcelChain>` — richer (it
// carries the minted Plan/Prescription referents the R1 contract requires alongside the
// rules) and keyed by national id, not by a parcel object. The shared SDK type is E1bc's to
// mint (roadmap item 3): grep 2026-09-01 finds NO `CountryAdapter`/`fetchChain` type outside
// this directory and no E1bc findings file in audit/europe-site-intel/2026-08-31/impl/ — the
// type is NOT YET STABLE, and guessing it here would mint a rival core interface from a lane
// (the L-7060 shape supplement §9 flag 3 warns about). When the E1bc SDK type lands,
// reconcile HERE (rename/wrap this function), never by editing core to match an adapter.
//
// Everything here is FetchOutcome end-to-end (C57 §1.5): a fetch that fails names the
// endpoint and the reason; empty and failure are DIFFERENT values.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
    type FetchOutcome,
    type SiteIntelPlan,
    type SiteIntelPrescription,
    type SiteIntelRule,
    type SiteIntelSource,
} from '@pryzm/schemas';
import {
    resolveEeParcelByTunnus,
    type EeCadastralParcel,
} from './eeParcelProvider.js';
import {
    resolveEeBuildingsIntersectingRing,
    type EeBuilding,
} from './eeBuildingsProvider.js';
import {
    resolveEeHoonestusForRing,
    resolveEeKruntForRing,
    resolveEePlanRegisterRow,
    type EeHoonestusFeature,
    type EeKruntFeature,
    type EePlanRegisterRow,
} from './eePlanProvider.js';
import { mapEeHoonestusToRules, mapEeKruntToRules } from './eeRuleMapper.js';
import { EE_SOURCES } from './eeSources.js';
import type { EeWfsDeps } from './eeWfsClient.js';

const tracer = trace.getTracer('pryzm.siteintel.ee');

/**
 * §J `precedence: ApplicabilityLadder` — Estonia's, as data. Analogous to DK's
 * byggefelt → delområde → lokalplan → ramme → BR18 ladder (§J's own example).
 */
export const EE_APPLICABILITY_LADDER = [
    {
        step: 'dp_hoonestus ehitusõigus (detail-plan building area — PlanS envelope tuple)',
        mode: 'DIRECT structured attributes where a valid detail plan is in PLANK',
    },
    {
        step: 'dp_krunt (detail-plan plot: use categories + roof pitch)',
        mode: 'DIRECT structured attributes',
    },
    {
        step: 'yldplaneering / yp_maakasutus (comprehensive plan: use machine-readable)',
        mode: 'DIRECT (use) — numeric limits live in plan DOCUMENTS → extraction pipeline (tier 4→5)',
    },
    {
        step: 'not-in-PLANK disambiguation',
        mode:
            'absent from dp layers ≠ no plan: paper-era plans may exist only in municipal ' +
            'registers — a municipal confirmation step, never an assumption (lane 4 EE-1)',
    },
] as const;

/**
 * One resolved building area with its rules AND the minted referents those rules cite —
 * the structured-rules unit of the EE chain. The R1 referent contract is carried IN the
 * result: every `applicability.basis` ref in `rules` resolves to `prescription`/`planEntity`
 * right here (no consumer ever needs an out-of-band id registry).
 */
export interface EeResolvedBuildingArea {
    readonly hoonestus: EeHoonestusFeature;
    /** The raw plan-register row the sysid join resolved, or null. */
    readonly plan: EePlanRegisterRow | null;
    /** The minted `SiteIntelPlan`, or null (row unresolved or status-less). */
    readonly planEntity: SiteIntelPlan | null;
    /** The minted `buildingField` Prescription the rules cite, or null (referent ladder). */
    readonly prescription: SiteIntelPrescription | null;
    readonly rules: readonly SiteIntelRule[];
}

/** One resolved detail-plan plot (krunt) — same referent-carrying shape as the building area. */
export interface EeResolvedPlot {
    readonly krunt: EeKruntFeature;
    readonly plan: EePlanRegisterRow | null;
    readonly planEntity: SiteIntelPlan | null;
    /** The minted `plannedPlot` Prescription the rules cite, or null (referent ladder). */
    readonly prescription: SiteIntelPrescription | null;
    readonly rules: readonly SiteIntelRule[];
}

/** The full §E1d acceptance chain for one parcel: parcel → buildings → plan → rules. */
export interface EeParcelChain {
    readonly parcel: EeCadastralParcel;
    /** Typed outcome — buildings may honestly be absent (undeveloped plot). */
    readonly buildings: FetchOutcome<readonly EeBuilding[]>;
    /** Plots with mapped rules; absent = no dp_krunt here (see ladder step 4). */
    readonly plots: FetchOutcome<readonly EeResolvedPlot[]>;
    /** Building areas with mapped rules; absent = no dp_hoonestus here (see ladder step 4). */
    readonly buildingAreas: FetchOutcome<readonly EeResolvedBuildingArea[]>;
}

/**
 * Resolve the §E1d chain for a cadastral id: parcel (cadastre) → buildings (ETAK↔EHR) →
 * plan features (PLANK, exact ring intersection) → plan register rows (sysid join) → E1a
 * rules + minted referents (pure mapper).
 *
 * PURE ORCHESTRATION of typed outcomes: every leg that fails names itself; a failed leg
 * never fabricates an empty; the parcel leg failing fails the chain (there is nothing to
 * hang the rest on); every other leg is carried as its own FetchOutcome. The mapper's one
 * structural refusal (a feature with no geometry and no plan identity) is caught and carried
 * as a transient outcome naming the cause — never a silent drop.
 */
export async function resolveEeParcelChain(
    tunnus: string,
    deps: EeWfsDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<EeParcelChain>> {
    return tracer.startActiveSpan('pryzm.siteintel.ee.resolveParcelChain', async (span): Promise<FetchOutcome<EeParcelChain>> => {
        try {
            span.setAttribute('ee.tunnus', tunnus);
            const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

            const parcelOutcome = await resolveEeParcelByTunnus(tunnus, deps);
            if (parcelOutcome.status !== 'found') {
                span.setStatus(
                    parcelOutcome.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: parcelOutcome.reason }
                        : { code: SpanStatusCode.OK },
                );
                return parcelOutcome;
            }
            const parcel = parcelOutcome.value;

            const [buildings, kruntOutcome, hoonestusOutcome] = await Promise.all([
                resolveEeBuildingsIntersectingRing(parcel.ring, deps),
                resolveEeKruntForRing(parcel.ring, deps),
                resolveEeHoonestusForRing(parcel.ring, deps),
            ]);

            // sysid → register-row outcome, fetched once per plan even when several features
            // share it (Kopli tn 2's two hoonestusalas + krunt all join sysid 30100071).
            const planRowCache = new Map<number, FetchOutcome<EePlanRegisterRow>>();
            const planRowFor = async (sysid: number | null): Promise<EePlanRegisterRow | null> => {
                if (sysid === null) return null;
                let outcome = planRowCache.get(sysid);
                if (outcome === undefined) {
                    outcome = await resolveEePlanRegisterRow(sysid, deps);
                    planRowCache.set(sysid, outcome);
                }
                // absent/transient → rules ride validityBasis:'ingestion' with the fetch date
                // (R3) instead of a fabricated adoption date.
                return outcome.status === 'found' ? outcome.value : null;
            };

            let buildingAreas: FetchOutcome<readonly EeResolvedBuildingArea[]>;
            if (hoonestusOutcome.status !== 'found') {
                buildingAreas = hoonestusOutcome;
            } else {
                try {
                    const resolved: EeResolvedBuildingArea[] = [];
                    for (const h of hoonestusOutcome.value) {
                        const planRow = await planRowFor(h.sysid);
                        const mapped = mapEeHoonestusToRules(h, planRow, fetchedAtIso);
                        resolved.push({
                            hoonestus: h,
                            plan: planRow,
                            planEntity: mapped.plan,
                            prescription: mapped.prescription,
                            rules: mapped.rules,
                        });
                    }
                    buildingAreas = { status: 'found', value: resolved };
                } catch (e) {
                    buildingAreas = {
                        status: 'transient',
                        reason: `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
                    };
                }
            }

            let plots: FetchOutcome<readonly EeResolvedPlot[]>;
            if (kruntOutcome.status !== 'found') {
                plots = kruntOutcome;
            } else {
                try {
                    const resolved: EeResolvedPlot[] = [];
                    for (const k of kruntOutcome.value) {
                        const planRow = await planRowFor(k.sysid);
                        const mapped = mapEeKruntToRules(k, planRow, fetchedAtIso);
                        resolved.push({
                            krunt: k,
                            plan: planRow,
                            planEntity: mapped.plan,
                            prescription: mapped.prescription,
                            rules: mapped.rules,
                        });
                    }
                    plots = { status: 'found', value: resolved };
                } catch (e) {
                    plots = {
                        status: 'transient',
                        reason: `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
                    };
                }
            }

            span.setStatus({ code: SpanStatusCode.OK });
            return {
                status: 'found',
                value: { parcel, buildings, plots, buildingAreas },
            };
        } finally {
            span.end();
        }
    });
}

/**
 * The assembled EE country adapter — the §J shape as a value. Field-for-field mapping to the
 * REPORT §J sketch is in the header comment; the shared SDK *type* is roadmap item 3, NOT
 * this lane's to mint — see §SEAM-E1BC-FETCHCHAIN in the header before "reconciling" this.
 */
export const eeCountryAdapter = {
    country: 'EE' as const,
    sources: (): readonly SiteIntelSource[] => EE_SOURCES,
    rules: { kind: 'structured' as const, fetchChain: resolveEeParcelChain },
    precedence: EE_APPLICABILITY_LADDER,
};

export { ESTONIA_BBOX, isInEstonia } from './eeJurisdiction.js';
export {
    EE_GEOSERVER_BASE,
    EE_PLANK_WFS_BASE,
    EE_NATIVE_CRS,
    EE_PLANK_GEOMETRY_COLUMN,
    extractOwsExceptionText,
    eeWfsGetFeatures,
    buildGeoserverCqlUrl,
    buildGeoserverIntersectsRingUrl,
    buildGeoserverWgs84BboxUrl,
    buildPlankBboxUrl,
    buildPlankAttributeFilterUrl,
    buildPlankIntersectsRingUrl,
    type EeWfsDeps,
    type EeWfsFeature,
} from './eeWfsClient.js';
export {
    EE_CADASTRE_LAYER,
    EE_PARCEL_PROVIDER_ID,
    EE_PARCEL_PROVIDER_LABEL,
    parseEeParcelFeature,
    resolveEeParcelAtWgs84Point,
    resolveEeParcelByTunnus,
    type EeCadastralParcel,
    type EeLandUseShare,
} from './eeParcelProvider.js';
export {
    EE_BUILDINGS_LAYER,
    EE_BUILDINGS_PROVIDER_ID,
    parseEeBuildingFeature,
    resolveEeBuildingsAtNativePoint,
    resolveEeBuildingsAtWgs84Point,
    resolveEeBuildingsIntersectingRing,
    type EeBuilding,
} from './eeBuildingsProvider.js';
export {
    EE_PLANK_ABSENCE_CAVEAT,
    EE_PLANK_LAYER_DP_KEHTIV,
    EE_PLANK_LAYER_HOONESTUS,
    EE_PLANK_LAYER_KRUNT,
    EE_PLANK_LAYER_PLAN_REGISTER,
    EE_PLANK_LAYER_YP_MAAKASUTUS,
    parseEeHoonestusFeature,
    parseEeKruntFeature,
    parseEePlanRegisterRow,
    resolveEeHoonestusAtPoint,
    resolveEeHoonestusForRing,
    resolveEeKruntAtPoint,
    resolveEeKruntForRing,
    resolveEePlanRegisterRow,
    type EeHoonestusFeature,
    type EeKruntFeature,
    type EePlanPoint,
    type EePlanRegisterRow,
} from './eePlanProvider.js';
export {
    EE_RULE_AUTHORITY,
    EE_RULE_VOCABULARY,
    eePlanEntityId,
    mapEeHoonestusToRules,
    mapEeKruntToRules,
    mapEePlanRegisterRowToPlan,
    parseEeEhitusoigusNumber,
    type EeMappedRuleSet,
    type EeRuleVocabularyEntry,
} from './eeRuleMapper.js';
export { EE_PLANK_SOURCE_ID, EE_SOURCES } from './eeSources.js';
