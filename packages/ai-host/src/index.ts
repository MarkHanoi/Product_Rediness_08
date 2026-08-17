// @pryzm/ai-host — public barrel.
//
// IMPORTANT: this barrel must NOT re-export anything from
// `./AiHost.impl.js`. Doing so would fold the impl chunk back into
// every caller's bundle and break the [strategic ADR-014] lazy
// contract. The static check in `scripts/check-ai-host-lazy.mjs`
// enforces this rule at CI time.
//
// S49 promotion: the L7.5 first-class plane (`AiPlane`, `AiBus`,
// `WorkflowRegistry`) is exported here so callers can construct/test
// it directly. The plane is PURE in the same sense as the lazy host —
// no DOM/THREE/React, only `@opentelemetry/api` + `@pryzm/ai-cost`
// types — but `AiHost.impl.js` remains the only file that wires the
// plane into the lazy `getAiHost()` singleton.

export { getAiHost, isAiHostLoaded } from './AiHost.js';
export {
  hashWorkflowRequest,
  AiResponseCacheFetchAdapter,
  MockAiResponseCache,
} from './AiResponseCache.js';
export {
  withWorkflowSpan,
  withWorkflowSpanSync,
} from './tracing.js';
// ADR-0313 — zero-token chat command resolver (tier 0/1).
export {
  resolveUtterance,
  resolveUtteranceIntent,
  withChatDispatchSpan,
  applySemanticIntent,
  findLevel,
  lengthToMeters,
} from './intents/ZeroTokenResolver.js';
// §PLAN (RAC U6) — compound sentences ("duplicate level 0 to level 1, then
// furnish it"): a splitter over the SAME single-intent ladder, executed by the
// SAME applySemanticIntent. No second resolver, no second dispatcher.
export {
  parsePlanIntent,
  resolveCompoundUtterance,
  splitPlanClauses,
} from './intents/SemanticPlan.js';
export type { PlanContext, PlanParse } from './intents/SemanticPlan.js';
// §PLANNER (RAC U10) — the LAST rung. Free-form language in; the SAME validated
// SemanticIntent / execute-plan structures out, run by the SAME
// applySemanticIntent. The vocabulary is generated from the capability registry
// and the model's output is validated against it before anything runs.
export {
  buildPlannerPrompt,
  buildPlannerVocabulary,
  buildPlannerFacts,
  capabilityFieldShapes,
  planUtterance,
  resetPlannerShapeCache,
  validatePlannerOutput,
} from './intents/LlmPlanner.js';
export type {
  CapabilityFieldShapes,
  PlannerDeps,
  PlannerOutcome,
  PlannerPrompt,
  PlannerShape,
  PlannerValidation,
} from './intents/LlmPlanner.js';
// ADR-0313 §NL — local natural-language layer (semantics only; zero tokens).
export {
  resolveNaturalLanguage,
  noteResolution,
  CONFIDENCE_THRESHOLDS,
} from './intents/LocalNaturalLanguageResolver.js';
export type {
  ConversationContext,
  NaturalLanguageContext,
  NaturalLanguageResolution,
} from './intents/LocalNaturalLanguageResolver.js';
// ADR-0313 §Capability-driven resolution — the capability registry is the ONE
// place the chat's idea of the editor's abilities lives, and the coverage gate
// (`tools/ga-gate/check-chat-capability-coverage.ts`) proves it against the real
// bus registrations.
export {
  allChatCapabilities,
  resolveChatCapability,
  capabilitiesForElement,
  capabilityAppliesTo,
  capabilityBusCommands,
  chatUnavailableReason,
  normalizeElementKind,
  CHAT_UNAVAILABLE,
  PROBE_ELEMENT_KINDS,
  GENERIC_PARAMETER_TARGETS,
} from './capabilities/ChatCapabilityRegistry.js';
export type {
  ChatCapability,
  ChatCapabilityParameter,
  CapabilityCommandProof,
  CapabilityScope,
  CapabilityValueSource,
} from './capabilities/ChatCapabilityRegistry.js';
export {
  capabilityGapRefusal,
  describeCapabilitiesFor,
  descriptiveReportReason,
  nonImperativeReason,
  unconnectedTopicCommands,
  unconnectedTopicLabels,
} from './capabilities/CapabilityRefusal.js';
export type { CapabilityGapRefusal, ChatResolutionState } from './capabilities/CapabilityRefusal.js';
export { parseWallTypeIntent } from './intents/ZeroTokenResolver.js';
// L-911 — the apartment default the chat QUOTES, exported so the editor can
// pin it against the DEFAULT_PROGRAM the engine actually uses.
export { APARTMENT_STATED_DEFAULT } from './intents/ZeroTokenResolver.js';
// ADR-0315 U3 — the canonical scope representation + the injected resolver's
// result contract (F1/F2).
export { isScopeError } from './intents/ScopeDescriptor.js';
export type {
  ScopeDescriptor,
  ScopeResolution,
  ScopeError,
  ScopeResult,
  ScopeSkip,
  // RAC U8.1 — FILTER scopes (predicate scopes) + the honesty payload the
  // editor-side resolver fills in so refusals can quote the real extremum.
  BaseScopeDescriptor,
  FilterScopeDescriptor,
  ElementFilter,
  PropertyFilter,
  TypeFilter,
  FilterProperty,
  FilterOp,
  FilterUnit,
  FilterStat,
  IntentScope,
  IntentSpatialScope,
  IntentFilterScope,
} from './intents/ScopeDescriptor.js';
// RAC U8 — the filter grammar's COPY, so the editor-side resolver speaks the
// same words the pure layer does (one vocabulary, never two).
export {
  describeFilter,
  describeFilters,
  filterRefusalCopy,
  formatFilterValue,
  parseFilterClauses,
  FILTER_PROPERTY_NOUN,
  FILTER_SUPERLATIVE,
} from './intents/FilterScope.js';
export type {
  ResolverContext,
  ResolverSelection,
  ResolverLevel,
  ResolverWallSystemType,
  BusCommandRef,
  ZeroTokenResolution,
  ZeroTokenLocalAction,
  SemanticIntent,
  SemanticApplication,
  WallPoint2,
  // §GATE-VIS-INTENT (VIS-CLASS) — the visibility chat route: the snapshot the
  // bridge injects for the read-only question, and the dispatch payload the
  // 'applyVisibilityIntent' local action carries.
  VisibilityIntentSnapshot,
  VisibilityLocalDispatch,
  VisibilityIntentBusCommand,
  // §PLAN (RAC U6) — the plan metadata the bridge's Confirm card and its
  // step-by-step dispatcher read.
  PlanReport,
  PlanStepReport,
} from './intents/ZeroTokenResolver.js';
// §FEAT-CHAT-TOOL-ACTIVATION (L-906) — the 'activateTool' local action's
// payload, and the pure parse/apply pair (exported for the editor bridge's
// specs; the bridge itself reads `placement` off the resolution union).
export { parsePlacementRef, applyActivatePlacement } from './intents/PlacementActivation.js';
export type { PlacementLocalDispatch } from './intents/PlacementActivation.js';
export { AiBus } from './AiBus.js';
export type { AiBusEvent, AiBusEventKind, AiBusListener, AiBusOptions } from './AiBus.js';
export { WorkflowRegistry } from './WorkflowRegistry.js';
export { AiPlane } from './AiPlane.js';
export {
  MockAnthropicRelay,
  DEFAULT_CRITIQUE_FIXTURE,
  loadRelay,
} from './AnthropicRelay.js';
export {
  createCfWorkerRelay,
  createResilientRelay,
  modelClassOf,
  DEFAULT_RELAY_ENDPOINT,
} from './CfWorkerRelay.js';
export type {
  RelayPorter,
  RelayRequest,
  RelayResponse,
} from './AnthropicRelay.js';
export {
  planCritiqueDescriptor,
  createPlanCritiqueImpl,
  buildCritiquePrompt,
  parseCritiqueItems,
  PLAN_CRITIQUE_MODEL,
  PLAN_CRITIQUE_MAX_TOKENS,
  PLAN_CRITIQUE_SYSTEM_PROMPT,
} from './workflows/PlanCritique.js';
export type {
  PlanCritiqueDeps,
  PlanCritiqueInput,
  PlanCritiqueWorkflowResult,
} from './workflows/PlanCritique.js';
export {
  PLAN_CRITIQUE_COST_USD_ESTIMATE,
  PLAN_CRITIQUE_MAX_ITEMS,
} from './workflows/PlanCritiqueTypes.js';
export type {
  CritiqueItem,
  CritiqueLocationRef,
  CritiqueResult,
  CritiqueSeverity,
  PlanViewSnapshot,
  SnapshotElement,
  VisibilityState,
} from './workflows/PlanCritiqueTypes.js';
export type {
  AiHost,
  AiHostOptions,
  AiWorkflowKind,
  AiWorkflowRequest,
  AiPendingAction,
  AiPendingActionPreview,
  AiPendingActionStatus,
  AiApprovalQueueLike,
  CommandPayloadRef,
  WorkflowDescriptor,
  WorkflowExecutionContext,
  WorkflowRunResult,
  WorkflowImpl,
  WorkflowRegistryEntry,
  BudgetResolver,
  NotifyAdmin,
  AiUsageInsertSink,
  AiPlaneDeps,
  AiSubmitOptions,
  AiCacheKey,
  AiResponseCacheLike,
} from './types.js';

