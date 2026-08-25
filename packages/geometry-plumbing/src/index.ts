/**
 * @pryzm/geometry-plumbing — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/plumbing/
 * Sprint S  (2026-05-11): PlumbingFragmentBuilder + PlumbingSystemTypeStore added (Great Purge)
 */

export * from './BathroomAccessoryGeometry';
export * from './ShowerGeometry';
export * from './ToiletGeometry';
export * from './PlumbingTypes';
export { PlumbingStore } from './PlumbingStore';
export { PlumbingFragmentBuilder } from './PlumbingFragmentBuilder';
export { PlumbingSystemTypeStore, plumbingSystemTypeStore } from './PlumbingSystemTypeStore';
export type { PlumbingSystemType } from './PlumbingSystemTypeStore';
export { PlumbingTool } from './PlumbingTool';
// §FEAT-PLUMBING-PLAN-ELEV-SYMBOLS (L-221) — 2D symbol builders + pure linework.
export {
    resolveFixtureFootprint,
    buildPlanLinework,
    buildElevationLinework,
} from './PlumbingSymbolGeometry';
export type { FixtureSymbolInput, FixtureFootprint } from './PlumbingSymbolGeometry';
export { PlumbingPlanSymbolBuilder, plumbingPlanSymbolBuilder } from './PlumbingPlanSymbolBuilder';
export { PlumbingElevationSymbolBuilder, plumbingElevationSymbolBuilder } from './PlumbingElevationSymbolBuilder';

// §FEAT-BATHROOM-POD-COMPOUND (L-11400) — the C109 parametric bathroom module.
//
// ⚠ TYPES AND PURE FUNCTIONS ONLY, AND THE ABSENCE OF ANYTHING ELSE IS DELIBERATE.
// C104 §9.1 records that a MODULE-SCOPE evaluation inside a barrel-reachable file made
// one package's defect the whole editor's crash: `command-registry` imports these
// geometry barrels as VALUE edges reachable from `bootstrap.everything`, so a throw at
// import time here kills test COLLECTION for every suite under `apps/editor`. Nothing
// below constructs anything at module scope. `[[scc-no-barrel-access-at-module-load]]`.
export {
    BATHROOM_POD_MEMBER_ORDER,
    bathroomPodChildIds,
    bathroomPodMemberOfKind,
    validateBathroomPod,
} from './BathroomPodTypes';
export type {
    BathroomPod,
    BathroomPodArrangement,
    BathroomPodHandedness,
    BathroomPodMember,
    BathroomPodMemberKind,
    BathroomPodRoom,
    BathroomPodsState,
    BathroomPodValidation,
} from './BathroomPodTypes';
export {
    BATHROOM_POD_CLEARANCES,
    BATHROOM_POD_DEFAULT_MEMBERS,
    DEFAULT_POD_SHOWER_VARIANT,
    DEFAULT_POD_TOILET_VARIANT,
    podGapBetween,
    podMemberConsumesRun,
    podShowerVariantFor,
} from './BathroomPodRules';
export type { BathroomPodClearance } from './BathroomPodRules';
export {
    bathroomPodMemberCount,
    bathroomPodMemberOrder,
    buildBathroomPod,
    solveBathroomPodLayout,
} from './BathroomPodAssembly';
export type { BathroomPodLayoutInput, BathroomPodLayoutResult } from './BathroomPodAssembly';
