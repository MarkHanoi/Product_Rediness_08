/**
 * @pryzm/core-app-model — stores sub-barrel (Wave 10 T4 W10-A)
 */

export type { BeamData, BeamSupport, RiskLevel, BeamPlanCheck } from './BeamTypes.js';
export { BEAM_CONSTRAINTS } from './BeamTypes.js';
export { BeamStore } from './BeamStore.js';

export type {
    CeilingLayerFunction, CeilingLayer, CeilingVertex, CeilingDetectionMethod,
    CeilingBoundary, CeilingHoleSubType, CeilingHoleShape, CeilingHoleElement,
    CeilingPattern, CeilingFinishSpec, CeilingSlope, CeilingEdgeRef,
    CeilingFreeLineEdge, CeilingHostReferenceEdge, CeilingSketchEdge, CeilingSketchLoop,
    CeilingSketch, CeilingProperties, CeilingIfcData, CeilingMetadata,
    CeilingComputedMetrics, CeilingData, CeilingToolMode, CeilingToolState,
    CeilingCreatorCallbacks, CeilingTypeCategory, CeilingSystemType,
} from './CeilingTypes.js';

export {
    CEILING_SOFFIT_DEFAULT_COLOR, CEILING_PLAN_FILL_DEFAULT_COLOR,
    LAYER_FUNCTION_COLORS, getSoffitColor, getPlanFillColor, getHoleFrameColor, getLayerColor,
} from './CeilingColourSystem.js';

export type { BoundingBox2D as CeilingBoundingBox2D, PolygonValidationResult as CeilingPolygonValidationResult } from './CeilingPolygonUtils.js';
export {
    computeArea as computeCeilingArea, computePerimeter as computeCeilingPerimeter,
    computeCentroid as computeCeilingCentroid, computeBoundingBox as computeCeilingBoundingBox,
    isCCW as isCeilingCCW, ensureCCW as ensureCeilingCCW,
    isPointInPolygon as isCeilingPointInPolygon, isSimplePolygon, isHoleContainedInPolygon,
    validatePolygon as validateCeilingPolygon, calculateSnapPoint as calculateCeilingSnapPoint,
} from './CeilingPolygonUtils.js';

export { CeilingStore } from './CeilingStore.js';
export { CeilingSystemTypeStore, ceilingSystemTypeStore } from './CeilingSystemTypeStore.js';

export type {
    FloorLayerFunction, FloorLayer, FloorZoneType, FloorVertex, FloorDetectionMethod,
    FloorBoundary, FloorPattern, FloorFinishSpec, FloorSlope, FloorHoleSubType,
    FloorHoleShape, FloorServiceHole, FloorUnderfloorHeating, FloorIfcData,
    FloorProperties, FloorMetadata, FloorEdgeRef, FloorFreeLineEdge, FloorHostReferenceEdge,
    FloorSketchEdge, FloorSketchLoop, FloorSketch, FloorToolState, FloorTypeCategory,
    FloorSystemType, FloorData, FloorToolCallbacks,
    FinishSeatingInput, FinishSeating,
} from './FloorTypes.js';
// §A.21.D48 — finish-on-slab seating (value exports).
export { DEFAULT_FINISH_THICKNESS_M, resolveFinishSeating } from './FloorTypes.js';
// §FIX-FURNITURE-FFL-DEFAULT — Finished-Floor-Level offset resolver (value export).
export { resolveFflOffset } from './FloorTypes.js';
// §FIX-INTERIOR-FFL-SEATING — STRICT position-dependent FFL / CFL queries. These are
// what element SEATING must use: they return `null` for "no finish covers this spot"
// so the caller can fall back honestly to the structural datum instead of inheriting
// some other room's finish height.
export { resolveFflOffsetAt } from './FloorTypes.js';
export { resolveCflOffsetAt } from './CeilingTypes.js';

export {
    FLOOR_DEFAULTS, FLOOR_LAYER_COLORS, resolveFloorColor, resolveLayerColor,
    hexToRGB, hexToThreeColor, getPreviewStyle, getPlanFillStyle, floorColorCacheKey,
} from './FloorColourSystem.js';

export type { ValidationResult as FloorValidationResult, BoundingBox2D as FloorBoundingBox2D } from './FloorPolygonUtils.js';
export {
    computeSignedArea, computeArea as computeFloorArea, computePerimeter as computeFloorPerimeter,
    computeCentroid as computeFloorCentroid, computeBoundingBox as computeFloorBoundingBox,
    isCCW as isFloorCCW, ensureCCW as ensureFloorCCW,
    validatePolygon as validateFloorPolygon, isPointInPolygon as isFloorPointInPolygon,
    calculateSnapPoint as calculateFloorSnapPoint,
} from './FloorPolygonUtils.js';

