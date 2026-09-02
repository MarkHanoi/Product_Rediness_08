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
/** Residential-building (multi-family) §4 — the lift / elevator element. */
export type VerticalCirculationId = Id<'verticalCirculation'>;
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
 * §FEAT-SWIMMING-POOL-ELEMENT (L-292) — the swimming-pool ASSEMBLY parent.
 * A pool OWNS its parts (walls, floor slab, water) through the L0
 * `parentId`/`childrenIds` fields; it carries no geometry of its own. ADR-0124.
 */
export type PoolId        = Id<'pool'>;
/**
 * §FEAT-SWIMMING-POOL-ELEMENT (L-292) — a body of water held by a pool.
 * Its OWN family (not a blue slab) because its quantity is a VOLUME and its
 * surface level is independent of the pool floor. ADR-0124 §4.
 */
export type WaterId       = Id<'water'>;
/**
 * §FEAT-BALCONY-COMPOUND (L-5600) — the balcony COMPOUND parent (C103).
 * A balcony OWNS its three members — a cantilever SLAB, its FLOOR FINISH and the
 * perimeter RAILING runs — through the L0 `parentId` / `childrenIds` fields, the
 * same ownership mechanism `pool` uses (ADR-0124 §3). The balcony record itself
 * carries NO geometry beyond the ONE boundary every member is derived from.
 */
export type BalconyId     = Id<'balcony'>;
/**
 * §COMPONENT-PLACE (audit §12 Phase 4C) · **ADR-0376 D9** — a PLACED OCCURRENCE of
 * a component definition, and **THE JOIN** the universal-component programme exists
 * to build: before this brand there was no bus verb anywhere in the repository that
 * put a component into a project.
 *
 * ⭐ IT IS AN ELEMENT BRAND, NOT A PARALLEL INSTANCE ID, and D9 rules exactly that:
 * a "component instance" concept outside the element model would mint a **second
 * citizenship class in the World Model** — two answers to *"what is in this
 * project"* — which is C84 EI-9 at the largest possible scale.
 *
 * ⚠ DISTINCT FROM `fam_<ULID>` (C111 §1.1-a), which identifies the DEFINITION
 * document. This brand identifies an OCCURRENCE of one, and the two id spaces are
 * deliberately not interchangeable: a definition outlives every occurrence of it.
 */
export type ComponentId   = Id<'component'>;
/**
 * §FEAT-PROJECT-ORIGIN (L-109) — the singleton Project Origin / Base Point.
 * One per project; the always-on blue-sphere coordination datum whose position
 * IS the shared-coordinate origin (C19 §1.3 LTP-ENU / ADR-0115 project base point).
 */
export type ProjectOriginId = Id<'projectOrigin'>;
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
/**
 * §FEAT-LIFT-COMPOUND-SYSTEM (L-5711, promoted 2026-08-22 by §FIX-LIFT-UNREACHABLE
 * L-7021) — the lift COMPOUND parent (C104, extending C103).
 *
 * A lift OWNS its members — the shaft ENCLOSURE sides, one landing DOOR per served
 * storey, and the five LOD-300 CABIN parts — through the L0 `parentId` /
 * `childrenIds` fields, the same ownership mechanism `pool` (ADR-0124 §3) and
 * `balcony` (C103) use.
 *
 * ⚠ NOT `VerticalCirculationId`, AND THE TWO MUST NOT BE MERGED. That brand belongs to
 * the LOD-200 MASSING lift the residential/office batch executors create through
 * `CreateVerticalCirculationCommand` — a different store, a different record, a
 * different level of detail. `LiftCompoundTypes.ts` explains why both exist;
 * collapsing the brands would let a massing shaft be handed to a command that expects
 * a compound, which is precisely the confusion the brands exist to prevent.
 *
 * ⭐ THIS IS THE PROMOTION `liftReachableThroughComposedRuntime.test.ts` ANTICIPATED —
 * its ids are minted "in the same shape so a later L0 promotion (L-5711) does not have
 * to rewrite this file". Until now `createId('lift')` was a type error, so the ONE id
 * factory could not mint the ONE id the compound needs, and a caller's only options
 * were a hand-built string (a second vocabulary — C84 EI-8) or a cast.
 */
export type LiftId        = Id<'lift'>;
/**
 * §FEAT-LIFT-COMPOUND-SYSTEM (L-5711 / L-7021) — one LOD-300 lift CABIN part.
 *
 * The five kinds are `LIFT_PART_CYCLE_ORDER` (structure, wall finish, floor, ceiling,
 * door). A cabin part is created and destroyed ONLY as part of a lift compound (C104
 * §2) — `lift.create` owns the only write path, which is why `PluginRegistry` gives
 * the `liftPart` store NO handlers of its own.
 */
