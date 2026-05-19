// @pryzm/plugin-selection — handler barrel + registry.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { SelectSelectionHandler, type SelectPayload } from './Select.js';
import { DeselectSelectionHandler, type DeselectPayload } from './Deselect.js';
import { ClearSelectionHandler, type ClearSelectionPayload } from './ClearSelection.js';
import { UpdateElementMarkHandler, type UpdateElementMarkPayload } from './UpdateElementMark.js';
import { CopySelectionHandler, type CopySelectionPayload } from './CopySelectionHandler.js';
import { PasteClipboardHandler, type PasteClipboardPayload } from './PasteClipboardHandler.js';

export {
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  UpdateElementMarkHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
};
export type {
  SelectPayload,
  DeselectPayload,
  ClearSelectionPayload,
  UpdateElementMarkPayload,
  CopySelectionPayload,
  PasteClipboardPayload,
};

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

export function buildSelectionHandlerSet(): readonly [
  SelectSelectionHandler,
  DeselectSelectionHandler,
  ClearSelectionHandler,
  typeof UpdateElementMarkHandler,
  CopySelectionHandler,
  PasteClipboardHandler,
] {
  return [
    new SelectSelectionHandler(),
    new DeselectSelectionHandler(),
    new ClearSelectionHandler(),
    UpdateElementMarkHandler,
    new CopySelectionHandler(),
    new PasteClipboardHandler(),
  ];
}

export function registerSelectionHandlers(bus: CommandBus): void {
  for (const h of buildSelectionHandlerSet()) {
    bus.register(h as Parameters<CommandBus['register']>[0]);
  }
}
