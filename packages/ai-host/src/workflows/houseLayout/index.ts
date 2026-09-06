// Casa Unifamiliar — houseLayout workflow public barrel.
//
// The pure, testable ai-host core for multi-storey single-family-house generation
// (SPEC-CASA-UNIFAMILIAR-TYPOLOGY; tracker A.21.b + A.21.c + part of A.21.d). The
// editor-wiring follow-up (A.21.e–g) consumes `generateHouseLayout`'s
// `HouseLayoutResult` to create levels, fan commands out per storey, place stairs,
// and punch slab voids.

export { generateHouseLayout, generateHouseLayoutOptions } from './houseOrchestrator.js';
export type { HouseLayoutOptions } from './houseOrchestrator.js';
export { allocateProgramToStoreys, storeyAcousticProfiles, storeyAcousticPreference } from './storeyAllocation.js';
export { enrichStoreyProgramToPlate, programmeHeadroom } from './houseProgramFloor.js';
export type { EnrichStoreyOptions, ProgrammeHeadroom } from './houseProgramFloor.js';
export { reserveStairCore, reserveStairCoreShaped, splitRisersForShape } from './stairCore.js';
export type { StairCoreShaped } from './stairCore.js';
// §CI-1-BANNER (SPEC-49 §4 CI-1; founder 2026-08-13) — the per-storey circulation
// verdict + the blocking banner naming the sealed rooms. `HouseLayoutResult.circulation`
// carries the report; these are exported so the editor surface can render it and so a
// consumer can judge a single storey it holds outside a full house result.
// §BUILT-PLAN-REACH — `builtPlanReach` is the L2 home of the reachability invariant that
// SPEC-49 §5 flags as existing ONLY at L7, where the generator cannot call it.
export {
    buildHouseCirculationReport, judgeStoreyCirculation, builtPlanReach,
} from './circulationBanner.js';
export type {
    HouseCirculationReport, HouseCirculationBanner, StoreyCirculationVerdict,
    StoreyCirculationInput, StoreyCirculationStatus, NotMeasuredReason, BannerSeverity,
    BuiltPlanReach,
} from './circulationBanner.js';
export { validateHouseStorey, houseStoreyBand } from './houseEnvelope.js';
export type { HouseStoreyEnvelopeInput, HouseStoreyBand } from './houseEnvelope.js';
export {
    roofBaseElevationM,
    roofBaseOffsetM,
    isDoorWithinWallSpan,
    clampDoorToWallSpan,
    wallVerticalExtents,
    wallExtentForLevel,
    DOOR_END_CLEAR_M,
    MIN_DOOR_WIDTH_M,
} from './houseVertical.js';
export type { ClampedDoorSpan, WallVerticalExtent } from './houseVertical.js';
// §GROUND-WELD (A.21.D39) — weld ground interior partitions onto the pre-drawn shell
// so the GROUND floor closes every room like the upper floors do.
export { weldPartitionsToShell, clampPartitionsInsideShell } from './weldPartitionsToShell.js';
export type { WeldWall, WeldOptions, XZ as WeldXZ } from './weldPartitionsToShell.js';
// §CONTAIN-CHECK (2026-06-16) — PURE diagnostics: report partition endpoints off the shell
// + windows overflowing a corner. Observability counterpart to the clamp/cap FIXERS.
export { checkShellContainment, checkWindowCornerOverflow } from './containmentChecks.js';
export type {
    ContainWall, ShellViolation, ShellContainmentReport,
    CheckWindow, HostSegment, WindowOverflowViolation, WindowOverflowReport,
} from './containmentChecks.js';
// §PROJECT-NORTH (ADR-0070 Model B) — RIGID-TRANSFORM-LAST weld: de-rotate + rectify +
// weld in the axis-aligned Project-North frame, then rotate the welded assembly to world.
export {
    deriveProjectNorthFrame,
    rectifyShellRing,
    projectNorthWeld,
    projectNorthWeldBoundary,
    projectNorthWeldSet,
} from './projectNorthWeld.js';
export type { ProjectNorthFrame, ProjectNorthWeldResult } from './projectNorthWeld.js';
// §STAIR-CONTAIN (2026-06-09) — pure full-footprint inward-containment for the house stair.
export { computeInwardContainmentOffset, allCornersInside, solveStairContainmentWorld } from './stairContainment.js';
export type { XZ2 as StairContainXZ } from './stairContainment.js';
// §STAIR-CONTAIN-UPSTREAM (2026-06-09) — the SHARED world stair-footprint builder used
// by BOTH the orchestrator (keep-out + containment) and the editor executor (dispatch).
export { computeStairWorldFootprint, resolveTotalRisers } from './stairWorldFootprint.js';
export type { StairWorldFootprintInput, StairWorldFootprint, FlightGeom as StairFlightGeom } from './stairWorldFootprint.js';
// DOC-AUTO DS3 (2026-06-09) — pure building-exterior elevation marks from a footprint.
export { computeBuildingElevationMarks } from './buildingElevations.js';
export type { BuildingElevationMark, BuildingElevationOptions } from './buildingElevations.js';
// DOC-AUTO DS4 (2026-06-09) — pure per-room crop region + interior elevation marks.
export { roomCropRegion, computeRoomInteriorElevationMarks } from './roomDocumentation.js';
export type { RoomCropRegion, RoomElevationMark } from './roomDocumentation.js';
// DOC-AUTO DS6 (2026-06-09) — pure documentation-set orchestration (numbered sheet plan).
export { planDocumentationSet } from './documentationSet.js';
export type { DocSetInput, DocLevelInput, DocRoomInput, DocViewKind, DocViewSpec, DocSheetPlan } from './documentationSet.js';
export type {
    HouseLayoutResult,
    ScoredHouseLayoutOption,
    PerStoreyProgramOverride,
    StoreyProgram,
    StoreyPlate,
    StoreyRole,
    StairCore,
    StairShape,
    StairFlightPlan,
    SlabVoid,
    RoofDescriptor,
    RoofKind,
    Pt,
} from './types.js';
