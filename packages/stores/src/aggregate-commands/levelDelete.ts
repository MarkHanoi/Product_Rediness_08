// A.23.c.2 (Phase A · Sprint 2) — `level.delete` command handler.
//
// Per [C20 §4.2 + §1.9]: cascades to Apartments + Rooms on the Level.
// This handler ONLY removes the Level — the L5 dispatch caller is
// responsible for first invoking apartment.delete + room.delete on the
// children (per §1.9 "deepest first" deletion order).
//
// Refuses if any Apartments still reference the Level — the explicit
// cascade-first pattern. Rooms with apartmentId=null (public-corridor
// case, A.23.b.3 future) are not blocking — they're attached to the
// Level directly and follow it.

import type { LevelId, BuildingId } from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import type { ApartmentStore } from '../ApartmentStore.js';
import {
    LevelDeletePayloadSchema,
    type AggregateCommandResult,
    type LevelDeletedEvent,
} from './types.js';

export function levelDelete(
    rawPayload: unknown,
    levelStore: LevelStore,
    apartmentStore: ApartmentStore,
): AggregateCommandResult<LevelDeletedEvent> {
    let payload;
    try {
        payload = LevelDeletePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `level.delete payload invalid: ${(err as Error).message}`,
        };
    }

    const target = levelStore.get(payload.id as LevelId);
    if (!target) {
        return {
            ok: false,
            reason: 'no-level',
            message: `level.delete: no Level with id '${payload.id}'`,
        };
    }

    // §1.9 — caller MUST cascade Apartments first.
    const apartments = apartmentStore.listForLevel(target.id as LevelId);
    if (apartments.length > 0) {
        return {
            ok: false,
            reason: 'level-has-apartments',
            message:
                `level.delete: ${apartments.length} Apartment(s) still on ` +
                `Level '${target.id}' — cascade apartment.delete first ` +
                `per [C20 §1.9] (deepest-first deletion order)`,
        };
    }

    // Suppress unused-variable lint on buildingId — we capture it for
    // the future audit trail (when L5 emits the OTel span this is the
    // attribute the inspect panel scopes to).
    void (target.buildingId as BuildingId);

    levelStore.remove(target.id as LevelId);
    return {
        ok: true,
        event: { type: 'level.deleted', level: target },
    };
}
