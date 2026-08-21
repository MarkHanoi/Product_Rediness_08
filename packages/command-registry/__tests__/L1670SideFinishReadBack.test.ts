/**
 * §WALL-FINISH-READBACK (L-1670) — "Set … on 59 of 59 walls" must be MEASURED.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * C67 rule 12 requires a "Done" to be backed by a read-back of the AUTHORITATIVE
 * store. `SetWallSideFinishBatchCommand` counted successful CALLS instead: the
 * child returns `{ success: true }` the instant `wallStore.updateWall()` returns,
 * and that method projects onto a field WHITELIST which drops anything it does
 * not name — in silence, with the call still succeeding.
 *
 * That is L-995 verbatim: `sideFinishes` was absent from the whitelist, and the
 * chat reported "all 17 walls … Done" over a model nothing had touched. The
 * whitelist is fixed; what was NOT fixed is that the count could never have
 * noticed, so the identical regression would print the identical sentence.
 *
 * ⭐ THE NON-VACUITY GUARD IS THE POINT OF THIS FILE. A read-back asserted only
 * against a faithful store proves nothing — it passes just as happily when the
 * read-back is deleted. So the same command is driven against a DROPPING store
 * (the L-995 whitelist, reproduced) and is required to REFUSE to count those
 * walls. The oracle is the count, which the test authors, not the store.
 */

import { describe, it, expect } from 'vitest';
import { SetWallSideFinishBatchCommand } from '../src/walls/SetWallSideFinishCommand';

const OAK = { materialId: 'wood-oak', materialColor: '#c8a96e', materialName: 'Wood · Oak (Light)' };

interface FakeWall {
    id: string;
    levelId: string;
    layers: unknown[];
    baseLine: Array<{ x: number; y: number; z: number }>;
    openings: unknown[];
    sideFinishes?: unknown;
}

/**
 * @param drops when true, `updateWall` accepts the call and SILENTLY discards
 *        `sideFinishes` — the L-995 whitelist, reproduced exactly.
 */
function makeStore(ids: string[], drops: boolean) {
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
        updateWall: (next: FakeWall) => {
            const { sideFinishes, ...rest } = next;
            map.set(next.id, (drops ? { ...rest } : { ...rest, sideFinishes }) as FakeWall);
        },
        restoreSnapshot: (snap: FakeWall) => { map.set(snap.id, { ...snap }); },
    };
}

const ctxFor = (store: ReturnType<typeof makeStore>) => ({ stores: { wallStore: store } }) as never;

describe('§WALL-FINISH-READBACK — the success count is read back from the authority', () => {
    it('a FAITHFUL store: all three walls count, and the summary says 3 of 3', () => {
        const store = makeStore(['w0', 'w1', 'w2'], false);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });
        const r = cmd.execute(ctxFor(store));

        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['w0', 'w1', 'w2']);
        expect(r.info?.[0]).toContain('3 of 3 walls');
        expect(cmd.skipped).toHaveLength(0);
    });

    it('⭐ NON-VACUITY — a DROPPING store (the L-995 whitelist) must NOT be reported as success', () => {
        const store = makeStore(['w0', 'w1', 'w2'], true);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });
        const r = cmd.execute(ctxFor(store));

        // The exact sentence the founder was shown twice must be impossible here.
        expect(r.info?.[0]).not.toContain('3 of 3 walls');
        expect(r.info?.[0]).toContain('0 of 3 walls');
        expect(r.affectedElementIds).toEqual([]);
        expect(r.success, 'nothing landed, so the batch is not a success').toBe(false);
        expect(cmd.skipped).toHaveLength(3);
        expect(cmd.skipped[0]!.reason).toContain('reading the record back');
    });

    it('undo still reverts whatever the dropping store DID accept', () => {
        // The child is retained for undo regardless of the read-back verdict — a
        // partially-applied write must stay revertible, or a failed read-back would
        // strand the model in the state it refuses to claim.
        const store = makeStore(['w0'], true);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });
        cmd.execute(ctxFor(store));
        expect(() => cmd.undo(ctxFor(store))).not.toThrow();
    });
});
