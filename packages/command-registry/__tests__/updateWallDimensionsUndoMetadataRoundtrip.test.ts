/**
 * §UNDO-SCOPED-TO-AUTHORED-FIELDS regression — metadata.version must ROUND-TRIP
 * through undo/redo, not ratchet.
 *
 * THE BUG THIS PINS (certification H2-undoredo, wall.updateDimensions row,
 * introduced by 56481971): `UpdateWallDimensionsCommand.undo()` was rewritten
 * from `restoreSnapshot(prevSnapshot)` to a scoped
 * `update(id, { height, thickness, _renderVersion }, preserveMetadata = true)`.
 * The commit believed the third argument alone suppresses the audit stamp. It
 * does not: `WallStore._updateImpl`'s preserve branch is gated on
 * `preserveMetadata && safeUpdates.metadata` (WallStore.ts:616), so an update
 * carrying NO `metadata` key falls into the else branch — `modifiedAt: now`,
 * `version + 1`. Undo therefore INCREMENTED the counter it existed to rewind:
 * seed v1 → execute v2 → undo v3 (cert: "expected 1 got 3") → redo v4
 * (cert: "expected 2 got 4"). metadata.version is ADR-0319 class 2 and may
 * never be excluded from the round-trip comparison.
 *
 * WHY THIS TEST USES THE REAL WallStore AND NOT A DOUBLE: the defect lives in
 * the interaction between the command's update payload and the real store's
 * preserve-branch gate. A store double with its own `update()` is, by
 * construction, incapable of detecting that the real gate needs `metadata`
 * present — the same seam-test doctrine as WallOpeningEmitSeam.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { UpdateWallDimensionsCommand } from '../src/walls/UpdateWallDimensionsCommand';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'level-0';

function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

function newStore(): WallStore {
    return new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
}

function seedWall(): WallData {
    return {
        id: 'w1',
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: [],
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

describe('UpdateWallDimensionsCommand — metadata.version round-trips through undo/redo (ADR-0319 class 2)', () => {
    let store: WallStore;
    let ctx: CommandContext;

    beforeEach(() => {
        store = newStore();
        store.add(seedWall());
        ctx = { stores: { wallStore: store } } as unknown as CommandContext;
    });

    it('execute bumps version once; undo restores it EXACTLY; redo lands back on the post-execute value', () => {
        // Read the POST-SEED metadata, never the literal handed to `add()`:
        // `WallStore.add` stamps its own `modifiedAt` (measured — the seeded `1`
        // does not survive the add). Asserting the literal would fail for a
        // reason that has nothing to do with the undo path under test.
        const seeded = store.getById('w1')!.metadata!;
        const v0 = seeded.version;
        const modifiedAt0 = seeded.modifiedAt;

        const cmd = new UpdateWallDimensionsCommand({ wallId: 'w1', height: 4.2, thickness: 0.2 });
        expect(cmd.execute(ctx).success).toBe(true);
        const afterExec = store.getById('w1')!;
        expect(afterExec.height).toBe(4.2);
        const vB = afterExec.metadata!.version;
        expect(vB).toBe(v0 + 1); // §03-1.1 — a semantic edit advances the counter once

        // UNDO — the whole point: version must go BACK to v0, never forward.
        expect(cmd.undo(ctx).success).toBe(true);
        const afterUndo = store.getById('w1')!;
        expect(afterUndo.height).toBe(3);
        expect(afterUndo.metadata!.version).toBe(v0);
        // The pre-fix defect stamped `modifiedAt: now` too; the snapshot's
        // pre-execute value must survive the undo unchanged.
        expect(afterUndo.metadata!.modifiedAt).toBe(modifiedAt0);

        // REDO (CommandManager redo re-runs execute) — must reproduce State B's
        // version, not v0+2 / v0+3 drift.
        expect(cmd.execute(ctx).success).toBe(true);
        expect(store.getById('w1')!.metadata!.version).toBe(vB);
        expect(store.getById('w1')!.height).toBe(4.2);
    });

    it('FALSIFIABILITY — a metadata-less preserveMetadata update still bumps (the gate this fix routes around is real)', () => {
        // If WallStore ever changes so that `preserveMetadata: true` WITHOUT a
        // metadata payload freezes the counter, this test goes red — at that
        // point the command's explicit `metadata: prev.metadata` becomes
        // redundant (not wrong) and both this file and the undo comment should
        // be revisited together.
        const v0 = store.getById('w1')!.metadata!.version;
        store.update('w1', { height: 5 } as Partial<WallData>, true);
        expect(store.getById('w1')!.metadata!.version).toBe(v0 + 1);
    });

    it('undo stays SCOPED to authored fields — a peer colour edit between execute and undo survives', () => {
        // Guards the other half of 56481971: restoring metadata must not have
        // silently reverted to a whole-record restore.
        const cmd = new UpdateWallDimensionsCommand({ wallId: 'w1', height: 4.2, thickness: 0.2 });
        expect(cmd.execute(ctx).success).toBe(true);
        store.update('w1', { materialColor: '#c0ffee' } as unknown as Partial<WallData>);
        expect(cmd.undo(ctx).success).toBe(true);
        const w = store.getById('w1')! as unknown as { materialColor?: string; height: number };
        expect(w.height).toBe(3);
        expect(w.materialColor).toBe('#c0ffee'); // peer work NOT clobbered
    });
});
