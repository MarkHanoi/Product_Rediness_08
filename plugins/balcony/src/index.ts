// @pryzm/plugin-balcony — public surface. §FEAT-BALCONY-COMPOUND (L-5600) · C103 · ADR-0333.
//
// A BALCONY IS A COMPOUND: one gesture (`balcony.create`) composes a cantilever SLAB,
// its FLOOR FINISH and N RAILING runs along the free perimeter — in ONE undo entry.
// `balcony.updateProfile` re-derives all three from a new outline (the founder's
// "edit the profile and the finish and railings adapt"), and `balcony.delete` removes
// the whole compound.
//
// The geometry math is in `@pryzm/geometry-balcony` (pure). This plugin is the command
// surface only.

export {
  BalconyStore,
  type BalconyData,
  type BalconyId,
  type BalconiesState,
} from './store.js';

export {
  BalconySystemError,
  BalconyNotFoundError,
  BalconyHostWallError,
  BalconyBoundaryError,
  BalconyMemberIdError,
  isBalconySystemError,
} from './errors.js';

export {
  BALCONY_HANDLER_TYPES,
  buildBalconyHandlerSet,
  registerBalconyHandlers,
  CreateBalconyHandler,
  type CreateBalconyPayload,
  UpdateBalconyProfileHandler,
  type UpdateBalconyProfilePayload,
  DeleteBalconyHandler,
  type DeleteBalconyPayload,
  type BalconyHandlerType,
} from './handlers/index.js';
