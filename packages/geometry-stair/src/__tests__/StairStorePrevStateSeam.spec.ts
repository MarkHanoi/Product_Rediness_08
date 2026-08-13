/**
 * C72 §3.1/§3.4/§3.5 · gap register PR-03 — the §STEP7 emit seam for
 * @pryzm/geometry-stair's StairStore (check-prevstate-contract P1 rows
 * StairStore.ts:90 and :105, struck in the same commit as this fix).
 *
 * A SEAM test, not a classifier test (C72 §3.4): it drives the REAL mutation
 * entry point on the REAL store, registers a REAL subscriber, and reads
 * prevState off the emission. No fixture supplies the value under test.
 *
 * Two-directional: prevState present AND carrying the PRE-mutation value
 * (fails if the third argument is dropped), AND differing from the post-
 * mutation payload (fails if it were reconstructed by a post-write store read,
 * which C72 §3.5 forbids).
 */

import { describe, it, expect } from 'vitest';
import { StairStore } from '../StairStore';
import type { StairData } from '../StairTypes';

const ctx = { activeLevelId: 'L0' } as never; // store reads .activeLevelId only

function makeStair(id: string, rotation: number): StairData {
    return {
        id,
        type: 'stair',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L1',
        shape: 'straight',
        rotation,
        properties: {},
        metadata: { createdAt: '1', modifiedAt: '1', version: 0 },
    } as unknown as StairData;
}

describe('geometry-stair StairStore — §STEP7 prevState on the update seam', () => {
    it('update() emits the pre-mutation stair as the third argument', () => {
        const store = new StairStore(ctx);
        store.add(makeStair('s1', 0));

        let next: StairData | undefined;
        let prev: StairData | undefined;
        store.subscribe((event, s, prevState) => {
            if (event === 'update') { next = s; prev = prevState; }
        });

        store.update('s1', { rotation: 90 } as Partial<StairData>);

        expect(prev, 'third argument missing — the two-argument famine is back').toBeTruthy();
        expect(prev!.rotation).toBe(0);   // the real prior
        expect(next!.rotation).toBe(90);  // a §3.5 re-read would have said 90 here too
        expect(prev!.metadata.version).toBe(0);
        expect(next!.metadata.version).toBe(1);
    });

    it('restoreSnapshot(): prior captured BEFORE the write; undefined on an empty slot', () => {
        const store = new StairStore(ctx);
        store.add(makeStair('s1', 0));

        const prevs: Array<StairData | undefined> = [];
        store.subscribe((event, _s, prevState) => {
            if (event === 'update') prevs.push(prevState);
        });

        store.restoreSnapshot(makeStair('s1', 45));
        expect(prevs[0]).toBeTruthy();
        expect(prevs[0]!.rotation).toBe(0); // §3.5: a post-write read would say 45

        // Restore into an empty slot: no prior exists — say so, do not invent one.
        store.restoreSnapshot(makeStair('s2', 10));
        expect(prevs[1]).toBeUndefined();
    });

    it('add() carries no prevState — there is no prior state to report', () => {
        const store = new StairStore(ctx);
        let sawPrev: unknown = 'unset';
        store.subscribe((event, _s, prevState) => {
            if (event === 'add') sawPrev = prevState;
        });

        store.add(makeStair('s3', 0));
        expect(sawPrev).toBeUndefined(); // absent per §3.1 — not invented
    });
});