// S52 — Generate3Options + VoiceCommand (lazy entry; impl loaded
// via dynamic import to preserve K3-A).
export {
  GENERATE_3_OPTIONS_COST_USD_ESTIMATE,
  GENERATE_3_OPTIONS_HARD_CEILING_USD,
  OPTION_STYLES,
  OPTION_STYLE_LABELS,
  PER_OPTION_BUDGET_USD,
} from './workflows/Generate3OptionsTypes.js';
export type {
  Generate3Result,
  GenerateOption,
  OptionStyle,
  PlanRegion,
} from './workflows/Generate3OptionsTypes.js';
export {
  buildOptionPrompt,
  createGenerate3OptionsImpl,
  generate3OptionsDescriptor,
  GENERATE_3_OPTIONS_MAX_TOKENS,
  GENERATE_3_OPTIONS_MODEL,
  GENERATE_3_OPTIONS_SYSTEM_PROMPT,
  parseOption,
  parseOptionCommands,
} from './workflows/Generate3Options.js';
export type {
  CostMeterRefundLike,
  Generate3OptionsDeps,
  Generate3OptionsInput,
  Generate3OptionsWorkflowResult,
} from './workflows/Generate3Options.js';
export {
  _resetVoiceCommandLoaderForTesting,
  getVoiceCommand,
  loadTranscriber,
  MockVoiceTranscriber,
  voiceCommandDescriptor,
} from './workflows/VoiceCommand.js';
export type {
  TranscribeRequest,
  TranscribeResponse,
  VoiceTranscriberPorter,
} from './workflows/VoiceCommand.js';

