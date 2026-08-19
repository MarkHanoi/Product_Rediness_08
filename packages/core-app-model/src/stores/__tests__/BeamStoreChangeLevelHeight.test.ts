/**
 * §L-1087 — a beam's 3-D HEIGHT must follow its storey change, or the move must
 * REFUSE.
 *
 * THE DEFECT THIS PINS. `BeamFragmentBuilder` seats the mesh at
 * `root.position.set(centre.x, centre.y, centre.z)`
 * (`packages/geometry-beam/src/BeamFragmentBuilder.ts:405`), where `centre.y` is
 * `(start.y + end.y) * 0.5` (`:352-356`) — the record's OWN absolute Y. The file
 * contains no `getLevelById` call at all. So a `changeLevel` that touched only
 * `levelId` re-filed the beam on the new plan, in the level browser and in IFC
 * containment, and left the mesh hovering at the OLD floor's height, with
 * nothing reporting a failure — the silently-wrong element `WallRake.ts:50-62`
 * forbids.
 *
 * These assertions run against the REAL `BeamStore`, never a hand-written
 * double: a fake built from the header cannot falsify the header.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BeamStore } from '../BeamStore';
import type { BeamData } from '../BeamTypes';
import { ProjectContext } from '../../context/ProjectContext';

/** A beam authored on L0, whose soffit sits 2.7 m above that storey's floor. */
function seedBeam(store: BeamStore, id = 'beam-1'): BeamData {
    const beam: BeamData = {
        id,
        levelId: 'L0',
        startPoint: { x: 0, y: 2.7, z: 0 },
        endPoint:   { x: 4, y: 2.7, z: 0 },
        width: 0.3,
        depth: 0.5,
        loadBearing: true,
        properties: {},
        ifcData: { guid: 'guid-beam-1', ifcClass: 'IfcBeam' },
    };
    store.add(beam);
    return beam;
}

describe('§L-1087 BeamStore.changeLevel — height follows the storey, or it refuses', () => {
    let store: BeamStore;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        store = new BeamStore(new ProjectContext());
        warn = vi.spyOn(console, 'warn').mockImplementation(() => { /* silence */ });
    });
    afterEach(() => { warn.mockRestore(); });

    it('moves BOTH endpoints by exactly the elevation DELTA, preserving the soffit offset', () => {
        seedBeam(store);

        const moved = store.changeLevel('beam-1', 'L1', { previousElevation: 0, newElevation: 3 });

        expect(moved).toBeDefined();
        expect(moved!.levelId).toBe('L1');
        // EXACTLY +3 — a beam authored 2.7 m above L0's floor is now 2.7 m above
        // L1's floor, not slammed to L1's floor datum.
        expect(moved!.startPoint.y).toBe(5.7);
        expect(moved!.endPoint.y).toBe(5.7);
        // The mount offset above the storey floor is the invariant a DELTA keeps
        // and an ASSIGNMENT would destroy.
        // (the subtraction here is the TEST's own arithmetic, so it carries the
        // float noise the store snaps away — hence a 9-digit closeness, while the
        // store's own values above are asserted exactly.)
        expect(moved!.startPoint.y - 3).toBeCloseTo(2.7, 9);
        // The X/Z plan position is untouched by a storey change.
        expect(moved!.startPoint.x).toBe(0);
        expect(moved!.endPoint.x).toBe(4);
        // `add()` parents a beam to its storey; the parent moves with it.
        expect(moved!.parentId).toBe('L1');
        expect(store.getById('beam-1')!.startPoint.y).toBe(5.7);
    });

    it('THE ANTI-HALF-MOVE ARM — with no elevations it REFUSES and the record is untouched', () => {
        seedBeam(store);
        store.changeLevel('beam-1', 'L1', { previousElevation: 0, newElevation: 3 });

        const refused = store.changeLevel('beam-1', 'L2');

        expect(refused).toBeUndefined();
        const after = store.getById('beam-1')!;
        // levelId did NOT move. A storey change without a height change is the
        // whole defect, so it must not happen at all.
        expect(after.levelId).toBe('L1');
        expect(after.startPoint.y).toBe(5.7);
        expect(after.endPoint.y).toBe(5.7);
        expect(after.parentId).toBe('L1');
        // A refusal is NAMED, never silent — otherwise it is indistinguishable
        // from "no such beam" (§context-data-honesty).
        expect(warn).toHaveBeenCalled();
        expect(String(warn.mock.calls[0][0])).toContain('L-1087 REFUSED');
    });

    it('refuses a non-finite elevation the same way it refuses a missing one', () => {
        seedBeam(store);

        expect(store.changeLevel('beam-1', 'L1', { previousElevation: 0, newElevation: Number.NaN }))
            .toBeUndefined();
        expect(store.changeLevel('beam-1', 'L1', { previousElevation: Number.POSITIVE_INFINITY, newElevation: 3 }))
            .toBeUndefined();
        expect(store.getById('beam-1')!.levelId).toBe('L0');
        expect(store.getById('beam-1')!.startPoint.y).toBe(2.7);
    });

    it('EI-7 — the reverse move restores the original Y exactly', () => {
        const seeded = seedBeam(store);
        const originalY = seeded.startPoint.y;

        store.changeLevel('beam-1', 'L1', { previousElevation: 0, newElevation: 3 });
        const back = store.changeLevel('beam-1', 'L0', { previousElevation: 3, newElevation: 0 });

        expect(back).toBeDefined();
        expect(back!.levelId).toBe('L0');
        expect(back!.startPoint.y).toBe(originalY);
        expect(back!.endPoint.y).toBe(originalY);
    });

    it('does not mutate the PRE-mutation record through a shared endpoint object', () => {
        seedBeam(store);
        const before = store.getById('beam-1')!;
        const beforeStartY = before.startPoint.y;

        store.changeLevel('beam-1', 'L1', { previousElevation: 0, newElevation: 3 });

        // `before` is the reference an undo leg would be holding. A shallow
        // spread would have shared `startPoint` with the moved record and turned
        // this "before" value into the "after" one, silently.
        expect(before.startPoint.y).toBe(beforeStartY);
    });
});
