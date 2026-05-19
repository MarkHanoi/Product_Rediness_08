// @pryzm/plugin-sheets — public surface (S37 / ADR-0031 / Phase 2C).
//
// Spec source: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37.

export {
  SheetsPluginError,
  SheetSchemaError,
  SheetNotFoundError,
  DuplicateSheetIdError,
  DuplicateSheetNumberError,
  SheetIntentError,
  DuplicateViewportIdError,
  ViewportNotFoundError,
  TitleBlockTemplateNotFoundError,
  DuplicateWidgetIdError,
  WidgetNotFoundError,
  WidgetKindUnknownError,
} from './errors.js';

export {
  SHEET_NUMBER_PATTERN,
  SHEET_NAME_MAX_LEN,
  isSheetName,
  isSheetNumberFormat,
  formatAutoSheetNumber,
  isPaperSize,
  isOrientation,
  type PaperSize,
  type Orientation,
} from './intent.js';

export {
  SHEET_HANDLER_TYPES,
  buildSheetHandlerSet,
  registerSheetHandlers,
  CreateSheetHandler,
  DeleteSheetHandler,
  RenameSheetHandler,
  ReorderSheetHandler,
  AddViewportHandler,
  RemoveViewportHandler,
  SetViewportScaleHandler,
  SetTitleBlockHandler,
  SetSheetMetadataHandler,
  AddWidgetHandler,
  RemoveWidgetHandler,
  SHEET_METADATA_FIELD_MAX_LEN,
  type SheetHandlerType,
  type CreateSheetPayload,
  type DeleteSheetPayload,
  type RenameSheetPayload,
  type ReorderSheetPayload,
  type AddViewportPayload,
  type RemoveViewportPayload,
  type SetViewportScalePayload,
  type SetTitleBlockPayload,
  type SetSheetMetadataPayload,
  type AddWidgetPayload,
  type RemoveWidgetPayload,
} from './handlers/index.js';

export {
  ViewportManager,
  DEFAULT_VIEWPORT_WIDTH_MM,
  DEFAULT_VIEWPORT_HEIGHT_MM,
  DEFAULT_VIEWPORT_SCALE,
  type DropViewOptions,
  type WorldBounds,
} from './viewport.js';

export {
  renderTitleBlock,
  resolveFieldValue,
  computeTitleBlockRect,
  getBuiltinTitleBlock,
  BUILTIN_TITLE_BLOCK_TEMPLATES,
  TITLE_BLOCK_FIELD_KEYS,
  type TitleBlockFieldKey,
  type FieldResolutionContext,
} from './title-block.js';

export {
  SheetCamera,
  SHEET_CAMERA_DEFAULT_PX_PER_MM,
  SHEET_CAMERA_MIN_PX_PER_MM,
  SHEET_CAMERA_MAX_PX_PER_MM,
  type SheetCameraOptions,
  type SheetScreenPoint,
  type SheetPaperPoint,
} from './sheet-camera.js';

export {
  SheetEditorHost,
  type SheetEditorHostOptions,
  type SheetReadStore,
  type ActiveSheetReadStore,
  type ViewRenderer,
  type ViewportRenderRequest,
  type TitleBlockReadStore,
  type ProjectMetadataProvider,
} from './sheet-editor-host.js';

// ── S39 widgets ────────────────────────────────────────────────────────────

export {
  Widget,
  drawUprightText,
  withUprightText,
  wrapText,
  TextWidget,
  ImageWidget,
  NorthArrowWidget,
  ScaleBarWidget,
  LegendWidget,
  RevisionsTableWidget,
  ScheduleSnapshotWidget,
  BimTagWidget,
  LineWidget,
  RegionWidget,
  buildBuiltinWidgetRegistry,
  BUILTIN_WIDGET_REGISTRY,
  BUILTIN_WIDGET_KINDS,
  renderWidget,
  widgetBounds,
  type WidgetRegistry,
  type WidgetCtx2D,
  type WidgetRenderEnv,
  type WidgetBounds,
} from './widgets/index.js';

export {
  mountWidgetPalette,
  PALETTE_DATA_TYPE,
  DEFAULT_WIDGET_DIMENSIONS,
  type WidgetPaletteOptions,
  type WidgetPaletteHandle,
} from './widget-tool-palette.js';

export {
  getSheetListItems,
  subscribeSheetList,
  activateSheet,
  dispatchCreateSheet,
  dispatchDeleteSheet,
  dispatchRenameSheet,
  dispatchReorderSheet,
  type SheetListItem,
  type SheetListChangeListener,
  type SheetListDisposer,
} from './sheet-list.js';

export {
  SHEET_SPAN_NAMES,
  setSheetTracer,
  clearSheetTracer,
  getSheetTracer,
  withSheetSpan,
  type SheetSpanName,
  type SheetSpan,
  type SheetTracer,
} from './tracing.js';

// ── S40 view-renderer infrastructure ───────────────────────────────────────

export {
  type ViewKind,
  VIEW_KINDS,
  type EditCamera,
  IDENTITY_EDIT_CAMERA,
  type ViewSource,
  type ViewSourceRequest,
  applyEditCamera,
  type ViewRegistry,
  type ViewRegistryEntry,
  MapViewRegistry,
  ViewportEditController,
  type ViewportEditControllerOptions,
  CompositeViewRenderer,
  type CompositeViewRendererOptions,
} from './view-renderer/index.js';

// ── S40 book export ────────────────────────────────────────────────────────

export {
  BookSchema,
  type BookData,
  addSheetToBook,
  removeSheetFromBook,
  moveSheetInBook,
  createBook,
  exportBook,
  type BookExportOptions,
  type BookExportResult,
  type ExportProgress,
  type SheetPageRenderer,
  type SheetRenderRequest,
  type SheetRenderResult,
  type DocumentAssembler,
  type SheetExportFormat,
} from './book/index.js';
