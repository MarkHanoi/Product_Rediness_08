// A.23.c.1 (Phase A · Sprint 2) — `building.create` command handler.
//
// Per [C20 §4.1]: inserts a Building. MUST fail if a Building already
// exists in the project (§1.1 single-Building rule, deferred to C20.1).
// The handler auto-generates the deterministic id, sets createdAt /
// updatedAt to now, defaults ordinal to 0.

import { BuildingSchema, type Building } from '@pryzm/schemas/aggregates';
import type { BuildingStore } from '../BuildingStore.js';
import {
    BuildingCreatePayloadSchema,
    type AggregateCommandResult,
    type BuildingCreatedEvent,
} from './types.js';

/** Deterministic Building id per [C20 §2.1]. Same pattern as
 *  `deterministicSiteId` from A.7.c.1 — derived from projectId so
 *  legacy auto-promotion stays idempotent across reloads. */
export function deterministicBuildingId(projectId: string): string {
    return `bldg_${projectId}`;
}

/**
 * Execute `building.create`. Per [C20 §1.1] one Building per Project
 * today — the handler rejects when the store already contains one.
 */
export function buildingCreate(
    rawPayload: unknown,
    store: BuildingStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<BuildingCreatedEvent> {
    let payload;
    try {
        payload = BuildingCreatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `building.create payload invalid: ${(err as Error).message}`,
        };
    }

    if (store.size() > 0) {
        return {
            ok: false,
            reason: 'building-already-exists',
            message:
                `building.create: a Building already exists per [C20 §1.1] ` +
                `(single-Building rule; multi-Building deferred to C20.1)`,
        };
    }

    const ts = now();
    const building: Building = BuildingSchema.parse({
        id: deterministicBuildingId(payload.projectId),
        projectId: payload.projectId,
        name: payload.name,
        description: payload.description ?? '',
        ...(payload.siteId ? { siteId: payload.siteId } : {}),
        createdAt: ts,
        updatedAt: ts,
        ordinal: 0,
    });

    store.add(building);
    return {
        ok: true,
        event: { type: 'building.created', building },
    };
}
