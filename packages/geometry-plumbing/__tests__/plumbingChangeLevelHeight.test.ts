/**
 * §L-1087 — a plumbing fixture's 3-D HEIGHT must follow its storey change, or
 * the move must REFUSE.
 *
 * THE DEFECT THIS PINS. `PlumbingFragmentBuilder` seats the root with
 * `root.position.copy(data.position)` (`PlumbingFragmentBuilder.ts:88`) and
 * contains no `getLevelById` call at all, so `data.position.y` is an ABSOLUTE
 * world coordinate. A `changeLevel` that touched only `levelId` re-filed the WC
 * on the new plan, in the level browser and in IFC containment, and left it
 * standing at the OLD floor's height with nothing reporting a failure — the
 * silently-wrong element `WallRake.ts:50-62` forbids.
 *
 * Run against the REAL `PlumbingStore`, never a hand-written double: a fake
 * built from the header cannot falsify the header.
 *
 * @vitest-environment happy-dom
 */
import * as THREE from '@pryzm/renderer-three/three';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlumbingStore } from '../src/PlumbingStore';
import type { PlumbingFixtureData } from '../src/PlumbingTypes';

/** A WALL-HUNG WC on L0: pan rim 0.40 m above that storey's floor. */
const seed = (over: Partial<PlumbingFixtureData> = {}): PlumbingFixtureData => ({
    id: 'fx-1', type: 'plumbing_fixture', fixtureType: 'toilet',
    position: new THREE.Vector3(1, 0.4, 2),
    rotation: new THREE.Euler(0, 0, 0),
    levelId: 'L0', levelName: 'Ground Floor', levelElevation: 0, baseOffset: 0.4,
    properties: {},
    ...over,
});

describe('§L-1087 PlumbingStore.changeLevel — height follows the storey, or it refuses', () => {
    let store: PlumbingStore;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        store = new PlumbingStore();
        store.add(seed());
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
    });
    afterEach(() => { warn.mockRestore(); });

    it('moves position.y by exactly the elevation DELTA, preserving the mounting height', () => {
        const moved = store.changeLevel('fx-1', 'L1', { previousElevation: 0, newElevation: 3 });

        expect(moved).toBeDefined();
        expect(moved!.levelId).toBe('L1');
        expect(moved!.position.y).toBe(3.4);          // EXACTLY +3
        // baseOffset untouched: a wall-hung pan stays wall-hung. An ASSIGNMENT
        // (`position.y = newElevation`) would have dropped it onto the slab at 3.
        expect(moved!.baseOffset).toBe(0.4);
        expect(moved!.position.x).toBe(1);
        expect(moved!.position.z).toBe(2);
        expect(store.getById('fx-1')!.position.y).toBe(3.4);
    });

    it('THE ANTI-HALF-MOVE ARM — with no elevations it REFUSES and the record is untouched', () => {
        store.changeLevel('fx-1', 'L1', { previousElevation: 0, newElevation: 3 });

        const refused = store.changeLevel('fx-1', 'L2');

        expect(refused).toBeUndefined();
        const after = store.getById('fx-1')!;
        expect(after.levelId).toBe('L1');
        expect(after.position.y).toBe(3.4);
        expect(after.levelElevation).toBe(3);
        expect(warn.mock.calls.some(c => String(c[0]).includes('L-1087 REFUSED'))).toBe(true);
    });

    it('refuses a non-finite elevation the same way it refuses a missing one', () => {
        expect(store.changeLevel('fx-1', 'L1', { previousElevation: 0, newElevation: Number.NaN }))
            .toBeUndefined();
        expect(store.changeLevel('fx-1', 'L1', {}))
            .toBeUndefined();
        expect(store.getById('fx-1')!.levelId).toBe('L0');
        expect(store.getById('fx-1')!.position.y).toBe(0.4);
    });

    it('EI-7 — the reverse move restores the original position.y exactly', () => {
        const originalY = store.getById('fx-1')!.position.y;

        store.changeLevel('fx-1', 'L1', { previousElevation: 0, newElevation: 3 });
        const back = store.changeLevel('fx-1', 'L0', { previousElevation: 3, newElevation: 0 });

        expect(back).toBeDefined();
        expect(back!.levelId).toBe('L0');
        expect(back!.position.y).toBe(originalY);
        expect(back!.levelElevation).toBe(0);
    });

    it('refreshes levelElevation truthfully, and never leaves levelName naming the storey it LEFT', () => {
        const moved = store.changeLevel('fx-1', 'L1', { previousElevation: 0, newElevation: 3 });

        expect(moved!.levelElevation).toBe(3);
        // Both fields reach mesh userData (PlumbingFragmentBuilder.ts:32-33), so a
        // stale 'Ground Floor' would be a visible self-contradiction. Without a
        // destination name the label degrades to the destination ID.
        expect(moved!.levelName).not.toBe('Ground Floor');
        expect(moved!.levelName).toBe('L1');
    });

    it('uses the destination NAME when the caller supplies one', () => {
        const moved = store.changeLevel('fx-1', 'L1',
            { previousElevation: 0, newElevation: 3, newLevelName: 'First Floor' });

        expect(moved!.levelName).toBe('First Floor');
        expect(moved!.levelElevation).toBe(3);
    });

    it('does not mutate the PRE-mutation record (the reference the emit forwards)', () => {
        const before = store.getById('fx-1')!;

        store.changeLevel('fx-1', 'L1', { previousElevation: 0, newElevation: 3 });

        // `structuredClone` deep-copies, so mutating the moved record's nested
        // `position` cannot reach back into the pre-state a diff subscriber uses
        // to dirty the storey being VACATED.
        expect(before.position.y).toBe(0.4);
        expect(before.levelId).toBe('L0');
        expect(before.levelName).toBe('Ground Floor');
    });
});
