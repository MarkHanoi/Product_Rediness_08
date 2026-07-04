// @pryzm/plugin-selection — handler barrel + registry.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { SelectSelectionHandler, type SelectPayload } from './Select.js';
import { DeselectSelectionHandler, type DeselectPayload } from './Deselect.js';
import { ClearSelectionHandler, type ClearSelectionPayload } from './ClearSelection.js';
import { UpdateElementMarkHandler, type UpdateElementMarkPayload } from './UpdateElementMark.js';
import { CopySelectionHandler, type CopySelectionPayload } from './CopySelectionHandler.js';
import { PasteClipboardHandler, type PasteClipboardPayload } from './PasteClipboardHandler.js';
import {
  selectionClipboard,
  type SelectionClipboard,
  type SelectionPastePort,
} from './clipboard.js';

export {
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  UpdateElementMarkHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
};
export {
  selectionClipboard,
  SelectionClipboard,
  DEFAULT_PASTE_OFFSET,
} from './clipboard.js';
export type {
  SelectPayload,
  DeselectPayload,
  ClearSelectionPayload,
  UpdateElementMarkPayload,
  CopySelectionPayload,
  PasteClipboardPayload,
};
export type {
  ClipboardEntry,
  SelectionPastePort,
  PasteOffset,
  PasteResult,
} from './clipboard.js';

/** Stable command-type strings — useful for routing the command bus
 *  to the correct undo behaviour. */
export const SELECTION_HANDLER_TYPES = [
  'selection.select',
  'selection.deselect',
  'selection.clear',
  'element.updateMark',
  'copy-selection',
  'paste-clipboard',
] as const;

/**
 * Options for wiring the copy/paste handlers (§FIX-COPY-PASTE, L-84).
 *   • `clipboard` — override the shared module clipboard (tests).
 *   • `pastePort` — the collaborator that re-creates copied elements. Without
 *     it, `paste-clipboard` rejects with a typed reason (never a silent no-op).
 */
export interface SelectionHandlerOptions {
  readonly clipboard?: SelectionClipboard;
  readonly pastePort?: SelectionPastePort;
}

export function buildSelectionHandlerSet(
  opts: SelectionHandlerOptions = {},
): readonly [
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  typeof UpdateElementMarkHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
] {
  const clipboard = opts.clipboard ?? selectionClipboard;
  const port = opts.pastePort ?? null;
  return [
    new SelectSelectionHandler(),
    new DeselectSelectionHandler(),
    new ClearSelectionHandler(),
    UpdateElementMarkHandler,
    new CopySelectionHandler(clipboard, port),
    new PasteClipboardHandler(clipboard, port),
  ];
}

export function registerSelectionHandlers(
  bus: CommandBus,
  opts: SelectionHandlerOptions = {},
): void {
  for (const h of buildSelectionHandlerSet(opts)) {
    bus.register(h as Parameters<CommandBus['register']>[0]);
  }
}
