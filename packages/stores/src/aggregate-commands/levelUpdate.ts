// A.23.c.2 (Phase A · Sprint 2) — `level.update` command handler.
//
// Per [C20 §4.2]: mutates Level fields. If levelNumber or elevation
// changes, re-validates §1.2 (uniqueness + monotonic). MUST refuse
// to change buildingId — that's a structural move requiring delete +
// re-create.

import {
    LevelSchema,
    type Level,
    type LevelId,
    type BuildingId,
} from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import {
    LevelUpdatePayloadSchema,
    type AggregateCommandResult,
    type LevelUpdatedEvent,
} from './types.js';

function checkMonotonicAfterPatch(
    others: readonly Level[],
    levelNumber: number,
    elevation: number,
): string | null {
    const projected = [
        ...others.map((l) => ({
            levelNumber: l.levelNumber,
            elevation: l.elevation,
        })),
        { levelNumber, elevation },
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

export function levelUpdate(
    rawPayload: unknown,
    levelStore: LevelStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<LevelUpdatedEvent> {
    let payload;
    try {
        payload = LevelUpdatePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `level.update payload invalid: ${(err as Error).message}`,
        };
    }

    const prior = levelStore.get(payload.id as LevelId);
    if (!prior) {
        return {
            ok: false,
            reason: 'no-level',
            message: `level.update: no Level with id '${payload.id}'`,
        };
    }

    // buildingId is NOT in the patch schema, but be defensive against
    // future widening.
    if ('buildingId' in (payload.patch as Record<string, unknown>)) {
        return {
            ok: false,
            reason: 'cannot-change-buildingId',
            message:
                `level.update: cannot change buildingId (delete + re-create ` +
                `the Level instead)`,
        };
    }

    const patch = payload.patch;
    const nextRaw: Record<string, unknown> = { ...prior };
    if (patch.name !== undefined) nextRaw.name = patch.name;
    if (patch.levelNumber !== undefined) nextRaw.levelNumber = patch.levelNumber;
    if (patch.elevation !== undefined) nextRaw.elevation = patch.elevation;
    if (patch.height !== undefined) nextRaw.height = patch.height;
    if (patch.isActive !== undefined) nextRaw.isActive = patch.isActive;
    if (patch.isReference !== undefined) nextRaw.isReference = patch.isReference;
    nextRaw.updatedAt = now();

    let next: Level;
    try {
        next = LevelSchema.parse(nextRaw);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message:
                `level.update: post-patch validation failed: ${(err as Error).message}`,
        };
    }

    // Re-validate §1.2 if levelNumber or elevation changed.
    if (
        next.levelNumber !== prior.levelNumber ||
        next.elevation !== prior.elevation
    ) {
        const others = levelStore
            .listForBuilding(prior.buildingId as BuildingId)
            .filter((l) => l.id !== prior.id);

        if (
            next.levelNumber !== prior.levelNumber &&
            others.some((l) => l.levelNumber === next.levelNumber)
        ) {
            return {
                ok: false,
                reason: 'level-number-conflict',
                message:
                    `level.update: levelNumber ${next.levelNumber} already ` +
                    `exists in Building '${prior.buildingId}'`,
            };
        }
        if (
            next.elevation !== prior.elevation &&
            others.some((l) => l.elevation === next.elevation)
        ) {
            return {
                ok: false,
                reason: 'elevation-conflict',
                message:
                    `level.update: elevation ${next.elevation}m already ` +
                    `exists in Building '${prior.buildingId}'`,
            };
        }
        const monotonic = checkMonotonicAfterPatch(
            others,
            next.levelNumber,
            next.elevation,
        );
        if (monotonic) {
            return {
                ok: false,
                reason: 'elevation-conflict',
                message: `level.update: ${monotonic}`,
            };
        }
    }

    levelStore.update(next);
    return {
        ok: true,
        event: { type: 'level.updated', level: next, prior },
    };
}
