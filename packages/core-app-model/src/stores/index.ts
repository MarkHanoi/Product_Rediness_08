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
} from './FloorTypes.js';

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

export type {
    HandrailRailLayer, HandrailData, HandrailFragment,
} from './HandrailTypes.js';
export type { HandrailFillType, HandrailRailProfile, HandrailBalusterShape } from './HandrailTypes.js';
export { HandrailStore } from './HandrailStore.js';
export type { HandrailTypeDefinition } from './HandrailTypeStore.js';
export { HandrailTypeStore, handrailTypeStore } from './HandrailTypeStore.js';

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

// Doors
export * from './DoorTypes.js';
export { DoorStore, doorStore } from './DoorStore.js';
export { DoorSystemTypeStore, doorSystemTypeStore } from './DoorSystemTypeStore.js';

// Windows
export * from './WindowTypes.js';
export { WindowStore, windowStore } from './WindowStore.js';
export { WindowSystemTypeStore, windowSystemTypeStore } from './WindowSystemTypeStore.js';

// Columns
export * from './ColumnTypes.js';
export { ColumnStore } from './ColumnStore.js';

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
