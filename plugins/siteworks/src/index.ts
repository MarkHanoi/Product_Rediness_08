// @pryzm/plugin-siteworks — public surface. C116 · ADR-0384.
//
// ROADS · PARKING AREAS · PEDESTRIAN AREAS, as ONE element kind wearing three roles.
// They differ in what they MEAN — who may travel on them, what the width is measured
// against, what a code check would ask — and in nothing a geometry pipeline can see.
// The founder's "category" is satisfied by three UI ENTRIES, not three element kinds
// (ADR-0384 D1; C83 §2.1: "a new element kind must not require 30 new decisions").
//
// Authored LINEARLY (a centreline + width — the Wall shape, and the swept ring is
// DERIVED, never stored) or AREALLY (a boundary ring + holes — the Slab shape), with
// a `thickness` that hangs BELOW the finished surface.
//
// ⛔ NOT `Slab` (a car park is not a floor plate and must never enter a floor-area
// schedule) and ⛔ NOT the zoning `street_width` family (a road the user DREW must
// never be read as a street that was MEASURED — C116 §0.3).
//
// Geometry math lives in `@pryzm/geometry-siteworks` and is pure.

export { SiteworksStore } from './store.js';
export type { SiteworksData, SiteworksState } from './store.js';
export {
    SiteworksGeometryError,
    SiteworksHasNoWidthError,
    SiteworksNotFoundError,
} from './errors.js';
export { siteworksPluginRegistration } from './registration.js';
export {
    SITEWORKS_HANDLER_TYPES,
    buildSiteworksHandlerSet,
    registerSiteworksHandlers,
} from './handlers/index.js';
export type { SiteworksHandlerType } from './handlers/index.js';
export type {
    CreateSiteworksBatchPayload,
    SiteworksCreateSpec,
    SiteworksPoint,
    SetSiteworksWidthPayload,
    SetSiteworksThicknessPayload,
    SetSiteworksRolePayload,
    DeleteSiteworksPayload,
} from './handlers/index.js';
