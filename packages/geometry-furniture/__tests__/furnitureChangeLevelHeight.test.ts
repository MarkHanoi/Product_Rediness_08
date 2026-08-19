/**
 * §L-1087 — a furniture item's 3-D HEIGHT must follow its storey change, or the
 * move must REFUSE.
 *
 * THE DEFECT THIS PINS. `FurnitureFragmentBuilder` seats the root at
 * `furnitureWorldY(data.position.y, baseOffset)` (`FurnitureFragmentBuilder.ts:148-150,
 * 277-282`) and contains no `getLevelById` call at all, so `data.position.y` is
 * an ABSOLUTE world FLOOR datum stamped at create time. A `changeLevel` that
 * touched only `levelId` re-filed the chair on the new plan, in the level
 * browser and in IFC containment, and left it hovering at the OLD floor's
 * height with nothing reporting a failure — the silently-wrong element
 * `WallRake.ts:50-62` forbids.
 *
 * Run against the REAL `FurnitureStore`, never a hand-written double: a fake
 * built from the header cannot falsify the header.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FurnitureStore } from '../src/FurnitureStore';
import type { FurnitureData } from '../src/FurnitureTypes';

/**
 * A wall unit on L0: its FLOOR datum is L0's elevation (0) and it is MOUNTED
 * 1.45 m above that floor. The mount offset is what a DELTA preserves and an
 * assignment would destroy.
 */
const seed = (over: Partial<FurnitureData> = {}): FurnitureData => ({
    id: 'fu-1', type: 'furniture', furnitureType: 'wall_unit',
    position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    levelId: 'L0', levelName: 'Ground Floor', levelElevation: 0, baseOffset: 1.45,
    width: 0.6, length: 0.35, height: 0.7,
    material: 'wood', properties: {},
    ...over,
});

describe('§L-1087 FurnitureStore.changeLevel — height follows the storey, or it refuses', () => {
    let store: FurnitureStore;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        store = new FurnitureStore();
        store.add(seed());
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
    });
    afterEach(() => { warn.mockRestore(); });

    it('moves position.y by exactly the elevation DELTA, preserving the mount offset', () => {
        const moved = store.changeLevel('fu-1', 'L1', { previousElevation: 0, newElevation: 3 });

        expect(moved).toBeDefined();
        expect(moved!.levelId).toBe('L1');
        expect(moved!.position.y).toBe(3);           // EXACTLY +3
        // baseOffset is untouched, so the builder still seats the unit 1.45 m
        // above its (new) floor: worldY 3 + 1.45 = 4.45, not 1.45.
        expect(moved!.baseOffset).toBe(1.45);
        expect(moved!.position.y + moved!.baseOffset).toBe(4.45);
        // The plan position is untouched by a storey change.
        expect(moved!.position.x).toBe(1);
        expect(moved!.position.z).toBe(2);
        expect(store.getById('fu-1')!.position.y).toBe(3);
    });

    it('THE ANTI-HALF-MOVE ARM — with no elevations it REFUSES and the record is untouched', () => {
        store.changeLevel('fu-1', 'L1', { previousElevation: 0, newElevation: 3 });

        const refused = store.changeLevel('fu-1', 'L2');

        expect(refused).toBeUndefined();
        const after = store.getById('fu-1')!;
        expect(after.levelId).toBe('L1');
        expect(after.position.y).toBe(3);
        expect(after.levelElevation).toBe(3);
        // A refusal is NAMED, never silent.
        expect(warn.mock.calls.some(c => String(c[0]).includes('L-1087 REFUSED'))).toBe(true);
    });

    it('refuses a non-finite elevation the same way it refuses a missing one', () => {
        expect(store.changeLevel('fu-1', 'L1', { previousElevation: 0, newElevation: Number.NaN }))
            .toBeUndefined();
        expect(store.changeLevel('fu-1', 'L1', { newElevation: 3 }))
            .toBeUndefined();
        expect(store.getById('fu-1')!.levelId).toBe('L0');
        expect(store.getById('fu-1')!.position.y).toBe(0);
    });

    it('EI-7 — the reverse move restores the original position.y exactly', () => {
        const originalY = store.getById('fu-1')!.position.y;

        store.changeLevel('fu-1', 'L1', { previousElevation: 0, newElevation: 3 });
        const back = store.changeLevel('fu-1', 'L0', { previousElevation: 3, newElevation: 0 });

        expect(back).toBeDefined();
        expect(back!.levelId).toBe('L0');
        expect(back!.position.y).toBe(originalY);
        expect(back!.levelElevation).toBe(0);
    });

    it('refreshes levelElevation truthfully, and never leaves levelName naming the storey it LEFT', () => {
        const moved = store.changeLevel('fu-1', 'L1', { previousElevation: 0, newElevation: 3 });

        // The denormalised elevation is the SAME number the delta came from.
        expect(moved!.levelElevation).toBe(3);
        // Without a destination name the label degrades to the destination ID —
        // a true identifier of the RIGHT storey — rather than staying 'Ground
        // Floor', which would name the storey the item just left.
        expect(moved!.levelName).not.toBe('Ground Floor');
        expect(moved!.levelName).toBe('L1');
        expect(warn.mock.calls.some(c => String(c[0]).includes('without a'))).toBe(true);
    });

    it('uses the destination NAME when the caller supplies one', () => {
        const moved = store.changeLevel('fu-1', 'L1',
            { previousElevation: 0, newElevation: 3, newLevelName: 'First Floor' });

        expect(moved!.levelName).toBe('First Floor');
        expect(moved!.levelElevation).toBe(3);
    });

    it('does not mutate the PRE-mutation record (the reference an undo leg holds)', () => {
        const before = store.getById('fu-1')!;

        store.changeLevel('fu-1', 'L1', { previousElevation: 0, newElevation: 3 });

        expect(before.position.y).toBe(0);
        expect(before.levelId).toBe('L0');
        expect(before.levelName).toBe('Ground Floor');
    });
});
