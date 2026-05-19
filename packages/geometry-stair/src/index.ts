/**
 * @pryzm/geometry-stair — public API barrel
 *
 * Sprint H P9 (2026-05-10): initial extraction — types, stores, validation.
 * Sprint AB  (2026-05-12): full extraction — builders, tool, stairPath.
 */

// ── Types / stores (Sprint H P9) ─────────────────────────────────────────────
export * from './StairRailingTypes';
export * from './StairLandingTypes';
export * from './StairTypeDefinitions';
export * from './StairTypes';
export * from './StairFootprintUtils';
export * from './StairTypeStore';
export * from './StairValidationAuthority';
export * from './LevelTraversalPolicy';
export { StairStore }        from './StairStore';
export { StairLandingStore } from './StairLandingStore';
export { StairRailingStore } from './StairRailingStore';

// ── Schema (Sprint AB) ───────────────────────────────────────────────────────
export * from './StairDataSchema';

// ── Builders (Sprint AB) ─────────────────────────────────────────────────────
export { StairMaterialResolver }    from './StairMaterialResolver';
export { StairPlanRepresentation }  from './StairPlanRepresentation';
export { StairStringerBuilder }     from './StairStringerBuilder';
export { StairLandingBuilder }      from './StairLandingBuilder';
export { StairRailingBuilder }      from './StairRailingBuilder';
export type { StairMeshData }       from './StairMeshBuilder';
export { StairMeshBuilder }         from './StairMeshBuilder';

// ── Controller + tool (Sprint AB) ────────────────────────────────────────────
export { StairCreationController, StairCreationPhase } from './StairCreationController';
export type { SnapPoint, SnapManager }                 from './StairToolDependencies';
export type { StairToolDependencies }                  from './StairToolDependencies';
export { StairTool }                                   from './StairTool';

// ── Cleanup + serialization (Sprint AB) ──────────────────────────────────────
export { StairLevelCleanupHandler }  from './StairLevelCleanupHandler';
export { StairSnapshotSerializer }   from './StairSnapshotSerializer';

// ── Export helpers (Sprint AB) ───────────────────────────────────────────────
export * from './StairIfcExporter';
export * from './StairScheduleExtractor';

// ── Technical drawing bridge (Sprint AB) ─────────────────────────────────────
export {
    StairSymbolTechnicalDrawingBridge,
    stairSymbolTechnicalDrawingBridge,
} from './StairSymbolTechnicalDrawingBridge';

// ── 2D stair path sub-package (Sprint AB) ────────────────────────────────────
export * from './stairPath/index';

// ── Handrails (Sprint T-6) ────────────────────────────────────────────────────
export { HandrailFragmentBuilder }    from './HandrailFragmentBuilder';
export { HandrailLevelCleanupHandler } from './HandrailLevelCleanupHandler';
export { serializeHandrailSnapshot, deserializeHandrailSnapshot } from './handrailSnapshotUtils';
export { HandrailTool }               from './HandrailTool';
