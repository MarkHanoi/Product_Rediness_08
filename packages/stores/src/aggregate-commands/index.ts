// A.23.c (Phase A · Sprint 2) — Public surface for the C20 aggregate
// command handlers.
//
// Pattern parallels site-commands (A.7.c) + climate-commands (A.10.e):
// pure handler functions `(payload, store, [now]) → AggregateCommandResult`.
// Programmer errors throw via Zod; pack/invariant errors fail-soft.
//
// Slice contents:
//   A.23.c.1 — building.* (create + update + delete-forbidden)
//   A.23.c.2 — level.* (create + update + setActive + delete)
//   A.23.c.3 — apartment.* (create + update + delete with Room cascade)
//   A.23.c.4 — room.* (create + update + delete + assignToApartment)

export { buildingCreate, deterministicBuildingId } from './buildingCreate.js';
export { buildingUpdate } from './buildingUpdate.js';
export { buildingDelete } from './buildingDelete.js';
export type { BuildingDeleteForbiddenEvent } from './buildingDelete.js';
export { levelCreate } from './levelCreate.js';
export { levelUpdate } from './levelUpdate.js';
export { levelSetActive } from './levelSetActive.js';
export { levelDelete } from './levelDelete.js';
export { apartmentCreate } from './apartmentCreate.js';
export { apartmentUpdate } from './apartmentUpdate.js';
export { apartmentDelete } from './apartmentDelete.js';
export { roomCreate } from './roomCreate.js';
export { roomUpdate } from './roomUpdate.js';
export { roomDelete } from './roomDelete.js';
export { roomAssignToApartment } from './roomAssignToApartment.js';

export {
    BuildingCreatePayloadSchema,
    BuildingUpdatePayloadSchema,
    BuildingDeletePayloadSchema,
    LevelCreatePayloadSchema,
    LevelUpdatePayloadSchema,
    LevelSetActivePayloadSchema,
    LevelDeletePayloadSchema,
    ApartmentCreatePayloadSchema,
    ApartmentUpdatePayloadSchema,
    ApartmentDeletePayloadSchema,
    RoomCreatePayloadSchema,
    RoomUpdatePayloadSchema,
    RoomDeletePayloadSchema,
    RoomAssignToApartmentPayloadSchema,
    type BuildingCreatePayload,
    type BuildingUpdatePayload,
    type BuildingDeletePayload,
    type LevelCreatePayload,
    type LevelUpdatePayload,
    type LevelSetActivePayload,
    type LevelDeletePayload,
    type ApartmentCreatePayload,
    type ApartmentUpdatePayload,
    type ApartmentDeletePayload,
    type RoomCreatePayload,
    type RoomUpdatePayload,
    type RoomDeletePayload,
    type RoomAssignToApartmentPayload,
    type AggregateCommandResult,
    type AggregateCommandRejection,
    type BuildingCreatedEvent,
    type BuildingUpdatedEvent,
    type LevelCreatedEvent,
    type LevelUpdatedEvent,
    type LevelActiveSetEvent,
    type LevelDeletedEvent,
    type ApartmentCreatedEvent,
    type ApartmentUpdatedEvent,
    type ApartmentDeletedEvent,
    type RoomCreatedEvent,
    type RoomUpdatedEvent,
    type RoomDeletedEvent,
    type RoomAssignedToApartmentEvent,
} from './types.js';
