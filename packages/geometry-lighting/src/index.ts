/**
 * @pryzm/geometry-lighting — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/lighting/
 * Sprint S  (2026-05-11): LightingFragmentBuilder added (Great Purge)
 * Sprint AD (2026-05-12): LightingTool extracted from src/engine/subsystems/lighting/
 *   per 47-EXTRACTION-SUBPHASES-5.1-5.2.md §8 Sprint AD.
 */

export * from './LightingTypes';
// §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — the NAMED, enumerable fixture catalogue.
// Identity only; photometry stays in LIGHTING_FIXTURE_PHOTOMETRY (core-app-model).
export * from './LightingTypeDefinitions';
export * from './LightingRoomResolver';
export { LightingStore } from './LightingStore';
export { LightingFragmentBuilder } from './LightingFragmentBuilder';
// §LIGHT-BUDGET-HONESTY (L-11420) — the per-fixture "am I actually emitting, and
// if not, WHY" verdict. Exported so a property panel can render the refusal with
// its numbers instead of leaving the user to guess (C16 CA-18).
export type { LiveLightState } from './LightingFragmentBuilder';
// §LIGHT147 (L-12420) — THROTTLED-BY-BUDGET vs NEVER-REGISTERED vs
// REGISTERED-BUT-ZERO-INTENSITY, as a read side `liveLightDiagnostics()` alone
// cannot provide (it can only describe a fixture already in `_roots`).
export type { LivePoolCoverage } from './LightingFragmentBuilder';
export { LightingTool } from './LightingTool';
// §OUTDOOR112 — the ONE placement base-point convention (preview == commit).
export { placementSeatFor } from './placementSeat';
export type { PlacementSeat } from './placementSeat';
