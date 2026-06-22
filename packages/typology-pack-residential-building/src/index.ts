// Residential building (multi-family) — @pryzm/typology-pack-residential-building.
//
// Imported by:
//   - packages/runtime-composer/src/composeRuntime.ts — registers at boot (GATED)
//   - (later slices) apps/editor typology bridge — intercepts the bridge command
//     `typology.residential-building.bridge`
//
// Strategic context: docs/03-execution/plans/RESIDENTIAL-BUILDING-IMPLEMENTATION-TRACKER.md P1.A.

export { RESIDENTIAL_BUILDING_MANIFEST } from './manifest.js';
export { buildResidentialBuildingTypologyPack } from './buildResidentialBuildingTypologyPack.js';
export { residentialBuildingGenerativeStage } from './stages/generative.js';
export { residentialBuildingBimEmitStage } from './stages/bimEmission.js';
export {
    ResidentialBuildingInput,
    ApartmentTypology,
    parseResidentialBuildingInput,
    enabledTypologies,
} from './inputModel.js';
