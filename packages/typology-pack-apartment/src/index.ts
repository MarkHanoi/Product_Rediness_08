// A.4.a (Phase A · Sprint 2) — @pryzm/typology-pack-apartment public surface.
//
// Imported by:
//   - packages/runtime-composer/src/composeRuntime.ts — registers at boot
//   - apps/editor/src/typology/legacyBridge.ts — intercepts the bridge
//     command `typology.apartment.bridge` + forwards to the existing
//     ai-host apartment-layout-execute path
//
// Strategic context: master-execution-tracker.md A.4.

export { APARTMENT_MANIFEST } from './manifest.js';
export { buildApartmentTypologyPack } from './buildApartmentTypologyPack.js';
export { apartmentGenerativeStage } from './stages/generative.js';
export { apartmentBimEmitStage } from './stages/bimEmission.js';
