// A.23.c.2 (Phase A · Sprint 2) — `level.setActive` command handler.
//
// Per [C20 §4.2 + §1.2]: sets one Level's isActive=true and clears
// every other Level (in the same Building) — zero-or-one active per
// Building.
//
// Implementation: gather all Levels in the target's Building, write
// each as a separate `update()` call to the store. The store fires
// listeners after each — for atomicity, consumers can wrap with a
// batch coordinator (out of scope here; the store-side notify pattern
// matches site-commands and is per-handler not per-row).

import type { Level, LevelId, BuildingId } from '@pryzm/schemas/aggregates';
import type { LevelStore } from '../LevelStore.js';
import {
    LevelSetActivePayloadSchema,
    type AggregateCommandResult,
    type LevelActiveSetEvent,
} from './types.js';

export function levelSetActive(
    rawPayload: unknown,
    levelStore: LevelStore,
    now: () => string = () => new Date().toISOString(),
): AggregateCommandResult<LevelActiveSetEvent> {
    let payload;
    try {
        payload = LevelSetActivePayloadSchema.parse(rawPayload);
    } catch (err) {
        return {
            ok: false,
            reason: 'invalid-payload',
            message: `level.setActive payload invalid: ${(err as Error).message}`,
        };
    }

    const target = levelStore.get(payload.id as LevelId);
    if (!target) {
        return {
            ok: false,
            reason: 'no-level',
            message: `level.setActive: no Level with id '${payload.id}'`,
        };
    }

    const buildingLevels = levelStore.listForBuilding(
        target.buildingId as BuildingId,
    );
    const priorActive = buildingLevels.find((l) => l.isActive);
    const ts = now();

    // Clear any other isActive=true Level FIRST so the store never
    // has > 1 active at a time during the transition.
    if (priorActive && priorActive.id !== target.id) {
        const cleared: Level = {
            ...priorActive,
            isActive: false,
            updatedAt: ts,
        };
        levelStore.update(cleared);
    }
    // Set the target active (idempotent if already active).
    if (!target.isActive) {
        const activated: Level = {
            ...target,
            isActive: true,
            updatedAt: ts,
        };
        levelStore.update(activated);
    }

    return {
        ok: true,
        event: {
            type: 'level.active-set',
            levelId: target.id,
            priorActiveId: priorActive && priorActive.id !== target.id
                ? priorActive.id
                : null,
        },
    };
}
