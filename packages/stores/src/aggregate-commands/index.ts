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
export { levelCreate } from './levelCreate.js';
export { levelUpdate } from './levelUpdate.js';
export { levelSetActive } from './levelSetActive.js';
export { levelDelete } from './levelDelete.js';

export {
    BuildingCreatePayloadSchema,
    BuildingUpdatePayloadSchema,
    BuildingDeletePayloadSchema,
    LevelCreatePayloadSchema,
    LevelUpdatePayloadSchema,
    LevelSetActivePayloadSchema,
    LevelDeletePayloadSchema,
    type BuildingCreatePayload,
    type BuildingUpdatePayload,
    type BuildingDeletePayload,
    type LevelCreatePayload,
    type LevelUpdatePayload,
    type LevelSetActivePayload,
    type LevelDeletePayload,
    type AggregateCommandResult,
    type AggregateCommandRejection,
    type BuildingCreatedEvent,
    type BuildingUpdatedEvent,
    type LevelCreatedEvent,
    type LevelUpdatedEvent,
    type LevelActiveSetEvent,
    type LevelDeletedEvent,
} from './types.js';
