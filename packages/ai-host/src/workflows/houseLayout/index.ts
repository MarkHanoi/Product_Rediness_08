// Casa Unifamiliar — houseLayout workflow public barrel.
//
// The pure, testable ai-host core for multi-storey single-family-house generation
// (SPEC-CASA-UNIFAMILIAR-TYPOLOGY; tracker A.21.b + A.21.c + part of A.21.d). The
// editor-wiring follow-up (A.21.e–g) consumes `generateHouseLayout`'s
// `HouseLayoutResult` to create levels, fan commands out per storey, place stairs,
// and punch slab voids.

export { generateHouseLayout, generateHouseLayoutOptions } from './houseOrchestrator.js';
export type { HouseLayoutOptions } from './houseOrchestrator.js';
export { allocateProgramToStoreys } from './storeyAllocation.js';
export { reserveStairCore, reserveStairCoreShaped, splitRisersForShape } from './stairCore.js';
export type { StairCoreShaped } from './stairCore.js';
export { validateHouseStorey, houseStoreyBand } from './houseEnvelope.js';
export type { HouseStoreyEnvelopeInput, HouseStoreyBand } from './houseEnvelope.js';
export type {
    HouseLayoutResult,
    ScoredHouseLayoutOption,
    StoreyProgram,
    StoreyPlate,
    StoreyRole,
    StairCore,
    StairShape,
    StairFlightPlan,
    SlabVoid,
    RoofDescriptor,
    RoofKind,
    Pt,
} from './types.js';