// ── #51 Apartment Layout Generator (SPEC-APARTMENT-LAYOUT-GENERATOR) ───────────
// Read-only generative workflow: shell → N ranked/validated/scored layout
// options → AIStore + modal; commit via apartment.layout-execute (A6).
export {
  apartmentLayoutDescriptor,
  createApartmentLayoutImpl,
  APARTMENT_LAYOUT_COST_USD_ESTIMATE,
} from './workflows/apartmentLayout/workflow.js';
// D-α-3 P1 — pure parameter-impact resolver consumed by the L3
// `ApartmentParameterPropagator` (composeRuntime wires it as the
// `ImpactResolver`). Pure data; no I/O.
export { recomputeImpact } from './workflows/apartmentLayout/solver/recomputeImpact.js';
export type {
  ApartmentParameters as RecomputeImpactApartmentParameters,
  RoomParameters as RecomputeImpactRoomParameters,
  ParameterChange,
  ImpactRegion,
} from './workflows/apartmentLayout/solver/recomputeImpact.js';
export type {
  ApartmentLayoutDeps,
  ApartmentLayoutWorkflowResult,
} from './workflows/apartmentLayout/workflow.js';
export {
  registerApartmentLayoutWorkflow,
  createApartmentLayoutRegistration,
  APARTMENT_LAYOUT_WORKFLOW_ID,
} from './workflows/apartmentLayout/register.js';
export type {
  WorkflowRegistrarLike,
  ApartmentLayoutRegisterDeps,
  PlaneLike,
  ApartmentLayoutRegistrationDeps,
  ApartmentLayoutRegistrationResult,
} from './workflows/apartmentLayout/register.js';
export {
  generateLayoutOptions,
  buildLayoutPrompt,
  parseLayoutOptions,
  parseLayoutOption,
  LAYOUT_MODEL,
  LAYOUT_MAX_TOKENS,
  LAYOUT_SYSTEM_PROMPT,
} from './workflows/apartmentLayout/generate.js';
export type {
  GenerateLayoutInput,
  GenerateLayoutResult,
} from './workflows/apartmentLayout/generate.js';
export { validateLayout } from './workflows/apartmentLayout/validate.js';
export { scoreLayout } from './workflows/apartmentLayout/score.js';
// A.25.1 — Living Design Parameters: pure design-sliders → ScoringWeights mapping.
// A.25.3 — + the non-scoring engine-tuning mapping (adjacency / accessibility /
// climate / space).
export {
  designParamsToScoringWeights,
  designParamsToEngineTuning,
  DEFAULT_DESIGN_PARAMS,
} from './workflows/apartmentLayout/designParamsToScoringWeights.js';
export type { DesignParams } from './workflows/apartmentLayout/designParamsToScoringWeights.js';
export { generateProceduralLayout } from './workflows/apartmentLayout/proceduralLayout.js';
export {
  buildLayoutPlan,
  buildLayoutCommands,
  MIN_WALL_LENGTH_M,
  DEFAULT_WALL_HEIGHT_M,
  DEFAULT_WALL_THICKNESS_M,
  DEFAULT_DOOR_HEIGHT_M,
  DEFAULT_DOOR_WIDTH_M,
} from './workflows/apartmentLayout/executePlan.js';
export type {
  LayoutPlan,
  LayoutExecuteOptions,
  WallCreateSpec,
  DoorPlanItem,
  Vec3m,
  LayoutCommand,
  LayoutCommandSet,
  IdMinter,
  IdPrefix,
} from './workflows/apartmentLayout/executePlan.js';
export {
  analyseShell,
  wallsToPolygon,
  polygonAreaM2,
  classifyPerimeter,
} from './workflows/apartmentLayout/shellAnalysis.js';
export { createStoreShellReader } from './workflows/apartmentLayout/shellReader.js';
// A.21.D29 #3 — main-entrance door resolver for the generated house (pure).
export {
  resolveEntranceDoor,
  ENTRANCE_DOOR_WIDTH_M,
  ENTRANCE_DOOR_HEIGHT_M,
} from './workflows/apartmentLayout/entranceDoor/entranceDoor.js';
export type { EntranceDoorDispatch } from './workflows/apartmentLayout/entranceDoor/entranceDoor.js';
export type {
  ShellReaderDeps,
  ShellWallRecord,
  Compass,
} from './workflows/apartmentLayout/shellReader.js';
export type {
  ShellAnalysis,
  ShellWallInput,
  ShellAnalysisOptions,
  ShellFaceInfo,
  FaceClass,
  PerimeterClass,
  PerimeterClassification,
} from './workflows/apartmentLayout/shellAnalysis.js';
export type {
  ApartmentGenerateLayoutPayload,
  ApartmentProgram,
  ApartmentConstraints,
  ScoringWeights,
  EngineTuning,
  LayoutOption,
  LayoutRoom,
  LayoutWall,
  LayoutDoor,
  ScoredLayoutOption,
  LayoutScore,
  LayoutScoreBreakdown,
  ValidationResult,
  RoomType,
  Vec2mm,
} from './workflows/apartmentLayout/types.js';
export { DEFAULT_LAYOUT_FIXTURE } from './AnthropicRelay.js';

