// @pryzm/plugin-selection — public barrel.
//
// L7 plugin hosting the three command handlers that mutate the L1
// `SelectionStore`.  Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md`
// §S16 D2 (lines 717-724) — "selection-plugin: handlers
// `selection.select`, `selection.deselect`, `selection.clear`".

export {
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
  SELECTION_HANDLER_TYPES,
  buildSelectionHandlerSet,
  registerSelectionHandlers,
  type SelectPayload,
  type DeselectPayload,
  type ClearSelectionPayload,
  type CopySelectionPayload,
  type PasteClipboardPayload,
} from './handlers/index.js';
