// @pryzm/plugin-lift — public surface. §FEAT-LIFT-COMPOUND-SYSTEM (L-5700) · C104 · ADR-0325.
//
// A LIFT IS A COMPOUND SYSTEM: one gesture (`lift.create`) composes a full-height
// shaft ENCLOSURE (opaque walls, or curtain-wall glass on the three non-landing
// faces for the standalone type), ONE real landing DOOR per served level, the five
// LOD-300 CABIN parts, and a VOID in every slab the shaft passes through — in ONE
// undo entry. `lift.delete` removes all of it AND heals every void.
//
// SELECTION DISCIPLINE: `drill-in` (C103 §2). A click selects the LIFT; Tab descends
// into its members, exactly as Tab descends into a kitchen run's units. That is the
// founder's "clicking tab allow the user to select sub systems within the lift
// system", and C103 §2 admits it as a declared property of a compound rather than a
// deviation from the balcony's `direct-member` model.
//
// The geometry math is in `@pryzm/geometry-lift` (pure). This plugin is the command
// surface only.

export {
    LiftCompoundStore,
    LiftPartStore,
    type LiftCompoundData,
    type LiftPartData,
    type LiftCompoundsState,
    type LiftPartsState,
} from './store.js';

export {
    LiftSystemError,
    LiftNotFoundError,
    LiftHostWallError,
    LiftServedLevelsError,
    LiftGeometryError,
    isLiftSystemError,
} from './errors.js';

export {
    LIFT_HANDLER_TYPES,
    buildLiftHandlerSet,
    registerLiftHandlers,
    CreateLiftHandler,
    DEFAULT_LIFT_TYPE_ID,
    type CreateLiftPayload,
    DeleteLiftHandler,
    type DeleteLiftPayload,
    type LiftHandlerType,
} from './handlers/index.js';
