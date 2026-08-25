// PROBE (L-10947) — what happens when the founder's own numbers do not fit the
// host wall?
//
// His sentence: *"Make all windows in the south facade 0.1 meters sill height,
// 3 meters height and 1.5 meters wide"*. Sill 0.1 + height 3 needs 3.1 m of
// wall. A default storey is 3.0 m. So on his own project this ask overflows
// every host by 100 mm.
//
// C72 §9 rules the host-move matrix ADAPT or REFUSE, NEVER SILENT, and the
// founder's standing ruling on spatial validity is IMPOSSIBLE vs INADVISABLE vs
// FINE, always ASK, never auto-edit. This file MEASURES which of those the
// live bulk route actually does, before anything is claimed about it.
//
// ⛔ IT IS A PROBE, AND ITS ASSERTIONS PIN WHATEVER IS TRUE TODAY. Where the
// current behaviour is wrong, the test says so in a comment and pins the wrong
// value, so the next change to it is visible rather than silent.

import { describe, it, expect, beforeEach } from 'vitest';
import { wallStore } from '@pryzm/geometry-wall';
import { windowStore } from '@pryzm/geometry-window';
import { UpdateElementDimensionsBatchCommand } from '../src/generic/UpdateElementDimensionsBatchCommand';

const WALL_ID = 'wall-fit-probe';
const WINDOW_ID = 'win-fit-probe';
const OPENING_ID = 'op-fit-probe';

function ctx(): any {
    return { stores: { wallStore } };
}

const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
const bimKernel: any = {
    getLevels: () => [LEVEL],
    getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
    registerElement: () => {},
};

/** A 3.0 m wall — the default storey height, and the founder's own case. */
function seed(wallHeight = 3): void {
    wallStore.attachEngine({} as never, bimKernel);
    wallStore.clear?.();
    windowStore.clear?.();
    wallStore.add({
        id: WALL_ID,
        type: 'wall',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }],
        height: wallHeight,
        thickness: 0.3,
        levelId: 'level-0',
    } as never);
    wallStore.addOpening(WALL_ID, {
        id: OPENING_ID,
        type: 'window',
        offset: 2,
        width: 1.2,
        height: 1.5,
        sillHeight: 0.9,
        elementId: WINDOW_ID,
    } as never);
    windowStore.add({
        id: WINDOW_ID,
        openingId: OPENING_ID,
        wallId: WALL_ID,
        offset: 2,
        width: 1.2,
        height: 1.5,
        sillHeight: 0.9,
    } as never);
}

function openingNow(): any {
    return wallStore.getById(WALL_ID)?.openings?.find((o: any) => o.elementId === WINDOW_ID);
}

describe('L-10947 PROBE — the founder\'s three numbers against a 3 m wall', () => {
    beforeEach(() => seed(3));

    it('⛔ MEASURED: sill 0.1 + height 3 on a 3 m wall is written WITHOUT a word about it', () => {
        const res = new UpdateElementDimensionsBatchCommand({
            elementIds: [WINDOW_ID],
            elementKind: 'window',
            dimensions: { sillHeight: 0.1, height: 3, width: 1.5 },
        }).execute(ctx());

        expect(res.success).toBe(true);

        const win = windowStore.getById(WINDOW_ID)!;
        const opening = openingNow();
        const top = (win.sillHeight ?? 0) + (win.height ?? 0);
        const wallHeight = wallStore.getById(WALL_ID)!.height;

        // ── THE FINDING, PINNED ─────────────────────────────────────────────
        // The opening's head sits at 3.1 m in a 3.0 m wall. Nothing clamped it,
        // nothing refused it, and the report says "Changed 1 of 1".
        //
        // ⚠ THIS IS THE C72 §9 BREACH, AND IT IS PINNED AS CURRENT BEHAVIOUR
        // RATHER THAN ENDORSED. Fixing it is NOT a clamp: the founder's standing
        // ruling is IMPOSSIBLE vs INADVISABLE vs FINE, and ALWAYS ASK — so the
        // answer is a refusal quoting BOTH numbers ("you asked for a head at
        // 3.100 m; this wall is 3.000 m"), not a silently shortened window the
        // user cannot see. Logged as L-10947; the fix belongs with the
        // host-fit gate, not inside a chat lane.
        expect(top).toBeCloseTo(3.1, 6);
        expect(wallHeight).toBe(3);
        expect(top).toBeGreaterThan(wallHeight);
        // No mention of the overflow anywhere in the report.
        expect((res.info ?? []).join(' ')).not.toMatch(/wall|host|taller|fit/i);
        // ⭐⭐ AND THE PROBE FOUND A SECOND, WORSE THING THAN IT WENT LOOKING FOR.
        //
        // The two records DISAGREE. `windowStore` holds sill 0.1 / height 3.
        // `wall.openings[]` — the record every wall-body arm cuts from — holds a
        // DIFFERENT sill, because the wall store's own mirror write pulls the
        // opening back inside the host while the rich store keeps what was asked.
        //
        // So the founder's sentence does not merely overflow: it leaves the FRAME
        // and the VOID 100 mm apart, silently, with the reply saying
        // "Changed 1 of 1". That is C86 §11 #1 — the exact divergence this
        // element family keeps re-producing — arrived at from the dimension side
        // rather than the profile side.
        //
        // ⛔ PINNED AS MEASURED, NOT ENDORSED. The values below are what the
        // model holds TODAY; if a fix lands, this test fails and that is the
        // point. Logged as L-10947.
        expect(windowStore.getById(WINDOW_ID)!.sillHeight).toBeCloseTo(0.1, 6);
        expect(windowStore.getById(WINDOW_ID)!.height).toBeCloseTo(3, 6);
        expect(opening?.sillHeight).toBeCloseTo(0, 6);      // ≠ 0.1 — the divergence
        expect(opening?.height).toBeCloseTo(3, 6);
        expect(opening?.sillHeight).not.toBeCloseTo(windowStore.getById(WINDOW_ID)!.sillHeight!, 6);
    });

    it('⛔ NON-VACUITY — the same three numbers on a 3.5 m wall are genuinely FINE', () => {
        seed(3.5);
        const res = new UpdateElementDimensionsBatchCommand({
            elementIds: [WINDOW_ID],
            elementKind: 'window',
            dimensions: { sillHeight: 0.1, height: 3, width: 1.5 },
        }).execute(ctx());
        expect(res.success).toBe(true);
        const win = windowStore.getById(WINDOW_ID)!;
        expect((win.sillHeight ?? 0) + (win.height ?? 0)).toBeLessThanOrEqual(3.5 + 1e-9);
    });

    it('⭐ ALL THREE dimensions ride ONE child dispatch — the one-undo property holds', () => {
        const cmd = new UpdateElementDimensionsBatchCommand({
            elementIds: [WINDOW_ID],
            elementKind: 'window',
            dimensions: { sillHeight: 0.1, height: 3, width: 1.5 },
        });
        expect(cmd.execute(ctx()).success).toBe(true);
        const after = windowStore.getById(WINDOW_ID)!;
        expect(after.width).toBeCloseTo(1.5, 6);
        expect(after.height).toBeCloseTo(3, 6);
        expect(after.sillHeight).toBeCloseTo(0.1, 6);

        // ONE undo restores all three — not three Ctrl-Zs.
        expect(cmd.undo(ctx()).success).toBe(true);
        const back = windowStore.getById(WINDOW_ID)!;
        expect(back.width).toBeCloseTo(1.2, 6);
        expect(back.height).toBeCloseTo(1.5, 6);
        expect(back.sillHeight).toBeCloseTo(0.9, 6);
    });
});
