// A.23.c.4 (Phase A · Sprint 2) — `room.delete` command handler.
//
// Per [C20 §4.4 + §1.9]: removes the Room. Per contract, cascades to
// room-scoped elements (furniture, ceilings, room-scoped lighting) —
// at this L3 layer the handler only drops the Room. The L5 dispatch
// caller invokes element-cascade commands BEFORE this room.delete
// (per §1.9 "deepest first" deletion order).

import type { RoomId } from '@pryzm/schemas/aggregates';
import type { RoomStore } from '../RoomStore.js';
import {
    RoomDeletePayloadSchema,
    type AggregateCommandResult,
    type RoomDeletedEvent,
} from './types.js';

export function roomDelete(
    rawPayload: unknown,
    roomStore: RoomStore,
): AggregateCommandResult<RoomDeletedEvent> {
    let payload;
    try {
        payload = RoomDeletePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `room.delete payload invalid: ${(err as Error).message}`,
        };
    }

    const target = roomStore.get(payload.id as RoomId);
    if (!target) {
        return {
            ok: false,
            reason: 'no-room',
            message: `room.delete: no Room with id '${payload.id}'`,
        };
    }

    roomStore.remove(target.id as RoomId);
    return {
        ok: true,
        event: { type: 'room.deleted', room: target },
    };
}
