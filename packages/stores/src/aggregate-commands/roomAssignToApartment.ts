// A.23.c.4 (Phase A · Sprint 2) — `room.assignToApartment` command handler.
//
// Per [C20 §4.4]: sets Room.apartmentId. Validates §1.4 same-Level
// constraint — the target Apartment MUST be on the same Level as the
// Room.
//
// Until A.23.b.3 widens RoomParameters.apartmentId to nullable, the
// payload requires a non-null apartmentId. (The contract allows null
// for public-corridor re-assignment, deferred.)

import {
    RoomSchema,
    type Room,
    type RoomId,
    type ApartmentId,
} from '@pryzm/schemas/aggregates';
import type { ApartmentStore } from '../ApartmentStore.js';
import type { RoomStore } from '../RoomStore.js';
import {
    RoomAssignToApartmentPayloadSchema,
    type AggregateCommandResult,
    type RoomAssignedToApartmentEvent,
} from './types.js';

export function roomAssignToApartment(
    rawPayload: unknown,
    apartmentStore: ApartmentStore,
    roomStore: RoomStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<RoomAssignedToApartmentEvent> {
    let payload;
    try {
        payload = RoomAssignToApartmentPayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `room.assignToApartment payload invalid: ${(err as Error).message}`,
        };
    }

    const room = roomStore.get(payload.roomId as RoomId);
    if (!room) {
        return {
            ok: false,
            reason: 'no-room',
            message: `room.assignToApartment: no Room with id '${payload.roomId}'`,
        };
    }

    const apt = apartmentStore.get(payload.apartmentId as ApartmentId);
    if (!apt) {
        return {
            ok: false,
            reason: 'no-apartment',
            message:
                `room.assignToApartment: no Apartment with id '${payload.apartmentId}'`,
        };
    }

    // §1.4 same-Level check.
    if (apt.levelId !== room.levelId) {
        return {
            ok: false,
            reason: 'apartment-level-mismatch',
            message:
                `room.assignToApartment: Apartment '${apt.id}' is on Level ` +
                `'${apt.levelId}', but Room '${room.id}' is on Level ` +
                `'${room.levelId}' (per [C20 §1.4])`,
        };
    }

    const priorApartmentId = room.apartmentId;
    if (priorApartmentId === payload.apartmentId) {
        // Idempotent — fire the event so subscribers stay in sync,
        // but no actual store mutation.
        return {
            ok: true,
            event: {
                type: 'room.assigned-to-apartment',
                roomId: room.id,
                apartmentId: payload.apartmentId,
                priorApartmentId: priorApartmentId,
            },
        };
    }

    // Mutate Room.apartmentId + sync parameters.apartmentId per §1.5.
    let next: Room;
    try {
        next = RoomSchema.parse({
            ...room,
            apartmentId: payload.apartmentId,
            parameters: {
                ...(room.parameters as Record<string, unknown>),
                apartmentId: payload.apartmentId,
            },
            updatedAt: now(),
        });
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `room.assignToApartment: post-assign validation failed: ` +
                `${(err as Error).message}`,
        };
    }
    roomStore.update(next);

    return {
        ok: true,
        event: {
            type: 'room.assigned-to-apartment',
            roomId: room.id,
            apartmentId: payload.apartmentId,
            priorApartmentId,
        },
    };
}
