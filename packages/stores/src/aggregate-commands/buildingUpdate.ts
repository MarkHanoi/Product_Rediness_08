// A.23.c.1 (Phase A · Sprint 2) — `building.update` command handler.
//
// Per [C20 §4.1]: patches mutable Building fields. MUST refuse to
// change `projectId` (§1.1 per-project isolation). Updates `updatedAt`
// to now. The event carries the PRIOR Building shape for undo.

import {
    BuildingSchema,
    type Building,
    type BuildingId,
} from '@pryzm/schemas/aggregates';
import type { BuildingStore } from '../BuildingStore.js';
import {
    BuildingUpdatePayloadSchema,
    type AggregateCommandResult,
    type BuildingUpdatedEvent,
} from './types.js';

export function buildingUpdate(
    rawPayload: unknown,
    store: BuildingStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<BuildingUpdatedEvent> {
    let payload;
    try {
        payload = BuildingUpdatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `building.update payload invalid: ${(err as Error).message}`,
        };
    }

    const prior = store.get(payload.id as BuildingId);
    if (!prior) {
        return {
            ok: false,
            reason: 'no-building',
            message: `building.update: no Building with id '${payload.id}'`,
        };
    }

    // §1.1 — projectId is IMMUTABLE. The Zod schema doesn't include it
    // in the patch shape; this is a defensive layer in case a future
    // refactor widens the patch.
    if ('projectId' in (payload.patch as Record<string, unknown>)) {
        return {
            ok: false,
            reason: 'cannot-change-projectId',
            message:
                `building.update: cannot change projectId per [C20 §1.1] ` +
                `(per-project isolation)`,
        };
    }

    // Compose the next Building. Convert `siteId: null` (clear) to
    // `siteId: undefined` so the L0 schema's optional() matches.
    const patch = payload.patch;
    const nextRaw: Record<string, unknown> = { ...prior };
    if (patch.name !== undefined) nextRaw.name = patch.name;
    if (patch.description !== undefined) nextRaw.description = patch.description;
    if (patch.ordinal !== undefined) nextRaw.ordinal = patch.ordinal;
    if (patch.siteId !== undefined) {
        if (patch.siteId === null) delete nextRaw.siteId;
        else nextRaw.siteId = patch.siteId;
    }
    nextRaw.updatedAt = now();

    let next: Building;
    try {
        next = BuildingSchema.parse(nextRaw);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `building.update: post-patch validation failed: ` +
                `${(err as Error).message}`,
        };
    }

    store.update(next);
    return {
        ok: true,
        event: { type: 'building.updated', building: next, prior },
    };
}
