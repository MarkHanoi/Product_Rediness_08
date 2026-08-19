/**
 * §L-1087 — a lighting fixture's 3-D HEIGHT must follow its storey change, or
 * the move must REFUSE.
 *
 * THE DEFECT THIS PINS. `LightingFragmentBuilder` seats the group with
 * `group.position.set(x, y, z)` straight from `data.position`
 * (`LightingFragmentBuilder.ts:344-345`) and contains no `getLevelById` call at
 * all, so `data.position.y` is an ABSOLUTE world coordinate. A `changeLevel`
 * that touched only `levelId` re-filed the fixture on the new plan, in
 * `getAllForLevel`, in the level browser and in IFC containment, and left it
 * hanging at the OLD storey's ceiling height with nothing reporting a failure —
 * the silently-wrong element `WallRake.ts:50-62` forbids.
 *
 * Run against the REAL `LightingStore`, never a hand-written double: a fake
 * built from the header cannot falsify the header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storeEventBus } from '@pryzm/core-app-model';
import { LightingStore } from '../src/LightingStore';
import type { LightingData } from '../src/LightingTypes';

/** A downlight on L0, hung at 2.6 m — a fixture is almost never at its floor. */
const seed = (over: Partial<LightingData> = {}): LightingData => ({
    id: 'lt-1', type: 'lighting', levelId: 'L0', fixtureType: 'downlight',
    position: { x: 2, y: 2.6, z: 1 },
    ...over,
});

describe('§L-1087 LightingStore.changeLevel — height follows the storey, or it refuses', () => {
    let store: LightingStore;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        store = new LightingStore();
        store.add(seed());
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
    });
    afterEach(() => { warn.mockRestore(); });

    it('moves position.y by exactly the elevation DELTA, preserving the hanging height', () => {
        const moved = store.changeLevel('lt-1', 'L1', { previousElevation: 0, newElevation: 3 });

        expect(moved).toBeDefined();
        expect(moved!.levelId).toBe('L1');
        expect(moved!.position.y).toBe(5.6);           // EXACTLY +3
        // The mounting height above its storey floor is the invariant a DELTA
        // keeps: 2.6 m above L0's floor becomes 2.6 m above L1's floor — an
        // assignment would have dropped the downlight to 3.0, on the slab.
        // (the subtraction is the TEST's own arithmetic and carries the float
        // noise the store snaps away — the store's own values are asserted exactly.)
        expect(moved!.position.y - 3).toBeCloseTo(2.6, 9);
        expect(moved!.position.x).toBe(2);
        expect(moved!.position.z).toBe(1);
        expect(store.getById('lt-1')!.position.y).toBe(5.6);
    });

    it('THE ANTI-HALF-MOVE ARM — with no elevations it REFUSES and the record is untouched', () => {
        store.changeLevel('lt-1', 'L1', { previousElevation: 0, newElevation: 3 });

        const refused = store.changeLevel('lt-1', 'L2');

        expect(refused).toBeUndefined();
        const after = store.getById('lt-1')!;
        expect(after.levelId).toBe('L1');
        expect(after.position.y).toBe(5.6);
        expect(warn.mock.calls.some(c => String(c[0]).includes('L-1087 REFUSED'))).toBe(true);
    });

    it('refuses a non-finite elevation the same way it refuses a missing one', () => {
        expect(store.changeLevel('lt-1', 'L1', { previousElevation: Number.NaN, newElevation: 3 }))
            .toBeUndefined();
        expect(store.changeLevel('lt-1', 'L1', { previousElevation: 0 }))
            .toBeUndefined();
        expect(store.getById('lt-1')!.levelId).toBe('L0');
        expect(store.getById('lt-1')!.position.y).toBe(2.6);
    });

    it('EI-7 — the reverse move restores the original position.y exactly', () => {
        const originalY = store.getById('lt-1')!.position.y;

        store.changeLevel('lt-1', 'L1', { previousElevation: 0, newElevation: 3 });
        const back = store.changeLevel('lt-1', 'L0', { previousElevation: 3, newElevation: 0 });

        expect(back).toBeDefined();
        expect(back!.levelId).toBe('L0');
        expect(back!.position.y).toBe(originalY);
    });

    it('rebuilds `position` rather than sharing it with the PRE-mutation record', () => {
        // The emit forwards the INTERNAL pre-mutation object as `prevState` —
        // the only way to observe it from outside, since `get()` returns a
        // structuredClone. `Object.freeze` on the record is SHALLOW, so a shared
        // nested `position` would have been mutated in place and this "before"
        // value would read 5.6: the storey being VACATED would then be diffed
        // against the new value rather than the old one.
        let prev: LightingData | undefined;
        const unsubscribe = storeEventBus.subscribe(e => {
            if (e.elementType === 'lighting' && e.prevState) prev = e.prevState as LightingData;
        });
        try {
            store.changeLevel('lt-1', 'L1', { previousElevation: 0, newElevation: 3 });
        } finally {
            unsubscribe();
        }

        expect(prev).toBeDefined();
        expect(prev!.position.y).toBe(2.6);
        expect(prev!.levelId).toBe('L0');
    });
});
