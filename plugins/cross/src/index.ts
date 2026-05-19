// @pryzm/plugin-cross — cross-element cascade-rule registry (S12-T6).
//
// Cross-element rules live here so no individual element plugin has to
// import another element plugin's `src/`.  Per ADR-012 the rules are
// L4 (cross-cutting) and registered at bootstrap time.
//
// First inhabitant (S12): the slab→wall edge-pinned cascade lifted
// from `src/elements/walls/SlabWallCoupling.ts:133` per
// `code-level ADR docs/architecture/adr/0010-slab-handler-triage.md`.

export {
  buildSlabWallCascadeRule,
  SLAB_WALL_CASCADE_TRIGGERS,
  type SlabWallCascadeDeps,
  type SlabWallPinAnchor,
} from './slab-wall.js';

// S14-T7 — stair→handrail cascade.
export {
  buildStairHandrailCascadeRule,
  STAIR_HANDRAIL_CASCADE_TRIGGERS,
  type StairHandrailCascadeDeps,
} from './stair-handrail.js';

// S26 — wall→room boundary cascade (S25 deferred carry-over,
// per ADR-0023 §"Carry-over: wall→room cross-rule").
export {
  buildWallRoomCascadeRule,
  WALL_ROOM_CASCADE_TRIGGERS,
  type WallRoomCascadeDeps,
} from './wall-room.js';

// Wave 11 recipe completion — handlers + intent.
export { CROSS_COMMANDS, registerCrossHandlers } from './handlers/index.js';
export type {
  CrossCommandId,
  CrossHandlerDeps,
  CrossHandlerType,
} from './handlers/index.js';
export type { CrossRegisterPayload } from './intent.js';
