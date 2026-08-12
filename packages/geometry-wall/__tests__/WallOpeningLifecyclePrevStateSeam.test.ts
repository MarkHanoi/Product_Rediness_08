/**
 * CONNECT-0 (roadmap Phase 5) / C72 §3.1 + §3.4 — THE SEAM, for the four
 * opening-LIFECYCLE emit sites.
 *
 * `check-prevstate-contract` P1 named four WallStore `'update'` emit sites that
 * carried two arguments — `addOpening`, `updateOpening` (non-hosted branch),
 * `removeOpening`, `restoreOpening` — i.e. every opening lifecycle edit through
 * them classified `whole-level / no-prevState` (the ADR-057 famine, again, one
 * method over from the updateDoor/updateWindow sites §FIX-OPENINGS-FAST-PATH-
 * UNREACHABLE already fixed). This suite drives the REAL mutation entry points
 * and reads `prevState` off the real emission — it never builds one by hand
 * (C72 §3.4: a fixture that supplies the very value under test proves nothing).
 *
 * Struck from the P1 ledger (21 → 17) in the same commit as the fix.
 */

import { describe, it, expect } from 'vitest';

import { WallStore } from '../src/WallStore';
import type { WallData, Opening } from '../src/WallTypes';
import { ProjectContext } from '@pryzm/core-app-model';

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

/** A bare 6 m × 3 m wall with NO openings. */
function makeBareWall(): WallData {
    return {
        id: 'w_host',
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

/** A hosted opening — OpeningSchema requires elementId on addOpening. */
function hostedOpening(overrides: Partial<Opening> = {}): Opening {
    return {
        id: 'op_1',
        type: 'door',
        elementId: 'el_op_1',
        doorType: 'single',
        offset: 1.5,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        ...overrides,
    } as unknown as Opening;
}

/**
 * The same opening with elementId STRIPPED, so updateOpening takes its
 * direct-emit branch (WallStore.ts:1065) rather than delegating to
 * updateDoor/updateWindow — the delegated sites are covered by
 * WallOpeningEmitSeam.test.ts already.
 */
function unhostedOpening(overrides: Partial<Opening> = {}): Opening {
    const o = hostedOpening(overrides) as unknown as Record<string, unknown>;
    delete o.elementId;
    return o as unknown as Opening;
}

function capture(store: WallStore) {
    const emissions: Array<{ event: string; wall: WallData; prevState?: WallData }> = [];
    const stop = store.subscribe((event, wall, prevState) => {
        emissions.push({ event, wall, prevState });
    });
    return { emissions, stop };
}

describe('CONNECT-0 — opening-lifecycle emits carry the pre-mutation wall', () => {

    it('addOpening emits update with prevState = the wall WITHOUT the opening', () => {
        const store = newStore();
        store.add(makeBareWall());

        const { emissions, stop } = capture(store);
        store.addOpening('w_host', hostedOpening());
        stop();

        const update = emissions.find(e => e.event === 'update');
        expect(update).toBeDefined();
        expect(update!.prevState).toBeDefined();
        expect((update!.prevState!.openings ?? []).length).toBe(0);
        expect((update!.wall.openings ?? []).length).toBe(1);
    });

    it('updateOpening (non-hosted) emits update with the pre-edit opening on prevState', () => {
        const store = newStore();
        store.add(makeBareWall());
        store.addOpening('w_host', hostedOpening());

        const { emissions, stop } = capture(store);
        store.updateOpening('w_host', unhostedOpening({ offset: 3.2 }));
        stop();

        const update = emissions.find(e => e.event === 'update');
        expect(update).toBeDefined();
        expect(update!.prevState).toBeDefined();
        expect(update!.prevState!.openings![0]!.offset).toBeCloseTo(1.5, 6);
        expect(update!.wall.openings![0]!.offset).toBeCloseTo(3.2, 6);
    });

    it('removeOpening emits update with prevState still HOLDING the opening', () => {
        const store = newStore();
        store.add(makeBareWall());
        store.addOpening('w_host', hostedOpening());

        const { emissions, stop } = capture(store);
        store.removeOpening('w_host', 'op_1');
        stop();

        const update = emissions.find(e => e.event === 'update');
        expect(update).toBeDefined();
        expect(update!.prevState).toBeDefined();
        expect((update!.prevState!.openings ?? []).length).toBe(1);
        expect((update!.wall.openings ?? []).length).toBe(0);
    });

    it('restoreOpening (undo of a delete) emits update with prevState LACKING the opening', () => {
        const store = newStore();
        store.add(makeBareWall());
        store.addOpening('w_host', hostedOpening());
        store.removeOpening('w_host', 'op_1');

        const { emissions, stop } = capture(store);
        store.restoreOpening('w_host', hostedOpening());
        stop();

        const update = emissions.find(e => e.event === 'update');
        expect(update).toBeDefined();
        expect(update!.prevState).toBeDefined();
        expect((update!.prevState!.openings ?? []).length).toBe(0);
        expect((update!.wall.openings ?? []).length).toBe(1);
    });
});
