// A.23.c.2 (Phase A · Sprint 2) — `level.create` command handler.
//
// Per [C20 §4.2 + §1.2]:
//   - Building (buildingId) MUST exist in BuildingStore
//   - levelNumber MUST be unique within the Building
//   - elevation MUST be unique within the Building
//   - monotonic-elevation: levelNumber asc ↔ elevation asc

import {
    LevelSchema,
    type Level,
    type BuildingId,
} from '@pryzm/schemas/aggregates';
import type { BuildingStore } from '../BuildingStore.js';
import type { LevelStore } from '../LevelStore.js';
import {
    LevelCreatePayloadSchema,
    type AggregateCommandResult,
    type LevelCreatedEvent,
} from './types.js';

let levelCounter = 0;
function mintLevelId(buildingId: string, levelNumber: number): string {
    levelCounter += 1;
    const tag =
        levelNumber === 0
            ? 'g'
            : levelNumber > 0
            ? `l${levelNumber}`
            : `b${Math.abs(levelNumber)}`;
    return `lvl_${buildingId}_${tag}_${levelCounter}`;
}

/**
 * Check the monotonic-elevation invariant after inserting a new Level
 * at (levelNumber, elevation). Returns null on success, or a string
 * describing the violation. We sort the projected list by levelNumber
 * and require elevation strictly ascending.
 */
function checkMonotonic(
    existingLevels: readonly Level[],
    newLevelNumber: number,
    newElevation: number,
): string | null {
    const projected: Array<{ levelNumber: number; elevation: number }> = [
        ...existingLevels.map((l) => ({
            levelNumber: l.levelNumber,
            elevation: l.elevation,
        })),
        { levelNumber: newLevelNumber, elevation: newElevation },
    ];
    projected.sort((a, b) => a.levelNumber - b.levelNumber);
    for (let i = 1; i < projected.length; i++) {
        if (projected[i]!.elevation <= projected[i - 1]!.elevation) {
            return (
                `monotonic violation: Level ${projected[i]!.levelNumber} ` +
                `(elev ${projected[i]!.elevation}) MUST be above Level ` +
                `${projected[i - 1]!.levelNumber} (elev ${projected[i - 1]!.elevation})`
            );
        }
    }
    return null;
}

export function levelCreate(
    rawPayload: unknown,
    buildingStore: BuildingStore,
    levelStore: LevelStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<LevelCreatedEvent> {
    let payload;
    try {
        payload = LevelCreatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `level.create payload invalid: ${(err as Error).message}`,
        };
    }

    // §1.2 — Building MUST exist.
    if (!buildingStore.has(payload.buildingId as BuildingId)) {
        return {
            ok: false,
            reason: 'level-buildingId-mismatch',
            message:
                `level.create: no Building with id '${payload.buildingId}' ` +
                `(per [C20 §1.2] Level.buildingId MUST reference an existing Building)`,
        };
    }

    // §1.2 — levelNumber unique within Building.
    const existing = levelStore.listForBuilding(
        payload.buildingId as BuildingId,
    );
    if (existing.some((l) => l.levelNumber === payload.levelNumber)) {
        return {
            ok: false,
            reason: 'level-number-conflict',
            message:
                `level.create: levelNumber ${payload.levelNumber} already ` +
                `exists in Building '${payload.buildingId}' per [C20 §1.2]`,
        };
    }

    // §1.2 — elevation unique within Building.
    if (existing.some((l) => l.elevation === payload.elevation)) {
        return {
            ok: false,
            reason: 'elevation-conflict',
            message:
                `level.create: elevation ${payload.elevation}m already ` +
                `exists in Building '${payload.buildingId}' per [C20 §1.2]`,
        };
    }

    // §1.2 — monotonic-elevation across the Building.
    const monotonic = checkMonotonic(
        existing,
        payload.levelNumber,
        payload.elevation,
    );
    if (monotonic) {
        return {
            ok: false,
            reason: 'elevation-conflict',
            message: `level.create: ${monotonic}`,
        };
    }

    const ts = now();
    const level: Level = LevelSchema.parse({
        id: mintLevelId(payload.buildingId, payload.levelNumber),
        buildingId: payload.buildingId,
        name: payload.name,
        levelNumber: payload.levelNumber,
        elevation: payload.elevation,
        height: payload.height,
        isActive: payload.isActive ?? false,
        isReference: payload.isReference ?? false,
        createdAt: ts,
        updatedAt: ts,
    });
    levelStore.add(level);

    return {
        ok: true,
        event: { type: 'level.created', level },
    };
}