// ── A.21 Casa Unifamiliar — multi-storey house layout (SPEC-CASA-UNIFAMILIAR) ──
// Pure, deterministic L2 storey orchestrator. Grows the single-plate apartment
// engine into a stacked house: per-storey D-TGL layouts + a shared stair core +
// per-slab stairwell voids + a roof cap. Consumed by the editor's
// HouseLayoutExecutor (A.21.d–g) exactly as `buildLayoutCommands` is.
export {
  generateHouseLayout,
  generateHouseLayoutOptions,
  allocateProgramToStoreys,
  reserveStairCore,
  reserveStairCoreShaped,
  splitRisersForShape,
  // §ROOF-CAP-ELEVATION / §DOOR-IN-WALL-SPAN / §WALL-SLAB-CONTINUITY (founder v45/v46 + D38)
  roofBaseElevationM,
  roofBaseOffsetM,
  isDoorWithinWallSpan,
  clampDoorToWallSpan,
  wallVerticalExtents,
  wallExtentForLevel,
  // §GROUND-WELD (A.21.D39) — weld ground interior partitions onto the pre-drawn shell.
  weldPartitionsToShell,
  // §SHELL-CONTAIN — clamp any partition endpoint outside the shell ring back onto the perimeter.
  clampPartitionsInsideShell,
  // §CONTAIN-CHECK — PURE diagnostics: report off-shell partition endpoints + window-corner overflow.
  checkShellContainment,
  checkWindowCornerOverflow,
  // §PROJECT-NORTH (ADR-0070 Model B) — RIGID-TRANSFORM-LAST weld in the axis-aligned frame.
  deriveProjectNorthFrame,
  rectifyShellRing,
  projectNorthWeld,
  projectNorthWeldBoundary,
  projectNorthWeldSet,
  // §STAIR-CONTAIN (2026-06-09) — pure full-footprint inward-containment for the house stair.
  computeInwardContainmentOffset,
  allCornersInside,
  // §STAIR-CONTAIN-UPSTREAM (2026-06-09) — shared world stair-footprint builder + the
  // single containment solver (orchestrator carves keep-out == executor's shipped footprint).
  solveStairContainmentWorld,
  computeStairWorldFootprint,
  resolveTotalRisers,
  // DOC-AUTO DS3 (2026-06-09) — pure building-exterior elevation marks from a footprint.
  computeBuildingElevationMarks,
  // DOC-AUTO DS4 (2026-06-09) — pure per-room crop region + interior elevation marks.
  roomCropRegion,
  computeRoomInteriorElevationMarks,
  // DOC-AUTO DS6 (2026-06-09) — pure documentation-set orchestration (numbered sheet plan).
  planDocumentationSet,
} from './workflows/houseLayout/index.js';
export type {
  WeldWall,
  WeldOptions,
  // §PROJECT-NORTH (ADR-0070 Model B).
  ProjectNorthFrame,
  ProjectNorthWeldResult,
  HouseLayoutOptions,
  HouseLayoutResult,
  ScoredHouseLayoutOption,
  PerStoreyProgramOverride,
  StoreyProgram,
  StoreyPlate,
  StoreyRole,
  StairCore,
  StairShape,
  StairFlightPlan,
  StairCoreShaped,
  SlabVoid,
  RoofDescriptor,
  RoofKind,
  ClampedDoorSpan,
  WallVerticalExtent,
  Pt as HousePt,
  // DOC-AUTO DS3/DS4/DS6 (2026-06-09).
  BuildingElevationMark,
  RoomCropRegion,
  RoomElevationMark,
  DocSetInput,
  DocLevelInput,
  DocRoomInput,
  DocViewKind,
  DocViewSpec,
  DocSheetPlan,
} from './workflows/houseLayout/index.js';

