/**
 * `@pryzm/plugin-ifc-inspector` — public surface
 *
 * Phase 3-B Sprint S57 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.2).
 * Pset editor DOM panel + `PsetUpdateCommand` schema/reducer + OTel.
 */

export type {
  PsetValue,
  Pset,
  IFCInspectorMeta,
  PsetUpdateCommand,
  CommandBusLike,
} from './types.js';

export { PsetEditorPanel } from './pset-editor.js';
export {
  parsePsetUpdateCommand,
  applyPsetUpdate,
  valueKind,
} from './commands.js';
export {
  PRYZM_IFC_INSPECTOR_TRACER,
  emitPsetUpdateSpan,
} from './otel.js';

export type { IfcPanelDeps } from './panel-contribution.js';
export { createIfcPanelContribution } from './panel-contribution.js';

// ── §IFC-TREE (L-8300..L-8376) — the IFC primitive tree ──────────────────────
// The class authority, the five groupings, the bounded row window, the
// eight-slot story model, the AI seam, and the DOM view + two-button toggle.
export {
  IFC_CLASS_AUTHORITY,
  resolveIfcClass,
  authorityKeys,
  mappedIfcClasses,
} from './tree/ifc-class-authority.js';
export type {
  IfcClassResolution,
  IfcClassAuthoritySource,
  IfcUnmappedReason,
} from './tree/ifc-class-authority.js';

export {
  NOT_AUTHORED,
  NOT_EXTRACTED,
  authored,
  IMPORTED_CAPABILITY,
  NATIVE_CAPABILITY,
  MATERIAL_EXPORT_CAVEAT,
  EXPORT_PATH_CAVEAT,
} from './tree/tree-source.js';
export type {
  Facet,
  IfcTreeElement,
  IfcTreeSource,
  SourceCapability,
  SpatialRung,
  Origin,
  PsetScalar,
} from './tree/tree-source.js';

export {
  GROUPINGS,
  buildGrouping,
  groupBySpatial,
  groupByClass,
  groupBySystem,
  groupByMaterial,
  groupByStorey,
} from './tree/groupings.js';
export type { Grouping, GroupingId, IfcGroup, Coverage } from './tree/groupings.js';

export {
  MAX_MATERIALISED_ROWS,
  MAX_ROWS_PER_GROUP,
  materialiseRows,
  truncationNotice,
} from './tree/row-window.js';
export type { IfcTreeRow, RowWindow } from './tree/row-window.js';

export {
  ANSWERABLE_SLOTS,
  SLOT_LABELS,
  PROVENANCE_CHIP,
  buildElementStory,
  withAiAnswers,
  openQuestions,
} from './tree/story-model.js';
export type {
  SlotId,
  Slot,
  ElementStory,
  Completeness,
  Provenance,
  ProvenanceKind,
  HowWeKnow,
} from './tree/story-model.js';

export { gateBatch, MAX_BATCH_ELEMENTS, MAX_QUESTIONS_PER_ELEMENT } from './tree/ai-seam.js';
export type { AiStoryPort, AiStoryRequest, AiCostEstimate, BatchDecision } from './tree/ai-seam.js';

export {
  adaptImportedModel,
  adaptNativeElements,
  normaliseRawIfcType,
} from './tree/adapters.js';
export type {
  ImportedModelLike,
  ImportedRecordLike,
  NativeElementLike,
} from './tree/adapters.js';

export { createIfcTreeView, createTreeToggle } from './tree/ifc-tree-view.js';
export type { IfcTreeView, IfcTreeViewDeps, TreeMode } from './tree/ifc-tree-view.js';
