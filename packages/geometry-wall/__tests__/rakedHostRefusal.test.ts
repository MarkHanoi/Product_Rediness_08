// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — a policy refusal must not arrive as
// a fatal error.
//
// ─── What happened in production, 2026-08-09 ─────────────────────────────────
// The founder set a wall's Vertical Angle, then placed a window on it:
//
//   [CommandManager] EXECUTE: ADD_OPENING
//   [CommandManager] FATAL ERROR DURING EXECUTION WallSchemaError:
//     [WallStore.addOpening] §WALL-RAKE rejected … not supported on a wall that
//     HOSTS OPENINGS … Remove the openings, or leave the rake at 90.
//
// The guard was RIGHT — ADR-0310 refuses this deliberately, because the opening
// carve is a vertical band and the door/window transform assumes a vertical host
// face (C15). What was wrong was the delivery:
//
//   1. it THREW, so the command aborted as `FATAL ERROR DURING EXECUTION`;
//   2. the carefully-written reason went to the devtools console, not the user,
//      whose entire experience was "windows cannot be hosted";
//   3. the property panel already refused the RAKE ROW on a wall that hosts
//      openings, but nothing refused an OPENING on a wall that is raked. Same
//      rule, two directions, one implemented. **That asymmetry was the defect.**
//
// ─── Why the fix belongs in canPlace() ───────────────────────────────────────
// `canPlace()` is already called on hover by every placement path — the
// production log shows it firing continuously as the cursor moves — it already
// returns a human-readable `reason`, and callers already treat `valid:false` as
// an ordinary decline. So the refusal now happens BEFORE dispatch: no fatal
// error, no aborted command, and the reason travels the channel built for it.
//
// The WallStore throw STAYS as defence in depth for any path that bypasses this
// one. It should now be unreachable from the UI, which is the point — a guard
// you can still reach from a click is a bug report waiting to happen.

import { describe, it, expect } from 'vitest';
import { WallOccupancyStore } from '../src/WallOccupancyStore';
import { RAKE_VERTICAL_DEG } from '../src/WallRake';
import type { WallData } from '../src/WallTypes';

const store = new WallOccupancyStore();

/** A plain 6 m straight wall with no openings. */
function wall(rakeAngleDeg?: number | null): WallData {
    return {
        id: 'wall-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        openings: [],
        ...(rakeAngleDeg === undefined ? {} : { rakeAngleDeg }),
    } as unknown as WallData;
}

describe('§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812)', () => {
    it('DECLINES an opening on a raked wall — without throwing', () => {
        // The whole point. Before this, the equivalent journey ended in
        // `FATAL ERROR DURING EXECUTION` from WallStore.addOpening.
        let res!: ReturnType<typeof store.canPlace>;
        expect(() => { res = store.canPlace(wall(75), 1, 1.2); }).not.toThrow();
        expect(res.valid).toBe(false);
    });

    it('gives a reason a human can act on, naming the control to change', () => {
        // "Invalid placement" would be useless here — the user has no way to guess
        // that an unrelated property on the HOST is what refused them.
        const { reason } = store.canPlace(wall(75), 1, 1.2);
        expect(reason).toBeTruthy();
        expect(reason!.toLowerCase()).toContain('angled');
        expect(reason).toContain('Vertical Angle');   // the exact panel control
        expect(reason).toContain('90');               // the value that fixes it
    });

    it('declines a rake leaning EITHER way', () => {
        // The rake range is 15..165 about vertical; both sides are equally unable
        // to host a vertical opening carve.
        expect(store.canPlace(wall(30), 1, 1.2).valid).toBe(false);
        expect(store.canPlace(wall(150), 1, 1.2).valid).toBe(false);
    });

    it('ALLOWS an opening on a vertical wall — explicit 90°', () => {
        // The guard must not fire on the overwhelmingly common case. A guard that
        // blocks normal work gets reverted, and then the crash comes back.
        expect(store.canPlace(wall(RAKE_VERTICAL_DEG), 1, 1.2).valid).toBe(true);
    });

    it('ALLOWS an opening when the wall has NO rake property at all', () => {
        // Every wall authored before ADR-0310 has no `rakeAngleDeg`. Treating
        // absent as raked would have blocked opening placement on the entire
        // existing estate — a far worse regression than the one being fixed.
        expect(store.canPlace(wall(undefined), 1, 1.2).valid).toBe(true);
        expect(store.canPlace(wall(null), 1, 1.2).valid).toBe(true);
    });

    it('reports the rake refusal WITHOUT conflictIds — it is not an overlap', () => {
        // Callers branch on conflictIds to highlight the clashing opening. A
        // policy refusal has no conflicting element, and inventing one would send
        // the UI hunting for an opening that does not exist.
        expect(store.canPlace(wall(75), 1, 1.2).conflictIds).toEqual([]);
    });
});
