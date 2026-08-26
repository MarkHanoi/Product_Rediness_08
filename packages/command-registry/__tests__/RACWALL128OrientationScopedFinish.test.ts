/**
 * §RACWALL128 — "change layer finish outside colour of all east-facing walls".
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The orientation SELECTION happens upstream (FacadeOrientationMath ±45°
 * quadrants, θ-threaded; the chat bridge's orientation arm resolves the compass
 * to wall ids). What the COMMAND must guarantee — and what this file pins — is
 * the contract the selector hands its ids to:
 *
 *   1. exactly the ids in scope get the EXTERIOR finish; a control wall of a
 *      different orientation (not in the id list) is byte-untouched;
 *   2. the batch is ONE undo entry — one undo() reverts every changed wall and
 *      leaves the control alone (C16 §8.6);
 *   3. a scope matching ZERO walls is a VISIBLE honest no-op with a message,
 *      never silent and never a throw (mirrors UpdateWallsSystemTypeBatch's
 *      all-refused policy; C74/CA-18).
 *
 * Store fake mirrors L1670SideFinishReadBack.test.ts (the faithful arm).
 */

import { describe, it, expect } from 'vitest';
import { SetWallSideFinishBatchCommand } from '../src/walls/SetWallSideFinishCommand';

const CLAY = { materialId: 'clay-plaster', materialColor: '#c9b8a3', materialName: 'Clay Plaster' };

interface FakeWall {
    id: string;
    levelId: string;
    layers: unknown[];
    baseLine: Array<{ x: number; y: number; z: number }>;
    openings: unknown[];
    sideFinishes?: { interior?: { materialId?: string }; exterior?: { materialId?: string } };
}

function makeStore(ids: string[]) {
    const map = new Map<string, FakeWall>();
    for (const id of ids) {
        map.set(id, {
            id,
            levelId: 'L0',
            layers: [{ thickness: 0.1, function: 'structure' }],
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            openings: [],
        });
    }
    return {
        getById: (id: string) => map.get(id),
        getAll: () => [...map.values()],
        updateWall: (next: FakeWall) => { map.set(next.id, { ...next }); },
        restoreSnapshot: (snap: FakeWall) => { map.set(snap.id, { ...snap }); },
    };
}

const ctxFor = (store: ReturnType<typeof makeStore>) => ({ stores: { wallStore: store } }) as never;

describe('§RACWALL128 — the orientation-scoped id list is honoured exactly', () => {
    it('changes exactly the in-scope walls; the control wall is untouched', () => {
        // 'w-e1'/'w-e2' are the (upstream-classified) east-facing walls;
        // 'w-n-control' faces another way and is NOT in the id list.
        const store = makeStore(['w-e1', 'w-e2', 'w-n-control']);
        const cmd = new SetWallSideFinishBatchCommand({
            wallIds: ['w-e1', 'w-e2'],
            side: 'exterior',
            finish: CLAY,
        });
        const r = cmd.execute(ctxFor(store));

        expect(r.success).toBe(true);
        expect([...r.affectedElementIds].sort()).toEqual(['w-e1', 'w-e2']);
        expect(r.info?.[0]).toContain('2 of 2 walls');
        expect(store.getById('w-e1')!.sideFinishes?.exterior?.materialId).toBe('clay-plaster');
        expect(store.getById('w-e2')!.sideFinishes?.exterior?.materialId).toBe('clay-plaster');
        // ⭐ THE CONTROL: a wall of another orientation carries NO finish at all.
        expect(store.getById('w-n-control')!.sideFinishes).toBeUndefined();
        // And the exterior write never leaks onto the interior slot.
        expect(store.getById('w-e1')!.sideFinishes?.interior).toBeUndefined();
    });

    it('ONE undo reverts the whole batch and still leaves the control alone (C16 §8.6)', () => {
        const store = makeStore(['w-e1', 'w-e2', 'w-n-control']);
        const cmd = new SetWallSideFinishBatchCommand({
            wallIds: ['w-e1', 'w-e2'],
            side: 'exterior',
            finish: CLAY,
        });
        cmd.execute(ctxFor(store));
        const u = cmd.undo(ctxFor(store));

        expect(u.success).toBe(true);
        expect([...u.affectedElementIds].sort()).toEqual(['w-e1', 'w-e2']);
        expect(store.getById('w-e1')!.sideFinishes).toBeUndefined();
        expect(store.getById('w-e2')!.sideFinishes).toBeUndefined();
        expect(store.getById('w-n-control')!.sideFinishes).toBeUndefined();
    });

    it('a ZERO-match scope is a visible honest no-op with a message — never silent, never a throw', () => {
        // The bridge's orientation arm already refuses "no exterior wall faces
        // east" BEFORE dispatch; if an empty list ever reaches the command
        // anyway, the command's own gate must say so too (defence in depth).
        const store = makeStore(['w-n-control']);
        const cmd = new SetWallSideFinishBatchCommand({
            wallIds: [],
            side: 'exterior',
            finish: CLAY,
        });
        const v = cmd.canExecute(ctxFor(store));
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('No walls selected');
        // Nothing changed, and the control wall never acquired a finish.
        expect(store.getById('w-n-control')!.sideFinishes).toBeUndefined();
    });

    it("an 'all' scope over an EMPTY project declines with its own message", () => {
        const store = makeStore([]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'exterior', finish: CLAY });
        const v = cmd.canExecute(ctxFor(store));
        expect(v.ok).toBe(false);
        if (v.ok) return;
        expect(v.reason).toContain('There are no walls in this project');
    });
});
