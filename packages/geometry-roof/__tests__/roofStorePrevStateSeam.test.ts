/**
 * C72 §3.1/§3.4/§3.5 · gap register PR-03 — the §STEP7 emit seam for
 * @pryzm/geometry-roof's RoofStore (check-prevstate-contract P1 rows
 * RoofStore.ts:120 and :137, struck in the same commit as this fix).
 *
 * A SEAM test, not a classifier test (C72 §3.4): it drives the REAL mutation
 * entry point on the REAL store, registers a REAL listener via on('update'),
 * and reads the pre-mutation snapshot off the emission. No fixture supplies
 * the value under test.
 *
 * Two-directional in every case: prevState present AND carrying the PRE-
 * mutation value (fails if the argument is dropped again — the two-argument
 * famine), AND differing from the post-mutation payload (fails if it were
 * reconstructed by re-reading the store after the write, which C72 §3.5
 * forbids because it diffs a value against itself and reports "unchanged").
 */

import { describe, it, expect } from 'vitest';
import { RoofStore } from '../src/RoofStore';
import type { RoofData } from '../src/RoofTypes';

const ctx = { activeLevelId: 'L0' } as never; // store reads .activeLevelId only

function makeRoof(id: string, overhang: number): RoofData {
    return {
        id,
        type: 'roof',
        levelId: 'L0',
        parentId: 'L0',
        footprint: { polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], centroid: [2, 2] },
        roofType: 'flat',
        overhang,
        thickness: 0.2,
        baseOffset: 3,
        properties: {},
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as RoofData;
}

/** Seed through the private map so the test does not depend on add()'s schema. */
function seeded(): RoofStore {
    const store = new RoofStore(ctx);
    (store as unknown as { _roofs: Map<string, RoofData> })._roofs.set('r1', Object.freeze(makeRoof('r1', 0.5)));
    return store;
}

describe('geometry-roof RoofStore — §STEP7 prevState on the update seam', () => {
    it('update() emits the pre-mutation roof to on("update") listeners', () => {
        const store = seeded();
        let next: RoofData | undefined;
        let prev: RoofData | undefined;
        store.on('update', ((n: RoofData, p: RoofData) => { next = n; prev = p; }) as never);

        store.update('r1', { overhang: 1.5 } as Partial<RoofData>);

        expect(prev, 'second listener argument missing — the two-argument famine is back').toBeTruthy();
        expect(prev!.overhang).toBe(0.5); // the real prior
        expect(next!.overhang).toBe(1.5); // a §3.5 re-read would have said 1.5 here too
        expect(prev).not.toBe(next);
    });

    it('restoreSnapshot() over an existing roof emits the stored prior, not the snapshot', () => {
        const store = seeded();
        let next: RoofData | undefined;
        let prev: RoofData | undefined;
        store.on('update', ((n: RoofData, p: RoofData) => { next = n; prev = p; }) as never);

        store.restoreSnapshot(makeRoof('r1', 9));

        expect(prev, 'restoreSnapshot dropped prevState').toBeTruthy();
        expect(prev!.overhang).toBe(0.5);
        expect(next!.overhang).toBe(9);
    });

    it('add() carries no prevState — there is no prior state to report', () => {
        const store = new RoofStore(ctx);
        let sawPrev: unknown = 'unset';
        store.on('add', ((_n: RoofData, p: RoofData) => { sawPrev = p; }) as never);

        store.add(makeRoof('r2', 0.4));

        expect(sawPrev).toBeUndefined(); // absent, per §3.1 — not invented
    });
});
