/**
 * @pryzm/geometry-stair — public API barrel
 *
 * Sprint H P9 (2026-05-10): initial extraction — types, stores, validation.
 * Sprint AB  (2026-05-12): full extraction — builders, tool, stairPath.
 */

// ── Types / stores (Sprint H P9) ─────────────────────────────────────────────
export * from './StairRailingTypes';
// §FIX-STAIR-RAILING-TYPE-PICKER — the one projection from the named railing
// catalogue (`handrailTypeStore`) onto a stair railing's construction fields.
export * from './StairRailingTypeMapping';
export * from './StairLandingTypes';
export * from './StairTypeDefinitions';
export * from './StairTypes';
export * from './StairFootprintUtils';

// §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) — the two stair-authoring chokepoints.
// Every creation path (plan tool, stair-path tool, 3D sketch, batch, AI) resolves
// its vertical span and its shape/width/type config through THESE, and nowhere else.
export * from './StairVerticalSpanResolver';
// §STAIR-LEVEL-SPAN-CHANGE (L-1533) — the same span arithmetic, applied AFTER
// creation: changing a stair's base/top level re-solves the riser distribution
// rather than writing two id fields (see the module header).
export * from './StairLevelSpanChange';
export * from './StairToolConfigStore';
// §FIX-STAIR-PARAM-NO-REGEN (L-215) — pure derived-geometry reconciler.
export {
    deriveStairGeometry,
    stairHasAuthoredFlightGeometry,
    stairDerivedGeometryDiffers,
    // §FIX-STAIR-AUTHORED-PARAM-DEAF — path-authored (polyline) stairs reconcile
    // their landing depth + per-flight tread depth from the primitives too.
    reconcilePathAuthoredStairLayout,
    stairAuthoredLayoutDiffers,
} from './StairParameterReconciler';
export type { StairDerivedGeometry } from './StairParameterReconciler';
// §STAIR-SECOND-RUN-DIRECTION (L-10270) — the founder's "modify the direction of
// the second run afterwards". Pure derivation + mirror; the ONE gate both the
// property panel and UpdateStairParametersCommand consult.
export * from './StairSecondRunDirection';
export * from './StairTypeStore';
export * from './StairValidationAuthority';
export * from './StairGeometryLimits';
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

// ── Handrails — MOVED OUT (C95 §14.2, ISSUE-LOG L-988) ───────────────────────
//
// The handrail sources that used to live here now live in their own package,
// `@pryzm/geometry-handrail`. The move was decided by measurement in BOTH
// directions: handrail→stair imports were ZERO, and the only stair→handrail
// references were the five re-export lines that stood right here. The
// co-location was accidental filing, not design.
//
// ⛔ These re-exports are NOT kept as a compatibility shim, deliberately. Only
// TWO call sites in the repository imported a handrail symbol through this
// barrel — `apps/editor/src/engine/initBuilders.ts` and `initTools.ts` — and
// both were repointed in the same commit. A shim for two known call sites would
// leave two live paths to one symbol (C84 EI-9) to save two import lines.
//
// `serializeHandrailSnapshot` / `deserializeHandrailSnapshot` are NOT re-exported
// here either: the copy in this package was one of the THREE byte-identical
// implementations recorded as L-987, and every real consumer already imports
// them from `@pryzm/core-app-model`. That copy is DELETED, not relocated.
//
// Import handrail symbols from `@pryzm/geometry-handrail`.
