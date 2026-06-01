// A.23.c (Phase A · Sprint 2) — Public surface for the C20 aggregate
// command handlers.
//
// Pattern parallels site-commands (A.7.c) + climate-commands (A.10.e):
// pure handler functions `(payload, store, [now]) → AggregateCommandResult`.
// Programmer errors throw via Zod; pack/invariant errors fail-soft.
//
// Slice contents:
//   A.23.c.1 (this) — building.* (create + update + delete-forbidden)
//   A.23.c.2+ planned — level.* / apartment.* / room.* surfaces

export { buildingCreate, deterministicBuildingId } from './buildingCreate.js';
export { buildingUpdate } from './buildingUpdate.js';
export { buildingDelete } from './buildingDelete.js';
export type { BuildingDeleteForbiddenEvent } from './buildingDelete.js';

export {
    BuildingCreatePayloadSchema,
    BuildingUpdatePayloadSchema,
    BuildingDeletePayloadSchema,
    type BuildingCreatePayload,
    type BuildingUpdatePayload,
    type BuildingDeletePayload,
    type AggregateCommandResult,
    type AggregateCommandRejection,
    type BuildingCreatedEvent,
    type BuildingUpdatedEvent,
} from './types.js';