// ── Residential building (multi-family) — public surface ─────────────────────
// The L2 pure orchestrator for the multi-family typology (centred core + per-level
// public corridor + packed apartments, each laid out via the frozen D-TGL engine).
// Consumed by the editor's residential-building executor (apps/editor/src/ui/
// residential-building/) which builds the core (stair + lift), corridors + each
// apartment's walls/doors/windows via the command bus. ADDITIVE re-export mirroring
// the houseLayout barrel above (the editor cannot import an un-exported symbol).
export {
  orchestrateResidentialBuilding,
  computeGroundFloor,
  packApartments,
  partitionLevelPlate,
  runApartmentCellLayout,
  shellFromCell,
  RESI_APARTMENT_CONSTRAINTS,
  RESI_SCORING_WEIGHTS,
  RESI_LAYOUT_COUNT,
  // §RESI-CORE-REWORK — clearance-derived core sizing (the single source of truth the
  // orchestrator floors the core at; exposed for tests + future consumers).
  deriveCoreSizing,
  // §RESI-OPENING-IN-WALL — emit-stage clamp keeping an opening within its STORED (mitred) wall.
  clampOpeningToWall,
  // L-864 §RESI-UNIT-CONTAINMENT — one hierarchy UNIT per PLACED apartment. The partitioner
  // knows which rooms form an apartment; this carries that grouping to the executor so the
  // shipped model knows it too (C81 §8 — a hard precondition of the edit layer).
  planBuildingUnits,
  unitLetter,
  unitTypeForBedrooms,
} from './workflows/residentialBuilding/index.js';
export type {
  CoreSizing,
  CoreSizingInput,
  ResidentialBuildingOrchestratorInput,
  ResidentialBuildingResult,
  ResidentialBuildingOk,
  ResidentialBuildingRejected,
  ResidentialRigidTransform,
  GroundFloorDescriptor,
  FootprintEdge,
  BuildingLevel,
  PlacedApartment,
  PerLevelApartments,
  LevelRole,
  PlannedApartment,
  Typology as ResidentialTypology,
  ApartmentDemand,
  ApartmentCell,
  CellEdge,
  ApartmentCellLayoutInput,
  ApartmentCellLayoutResult,
  ClampedOpening,
  // L-864 §RESI-UNIT-CONTAINMENT
  PlannedUnit,
} from './workflows/residentialBuilding/index.js';

// ── Office building (4th typology) — circular floor-plate + tower orchestrator ──
// PURE L2 planners (zero THREE, zero DOM). Consumed by the editor's office-building
// trigger/controller (apps/editor/src/ui/office-building/) + the office typology pack.
export {
  generateOfficeFloorPlate,
  coreFractionForRise,
  riseZoneLabel,
  orchestrateOfficeBuilding,
  classifyOfficeFloor,
  maxFeasibleStoriesForRadius,
} from './workflows/officeBuilding/index.js';
export type {
  OfficeFloorPlateInput,
  OfficeFloorPlateResult,
  OfficeFloorPlateOk,
  OfficeFloorPlateRejected,
  OfficePlateAutoFit,
  OfficeZone,
  OfficeZoneKind,
  OfficeFloorAnalytics,
  WorkplaceCulture,
  DeskMode,
  OfficeBuildingOrchestratorInput,
  OfficeBuildingResult,
  OfficeBuildingOk,
  OfficeBuildingRejected,
  OfficeBuildingAnalytics,
  OfficeFloorDescriptor,
  OfficeFloorType,
} from './workflows/officeBuilding/index.js';

