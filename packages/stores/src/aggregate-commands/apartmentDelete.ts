// A.23.c.3 (Phase A · Sprint 2) — `apartment.delete` command handler.
//
// Per [C20 §4.3 + §1.9]: the contract says "Unassigns every Room
// (Room.apartmentId = null); does NOT delete the Rooms". The current
// L0 schema has `Room.apartmentId` REQUIRED (the C20 §2.4 nullable
// widening ships in A.23.b.3) — so this handler CASCADE-DELETES
// the Rooms via RoomStore.removeForApartment for now.
//
// Once A.23.b.3 widens apartmentId to nullable, this handler updates
// to "unassign" semantics: iterate the Rooms, set apartmentId=null
// on each, re-store, then remove the Apartment. The event will then
// carry an `unassignedRoomCount` instead of `cascadedRoomCount`.

import type {
    ApartmentId,
} from '@pryzm/schemas/aggregates';
import type { ApartmentStore } from '../ApartmentStore.js';
import type { RoomStore } from '../RoomStore.js';
import {
    ApartmentDeletePayloadSchema,
    type AggregateCommandResult,
    type ApartmentDeletedEvent,
} from './types.js';

export function apartmentDelete(
    rawPayload: unknown,
    apartmentStore: ApartmentStore,
    roomStore: RoomStore,
): AggregateCommandResult<ApartmentDeletedEvent> {
    let payload;
    try {
        payload = ApartmentDeletePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `apartment.delete payload invalid: ${(err as Error).message}`,
        };
    }

    const target = apartmentStore.get(payload.id as ApartmentId);
    if (!target) {
        return {
            ok: false,
            reason: 'no-apartment',
            message: `apartment.delete: no Apartment with id '${payload.id}'`,
        };
    }

    // §1.9 — cascade-delete Rooms first (will become "unassign" after
    // A.23.b.3 nullable widening). RoomStore.removeForApartment returns
    // the count for the event payload.
    const cascadedRoomCount = roomStore.removeForApartment(
        target.id as ApartmentId,
    );
    apartmentStore.remove(target.id as ApartmentId);

    return {
        ok: true,
        event: {
            type: 'apartment.deleted',
            apartment: target,
            cascadedRoomCount,
        },
    };
}
