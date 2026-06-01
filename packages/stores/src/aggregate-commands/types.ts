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

// ─────────────────────────────────────────────────────────────────────────────
// Re-export aggregate types for handler consumers (saves an import).
// ─────────────────────────────────────────────────────────────────────────────

export type {
    Building,
    Level,
    Apartment,
    Room,
};