// ── Office Furnish — the MODULAR fit-out engine (SPEC §5/§6/§7/§8/§9 steps 7–8) ─────────────
// Command 2 (Furnish Office) composes reusable §5 modules (single/linear/bench workstations ·
// collaborative · meeting · executive · phone-booth · kitchen · breakout) and places them by an
// occupancy-driven (§8), circulation-clearance-respecting (§7) engine with a final egress validation
// (§9-8). The editor maps each PlacedItem to a CreateFurnitureCommand (P6). Pure: zero THREE, zero DOM.
export { estimateOccupancy } from './workflows/officeFurnish/index.js';
export type { OfficeModuleKind } from './workflows/officeFurnish/index.js';
export {
    // §5 module recipes.
    singleWorkstation, linearWorkstation, benchWorkstation,
    collaborativeBlock, meetingRoomBlock, executiveOffice,
    phoneBooth, kitchenBlock, breakoutBlock, moduleDesks,
    // §8 occupancy → module mix.
    planModuleMix,
    // §5/§7/§8 placement engine.
    planFloorFurnish,
    // §7 clearances + §9-8 validation.
    validateFurnish, CLEARANCES,
    // Module output helpers.
    itemsBBox, moduleDeskCount,
} from './workflows/officeFurnish/index.js';
export type {
    PlacedItem, PlacedModule, ModuleMaterial,
    ModuleMix,
    FurnishRoom, FurnishFloorInput, FurnishFloorPlan,
    FloorKeepouts, AnnulusKeepout, SpokeKeepout, ClearanceViolation,
    // Aliased: the office fit-out validation result. `FurnishValidation` (unqualified) is already
    // taken by the D-FLE per-room validator below, so the office engine's result exports as
    // `OfficeFurnishValidation` on the public barrel.
    FurnishValidation as OfficeFurnishValidation,
} from './workflows/officeFurnish/index.js';

// ── D-FLE Furniture Layout Engine — public surface ───────────────────────────
// The deterministic per-room furniture layout engine (SPEC-FURNITURE-LAYOUT-ENGINE).
// Pure: zero THREE, zero DOM. Consumed by the editor's furnish trigger
// (apps/editor/src/ui/furnish-layout/) which assembles FurnishRoomInput from
// the live room/wall/door/window stores and dispatches buildFurnishCommands()
// inside batchCoordinator.runBatch — same pattern as the apartment generator.
export { furnishRoom, furnishRoomCompound } from './workflows/furnishLayout/furnishRoom.js';
export type { FurnishOptions } from './workflows/furnishLayout/furnishRoom.js';
export { buildFurnishCommands } from './workflows/furnishLayout/buildFurnishCommands.js';
// A.21.D20 — kitchen / wardrobe I/L/U run planners (SPEC-KITCHEN-WARDROBE-APPLIANCES).
export { planKitchen, kitchenTrianglePoints, normaliseKitchenLayout } from './workflows/furnishLayout/kitchenLayout.js';
export type { KitchenLayout } from './workflows/furnishLayout/kitchenLayout.js';
export { planWardrobe, normaliseWardrobeLayout } from './workflows/furnishLayout/wardrobeLayout.js';
export type { WardrobeLayout } from './workflows/furnishLayout/wardrobeLayout.js';
export { archetypeFor } from './workflows/furnishLayout/archetypes.js';
export { validateFurnishedRoom } from './workflows/furnishLayout/validate.js';
export type { FurnishValidation } from './workflows/furnishLayout/validate.js';
export type {
  FurnitureKind,
  FurnishableOccupancy,
  Footprint,
  Anchor,
  FurnitureItemSpec,
  FurnitureArchetype,
  OpeningPose,
  RoomWallSeg,
  FurnishRoomInput,
  PlacedFurniture,
} from './workflows/furnishLayout/types.js';
export type {
  FurnishCommand,
  FurnishCommandSet,
} from './workflows/furnishLayout/buildFurnishCommands.js';