export { FloorStore } from './FloorStore.js';
export { FloorSystemTypeStore, floorSystemTypeStore } from './FloorSystemTypeStore.js';

// §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — THE floor-finish creation chokepoint.
// One store for the architect's choice + one resolver for the concrete record, read by
// BOTH the 3D FloorTool and the plan FloorPlanToolHandler (C11 §3 — parity by construction).
export type {
    FloorToolConfig, ResolvedFloorFinish, FloorSystemTypeLookup,
} from './FloorToolConfigStore.js';
export {
    DEFAULT_FLOOR_TOOL_CONFIG,
    DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
    DEFAULT_FLOOR_FINISH_THICKNESS_M,
    getFloorToolConfig, setFloorToolConfig, resetFloorToolConfig,
    resolveFloorFinish,
} from './FloorToolConfigStore.js';

export type {
    HandrailRailLayer, HandrailData, HandrailFragment,
} from './HandrailTypes.js';
export type { HandrailFillType, HandrailRailProfile, HandrailBalusterShape } from './HandrailTypes.js';
export { HandrailStore } from './HandrailStore.js';
export type { HandrailTypeDefinition } from './HandrailTypeStore.js';
export { HandrailTypeStore, handrailTypeStore } from './HandrailTypeStore.js';
// §L-1102 / §L-1037 — the ONE handrail persistence pair. Both ProjectSerializer
// copies call `serializeHandrailRecord`; both ProjectLoader copies call
// `buildHandrailCreatePayload`. Do not hand-assemble either side again.
export { HANDRAIL_TRANSIENT_FIELDS, serializeHandrailRecord, buildHandrailCreatePayload } from './handrailPersistence.js';
export type { SerializedHandrail, HandrailCreatePayload } from './handrailPersistence.js';

// §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — the curtain-wall type catalogue,
// the same shape as the handrail one above. See the store's header for why it
// lives here rather than in `@pryzm/types-builtin`, which carries a DROP verdict.
export type { CurtainWallTypeDefinition } from './CurtainWallTypeStore.js';
export {
    CurtainWallTypeStore,
    curtainWallTypeStore,
    resolveCurtainWallTypeFields,
    resolveCurtainWallTypePanelFields,
} from './CurtainWallTypeStore.js';

export type { OpeningData } from './OpeningTypes.js';
export { OpeningStore } from './OpeningStore.js';

export type {
    RoomBoundingLinePlacement, RoomBoundingLineProperties, RoomBoundingLineMetadata,
    RoomBoundingLineData, SerializedRoomBoundingLine,
    RoomBoundingLineEventType, RoomBoundingLineEventListener,
} from './RoomBoundingLineTypes.js';
export { RoomBoundingLineStore, roomBoundingLineStore } from './RoomBoundingLineStore.js';

export { GridStore } from './GridStore.js';

// Sprint H P9 (2026-05-10) — handrail snapshot utilities
export { serializeHandrailSnapshot, deserializeHandrailSnapshot } from './HandrailSnapshotUtils.js';

// ── Sprint H P9.2 (2026-05-10) — Domain element stores/types ────────────────

