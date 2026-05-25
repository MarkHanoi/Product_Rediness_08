// @pryzm/stores — public surface.
//
// L1 stores layer per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05.

export { Store } from './Store.js';
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
