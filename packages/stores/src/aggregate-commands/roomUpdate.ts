// A.23.c.4 (Phase A · Sprint 2) — `room.update` command handler.
//
// Per [C20 §4.4]: patches Room fields + optionally the parameters
// record. If levelId or apartmentId changes, re-validates §1.4 same-
// Level constraint. Keeps parameters.id === Room.id per §1.5.

import {
    RoomSchema,
    type Room,
    type RoomId,
    type ApartmentId,
    type LevelId,
} from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import type { ApartmentStore } from '../ApartmentStore.js';
import type { RoomStore } from '../RoomStore.js';
import {
    RoomUpdatePayloadSchema,
    type AggregateCommandResult,
    type RoomUpdatedEvent,
} from './types.js';

export function roomUpdate(
    rawPayload: unknown,
    levelStore: LevelStore,
    apartmentStore: ApartmentStore,
    roomStore: RoomStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<RoomUpdatedEvent> {
    let payload;
    try {
        payload = RoomUpdatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `room.update payload invalid: ${(err as Error).message}`,
        };
    }

    const prior = roomStore.get(payload.id as RoomId);
    if (!prior) {
        return {
            ok: false,
            reason: 'no-room',
            message: `room.update: no Room with id '${payload.id}'`,
        };
    }

    // Determine the final levelId + apartmentId after patch.
    const finalLevelId = payload.patch.levelId ?? prior.levelId;
    const finalApartmentId =
        payload.patch.apartmentId ?? prior.apartmentId;

    // Re-validate §1.4 same-Level if either changed.
    const levelChanged = payload.patch.levelId !== undefined;
    const apartmentChanged = payload.patch.apartmentId !== undefined;
    if (levelChanged || apartmentChanged) {
        if (!levelStore.has(finalLevelId as LevelId)) {
            return {
                ok: false,
                reason: 'no-level',
                message: `room.update: target Level '${finalLevelId}' does not exist`,
            };
        }
        const apt = apartmentStore.get(finalApartmentId as ApartmentId);
        if (!apt) {
            return {
                ok: false,
                reason: 'no-apartment',
                message:
                    `room.update: target Apartment '${finalApartmentId}' does not exist`,
            };
        }
        if (apt.levelId !== finalLevelId) {
            return {
                ok: false,
                reason: 'apartment-level-mismatch',
                message:
                    `room.update: Apartment '${finalApartmentId}' is on Level ` +
                    `'${apt.levelId}', not '${finalLevelId}' (per [C20 §1.4])`,
            };
        }
    }

    // Compose next Room.
    const nextRaw: Record<string, unknown> = { ...prior };
    if (payload.patch.name !== undefined) nextRaw.name = payload.patch.name;
    if (payload.patch.levelId !== undefined) nextRaw.levelId = payload.patch.levelId;
    if (payload.patch.apartmentId !== undefined) {
        nextRaw.apartmentId = payload.patch.apartmentId;
    }
    nextRaw.updatedAt = now();
    if (payload.parameterPatch !== undefined) {
        const paramsPatch =
            payload.parameterPatch as Record<string, unknown> | null;
        nextRaw.parameters = {
            ...(prior.parameters as Record<string, unknown>),
            ...(paramsPatch ?? {}),
            id: prior.id,
            apartmentId: finalApartmentId,
        };
    } else if (apartmentChanged) {
        // Keep parameters.apartmentId in sync per §1.5.
        nextRaw.parameters = {
            ...(prior.parameters as Record<string, unknown>),
            apartmentId: finalApartmentId,
        };
    }

    let next: Room;
    try {
        next = RoomSchema.parse(nextRaw);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `room.update: post-patch validation failed: ${(err as Error).message}`,
        };
    }

    roomStore.update(next);
    return {
        ok: true,
        event: { type: 'room.updated', room: next, prior },
    };
}