// ── D-LE Lighting Layout Engine — public surface ─────────────────────────────
// Per-room ceiling-fixture auto-placer (MVP: one fixture at the room centroid,
// kind chosen by occupancy + area). Pure: zero THREE, zero DOM. Consumed by
// the editor's lighting trigger which assembles `LightRoomInput` from the
// live room store and dispatches `lighting.create` inside one `runBatch` —
// same pattern as furniture (D-FLE). Auto-fires AFTER furnish completes so
// every room ends up lit when the apartment generator finishes.
export { lightRoom } from './workflows/lightingLayout/lightRoom.js';
// §FURNISH-DROP-SURFACING — typed furnish-stage provenance for lighting. The
// editor's chain wiring passes what it knows about furnish (completed /
// dropped-with-reason) and the resulting LightingCommandSet carries a
// basis stamp the UI must surface (C75 §1.2 / §1.4).
export { resolveLightingBasis } from './workflows/lightingLayout/lightingBasis.js';
export type {
  FurnishStageOutcome,
  LightingBasis,
  LightingBasisResolution,
} from './workflows/lightingLayout/lightingBasis.js';
export { archetypeForLighting, LIGHTING_ARCHETYPES } from './workflows/lightingLayout/archetypes.js';
export { buildLightingCommands } from './workflows/lightingLayout/buildLightingCommands.js';
export type {
  LightKind,
  LightableOccupancy,
  LightRoomInput,
  PlacedLight,
  LightingArchetype,
} from './workflows/lightingLayout/types.js';
export type {
  LightingCommand,
  LightingCommandSet,
  LightIdMinter,
} from './workflows/lightingLayout/buildLightingCommands.js';

// ── D-CE Ceiling Layout Engine — public surface ──────────────────────────────
// Per-room ceiling-slab auto-placer (MVP: one ceiling per ceilable room at
// level.elevation + 2.7 m, archetype-driven thickness + tint). Pure: zero
// THREE, zero DOM. Consumed by the editor's ceiling trigger which assembles
// `CeilingRoomInput` from the live room store and dispatches
// `ceiling.batch.create` inside one `runBatch` — same pattern as D-FLE / D-LE.
// Auto-fires AFTER the apartment generator finishes so every room ends up
// enclosed before furniture + lighting passes execute.
export { ceilingForRoom } from './workflows/ceilingLayout/ceilingForRoom.js';
export { archetypeForCeiling, CEILING_ARCHETYPES } from './workflows/ceilingLayout/archetypes.js';
export { buildCeilingCommands } from './workflows/ceilingLayout/buildCeilingCommands.js';
export type {
  CeilableOccupancy,
  CeilingArchetype,
  CeilingRoomInput,
  PlacedCeiling,
  Pt as CeilingPt,
  Vec3m as CeilingVec3m,
} from './workflows/ceilingLayout/types.js';
export type {
  CeilingCommand,
  CeilingCommandSet,
  CeilingIdMinter,
} from './workflows/ceilingLayout/buildCeilingCommands.js';

// ── §27 / §61 Daylight Analytic Pass — public surface ─────────────────────────
// The per-room OFFLINE daylight / insolation metric (SPIKE-DAYLIGHT-SUN-
// PENETRATION ask B). Pure L2: zero THREE / Cesium / DOM, deterministic. Data
// source for the §27 DAYLIGHT-GRAPH + the §59 kitchen "natural-light" scorecard
// axis. The editor's read-only console command (`window.pryzmComputeDaylight()`)
// assembles RoomDaylightInput[] from the live room/wall stores + runs this pass.
export {
  computeRoomDaylight,
  computeBuildingDaylight,
  defaultSunSamples,
  sunDirection,
} from './workflows/daylight/index.js';
export type {
  Pt2 as DaylightPt2,
  WindowAperture,
  RoomDaylightInput,
  SunSample,
  WindowContribution,
  RoomDaylightResult,
  BuildingDaylightResult,
  DaylightOptions,
} from './workflows/daylight/index.js';

// ── Sprint H P9 (2026-05-10) — GenerativeTypes ────────────────────────────────
export * from './generative/GenerativeTypes';
export { layoutGenerator, roomColour } from './generative/LayoutGenerator.js';

