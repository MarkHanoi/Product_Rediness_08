// A.23.c.1 (Phase A · Sprint 2) — `building.delete` command handler.
//
// Per [C20 §4.1] + §1.1: FORBIDDEN today. The single-Building rule
// makes Building.delete reserved for the C20.1 multi-Building
// amendment. The handler ALWAYS rejects with `forbidden-delete`
// regardless of payload content — the explicit-failure pattern.

import type { BuildingStore } from '../BuildingStore.js';
import {
    BuildingDeletePayloadSchema,
    type AggregateCommandResult,
} from './types.js';

/** building.delete always-rejects "event" shape. Carries no data;
 *  callers know from the result's `ok: false` that the operation was
 *  refused. */
export interface BuildingDeleteForbiddenEvent {
    readonly type: 'building.delete-forbidden';
}

export function buildingDelete(
    rawPayload: unknown,
    _store: BuildingStore,
): AggregateCommandResult<BuildingDeleteForbiddenEvent> {
    try {
        BuildingDeletePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `building.delete payload invalid: ${(err as Error).message}`,
        };
    }
    return {
        ok: false,
        reason: 'forbidden-delete',
        message:
            `building.delete: FORBIDDEN per [C20 §1.1] — single-Building ` +
            `today (multi-Building deferred to C20.1 amendment)`,
    };
}