export type LiftPartId    = Id<'liftPart'>;
/**
 * §BATH102 (L-11480, C109) — the LOD-300 parametric BATHROOM POD compound parent.
 *
 * A pod OWNS its members — the WC, the basin, the shower (glass panel INCLUDED, C109
 * R-8) and any accessories — through `members[]` + `parentId`, the same ownership
 * mechanism `pool` (ADR-0124 §3), `balcony` and `lift` (C104 §4) use. Every member is
 * a record in the `plumbing` family; the pod mints exactly ONE new family — itself
 * (C109 §2).
 *
 * ⚠ THIS IS THE **BRAND ONLY**, AND THE SPLIT IS DELIBERATE. C109 §12 defers the L0
 * promotion of `BathroomPodSchema` — the Zod shape stays in
 * `packages/geometry-plumbing/` and `bathroomPod` is **not** in `SCHEMA_REGISTRY`,
 * because moving the schema changes **what validates a persisted project**, which is a
 * C47 format question deserving its own blast radius (C104's L-7061, still OPEN). The
 * BRAND carries none of that: it is a string-literal member of a type union with no
 * I/O, no runtime and no persistence consequence, and without it `createId` — the ONE
 * id factory — could not mint the one id the compound needs, leaving a caller with a
 * hand-built string (a second vocabulary, C84 EI-8) or a cast. That is the exact
 * argument `LiftId` above makes, and §12 is amended to record the two halves
 * separately rather than as one deferral.
 */
export type BathroomPodId = Id<'bathroomPod'>;
/**
 * §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900, C106) — the AUTHORED construction /
 * setting-out line an architect draws to lay a scheme out at early-stage design.
 *
 * ⛔ NOT THE CADASTRAL PARCEL BOUNDARY. `Parcel.boundary` (C19 §1.4) is a legal,
 * surveyed, ONE-SHOT IMMUTABLE polygon owned by the site subsystem — there is
 * deliberately no `site.editParcelBoundary` command. A `BoundaryLine` is the exact
 * opposite: authored, editable, moveable, and a HOST that carries its dependents when
 * it moves (C106 §3). Merging the two would let an ordinary edit gesture rewrite a
 * legal title outline, which is why they carry different brands and different stores.
 *
 * ⛔ AND NOT `RoomBoundingLine` (`core-app-model`, `CommandType.CREATE_ROOM_BOUNDING_LINE`).
 * That is a 2-point INVISIBLE splitter consumed by room DETECTION to divide an
 * open-plan space; it hosts nothing, has no volume and no LOD. C106 §0.2 tabulates
 * all three lines side by side so a reader cannot confuse them.
 */
export type BoundaryLineId = Id<'boundaryLine'>;
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
  | 'verticalCirculation'
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
  | 'projectOrigin'
  | 'pool'
  | 'water'
  | 'balcony'
  // §COMPONENT-PLACE (audit §12 Phase 4C) · ADR-0376 D9 — the placed occurrence of
  // a component definition. THE JOIN. See `ComponentId` above for why it is an
  // element discriminator and not a parallel instance concept.
  | 'component'
  | 'lift'
  | 'liftPart'
  // §BATH102 (L-11480, C109) — the LOD-300 parametric bathroom-pod compound parent.
  // ⚠ BRAND ONLY; the Zod schema's L0 promotion stays deferred — see `BathroomPodId`.
  | 'bathroomPod'
  // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900, C106) — the authored setting-out line.
  | 'boundaryLine'
  | 'opening'
  | 'floor'
  | 'section';

/** All branded IDs the protocol surface exposes. */
export type AnyElementId =
  | WallId | SlabId | DoorId | WindowId | RoofId | CurtainWallId
  | GridId | ColumnId | BeamId | StairId | VerticalCirculationId | HandrailId | CeilingId
  | RoomId | FurnitureId | AnnotationId | DimensionId | SheetId
  | ScheduleId | ViewId | ProjectId
  | StructuralId | LightingId | PlumbingId | ProjectOriginId
  | PoolId | WaterId | BalconyId | ComponentId | LiftId | LiftPartId | BathroomPodId | BoundaryLineId
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
  T extends 'verticalCirculation' ? VerticalCirculationId :
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
  T extends 'projectOrigin' ? ProjectOriginId :
  T extends 'pool'        ? PoolId        :
  T extends 'water'       ? WaterId       :
  T extends 'balcony'     ? BalconyId      :
  // §COMPONENT-PLACE · ADR-0376 D9 — the placed component occurrence.
  T extends 'component'   ? ComponentId   :
  T extends 'lift'        ? LiftId        :
  T extends 'liftPart'    ? LiftPartId    :
  // §BATH102 (L-11480, C109) — brand only; see `BathroomPodId`.
  T extends 'bathroomPod' ? BathroomPodId :
  T extends 'boundaryLine' ? BoundaryLineId :
  T extends 'opening'     ? OpeningId     :
  T extends 'floor'       ? FloorId       :
  T extends 'section'    ? SectionId     :
  never;
