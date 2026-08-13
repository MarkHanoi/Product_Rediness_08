/**
 * C72 §3.1/§3.4/§3.5 · gap register PR-03 — the §STEP7 emit seam for
 * @pryzm/geometry-lift's LiftStore (check-prevstate-contract P1 rows
 * LiftStore.ts:88 and :99, struck in the same commit as this fix).
 *
 * A SEAM test, not a classifier test (C72 §3.4): it drives the REAL mutation
 * entry point on the REAL store, registers a REAL subscriber, and reads
 * prevState off the emission. No fixture supplies the value under test.
 *
 * ⚠ PATH NOTE, stated rather than left as a trap: this file is a `.spec.ts`
 * under `src/__tests__/` because that is what `vitest.config.ts` INCLUDES
 * (`src/**\/__tests__/**\/*.spec.ts`, `src/**\/*.spec.ts`). The package's other
 * store suite, `packages/geometry-lift/__tests__/liftStores.test.ts`, matches
 * NEITHER pattern and does not run — measured, not assumed: the package's test
 * script reports 1 file / 9 tests, which is LiftToolPlacement.spec.ts alone.
 * That dark suite is reported, not silently adopted or "fixed" here.
 */

import { describe, it, expect } from 'vitest';
import { LiftStore } from '../LiftStore';
import type { LiftData } from '../LiftTypes';

const ctx = { activeLevelId: 'L0' } as never; // store reads .activeLevelId only

function makeLift(id: string, shaftWidth: number): LiftData {
    const now = new Date().toISOString();
    return {
        id,
        type: 'verticalCirculation',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L3',
        kind: 'passenger',
        origin: { x: 0, y: 0, z: 0 },
        rotation: 0,
        shaftWidth,
        shaftDepth: 1.8,
        carCapacityPersons: 8,
        doorWidth: 0.9,
        properties: {},
        metadata: { createdAt: now, modifiedAt: now, version: 0, source: 'user' },
    } as unknown as LiftData;
}

describe('geometry-lift LiftStore — §STEP7 prevState on the update seam', () => {
    it('update() emits the pre-mutation lift as the third argument', () => {
        const store = new LiftStore(ctx);
        store.add(makeLift('l1', 1.8));

        let next: LiftData | undefined;
        let prev: LiftData | undefined;
        store.subscribe((event, l, prevState) => {
            if (event === 'update') { next = l; prev = prevState; }
        });

        store.update('l1', { shaftWidth: 2.4 } as Partial<LiftData>);

        expect(prev, 'third argument missing — the two-argument famine is back').toBeTruthy();
        expect(prev!.shaftWidth).toBe(1.8); // the real prior
        expect(next!.shaftWidth).toBe(2.4); // a §3.5 re-read would have said 2.4 here too
        expect(prev!.metadata.version).toBe(0);
        expect(next!.metadata.version).toBe(1);
    });

    it('restoreSnapshot(): prior captured BEFORE the write; undefined on an empty slot', () => {
        const store = new LiftStore(ctx);
        store.add(makeLift('l1', 1.8));

        const prevs: Array<LiftData | undefined> = [];
        store.subscribe((event, _l, prevState) => {
            if (event === 'update') prevs.push(prevState);
        });

        store.restoreSnapshot(makeLift('l1', 3.3));
        expect(prevs[0]).toBeTruthy();
        expect(prevs[0]!.shaftWidth).toBe(1.8); // §3.5: a post-write read would say 3.3

        // Restore into an empty slot: no prior exists — say so, do not invent one.
        store.restoreSnapshot(makeLift('l2', 2.0));
        expect(prevs[1]).toBeUndefined();
    });

    it('add() carries no prevState — there is no prior state to report', () => {
        const store = new LiftStore(ctx);
        let sawPrev: unknown = 'unset';
        store.subscribe((event, _l, prevState) => {
            if (event === 'add') sawPrev = prevState;
        });

        store.add(makeLift('l3', 1.8));
        expect(sawPrev).toBeUndefined(); // absent per §3.1 — not invented
    });
});