// ── Sprint AJ (2026-05-12) — ai/ domain layer ────────────────────────────────
export type * from './AITypes.js';
export type { ElementSchema } from './ElementSchema.js';
export { AIReadModel, aiReadModel } from './AIReadModel.js';
export { RuleEngine } from './RuleEngine.js';
export { QueryEngine } from './QueryEngine.js';
export { AIService, aiService } from './AIService.js';
export { AIResponseParser } from './AIResponseParser.js';
export { AIElementFactory } from './AIElementFactory.js';
export { AIApprovalStore, aiApprovalStore } from './AIApprovalStore.js';
export type { AIApprovalRecord } from './AIApprovalRecord.js';
export { FloorPlanAIFactory } from './FloorPlanAIFactory.js';
export type {
    FloorPlanAnalysis,
    DetectedWall,
    DetectedOpening,
    DetectedFurniture,
    DetectedSlabOutline,
} from './FloorPlanAIFactory.js';
export { FloorPlanBatchExecutor } from './FloorPlanBatchExecutor.js';
export { FloorPlanCommandBatcher, measureEffectiveMetersPerPixel } from './FloorPlanCommandBatcher.js';
export * from './FloorPlanDiagnostics.js';
export * from './FloorPlanImageEnhancer.js';
export * from './ImagePreprocessor.js';
export { repairAndParseJSON } from './JSONRepair.js';
export { worldModelAdapter } from './WorldModelAdapter.js';
export { SemanticQueryEngine, semanticQueryEngine } from './SemanticQueryEngine.js';
export type { NLQueryResult, NLQueryRow } from './SemanticQueryEngine.js';
// GE-12: './PlanarTopologyEngine.js' removed — collapsed onto @pryzm/room-topology,
// which owns computeTopology / assignOpeningsToWalls / DetectedRoom / TopologyResult.
// Not re-exported as a shim: a repo-wide symbol census found ZERO importers of those
// four symbols from '@pryzm/ai-host'. Consumers take them from the owner.
export * from './WallRegionExtractor.js';
export * from './WallCandidateScorer.js';
export * from './WallTerminatorDoorDetector.js';
export * from './DoorGapInpainter.js';
export * from './DoorGeometricValidator.js';
export { GenerativeDesignAdvisor, generativeAdvisor } from './GenerativeDesignAdvisor.js';
export { StairComplianceReporter } from './StairComplianceReporter.js';
export { voiceSpatialInterface } from './VoiceSpatialInterface.js';
export type { VoiceIntentType, VoiceParsedCommand, VoiceListenState, VoiceStateListener } from './VoiceSpatialInterface.js';
export {
    ambientIntelligence,
    configureAmbientIntelligence,
} from './AmbientIntelligence.js';
export type { AmbientObservation, AmbientUiPrefsProvider } from './AmbientIntelligence.js';
export * from './intents.js';

// Apartment-layout validator framework (runs 4-11): orchestrator + adapter
// + formatter + combined call surface. Surfaced at the root so the editor's
// dev-test functions + future apartment-modal wire-ins can import without
// a deep path.
export {
    validateApartmentLayout,
    passesLegality,
    summarise,
} from './workflows/apartmentLayout/validators/orchestrator.js';
export type {
    ApartmentLayoutRoom,
    ApartmentLayoutForValidation,
    AggregatedViolationReport,
} from './workflows/apartmentLayout/validators/orchestrator-types.js';
// §L-909(b) — the "this check could not run" record. Exported at the root so
// report surfaces can render unmeasured checks instead of over-claiming.
export type {
    NotMeasuredField,
    NotMeasuredNote,
} from './workflows/apartmentLayout/validators/not-measured.js';
export {
    toValidationInput,
} from './workflows/apartmentLayout/validators/layout-adapter.js';
export type {
    DtglLayoutDto,
    DtglLayoutRoom,
    DtglLayoutEdge,
    AdapterOptions,
} from './workflows/apartmentLayout/validators/layout-adapter.js';
export {
    validateAndFormatLayout,
} from './workflows/apartmentLayout/validators/validate-and-format.js';
export type {
    ValidateAndFormatOptions,
    ValidateAndFormatResult,
} from './workflows/apartmentLayout/validators/validate-and-format.js';
export {
    formatViolationReport,
    formatViolationLine,
    groupByClass,
    groupByRoom,
} from './workflows/apartmentLayout/reporting/report-formatter.js';
export type {
    FormatOptions,
} from './workflows/apartmentLayout/reporting/report-formatter.js';

// ── BIM 3.0 Phase 4 — Graph exposure (the Level 5 unlock) ────────────────────
// The read-only, refusal-honest query surface behind the `graph.query` /
// `graph.neighbors` / `graph.path` bus verbs. See GraphQueryService.ts.
export {
    GraphQueryService,
    GRAPH_QUERY_SUPPORTED_RELATIONSHIPS,
    // ADR-0325 — the hierarchy families this surface refuses. Exported beside the
    // supported set so a gate or probe can assert the two are DISJOINT.
    GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS,
} from './graph/GraphQueryService.js';
export type {
    GraphQueryResult,
    GraphNeighborsResult,
    GraphPathResult,
    GraphNeighbor,
    GraphRefusalReason,
    GraphHierarchyUndeterminedReason,
    GraphQueryServiceDeps,
    RoomGraphLike,
} from './graph/GraphQueryService.js';
