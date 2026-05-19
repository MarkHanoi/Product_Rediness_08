// View handler registration helper (S17-T6 + E.5.x P3).
//
// Spec: PHASE-1C §S17 line 793 (D6).
// ADR: docs/architecture/adr/0016-view-state-command-driven.md.
// E.5.x P3: SetViewOutput/Range/Crop/Underlay + UpdateViewDefinition handlers added.

import type { CommandBus } from '@pryzm/plugin-sdk';
import { CreateViewHandler } from './CreateView.js';
import { DeleteViewHandler } from './DeleteView.js';
import { RenameViewHandler } from './RenameView.js';
import { SwitchViewHandler } from './SwitchView.js';
import { UpdateViewCameraHandler } from './UpdateViewCamera.js';
import { SetViewOutputHandler } from './SetViewOutput.js';
import { SetViewRangeHandler } from './SetViewRange.js';
import { SetViewCropHandler } from './SetViewCrop.js';
import { SetViewUnderlayHandler } from './SetViewUnderlay.js';
import { UpdateViewDefinitionHandler } from './UpdateViewDefinition.js';
import { DeleteElementHandler } from './DeleteElement.js';
import { HideElementInViewHandler } from './HideElementInView.js';
import { IsolateElementInViewHandler } from './IsolateElementInView.js';
import { SetElementGraphicOverrideHandler } from './SetElementGraphicOverride.js';
import { SetViewProjectionHandler } from './SetViewProjection.js';

export { CreateViewHandler } from './CreateView.js';
export { DeleteViewHandler } from './DeleteView.js';
export { RenameViewHandler } from './RenameView.js';
export { SwitchViewHandler } from './SwitchView.js';
export { UpdateViewCameraHandler } from './UpdateViewCamera.js';
export { SetViewOutputHandler } from './SetViewOutput.js';
export { SetViewRangeHandler } from './SetViewRange.js';
export { SetViewCropHandler } from './SetViewCrop.js';
export { SetViewUnderlayHandler } from './SetViewUnderlay.js';
export { UpdateViewDefinitionHandler } from './UpdateViewDefinition.js';
export { DeleteElementHandler, type DeleteElementPayload } from './DeleteElement.js';
export { HideElementInViewHandler, type HideElementInViewPayload } from './HideElementInView.js';
export { IsolateElementInViewHandler, type IsolateElementInViewPayload } from './IsolateElementInView.js';
export { SetElementGraphicOverrideHandler, type SetElementGraphicOverridePayload } from './SetElementGraphicOverride.js';
export { SetViewProjectionHandler, type SetViewProjectionPayload } from './SetViewProjection.js';

export type {
  CreateViewPayload,
  CreateViewStores,
} from './CreateView.js';
export type {
  DeleteViewPayload,
  DeleteViewStores,
} from './DeleteView.js';
export type {
  RenameViewPayload,
  RenameViewStores,
} from './RenameView.js';
export type {
  SwitchViewPayload,
  SwitchViewStores,
} from './SwitchView.js';
export type {
  UpdateViewCameraPayload,
  UpdateViewCameraStores,
} from './UpdateViewCamera.js';
export type { SetViewOutputPayload } from './SetViewOutput.js';
export type { SetViewRangePayload } from './SetViewRange.js';
export type { SetViewCropPayload } from './SetViewCrop.js';
export type { SetViewUnderlayPayload } from './SetViewUnderlay.js';
export type { UpdateViewDefinitionPayload } from './UpdateViewDefinition.js';

const ALL_HANDLERS = [
  CreateViewHandler,
  DeleteViewHandler,
  RenameViewHandler,
  SwitchViewHandler,
  UpdateViewCameraHandler,
  SetViewOutputHandler,
  SetViewRangeHandler,
  SetViewCropHandler,
  SetViewUnderlayHandler,
  UpdateViewDefinitionHandler,
  DeleteElementHandler,
  HideElementInViewHandler,
  IsolateElementInViewHandler,
  SetElementGraphicOverrideHandler,
  SetViewProjectionHandler,
] as const;

/**
 * Register all view plugin command handlers against a `CommandBus`.
 * Returns the list of registered command-type strings for introspection.
 */
export function registerViewHandlers(bus: CommandBus): readonly string[] {
  const types: string[] = [];
  for (const handler of ALL_HANDLERS) {
    bus.register(handler as any);
    types.push(handler.type);
  }
  return types;
}