// ── §TOMBSTONE-HOSTED-STORE-FORK (2026-08-12) ───────────────────────────────
//
// DELETED HERE: `DoorTypes` · `DoorStore`/`doorStore` · `DoorSystemTypeStore`/
// `doorSystemTypeStore`, and the four mirror-image window entries.
//
// They were STALE FORKS of the live geometry-package stores, not a second layer
// of the model. Each was a byte-for-byte-then-diverged copy that stopped tracking
// its original: the door fork lacked `replace()`, `getIdsByWallId()` and the
// §FIX-HOSTWALL-DOOR-INDEX reverse index; the window schema fork lacked
// `glazingThickness` / `rebateDepth` (§FEAT-WINDOW-PLAN-SYMBOL-SOUND, L-254); the
// system-type forks lacked the `dimensions` block.
//
// THE LIVE OWNERS — import from these, and only these:
//   `@pryzm/geometry-door`   → DoorStore · doorStore · DoorSystemTypeStore ·
//                              doorSystemTypeStore · DoorOpening(Schema) · …
//   `@pryzm/geometry-window` → the mirror set.
// Every real consumer already did: commands (`@pryzm/command-registry`), builders,
// BOTH ProjectSerializer/ProjectLoader pairs, `ScheduleExtractor` (in THIS package,
// at schedules/ScheduleExtractor.ts:19-20), the property panel and the AI host.
// These eight exports had ZERO importers anywhere in the repo — the fork was
// reachable only through this barrel, and nothing reached. Proven by deletion:
// `tsc -p packages/core-app-model` reports the same 447 pre-existing errors before
// and after, and not one of them names a deleted symbol.
//
// WHY THEY COULD NOT STAY. Two live singletons answered for one kind, so C70
// A-INV-1 ("one kind, one store") was structurally false: after real command
// seeding the geometry stores held the doors and windows while these held nothing,
// and any reader that picked this handle saw an empty model and could not tell that
// from "this project has no doors" (§CONTEXT-DATA-HONESTY — failure and empty are
// the same value). Worse, `ProjectScopeRegistry` is keyed by `scopeName` and
// `register()` REPLACES silently: both copies registered `'doorStore'`, so which one
// `ClearProjectCommand.clearAll()` actually cleared was decided by module-evaluation
// order. Geometry happened to evaluate last. A reordered barrel or a bundler
// decision flips that, and then a project switch clears the empty fork while the
// real doors survive into the next project — the cross-project leak the registry
// exists to prevent. Measured by gates/check-authoritative-state.ts arm S3 and,
// independently, by ga-gate/check-declared-project-scopes.ts arm D7.
//
// NOT re-pointed to the geometry singletons (the other candidate fix): this package
// is a DEPENDENCY of `@pryzm/geometry-door`/`-window`, so a re-export here would
// close a package cycle. The dependency runs core-app-model → geometry, never back.
// ────────────────────────────────────────────────────────────────────────────

// Columns
export * from './ColumnTypes.js';
// ── §TOMBSTONE-COLUMN-STORE-FORK (2026-08-14, gap register PR-13) ───────────
//
// DELETED HERE: `ColumnStore` (was `./ColumnStore.ts`).
//
// The third and last of the PR-13 store forks — Door and Window fell 2026-08-12
// (§TOMBSTONE-HOSTED-STORE-FORK above, `f718d768`). Same disease, same proof:
// a separately-declared near-twin that had stopped tracking its original. This
// copy had `validateColumnData` (Zod, §COLUMN-AUDIT-2026 §W4) STRIPPED to a
// `/* validation deferred to command layer */` comment on both write paths,
// while its doc header still CLAIMED "All write-path entries are validated via
// validateColumnData" — a store whose contract comments lie about its body.
//
// THE LIVE OWNER — import from this, and only this:
//   `@pryzm/geometry-column` → ColumnStore (validating copy). Every real
// consumer already did: initBuilders (the shipping instantiation), BOTH
// ProjectSerializer pairs, ai-host AIReadModel, file-format IFC readers, the
// rac-conformance certification world. This export had ZERO importers anywhere
// in the repo — one authority, proven by deletion (root tsc unchanged).
//
// `ColumnTypes` (the ColumnData TYPE, above) deliberately STAYS: geometry-slab's
// SlabColumnCoupling consumes it from here and cannot reach geometry-column
// without closing a package cycle (geometry-column → geometry-slab). A shared
// type is not a rival store; the STORE is what PR-13 forbids duplicating.
// ────────────────────────────────────────────────────────────────────────────

// Roofs
export * from './RoofTypes.js';
export * from './RoofDataSchema.js';
export * from './roofSnapshotUtils.js';
export { RoofStore } from './RoofStore.js';

// Stairs
export * from './StairRailingTypes.js';
export * from './StairLandingTypes.js';
export * from './StairTypes.js';
export * from './StairFootprintUtils.js';
export * from './StairTypeDefinitions.js';
export { StairTypeStore } from './StairTypeStore.js';
export { StairStore } from './StairStore.js';

// Handrail snapshots
export * from './handrailSnapshotUtils2.js';

// Furniture
export * from './AIElementConfig.js';
export * from './WardrobeCabinetTypes.js';
export * from './KitchenTypes.js';
export * from './WardrobeTypes.js';
export * from './FurnitureTypes.js';
export * from './AIElementValidator.js';
export { FurnitureStore } from './FurnitureStore.js';

// Lighting
export * from './LightingTypes.js';
export { LightingStore } from './LightingStore.js';

// Plumbing
export * from './BathroomAccessoryGeometry.js';
export * from './ShowerGeometry.js';
export * from './ToiletGeometry.js';
export * from './PlumbingTypes.js';
export { PlumbingStore } from './PlumbingStore.js';
