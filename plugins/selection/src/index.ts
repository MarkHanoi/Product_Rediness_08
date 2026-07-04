// @pryzm/plugin-selection — public barrel.
//
// L7 plugin hosting the command handlers that mutate the L1 `SelectionStore`
// (`selection.select`, `selection.deselect`, `selection.clear`) plus the
// clipboard-backed `copy-selection` / `paste-clipboard` handlers
// (§FIX-COPY-PASTE, V1-LAUNCH-READINESS-AUDIT L-84).
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S16 D2 (lines 717-724).

export {
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
  SELECTION_HANDLER_TYPES,
  buildSelectionHandlerSet,
  registerSelectionHandlers,
  selectionClipboard,
  SelectionClipboard,
  DEFAULT_PASTE_OFFSET,
  type SelectPayload,
  type DeselectPayload,
  type ClearSelectionPayload,
  type CopySelectionPayload,
  type PasteClipboardPayload,
  type SelectionHandlerOptions,
  type ClipboardEntry,
  type SelectionPastePort,
  type PasteOffset,
  type PasteResult,
} from './handlers/index.js';
