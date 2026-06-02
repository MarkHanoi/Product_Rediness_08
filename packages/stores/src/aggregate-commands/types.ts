// A.23.c (Phase A · Sprint 2) — aggregate command payloads + shared
// result/rejection types. Pattern parallels site-commands (A.7.c) and
// climate-commands (A.10.e).
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md §4
//   - docs/03-execution/plans/master-execution-tracker.md A.23.c

import { z } from 'zod';
import {
    BuildingIdSchema,
    LevelIdSchema,
    ApartmentIdSchema,
    RoomIdSchema,
    type Building,
    type Level,
    type Apartment,
    type Room,
} from '@pryzm/schemas/aggregates';
import { ProjectIdSchema, SiteIdSchema } from '@pryzm/schemas';

// ─────────────────────────────────────────────────────────────────────────────
// Shared rejection enum + result discriminated union.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Soft rejection reasons for aggregate commands. Programmer errors
 * (missing payload fields, malformed input) throw via Zod.
 */
export type AggregateCommandRejection =
    | 'no-building'                        // §1.1 — Building absent
    | 'building-already-exists'           // §1.1 — single-Building rule
    | 'no-level'                          // §1.2 — Level not found
    | 'no-apartment'                      // §1.3 — Apartment not found
    | 'no-room'                           // §1.4 — Room not found
    | 'level-number-conflict'             // §1.2 — non-unique levelNumber
    | 'elevation-conflict'                // §1.2 — non-unique elevation
    | 'level-buildingId-mismatch'         // §1.2 — Level.buildingId unknown
    | 'unit-number-conflict'              // §1.3 — non-unique unitNumber
    | 'apartment-level-mismatch'          // §1.4 — Room.levelId mismatch
    | 'cannot-change-projectId'           // §1.1 — projectId immutable
    | 'cannot-change-buildingId'          // §1.2 — Level.buildingId immutable
    | 'level-has-apartments'              // §1.9 — must cascade-delete first
    | 'forbidden-delete'                  // §1.1 — building.delete is reserved
    | 'invalid-payload';                   // generic Zod failure

export type AggregateCommandResult<TEvent extends { type: string }> =
    | { readonly ok: true; readonly event: TEvent }
    | {
          readonly ok: false;
          readonly reason: AggregateCommandRejection;
          readonly message: string;
      };

// ─────────────────────────────────────────────────────────────────────────────
// building.* payloads (§4.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `building.create` payload — per [C20 §4.1].
 * MUST fail when a Building already exists in the project (§1.1).
 * The handler synthesises the full Building (id auto-generated,
 * createdAt/updatedAt set to now, ordinal default 0) from the
 * payload's essentials.
 */
export const BuildingCreatePayloadSchema = z.object({
    projectId: ProjectIdSchema,
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    siteId: SiteIdSchema.optional(),
});
export type BuildingCreatePayload = z.infer<
    typeof BuildingCreatePayloadSchema
>;

/**
 * `building.update` payload — per [C20 §4.1].
 * Patches mutable fields (name · description · siteId · ordinal).
 * The handler MUST refuse to change `projectId` (§1.1 isolation).
 */
export const BuildingUpdatePayloadSchema = z.object({
    id: BuildingIdSchema,
    patch: z
        .object({
            name: z.string().min(1).max(120).optional(),
            description: z.string().max(2000).optional(),
            siteId: SiteIdSchema.nullable().optional(),
            ordinal: z.number().int().min(0).optional(),
        })
        .refine(
            (p) => Object.keys(p).length > 0,
            'building.update: patch is empty',
        ),
});
export type BuildingUpdatePayload = z.infer<
    typeof BuildingUpdatePayloadSchema
>;

/**
 * `building.delete` payload — per [C20 §4.1] FORBIDDEN.
 * The handler ALWAYS rejects with `forbidden-delete` regardless of
 * payload content (C20.1 amendment may relax this in future).
 */
export const BuildingDeletePayloadSchema = z.object({
    id: BuildingIdSchema,
});
export type BuildingDeletePayload = z.infer<
    typeof BuildingDeletePayloadSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// level.* payloads (§4.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `level.create` payload — per [C20 §4.2].
 * Handler MUST validate per [C20 §1.2]:
 *   - Building (buildingId) exists in BuildingStore
 *   - levelNumber is UNIQUE within the Building
 *   - elevation is UNIQUE within the Building
 *   - monotonic-elevation invariant — adding a new (number, elevation)
 *     does not break the existing ordering
 */
export const LevelCreatePayloadSchema = z.object({
    buildingId: BuildingIdSchema,
    name: z.string().min(1).max(80),
    levelNumber: z.number().int(),
    elevation: z.number().finite(),
    height: z.number().positive().max(20),
    isActive: z.boolean().optional(),
    isReference: z.boolean().optional(),
});
export type LevelCreatePayload = z.infer<typeof LevelCreatePayloadSchema>;

/**
 * `level.update` payload — per [C20 §4.2].
 * Mutates Level fields. If `levelNumber` or `elevation` changes, the
 * handler MUST re-validate §1.2 uniqueness + monotonicity across the
 * Building.
 */
