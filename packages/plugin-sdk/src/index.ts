// @pryzm/plugin-sdk — public surface (S62 D2-D9 expanded; Wave-12 L8-compliance re-exports).
//
// The locked descriptor schema (D1) is unchanged.  D2-D9 added:
//
//   • lifecycle hooks (D2)
//   • host proxy contracts (D3)
//   • iframe sandbox + CSP policy + escape-vector audit suite (D4 + D7)
//   • `pryzm dev` CLI helper (D4)
//   • Ed25519 plugin signing + revocation list (D8)
//
// Wave-12 (S98-S100) added:
//   • Re-exports from @pryzm/command-bus, @pryzm/stores, @pryzm/schemas,
//     @pryzm/scene-committer, @pryzm/geometry-kernel, @pryzm/view-state,
//     @pryzm/frame-scheduler, @pryzm/sync-client, @pryzm/renderer so that
//     L7 plugins import ONLY from '@pryzm/plugin-sdk'.
//
// Wave-15 Task 1 (2026-05-01) added:
//   • Re-exports from @pryzm/ui (PanelContribution, PanelContext, PanelCategory,
//     InspectorTabContribution) — closes the final L7 boundary gap found by the
//     pryzm-3-functional-day-1 verifier in plugins/bcf and plugins/ifc-inspector.
//
// Anything you can import from here is locked for v1.x per ADR-0038 §A.
// Anything not exported here is internal and may move.

// ── Descriptor (D1) ────────────────────────────────────────────────────────
export {
  PluginPermissionSchema,
  PluginContributionSchema,
  PluginManifestSchema,
  validateManifest,
} from './descriptor';

// ── Lifecycle (D2) ─────────────────────────────────────────────────────────
export {
  definePlugin,
  HOOK_TIMEOUT_MS,
} from './lifecycle';

export type {
  PluginLifecycle,
  PluginActivationContext,
  PluginUserContext,
} from './lifecycle';

// ── Host proxies (D3) ──────────────────────────────────────────────────────
export {
  PluginPermissionError,
} from './hosts/index';

export type {
  HostProxies,
  CommandBusProxy,
  CommandHandle,
  CommandResult,
  StoresProxy,
  StoreSnapshot,
  StoreSubscription,
  ElementRef,
  ViewsProxy,
  ViewRef,
  ViewKind,
  SelectionProxy,
  SelectionSubscription,
  AiProxy,
  AiWorkflowResult,
  AiWorkflowRef,
  FormatProxy,
  FormatImporterRegistration,
  FormatExporterRegistration,
  ImporterHandler,
  ExporterHandler,
} from './hosts/index';

// ── Sandbox (D4 + D7) ──────────────────────────────────────────────────────
export {
  buildPluginCSP,
  buildIframeHeadHTML,
  buildIframeSrcdoc,
  isAllowedFromPlugin,
  isAllowedFromHost,
  PLUGIN_ALLOWED_OUTBOUND_KINDS,
  HOST_ALLOWED_OUTBOUND_KINDS,
  SANDBOX_TOKENS,
  ESCAPE_VECTORS,
} from './sandbox/index';

export type {
  SandboxMessage,
  SandboxMessageKind,
  EscapeVector,
  EscapeCategory,
  EscapeEnv,
} from './sandbox/index';

// ── Signing (D8) ───────────────────────────────────────────────────────────
export {
  generateKeyPair,
  signPayload,
  verifyPayload,
  sha256OfBytes,
  makePluginSignature,
  verifyPluginSignature,
  RevocationList,
} from './signing';

export type {
  KeyPair,
  PluginSignature,
  SignaturePayload,
  VerifyPluginSignatureResult,
} from './signing';

export { canonicalJSONStringify } from './canonical-json';

// ── Re-exports from types.ts (legacy) ──────────────────────────────────────
export type {
  PluginPermission,
  PluginContribution,
  PluginManifest,
  PluginDescriptor,
  ValidateManifestResult,
} from './types';

