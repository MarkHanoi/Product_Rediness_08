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
} from './workflows/apartmentLayout/shellAnalysis.js';
export { createStoreShellReader } from './workflows/apartmentLayout/shellReader.js';
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
} from './workflows/apartmentLayout/shellAnalysis.js';
export type {
  ApartmentGenerateLayoutPayload,
  ApartmentProgram,
  ApartmentConstraints,
  ScoringWeights,
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
export type { FloorPlanAnalysis, DetectedWall } from './FloorPlanAIFactory.js';
export { FloorPlanBatchExecutor } from './FloorPlanBatchExecutor.js';
export { FloorPlanCommandBatcher } from './FloorPlanCommandBatcher.js';
export * from './FloorPlanDiagnostics.js';
export * from './FloorPlanImageEnhancer.js';
export * from './ImagePreprocessor.js';
export { repairAndParseJSON } from './JSONRepair.js';
export { worldModelAdapter } from './WorldModelAdapter.js';
export { SemanticQueryEngine, semanticQueryEngine } from './SemanticQueryEngine.js';
export type { NLQueryResult, NLQueryRow } from './SemanticQueryEngine.js';
export * from './PlanarTopologyEngine.js';
export * from './WallRegionExtractor.js';
export * from './WallCandidateScorer.js';
export * from './WallIntersectionResolver.js';
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
