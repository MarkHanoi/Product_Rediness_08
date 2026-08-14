// @pryzm/plugin-selection — handler barrel + registry.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { SelectSelectionHandler, type SelectPayload } from './Select.js';
import { DeselectSelectionHandler, type DeselectPayload } from './Deselect.js';
import { ClearSelectionHandler, type ClearSelectionPayload } from './ClearSelection.js';
import { CopySelectionHandler, type CopySelectionPayload } from './CopySelectionHandler.js';
import { PasteClipboardHandler, type PasteClipboardPayload } from './PasteClipboardHandler.js';
import {
  selectionClipboard,
  type SelectionClipboard,
  type SelectionPastePort,
} from '../clipboard.js';

export {
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
};
export {
  selectionClipboard,
  SelectionClipboard,
  DEFAULT_PASTE_OFFSET,
} from '../clipboard.js';
export type {
  SelectPayload,
  DeselectPayload,
  ClearSelectionPayload,
  CopySelectionPayload,
  PasteClipboardPayload,
};
export type {
  ClipboardEntry,
  SelectionPastePort,
  PasteOffset,
  PasteResult,
} from '../clipboard.js';

/** Stable command-type strings — useful for routing the command bus
 *  to the correct undo behaviour. */
export const SELECTION_HANDLER_TYPES = [
  'selection.select',
  'selection.deselect',
  'selection.clear',
  // §FIX-ELEMENT-MARK-SHADOW (MT-03) — 'element.updateMark' is NOT declared
  // here. It has a live §FIX-ELEMENT-MARK-UNHANDLED bridge in
  // initBusHandlers.ts:2041, and this plugin claiming the type first (this set
  // is contributed by PluginRegistry at composeRuntime, before initBusHandlers)
  // was the ONLY reason that bridge never registered (the §OI-053
  // `registry.has()` skip). The plugin arm swallowed a failed dispatch into
  // `{forward:[],inverse:[]}` (C16 CA-18 PROHIBITED) and wrote `properties.mark`
  // where the schedule reads the top-level `mark` field (C28). Authority
  // declared: the bridge. Loser deleted, not commented. Pin:
  // __tests__/handlers/ElementMarkShadow.test.ts.
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
  CopySelectionHandler,
  PasteClipboardHandler,
] {
  const clipboard = opts.clipboard ?? selectionClipboard;
  const port = opts.pastePort ?? null;
  return [
    new SelectSelectionHandler(),
    new DeselectSelectionHandler(),
    new ClearSelectionHandler(),
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