// ── Wave-12 L8-compliance re-exports ───────────────────────────────────────
// These re-exports are the ONLY permitted path for L7 plugins to reach
// L0-L6 contracts.  The ESLint rule `pryzm/no-direct-pryzm-in-plugins`
// (packages/lint-config/src/plugin-boundary.ts) enforces this at error
// level post-Wave-12.

// ── @pryzm/command-bus ─────────────────────────────────────────────────────
export {
  CommandBus,
  CommandBusError,
  produceCommand,
  produceWithPatchesPerStore,
  PatchEmitter,
  UndoStack,
  CascadeRunner,
  CascadeRunnerError,
  CascadeDepthExceededError,
  MAX_CASCADE_DEPTH,
  defaultExtractEntityId,
} from '@pryzm/command-bus';

export type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  AuditMetadata,
  AuditDefaults,
  EventRecord,
  PatchSnapshotEntry,
  StoreId,
  AnyStores,
  ValidationResult,
  Patch,
  EmptyPayload,
  CommandRegistry,
  CascadeRule,
  CascadeContext,
  CascadeCommand,
  CascadeOtelSpan,
  CascadeDispatchStats,
} from '@pryzm/command-bus';

// ── @pryzm/stores ──────────────────────────────────────────────────────────
export {
  Store,
  CubeStore,
  SelectionStore,
  AnnotationStore,
  DimensionStore,
  ActiveViewStore,
  ACTIVE_VIEW_ID,
  DEFAULT_ACTIVE_VIEW_STATE,
  SheetStore,
  ActiveSheetStore,
  ACTIVE_SHEET_ID,
  DEFAULT_ACTIVE_SHEET_STATE,
  TitleBlockStore,
  ScheduleStore,
  ActiveScheduleStore,
  ACTIVE_SCHEDULE_ID,
  DEFAULT_ACTIVE_SCHEDULE_STATE,
  ProjectListStore,
  attachStores,
  AiApprovalQueueStore,
  approvalQueueBadgeCount,
  DEFAULT_PENDING_TTL_MS,
} from '@pryzm/stores';

export type {
  CubeDto,
  SelectionDto,
  SelectionKind,
  SelectionMode,
  SelectionTarget,
  AnnotationData,
  AnnotationId,
  AnnotationsState,
  DimensionId,
  DimensionViewSettings,
  DimensionAutoModeOrOff,
  ActiveViewState,
  SheetsState,
  ActiveSheetState,
  TitleBlocksState,
  TitleBlockStoreOptions,
  SchedulesState,
  ActiveScheduleState,
  ProjectSummary,
  AttachStoresOptions,
  AiPendingActionData,
} from '@pryzm/stores';

// ── @pryzm/schemas ─────────────────────────────────────────────────────────
export { createId } from '@pryzm/schemas';
export * from '@pryzm/schemas';

// ── @pryzm/scene-committer ─────────────────────────────────────────────────
export {
  CommitterHost,
  SceneRegistry,
  MaterialPool,
  bindStore,
  diffToDeltas,
  commitDimensions,
} from '@pryzm/scene-committer';

export type {
  ElementId,
  MaterialHandle,
  PrimitiveCommitter,
  CommitterHostOptions,
  SceneDelta,
  BindStoreHandle,
  BindStoreOptions,
  Canvas2DLike,
  ViewTransformMatrix,
} from '@pryzm/scene-committer';

