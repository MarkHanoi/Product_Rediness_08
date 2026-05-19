/**
 * @pryzm/geometry-roof — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/roofs/
 * Sprint S  (2026-05-11): RoofLevelCleanupHandler added (Great Purge)
 * Sprint AA (2026-05-12): RoofGeometryBuilder, RoofFragmentBuilder, RoofTool,
 *                         RoofSlopeSymbolBuilder promoted from src/
 */

export * from './RoofTypes';
export * from './roofSnapshotUtils';
export { RoofStore } from './RoofStore';
export { RoofLevelCleanupHandler } from './RoofLevelCleanupHandler';
export { WallRegionDetector } from './WallRegionDetector';
export { RoofSnapEngine } from './RoofSnapEngine';
export type { SnapType, SnapResult } from './RoofSnapEngine';

// Sprint AA
export { RoofGeometryBuilder } from './RoofGeometryBuilder';
export { RoofFragmentBuilder } from './RoofFragmentBuilder';
export { RoofTool, RoofToolState } from './RoofTool';
export type { RoofToolDeps, RoofToolCallbacks } from './RoofTool';
export { RoofSlopeSymbolBuilder } from './RoofSlopeSymbolBuilder';
