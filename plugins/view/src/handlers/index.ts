// View handler registration helper (S17-T6 + E.5.x P3).
//
// Spec: PHASE-1C §S17 line 793 (D6).
// ADR: docs/02-decisions/adrs/0016-view-state-command-driven.md.
// E.5.x P3: SetViewOutput/Range/Underlay handlers added. (SetViewCrop and
// UpdateViewDefinition were REMOVED by MT-03 — their live arms are the
// initBusHandlers bridges; see the §FIX-VIEW-*-SHADOW notes below.)

import type { CommandBus } from '@pryzm/plugin-sdk';
import { CreateViewHandler } from './CreateView.js';
import { DeleteViewHandler } from './DeleteView.js';
import { RenameViewHandler } from './RenameView.js';
import { SwitchViewHandler } from './SwitchView.js';
import { UpdateViewCameraHandler } from './UpdateViewCamera.js';
import { SetViewOutputHandler } from './SetViewOutput.js';
import { SetViewRangeHandler } from './SetViewRange.js';
import { SetViewUnderlayHandler } from './SetViewUnderlay.js';
import { DeleteElementHandler } from './DeleteElement.js';
import { DeleteElementsBatchHandler } from './DeleteElementsBatch.js';
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
export { SetViewUnderlayHandler } from './SetViewUnderlay.js';
export { DeleteElementHandler, type DeleteElementPayload } from './DeleteElement.js';
// §FEAT-SCOPED-DELETE (RAC U9.2) — N deletes, ONE undo entry.
export {
  DeleteElementsBatchHandler,
  DELETE_BATCH_REPORT_EVENT,
  type DeleteElementsBatchPayload,
  type DeleteBatchReport,
} from './DeleteElementsBatch.js';
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
export type { SetViewUnderlayPayload } from './SetViewUnderlay.js';

const ALL_HANDLERS = [
  CreateViewHandler,
  DeleteViewHandler,
  RenameViewHandler,
  SwitchViewHandler,
  UpdateViewCameraHandler,
  SetViewOutputHandler,
  SetViewRangeHandler,
  // §FIX-VIEW-CROP-SHADOW (MT-03) — SetViewCropHandler is NOT in this set. The
  // §E.5.4 bridge at initBusHandlers.ts:2150 is the live arm for 'view.setCrop'
  // (initBusHandlers runs BEFORE registerViewHandlers; first registration
  // wins), and the handler's "sole state-mutation path" header was false at
  // runtime. Loser deleted, not commented. Pin:
  // __tests__/handlers/SetViewCropShadow.test.ts.
  SetViewUnderlayHandler,
  // §FIX-VIEW-UPDATEDEF-SHADOW (MT-03) — UpdateViewDefinitionHandler is NOT in
  // this set. The §FIX-VIEW-UPDATE-PAYLOAD-KEY bridge at
  // initBusHandlers.ts:2134 is the live arm (its own comment names it, pinned
  // by apps/editor/__tests__/viewBusLifecycle.test.ts), and it accepts the
  // legacy `updates` payload key the plugin arm did not (L-222 scope-drag).
  // Loser deleted, not commented. Pin:
  // __tests__/handlers/UpdateViewDefinitionShadow.test.ts.
  DeleteElementHandler,
  DeleteElementsBatchHandler,
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
