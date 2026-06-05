// A.21.a — @pryzm/typology-pack-casa-unifamiliar public surface.
//
// Imported by:
//   - packages/runtime-composer/src/composeRuntime.ts — registers at boot
//   - (future A.21.j) apps/editor typology bridge — intercepts the bridge
//     command `typology.casa-unifamiliar.bridge`
//
// Strategic context: master-execution-tracker.md A.21.a +
// docs/03-execution/specs/SPEC-CASA-UNIFAMILIAR-TYPOLOGY.md.

export { CASA_UNIFAMILIAR_MANIFEST } from './manifest.js';
export { buildCasaUnifamiliarTypologyPack } from './buildCasaUnifamiliarTypologyPack.js';
export { casaUnifamiliarGenerativeStage } from './stages/generative.js';
export { casaUnifamiliarBimEmitStage } from './stages/bimEmission.js';
