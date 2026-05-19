/**
 * @pryzm/protocol — the public DTO surface of PRYZM 2.
 *
 * L1 stores, sync, AI, and plugin authors import from here; never directly
 * from `@pryzm/schemas`. This barrel is what we promise stability on.
 */

// All 20 element schemas as runtime Zod values + inferred types.
export {
  Wall,
  Slab,
  Door,
  Window,
  Roof,
  CurtainWall,
  Grid,
  Column,
  Beam,
  Stair,
  Handrail,
  Ceiling,
  Room,
  Furniture,
  FurnitureRepresentation,
  FurnitureLod,
  Annotation,
  Dimension,
  Sheet,
  Schedule,
  View,
  Project,
  Structural,
  Lighting,
  Plumbing,
} from '@pryzm/schemas';

// Typed-ID brands.
export type {
  Id,
  AnyElementId,
  ElementType,
  IdFor,
  WallId,
  SlabId,
  DoorId,
  WindowId,
  RoofId,
  CurtainWallId,
  GridId,
  ColumnId,
  BeamId,
  StairId,
  HandrailId,
  CeilingId,
  RoomId,
  FurnitureId,
  AnnotationId,
  DimensionId,
  SheetId,
  ScheduleId,
  ViewId,
  ProjectId,
  StructuralId,
  LightingId,
  PlumbingId,
} from '@pryzm/schemas';

// ID factory + introspection helpers.
export { createId, isId, parseId, unbrand } from '@pryzm/schemas';

// Shared primitives.
export { Vec2, Vec3, ColorRgb, Aabb, Metadata, IfcData } from '@pryzm/schemas';

// Schema registry for dispatch.
export { SCHEMA_REGISTRY } from '@pryzm/schemas';
export type { SchemaRegistry, ElementSchema } from '@pryzm/schemas';

// ISO 19650-2 CDE structured name types + validation (migrated from src/cde/ — S87-WIRE 2026-05-01).
export {
  TYPE_CODES,
  ROLE_CODES,
  SUITABILITY_CODES,
  CDE_ROLE_LABELS,
  CDE_STATE_DISPLAY,
  validateStructuredName,
  assembleFilename,
} from './StructuredName';
export type {
  TypeCode,
  RoleCode,
  SuitabilityCode,
  CDEState,
  CDERole,
  StructuredName,
  NameValidationError,
  StateDisplay,
} from './StructuredName';

// ── Sprint H P9.2 (2026-05-10) — authenticated fetch wrapper ────────────────
export { getStoredToken, getCurrentUserId, apiFetch } from './apiFetch.js';
