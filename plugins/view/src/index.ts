// @pryzm/plugin-view — public surface (S17).
//
// Spec: PHASE-1C §S17.
// ADR: docs/02-decisions/adrs/0016-view-state-command-driven.md.

export { ViewNotFoundError, ViewAlreadyExistsError, ViewValidationError } from './errors.js';
export {
  CreateViewHandler,
  DeleteViewHandler,
  RenameViewHandler,
  SwitchViewHandler,
  UpdateViewCameraHandler,
  registerViewHandlers,
} from './handlers/index.js';
export type {
  CreateViewPayload,
  CreateViewStores,
  DeleteViewPayload,
  DeleteViewStores,
  RenameViewPayload,
  RenameViewStores,
  SwitchViewPayload,
  SwitchViewStores,
  UpdateViewCameraPayload,
  UpdateViewCameraStores,
} from './handlers/index.js';