export const LevelUpdatePayloadSchema = z.object({
    id: LevelIdSchema,
    patch: z
        .object({
            name: z.string().min(1).max(80).optional(),
            levelNumber: z.number().int().optional(),
            elevation: z.number().finite().optional(),
            height: z.number().positive().max(20).optional(),
            isActive: z.boolean().optional(),
            isReference: z.boolean().optional(),
        })
        .refine(
            (p) => Object.keys(p).length > 0,
            'level.update: patch is empty',
        ),
});
export type LevelUpdatePayload = z.infer<typeof LevelUpdatePayloadSchema>;

/**
 * `level.setActive` payload — per [C20 §4.2].
 * Sets the named Level's isActive=true and clears every other Level
 * (in the same Building) per [C20 §1.2] (zero-or-one active).
 */
export const LevelSetActivePayloadSchema = z.object({
    id: LevelIdSchema,
});
export type LevelSetActivePayload = z.infer<
    typeof LevelSetActivePayloadSchema
>;

/**
 * `level.delete` payload — per [C20 §4.2].
 * Cascades to every Apartment + Room on the Level per [§1.9]. This
 * handler only removes the LEVEL — the dispatch caller is responsible
 * for first invoking apartment.delete + room.delete on the children
 * (per the §1.9 "deepest first" deletion order). The handler refuses
 * if any Apartments / Rooms still reference the Level — explicit
 * cascade by the L5 caller, not silent.
 */
export const LevelDeletePayloadSchema = z.object({
    id: LevelIdSchema,
});
export type LevelDeletePayload = z.infer<typeof LevelDeletePayloadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// apartment.* payloads (§4.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `apartment.create` — per [C20 §4.3].
 * Handler validates: Level exists; Level.buildingId === payload.buildingId;
 * unitNumber unique within Building.
 * Per [§1.5] `parameters.id` MUST equal `Apartment.id` — the handler
 * mints id then sets parameters.id to match.
 */
export const ApartmentCreatePayloadSchema = z.object({
    buildingId: BuildingIdSchema,
    levelId: LevelIdSchema,
    name: z.string().min(1).max(120),
    unitNumber: z.string().min(1).max(20),
    /** ApartmentParameters payload (id will be set by handler). */
    parameters: z.unknown(),
});
export type ApartmentCreatePayload = z.infer<
    typeof ApartmentCreatePayloadSchema
>;

/**
 * `apartment.update` — per [C20 §4.3]. Patches Apartment fields +
 * optionally the parameters record. Re-validates unitNumber uniqueness
 * if it changes.
 */
export const ApartmentUpdatePayloadSchema = z.object({
    id: ApartmentIdSchema,
    patch: z.object({
        name: z.string().min(1).max(120).optional(),
        unitNumber: z.string().min(1).max(20).optional(),
        levelId: LevelIdSchema.optional(),
    }),
    parameterPatch: z.unknown().optional(),
});
export type ApartmentUpdatePayload = z.infer<
    typeof ApartmentUpdatePayloadSchema
>;

/**
 * `apartment.delete` — per [C20 §4.3] + §1.9.
 * Cascade-deletes the Rooms via RoomStore.removeForApartment. (Once
 * A.23.b.3 ships nullable apartmentId, this switches to UNASSIGN
 * semantics per the contract.)
 */
export const ApartmentDeletePayloadSchema = z.object({
    id: ApartmentIdSchema,
});
export type ApartmentDeletePayload = z.infer<
    typeof ApartmentDeletePayloadSchema
>;

// ─────────────────────────────────────────────────────────────────────────────
// Domain events
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildingCreatedEvent {
    readonly type: 'building.created';
    readonly building: Building;
}

export interface BuildingUpdatedEvent {
    readonly type: 'building.updated';
    readonly building: Building;
    readonly prior: Building;
}

export interface LevelCreatedEvent {
    readonly type: 'level.created';
    readonly level: Level;
}

export interface LevelUpdatedEvent {
    readonly type: 'level.updated';
    readonly level: Level;
    readonly prior: Level;
}

export interface LevelActiveSetEvent {
    readonly type: 'level.active-set';
    readonly levelId: string;
    /** Prior active Level id in the same Building (null when none). */
    readonly priorActiveId: string | null;
}

export interface LevelDeletedEvent {
    readonly type: 'level.deleted';
    readonly level: Level;
}

export interface ApartmentCreatedEvent {
    readonly type: 'apartment.created';
    readonly apartment: Apartment;
}

export interface ApartmentUpdatedEvent {
    readonly type: 'apartment.updated';
    readonly apartment: Apartment;
    readonly prior: Apartment;
}

export interface ApartmentDeletedEvent {
    readonly type: 'apartment.deleted';
    readonly apartment: Apartment;
    readonly cascadedRoomCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export aggregate types for handler consumers (saves an import).
// ─────────────────────────────────────────────────────────────────────────────

export type {
    Building,
    Level,
    Apartment,
    Room,
};