// ── @pryzm/geometry-kernel ─────────────────────────────────────────────────
export {
  NO_JOINS,
  asMaterialKey,
  assertValidDescriptor,
  DescriptorInvariantError,
  produceWall,
  composeWallGeometryHash,
  WALL_HASH_SCHEMA_VERSION,
  computeOpeningWorldPos,
  produceDoor,
  composeDoorGeometryHash,
  produceWindow,
  composeWindowGeometryHash,
  computeMullionsX,
  computeMullionsZ,
  produceRoof,
  produceSlab,
  composeSlabGeometryHash,
  SLAB_HASH_SCHEMA_VERSION,
  produceColumn,
  composeColumnGeometryHash,
  produceBeam,
  composeBeamGeometryHash,
  produceGrid,
  composeGridGeometryHash,
  produceCurtainWall,
  composeCurtainWallGeometryHash,
  curtainWallBasis,
  computeCurtainWallGrid,
  CURTAIN_WALL_HASH_SCHEMA_VERSION,
  buildLinearExtrusion,
  composeStructuralMaterialKey,
  produceStair,
  composeStairGeometryHash,
  STAIR_HASH_SCHEMA_VERSION,
  produceHandrail,
  composeHandrailGeometryHash,
  HANDRAIL_HASH_SCHEMA_VERSION,
  produceCeiling,
  composeCeilingGeometryHash,
  CEILING_HASH_SCHEMA_VERSION,
  produceRoom,
  analyseRoom,
  composeRoomGeometryHash,
  ROOM_HASH_SCHEMA_VERSION,
  produceStructural,
  STRUCTURAL_HASH_SCHEMA_VERSION,
  composeStructuralGeometryHash,
  produceLighting,
  composeLightingMaterialKey,
  LIGHTING_HASH_SCHEMA_VERSION,
  composeLightingGeometryHash,
  producePlumbing,
  composePlumbingMaterialKey,
  PLUMBING_HASH_SCHEMA_VERSION,
  composePlumbingGeometryHash,
  produceFurniture,
  selectActiveRepresentation,
  composeFurnitureMaterialKey,
  FURNITURE_HASH_SCHEMA_VERSION,
  composeFurnitureGeometryHash,
  produceDimension,
  analyseDimension,
  composeDimensionMaterialKey,
  DIMENSION_HASH_SCHEMA_VERSION,
  composeDimensionGeometryHash,
  projectWallEdges,
  _mergeIntervals,
  _invertIntervals,
  _groupByWall,
  computePocheFills,
  makeMonotonicDimensionIdFactory,
  produceDimensions,
  evaluateDimensions,
  formatDimension,
  produceExtrude,
  composeExtrudeHash,
  classifyElement,
  evaluateCondition,
  resolveElementInstructions,
  produceSectionCut,
} from '@pryzm/geometry-kernel';

export type {
  BufferGeometryDescriptor,
  DescriptorGroup,
  IndexedAttribute,
  JoinData,
  JoinEnd,
  JoinKind,
  Point3D,
  MaterialKey,
  WallProducer,
  DoorProducer,
  DoorWorldPlacement,
  WindowProducer,
  WindowWorldPlacement,
  RoofProducer,
  SlabProducer,
  ColumnProducer,
  BeamProducer,
  GridProducer,
  CurtainWallProducer,
  CurtainWallBasis,
  StructuralProfile,
  StructuralShape,
  LinearExtrusion,
  StairProducer,
  HandrailProducer,
  CeilingProducer,
  RoomProducer,
  RoomBoundaryContext,
  RoomAnalytic,
  StructuralProducer,
  LightingProducer,
  PlumbingProducer,
  FurnitureProducer,
  DimensionProducer,
  DimensionAnalytic,
  DimensionEdge,
  DimensionArrow,
  EdgeVec2,
  Edge2D,
  ProjectWallEdgesInput,
  PocheVec2,
  PocheFill,
  ComputePocheFillsInput,
  DimensionElementSnapshot,
  DimensionRequest,
  DimDoorLike,
  DimRoomLike,
  DimWallLike,
  DimWindowLike,
  DoorLikeEvaluator,
  ElementSnapshotForDim,
  ProjectUnitSettings,
  RoomLikeEvaluator,
  DimVec3Like,
  WallLikeEvaluator,
  WindowLikeEvaluator,
  ElementClassification,
  ElementForView,
  ElementRenderInstruction,
  ResolvedViewRange,
  ExtrudeOptions,
  ExtrudeProducer,
  ExtrudeResult,
  ProfilePoint,
  AabbForSection,
  SectionCutResult,
  SectionEdge2D,
  SectionLine,
} from '@pryzm/geometry-kernel';

// ── @pryzm/view-state ──────────────────────────────────────────────────────
export {
  ViewDefinitionSchema,
  ViewKindEnum,
  RenderModeEnum,
  ViewRegistry,
  ViewController,
  ViewNotFoundError,
  Default3DView,
  LevelOverview,
  defaults as viewDefaults,
} from '@pryzm/view-state';

