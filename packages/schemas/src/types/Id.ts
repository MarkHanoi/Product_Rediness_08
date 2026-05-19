/**
 * Typed-ID brands for every PRYZM 2 element family.
 *
 * Every PRYZM 2 primitive is keyed by an opaque, branded string. The brand
 * has no runtime cost (the value is still just `string`) but it prevents the
 * compiler from accepting a `WallId` where a `SlabId` was expected. This is
 * the L1 contract that makes scene mutations type-safe.
 *
 * The convention `<prefix>_<ulid>` is enforced at construction time by
 * `createId(prefix)` — see `../factory/createId.ts`.
 */

/** Generic branded ID. Use the per-element aliases below in public APIs. */
export type Id<TPrefix extends string> = string & { readonly __brand: TPrefix };

export type WallId        = Id<'wall'>;
export type SlabId        = Id<'slab'>;
export type DoorId        = Id<'door'>;
export type WindowId      = Id<'window'>;
export type RoofId        = Id<'roof'>;
export type CurtainWallId = Id<'curtainwall'>;
export type GridId        = Id<'grid'>;
export type ColumnId      = Id<'column'>;
export type BeamId        = Id<'beam'>;
export type StairId       = Id<'stair'>;
export type HandrailId    = Id<'handrail'>;
export type CeilingId     = Id<'ceiling'>;
export type RoomId        = Id<'room'>;
export type FurnitureId   = Id<'furniture'>;
export type AnnotationId  = Id<'annotation'>;
export type DimensionId   = Id<'dimension'>;
export type SheetId       = Id<'sheet'>;
export type ScheduleId    = Id<'schedule'>;
export type ViewId        = Id<'view'>;
export type ProjectId     = Id<'project'>;
export type StructuralId  = Id<'structural'>;
export type LightingId    = Id<'lighting'>;
export type PlumbingId    = Id<'plumbing'>;
/**
 * Sub-element brand for openings — openings live inside `Wall.openings[]`
 * and are not their own top-level element family, but the door / window
 * placement tools mint stable opening ids via `createId('opening')` so
 * the host wall and the inserted door / window can refer to the same
 * opening across the cascade. Adding the brand here keeps the typed-id
 * contract uniform (and prevents `createId('opening')` from being typed
 * as `never`).
 */
export type OpeningId     = Id<'opening'>;
/** §P3.2-FL: Floor finish element.  Added in ELEMENT-OPERATIONS-IMPL-PLAN-2026-05-17. */
export type FloorId       = Id<'floor'>;
/**
 * §P3.4-SE: Section cut annotation element.  Added in ELEMENT-OPERATIONS-IMPL-PLAN-2026-05-17.
 * Ids are minted by CreateSectionHandler as `section-<ts36>-<seq36>`; the brand
 * keeps the type-safe ID contract uniform across all element families.
 */
export type SectionId     = Id<'section'>;

/** Discriminator value the `type` field of a node will hold. */
export type ElementType =
  | 'wall'
  | 'slab'
  | 'door'
  | 'window'
  | 'roof'
  | 'curtainwall'
  | 'grid'
  | 'column'
  | 'beam'
  | 'stair'
  | 'handrail'
  | 'ceiling'
  | 'room'
  | 'furniture'
  | 'annotation'
  | 'dimension'
  | 'sheet'
  | 'schedule'
  | 'view'
  | 'project'
  | 'structural'
  | 'lighting'
  | 'plumbing'
  | 'opening'
  | 'floor'
  | 'section';

/** All branded IDs the protocol surface exposes. */
export type AnyElementId =
  | WallId | SlabId | DoorId | WindowId | RoofId | CurtainWallId
  | GridId | ColumnId | BeamId | StairId | HandrailId | CeilingId
  | RoomId | FurnitureId | AnnotationId | DimensionId | SheetId
  | ScheduleId | ViewId | ProjectId
  | StructuralId | LightingId | PlumbingId
  | OpeningId | FloorId | SectionId;

/** Map element-type discriminator → typed ID. */
export type IdFor<T extends ElementType> =
  T extends 'wall'        ? WallId        :
  T extends 'slab'        ? SlabId        :
  T extends 'door'        ? DoorId        :
  T extends 'window'      ? WindowId      :
  T extends 'roof'        ? RoofId        :
  T extends 'curtainwall' ? CurtainWallId :
  T extends 'grid'        ? GridId        :
  T extends 'column'      ? ColumnId      :
  T extends 'beam'        ? BeamId        :
  T extends 'stair'       ? StairId       :
  T extends 'handrail'    ? HandrailId    :
  T extends 'ceiling'     ? CeilingId     :
  T extends 'room'        ? RoomId        :
  T extends 'furniture'   ? FurnitureId   :
  T extends 'annotation'  ? AnnotationId  :
  T extends 'dimension'   ? DimensionId   :
  T extends 'sheet'       ? SheetId       :
  T extends 'schedule'    ? ScheduleId    :
  T extends 'view'        ? ViewId        :
  T extends 'project'     ? ProjectId     :
  T extends 'structural'  ? StructuralId  :
  T extends 'lighting'    ? LightingId    :
  T extends 'plumbing'    ? PlumbingId    :
  T extends 'opening'     ? OpeningId     :
  T extends 'floor'       ? FloorId       :
  T extends 'section'    ? SectionId     :
  never;
