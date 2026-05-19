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