export type {
  ViewDefinition,
  ViewKind as ViewStateKind,
  RenderMode,
  ViewId,
  LevelId,
  ViewControllerOptions,
} from '@pryzm/view-state';

// ── @pryzm/frame-scheduler ─────────────────────────────────────────────────
export {
  FrameScheduler,
  GlobalRafAdapter,
  FakeRafAdapter,
  PRIORITIES,
  TICK_PRIORITIES,
  isPriority,
  isTickPriority,
} from '@pryzm/frame-scheduler';

export type {
  Priority,
  TickPriority,
  FrameRequest,
  DrainResult,
  TickListener,
  TickListenerCallback,
  TickListenerDisposer,
  RafAdapter,
  RafCallback,
} from '@pryzm/frame-scheduler';

// ── @pryzm/sync-client ─────────────────────────────────────────────────────
export {
  PryzmAwareness,
  AWARENESS_BYTES_PER_SEC_BUDGET,
} from '@pryzm/sync-client';

export type {
  PryzmAwarenessState,
  PryzmAwarenessUserContext,
  PryzmAwarenessOptions,
  AwarenessThroughputStats,
} from '@pryzm/sync-client';

// ── @pryzm/schemas (subpath modules not in the main barrel) ────────────────
// annotation/dimension, view/view-template, schedule, sheet, sheet/widget-payloads
// are intentionally behind subpaths in @pryzm/schemas (to avoid element name
// collisions). Re-exported flat here so plugins always import from plugin-sdk.
// NOTE: ScheduleId and SheetId are excluded (already in @pryzm/schemas main
// barrel) to avoid TS2308 duplicate-export ambiguity.
export * from '@pryzm/schemas/annotation/dimension';
export * from '@pryzm/schemas/view/view-template';
// A.R.3 (Revit round-trip) — canonical IFC/Revit element-metadata shape so the
// ifc-import / ifc-export plugins bind to ONE definition (also used by the L3
// IfcMetaStore). Exposes IfcElementMeta · Pset · Qset · PsetValue ·
// IfcElementTier · IfcMetaStoreSnapshot.
export * from '@pryzm/schemas/ifc';

// @pryzm/schemas/schedule — explicit list, excluding ScheduleId (already in main barrel)
export {
  ScheduleColumnSchema,
  ScheduleSchema,
  type ScheduleColumnDto,
  type ScheduleData,
  type FormulaResult,
  type FormulaNode,
  type BinaryOp,
  type UnaryOp,
  type BuiltinFunction,
  type ScheduleRow,
  BUILTIN_FUNCTIONS,
  isBuiltinFunction,
  CELL_ERR,
  CELL_CIRCULAR,
  CELL_UNDEF,
  FORMULA_MAX_DEPTH,
} from '@pryzm/schemas/schedule';

// @pryzm/schemas/sheet — explicit list, excluding SheetId (already in main barrel)
export {
  PAPER_SIZES,
  type PaperSize,
  type Orientation,
  getSheetDimensions,
  isPaperSize,
  isOrientation,
  ViewportSchema,
  WidgetSchema,
  SheetSchema,
  PLACEHOLDER_TITLE_BLOCK_ID,
  type ViewportDto,
  type WidgetDto,
  type SheetData,
  TitleBlockFieldSchema,
  TitleBlockBorderLineSchema,
  TitleBlockLogoAreaSchema,
  TitleBlockLayoutSchema,
  TitleBlockTemplateSchema,
  TitleBlockYAnchorSchema,
  TitleBlockTextAlignSchema,
  ProjectMetadataSchema,
  EMPTY_PROJECT_METADATA,
  BUILTIN_TITLE_BLOCK_IDS,
  DEFAULT_TITLE_BLOCK_ID,
  type TitleBlockField,
  type TitleBlockBorderLine,
  type TitleBlockLogoArea,
  type TitleBlockLayout,
  type TitleBlockTemplate,
  type TitleBlockTemplateId,
  type TitleBlockYAnchor,
  type TitleBlockTextAlign,
  type ProjectMetadata,
  type BuiltinTitleBlockId,
} from '@pryzm/schemas/sheet';

