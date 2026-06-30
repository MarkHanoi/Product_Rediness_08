// Office building (tower) — @pryzm/typology-pack-office-building.
//
// Imported by:
//   - packages/runtime-composer/src/composeRuntime.ts — registers at boot (GATED
//     behind __PRYZM_OFFICE_BUILDING__)
//   - apps/editor office-building UI — the console trigger drives the orchestrator.

export { OFFICE_BUILDING_MANIFEST } from './manifest.js';
export { buildOfficeBuildingTypologyPack } from './buildOfficeBuildingTypologyPack.js';
export { officeBuildingGenerativeStage } from './stages/generative.js';
export { officeBuildingBimEmitStage } from './stages/bimEmission.js';
export {
    OfficeBuildingInput,
    DeskMode,
    WorkplaceCulture,
    PlateShape,
    parseOfficeBuildingInput,
} from './inputModel.js';
