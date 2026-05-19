/**
 * @pryzm/geometry-lighting — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/lighting/
 * Sprint S  (2026-05-11): LightingFragmentBuilder added (Great Purge)
 * Sprint AD (2026-05-12): LightingTool extracted from src/engine/subsystems/lighting/
 *   per 47-EXTRACTION-SUBPHASES-5.1-5.2.md §8 Sprint AD.
 */

export * from './LightingTypes';
export * from './LightingRoomResolver';
export { LightingStore } from './LightingStore';
export { LightingFragmentBuilder } from './LightingFragmentBuilder';
export { LightingTool } from './LightingTool';
