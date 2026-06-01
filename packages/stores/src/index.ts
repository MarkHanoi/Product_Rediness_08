// @pryzm/stores — public surface.
//
// L1 stores layer per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05.

export { Store } from './Store.js';

// D-α-1 (BIM 2/3 §6) — L0 parameter stores. Hold user INTENT post-execute
// (the Data Management Panel edits these); the apartment-solver (D-α-3)
// re-derives geometry from them.
export {
    ApartmentParametersStore,
    apartmentParametersStore,
} from './ApartmentParametersStore.js';
export {
    RoomParametersStore,
    roomParametersStore,
} from './RoomParametersStore.js';
export {
    ApartmentParameterPropagator,
    type PropagationEvent,
    type ImpactResolver,
} from './ApartmentParameterPropagator.js';
// P0.3 slice B (Family Platform) — L3 reactive registry store + core seed.
// The store wraps the L0 `FamilyRegistryState` substrate from slice A
// (`@pryzm/schemas/family-registry`); the seed function returns the initial
// `origin: 'core'` entries that composeRuntime registers at boot.
export { FamilyRegistryStore } from './familyRegistryStore.js';
export { buildCoreFamilySeeds } from './seedCoreFamilies.js';
// A.7.b (Phase A · Sprint 2) — L3 SiteModelStore.
// Wraps the L0 `SiteModel` substrate shipped in A.7.a
// (`@pryzm/schemas/site`). One per runtime; reset on project switch
// per [C19 §1.13]. The `site.*` command surface in A.7.c will call
// `set()` after running cross-schema validation.
export { SiteModelStore } from './SiteModelStore.js';
// A.10.d (Phase A · Sprint 2) — L3 ClimateStore.
// Wraps the L0 ClimateDataset substrate (A.10.a). siteRef → dataset
// resolver + cache (keyed by ClimateCacheKey per C21 §1.4) + stale-
// entry archive per §1.5. The `climate.*` command surface in A.10.e
// calls `ingest()` after running Zod validation + license-compliance.
export { ClimateStore } from './ClimateStore.js';
// A.7.c (Phase A · Sprint 2) — site.* command handlers. Pure functions
// `(payload, store) → SiteCommandResult<Event>`. The L5 adapter (command-
// bus wiring + OTel span + LTP-ENU rebase + domain event emit) lives
// elsewhere and composes against these. Per [C19 §4].
//
//   A.7.c.1 MVS:        siteCreate / siteUpdateLocation / siteSetParcelBoundary
//   A.7.c.2:            siteUpdateZoning / siteSetFootprint / siteClearFootprint
//   A.7.c.3 (this):     siteAddContextBuilding / siteRemoveContextBuilding /
//                       siteReplaceContextBuilding
//   A.7.c.4+ planned:   resync · climate/building link · whole-site replace ·
//                       cascade-delete
export {
    siteCreate,
    siteUpdateLocation,
    siteSetParcelBoundary,
    siteUpdateZoning,
    siteSetFootprint,
    siteClearFootprint,
    siteAddContextBuilding,
    siteRemoveContextBuilding,
    siteReplaceContextBuilding,
    deterministicSiteId,
    SiteCreatePayloadSchema,
    SiteUpdateLocationPayloadSchema,
    SiteSetParcelBoundaryPayloadSchema,
    SiteUpdateZoningPayloadSchema,
    SiteSetFootprintPayloadSchema,
    SiteClearFootprintPayloadSchema,
    SiteAddContextBuildingPayloadSchema,
    SiteRemoveContextBuildingPayloadSchema,
    SiteReplaceContextBuildingPayloadSchema,
    type SiteCreatePayload,
    type SiteUpdateLocationPayload,
    type SiteSetParcelBoundaryPayload,
    type SiteUpdateZoningPayload,
    type SiteSetFootprintPayload,
    type SiteClearFootprintPayload,
    type SiteAddContextBuildingPayload,
    type SiteRemoveContextBuildingPayload,
    type SiteReplaceContextBuildingPayload,
    type SiteCommandResult,
    type SiteCommandRejection,
    type SiteCommandWarnings,
    type SiteCreatedEvent,
    type SiteLocationChangedEvent,
    type SiteParcelBoundarySetEvent,
    type SiteZoningUpdatedEvent,
    type SiteFootprintSetEvent,
    type SiteFootprintClearedEvent,
    type SiteContextBuildingAddedEvent,
    type SiteContextBuildingRemovedEvent,
    type SiteContextBuildingReplacedEvent,
} from './site-commands/index.js';
// P0.5 Stage-5 wiring (Family Platform) — L0-pure-pipeline → L3-reactive-store
// bridge.  Takes raw JSON, runs the 5-stage pure pipeline, and inserts the
// resulting RegisteredFamily into the store.
export {
    registerFamilyFromJson,
    type RegisterFamilyFromJsonOptions,
    type RegisterFamilyFromJsonResult,
    type RegisterFamilyFromJsonSuccess,
    type RegisterFamilyFromJsonFailure,
} from './registerFamilyFromJson.js';
// C27 INS-α-2 (BIM 3.0 Inspect Model) — L3 reactive store wrapping the
// L0 `InspectSelection` substrate from `@pryzm/schemas`.  Drives the
// future Inspect tab master-tree selection; this slice ships the store
// only (no UI, no visibility-isolation wiring yet).
export { InspectSelectionStore } from './InspectSelectionStore.js';
// C28 DAT-α-2 — Data Panel state container.
// DO NOT REMOVE — auto-fixer guard
export * from './DataStore.js';
// C27 INS-α-6 — IsolationStateStore + selection-to-isolation reducer.
// L3 state container holding the per-element IsolationOverride map
// produced by the L1-pure `buildIsolationIntent` (visibility package).
// DO NOT REMOVE — auto-fixer guard
export * from './IsolationStateStore.js';
// C30 DSM-α-2 — Drawing Set state container.
// DO NOT REMOVE — auto-fixer guard
export * from './DrawingSetStore.js';
export { CubeStore, type CubeDto } from './CubeStore.js';
export { SelectionStore, type SelectionDto, type SelectionKind, type SelectionMode, type SelectionTarget } from './SelectionStore.js';
export {
  AnnotationStore,
  type AnnotationData,
  type AnnotationId,
  type AnnotationsState,
} from './AnnotationStore.js';
export {
  DimensionStore,
  type DimensionId,
  type DimensionViewSettings,
  type DimensionAutoModeOrOff,
} from './DimensionStore.js';
export {
  ActiveViewStore,
  ACTIVE_VIEW_ID,
  DEFAULT_ACTIVE_VIEW_STATE,
  type ActiveViewState,
} from './ActiveViewStore.js';
export {
  SheetStore,
  type SheetsState,
} from './SheetStore.js';
export {
  ActiveSheetStore,
  ACTIVE_SHEET_ID,
  DEFAULT_ACTIVE_SHEET_STATE,
  type ActiveSheetState,
} from './ActiveSheetStore.js';
export {
  TitleBlockStore,
  type TitleBlocksState,
  type TitleBlockStoreOptions,
} from './TitleBlockStore.js';
export {
  ScheduleStore,
  type SchedulesState,
} from './ScheduleStore.js';
export {
  ActiveScheduleStore,
  ACTIVE_SCHEDULE_ID,
  DEFAULT_ACTIVE_SCHEDULE_STATE,
  type ActiveScheduleState,
} from './ActiveScheduleStore.js';
export {
  ProjectListStore,
  type ProjectSummary,
} from './ProjectListStore.js';
export { attachStores, type AttachStoresOptions } from './attachStores.js';
export {
  AiApprovalQueueStore,
  approvalQueueBadgeCount,
  DEFAULT_PENDING_TTL_MS,
  type AiPendingActionData,
  type AiPendingActionId,
  type AiApprovalQueueState,
} from './AiApprovalQueueStore.js';
export {
  LayoutOptionsStore,
  type PendingLayoutRun,
} from './LayoutOptionsStore.js';
export type { DirtyDiff, DirtyListener, Disposer, Id, Patch } from './types.js';
// ── ADR-048 · Task 4.3: Virtualized ElementStore ──────────────────────────
export {
  LRUElementMap,
  type Vec3Like,
  type EvictionCallback,
  type PositionExtractor,
  type CameraPositionProvider,
  type LRUElementMapOptions,
} from './LRUElementMap.js';
export {
  CameraPositionService,
  cameraPositionService,
  type CameraPositionListener,
} from './CameraPositionService.js';
export {
  IndexedDBStore,
  type IDBFactoryLike,
  type IDBOpenDBRequestLike,
  type IDBDatabaseLike,
  type IDBTransactionLike,
  type IDBObjectStoreLike,
  type IDBRequestLike,
} from './IndexedDBStore.js';
export {
  ElementStore,
  type ElementValidator,
  type ElementStoreOptions,
} from './ElementStore.js';
export {
  selectActiveViewId,
  selectActiveToolId,
  selectHasActiveTool,
  selectActiveSheetId,
  selectHasActiveSheet,
  selectActiveScheduleId,
  selectSelectionKind,
  selectSelectionId,
  selectAnnotationCount,
  selectAnnotationById,
  selectAnnotationIds,
  selectDimensionAutoMode,
  selectShowOverallDimensions,
  selectIsDimensionOff,
  selectIsWallToolActive,
  selectIsDoorToolActive,
  selectIsWindowToolActive,
  selectIsDefaultView,
} from './selectors.js';
