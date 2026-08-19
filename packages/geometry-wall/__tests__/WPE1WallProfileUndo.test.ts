/**
 * §FEAT-WALL-PROFILE-EDIT — UNDO, MEASURED (C84 EI-7), not argued.
 *
 * The claim the feature rests on is that `UpdateElementParameterCommand`'s previous-value
 * snapshot is sufficient undo for a profile edit, because the edit writes exactly ONE field
 * and there is no second store to restore. That claim has a specific way of being wrong:
 * `captureCurrentValues` snapshots `element[key]`, so a wall that had NO profile snapshots
 * `wallProfile: undefined` — and if anything along the way DROPS an undefined-valued key,
 * `undo()` finds an empty snapshot, reports "nothing to undo", and the profile survives the
 * undo. That is exactly the shape of §FIX-STAIR-PROPS-UNDO, which this command already
 * carries a scar from.
 *
 * So it is measured on the real store, through the real command, both directions:
 * rectangle → profile → undo, and profile → cleared → undo.
 */

import { describe, it, expect } from 'vitest';
import { WallStore } from '../src/WallStore';
import { hasWallProfile, type WallProfile } from '../src/WallProfile';
import { ProjectContext } from '@pryzm/core-app-model';
import { UpdateElementParameterCommand } from '@pryzm/command-registry';
import type { WallData } from '../src/WallTypes';

const LEVEL_ID = 'level-ground';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

const newStore = () => new WallStore(
    new ProjectContext(),
    makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
);

/** A gable: 6 m long, 3 m at the ridge, shoulders cut down to 2 m. */
const GABLE: WallProfile = {
    ring: [{ u: 0, v: 0 }, { u: 6, v: 0 }, { u: 6, v: 2 }, { u: 3, v: 3 }, { u: 0, v: 2 }],
};

function plainWall(profile?: WallProfile): WallData {
    return {
        id: 'w-1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        ...(profile ? { wallProfile: profile } : {}),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

function ctx(store: WallStore) {
    return { stores: { wallStore: store } } as never;
}

function cmd(parameters: Record<string, unknown>) {
    return new UpdateElementParameterCommand({
        elementId: 'w-1',
        elementType: 'wall',
        parameters,
    } as never);
}

describe('§FEAT-WALL-PROFILE-EDIT — the write and its undo, on the real store', () => {
    it('authoring a profile reaches the store, and undo removes it again', () => {
        const store = newStore();
        store.add(plainWall());
        expect(hasWallProfile((store.getById('w-1') as { wallProfile?: unknown }).wallProfile)).toBe(false);

        const c = cmd({ wallProfile: GABLE });
        expect(c.canExecute(ctx(store)).ok, JSON.stringify(c.canExecute(ctx(store)))).toBe(true);
        c.execute(ctx(store));
        expect(hasWallProfile((store.getById('w-1') as { wallProfile?: unknown }).wallProfile)).toBe(true);

        // THE MEASUREMENT: a wall that had NO profile snapshots `undefined`. If that key is
        // dropped anywhere, undo reports "nothing to undo" and the gable survives.
        c.undo(ctx(store));
        expect(hasWallProfile((store.getById('w-1') as { wallProfile?: unknown }).wallProfile)).toBe(false);
    });

    it('clearing sends UNDEFINED — `null` is rejected by the schema and CRASHES', () => {
        // MEASURED 2026-08-19, and it changed the implementation: `WallDataUpdateSchema`
        // declares `wallProfile` `.optional()`, not `.nullable()`, so a `null` clear does
        // not refuse — it throws a `WallSchemaError` out of `WallStore.update`, turning
        // "remove this profile" into a crash. Pinned here so the tidier-looking `null`
        // cannot come back without the schema change that would make it safe.
        const store = newStore();
        store.add(plainWall(GABLE));
        expect(() => cmd({ wallProfile: null }).execute(ctx(store))).toThrow(/wallProfile|Schema/);
    });

    it('clearing a profile is undoable — the ring comes back vertex for vertex', () => {
        const store = newStore();
        store.add(plainWall(GABLE));

        const c = cmd({ wallProfile: undefined });
        c.execute(ctx(store));
        expect(hasWallProfile((store.getById('w-1') as { wallProfile?: unknown }).wallProfile)).toBe(false);

        c.undo(ctx(store));
        const back = (store.getById('w-1') as { wallProfile?: WallProfile }).wallProfile;
        expect(back?.ring).toEqual(GABLE.ring);
    });

    it('the command REFUSES an out-of-bounds ring rather than storing it', () => {
        const store = newStore();
        store.add(plainWall());
        const c = cmd({ wallProfile: { ring: [{ u: 0, v: 0 }, { u: 6, v: 0 }, { u: 3, v: 9 }] } });
        const verdict = c.canExecute(ctx(store));
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toMatch(/outside the wall's own extent|CUT the/);
    });
});
