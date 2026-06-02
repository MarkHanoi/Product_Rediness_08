// A.23.c.4 (Phase A · Sprint 2) — `room.create` command handler.
//
// Per [C20 §4.4 + §1.4 + §1.5]:
//   - Level (levelId) exists in LevelStore
//   - Apartment (apartmentId) exists AND Apartment.levelId === Room.levelId
//   - parameters.id === Room.id (handler sets)
//   - parameters.apartmentId === Room.apartmentId (handler sets)

import {
    RoomSchema,
    type Room,
    type ApartmentId,
    type LevelId,
} from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import type { ApartmentStore } from '../ApartmentStore.js';
import type { RoomStore } from '../RoomStore.js';
import {
    RoomCreatePayloadSchema,
    type AggregateCommandResult,
    type RoomCreatedEvent,
} from './types.js';

let roomCounter = 0;
function mintRoomId(name: string): string {
    roomCounter += 1;
    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `rm_${slug}_${roomCounter}`;
}

export function roomCreate(
    rawPayload: unknown,
    levelStore: LevelStore,
    apartmentStore: ApartmentStore,
    roomStore: RoomStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<RoomCreatedEvent> {
    let payload;
    try {
        payload = RoomCreatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `room.create payload invalid: ${(err as Error).message}`,
        };
    }

    // §1.4 — Level MUST exist.
    if (!levelStore.has(payload.levelId as LevelId)) {
        return {
            ok: false,
            reason: 'no-level',
            message: `room.create: no Level with id '${payload.levelId}'`,
        };
    }

    // §1.4 — Apartment MUST exist + share the Level.
    const apt = apartmentStore.get(payload.apartmentId as ApartmentId);
    if (!apt) {
        return {
            ok: false,
            reason: 'no-apartment',
            message: `room.create: no Apartment with id '${payload.apartmentId}'`,
        };
    }
    if (apt.levelId !== payload.levelId) {
        return {
            ok: false,
            reason: 'apartment-level-mismatch',
            message:
                `room.create: Apartment '${payload.apartmentId}' is on Level ` +
                `'${apt.levelId}', not '${payload.levelId}' (per [C20 §1.4])`,
        };
    }

    // Mint id + sync parameters.id + apartmentId per §1.5.
    const roomId = mintRoomId(payload.name);
    const paramsRaw = payload.parameters as Record<string, unknown> | undefined;
    const parameters = {
        ...(paramsRaw ?? {}),
        id: roomId,
        apartmentId: payload.apartmentId,
        name: payload.name,
    };
    const ts = now();
    let room: Room;
    try {
        room = RoomSchema.parse({
            id: roomId,
            levelId: payload.levelId,
            apartmentId: payload.apartmentId,
            name: payload.name,
            parameters,
            createdAt: ts,
            updatedAt: ts,
        });
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `room.create: SchemaParseFailed (likely parameters): ` +
                `${(err as Error).message}`,
        };
    }

    roomStore.add(room);
    return {
        ok: true,
        event: { type: 'room.created', room },
    };
}
