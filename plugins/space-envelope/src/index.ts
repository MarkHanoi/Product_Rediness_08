// @pryzm/plugin-space-envelope — public surface.
// §FEAT-SPACE-ENVELOPE (L-12900) · **C114** · ADR-0380 · founder directive
// `STR-ENVELOPE-AS-FIRST-CLASS-ELEMENT`.
//
// The AUTHORED spatial volume an architect places BEFORE any wall exists. Two authored
// roles — `level` (the to-be-built area and volume per storey) and `room` (initial
// layout volumes that behave like a room). The third role, `maximumBuildable`, is
// DECLARED in the schema and REFUSED at the create verb, because an editable legal
// ceiling is a study a user can drag and "a STUDY, not a permit" is the ratified
// position (C58/C74/C75, ADR-0380 D2).
//
// ⛔ NOT `BuildableEnvelope` (the SOLVED legal ceiling, never authored) and NOT `Room`
// (whose detector would recompute a wall-free volume away — C84 EI-7e, ADR-0380 D1).
//
// Geometry math lives in `@pryzm/geometry-space-envelope` and is pure.

export { SpaceEnvelopeStore } from './store.js';
export type { SpaceEnvelopeData, SpaceEnvelopesState } from './store.js';
export { SpaceEnvelopeGeometryError, MaximumBuildableNotAuthorableError } from './errors.js';
export { spaceEnvelopePluginRegistration } from './registration.js';
export {
    SPACE_ENVELOPE_HANDLER_TYPES,
    buildSpaceEnvelopeHandlerSet,
    registerSpaceEnvelopeHandlers,
} from './handlers/index.js';
export type { SpaceEnvelopeHandlerType } from './handlers/index.js';