export * from '@pryzm/schemas/sheet/widget-payloads';

// ── @pryzm/types-builtin ───────────────────────────────────────────────────
// Built-in type catalogues (door, window, roof, curtain-wall starters).
// Re-exported flat (no subpath) so plugins import from @pryzm/plugin-sdk only.
export {
  BUILTIN_DOOR_TYPES,
  DEFAULT_DOOR_TYPE_ID,
  getDoorType,
} from '@pryzm/types-builtin/door';

export type {
  DoorType,
  DoorSwing,
} from '@pryzm/types-builtin/door';

export {
  BUILTIN_WINDOW_TYPES,
  DEFAULT_WINDOW_TYPE_ID,
  getWindowType,
} from '@pryzm/types-builtin/window';

export type {
  WindowType,
  WindowGridSpec,
} from '@pryzm/types-builtin/window';

export {
  BUILTIN_ROOF_TYPES,
  DEFAULT_ROOF_TYPE_ID,
  getRoofType,
} from '@pryzm/types-builtin/roof';

export type {
  RoofType,
  RoofShape,
} from '@pryzm/types-builtin/roof';

export {
  BUILTIN_CURTAIN_WALL_TYPES,
  BUILTIN_CW_PANEL_TYPES,
  BUILTIN_CW_MULLION_TYPES,
  DEFAULT_CURTAIN_WALL_TYPE_ID,
  DEFAULT_CW_PANEL_TYPE_ID,
  DEFAULT_CW_MULLION_TYPE_ID,
  getCurtainWallType,
  getCurtainWallPanelType,
  getCurtainWallMullionType,
} from '@pryzm/types-builtin/curtain-wall';

export type {
  CurtainWallFamily,
  CurtainWallSystemType,
  CurtainPanelKind,
  CurtainWallPanelType,
  CurtainWallMullionType,
} from '@pryzm/types-builtin/curtain-wall';

// ── @pryzm/renderer ────────────────────────────────────────────────────────
export {
  bootstrapScene,
  bootstrapSceneIdle,
  Renderer,
  RendererInitError,
} from '@pryzm/renderer';

export type {
  SceneBootstrapAudit,
  SceneBootstrapInput,
  SceneBootstrapResult,
  SceneSlotShape,
  RenderEverythingBootstrapFn,
  RendererInitOptions,
  RendererMode,
  ResolvedRendererMode,
} from '@pryzm/renderer';

// ── @pryzm/ui — panel + inspector host contribution types ──────────────────
// Wave-15 Task 1: plugins/bcf and plugins/ifc-inspector were importing these
// directly from @pryzm/ui, crossing the L7 boundary.  Re-exported here so
// all L7 plugins import exclusively from @pryzm/plugin-sdk.
// Spec: 02-ARCHITECTURE.md §2 (L7 row); 18-WAVES-13-15-ZERO-WASTE.md §3
//       (plugin-compliance check → 0).
export {
  PanelHost,
  PRYZM_PANEL_HOST_TRACER,
  InspectorHost,
  PRYZM_INSPECTOR_HOST_TRACER,
} from '@pryzm/ui';

export type {
  PanelContribution,
  PanelContext,
  PanelCategory,
  InspectorTabContribution,
} from '@pryzm/ui';

// ── Wave A20-T10 — bSDD property lookup ───────────────────────────────────────
export {
  BsddPropertyLookup,
  getBsddLookup,
  type BsddPropertyDefinition,
  type BsddClassification,
  type BsddLookupOptions,
} from './bsdd.js';

// ── S03 — OTel handler tracing (C10 §2, merge blocker) ────────────────────────
// L7 handler files MUST NOT import @opentelemetry/api directly — route
// through plugin-sdk so the OTel version is managed in one place and tests
// can inject a mock tracer without patching the global `trace` registry.
// ADR-002 §2: plugins import ONLY from @pryzm/plugin-sdk.
export {
  getHandlerTracer,
  withHandlerSpan,
  withAsyncHandlerSpan,
  type Tracer,
  type Span,
} from './tracing.js';
