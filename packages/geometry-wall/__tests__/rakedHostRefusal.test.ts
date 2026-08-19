// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — a policy refusal must not arrive as
// a fatal error.
//
// ⚠ §RAKE-HOSTED-OPENING (founder 2026-08-18) — THE RULE THIS FILE POLICED IS GONE,
// THE LESSON IT TAUGHT IS NOT. A raked wall may now host doors and windows: the
// carve and the leaf both ride the wall's own shear about its base
// (`WallRake.ts` §RAKE-HOSTED-OPENING states the plumb-height / in-plane-leaf
// decision; `RakedHostedOpening.test.ts` measures it end to end). So the assertions
// below have flipped from "declines" to "accepts". What has NOT changed is where a
// refusal must happen and how it must be delivered, and that is what this file now
// pins — against the cases that are still refused.
//
// ─── What happened in production, 2026-08-09 ─────────────────────────────────
// The founder set a wall's Vertical Angle, then placed a window on it:
//
//   [CommandManager] EXECUTE: ADD_OPENING
//   [CommandManager] FATAL ERROR DURING EXECUTION WallSchemaError:
//     [WallStore.addOpening] §WALL-RAKE rejected … not supported on a wall that
//     HOSTS OPENINGS … Remove the openings, or leave the rake at 90.
//
// The guard was RIGHT AT THE TIME — ADR-0310 refused this deliberately, because the
// opening carve was a vertical band and the door/window transform assumed a vertical
// host face (C15). What was wrong was the delivery:
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
// an ordinary decline. So a refusal happens BEFORE dispatch: no fatal error, no
// aborted command, and the reason travels the channel built for it.
//
// The WallStore throw STAYS as defence in depth for any path that bypasses this
// one. It should be unreachable from the UI, which is the point — a guard you can
// still reach from a click is a bug report waiting to happen. That is the half of
// L-812 the founder's 2026-08-18 request did not touch, and it is still load-bearing:
// the surviving refusals must decline, never crash.

import { describe, it, expect } from 'vitest';
import { WallOccupancyStore } from '../src/WallOccupancyStore';
import { RAKE_VERTICAL_DEG } from '../src/WallRake';
import type { WallData } from '../src/WallTypes';

const store = new WallOccupancyStore();

/** A plain 6 m straight wall with no openings. */
function wall(rakeAngleDeg?: number | null, extra: Record<string, unknown> = {}): WallData {
    return {
        id: 'wall-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        thickness: 0.2,
        openings: [],
        ...(rakeAngleDeg === undefined ? {} : { rakeAngleDeg }),
        ...extra,
    } as unknown as WallData;
}

describe('§RAKE-HOSTED-OPENING — a raked host now ACCEPTS an opening', () => {
    it('ACCEPTS an opening on a raked wall — the founder\'s 2026-08-18 ask', () => {
        const res = store.canPlace(wall(75), 1, 1.2);
        expect(res.valid).toBe(true);
        expect(res.reason).toBeFalsy();
    });

    it('accepts a rake leaning EITHER way, at both ends of the authorable range', () => {
        for (const deg of [16, 30, 75, 105, 150, 164]) {
            expect(store.canPlace(wall(deg), 1, 1.2).valid).toBe(true);
        }
    });

    it('ALLOWS an opening on a vertical wall — explicit 90°', () => {
        // Unchanged, and still the overwhelmingly common case.
        expect(store.canPlace(wall(RAKE_VERTICAL_DEG), 1, 1.2).valid).toBe(true);
    });

    it('ALLOWS an opening when the wall has NO rake property at all', () => {
        // Every wall authored before ADR-0310 has no `rakeAngleDeg`. Treating
        // absent as raked would have blocked opening placement on the entire
        // existing estate.
        expect(store.canPlace(wall(undefined), 1, 1.2).valid).toBe(true);
        expect(store.canPlace(wall(null), 1, 1.2).valid).toBe(true);
    });
});

describe('§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — the surviving refusals still DECLINE', () => {
    // These hosts cannot legally exist — `WallDataSchema` refuses to mint one — so
    // this arm is defence in depth against a wall written by a path that skipped
    // validation. That is precisely when a crash would be least excusable, which is
    // why the arm is kept reachable and kept a decline.

    // §FEAT-RAKE-CURVED / §FEAT-RAKE-LAYERED-OPENINGS (L-1064) — BOTH of these inverted,
    // and they are rewritten rather than deleted because the occupancy gate is a DIFFERENT
    // write boundary from the schema and the store, and it has to be seen to agree with
    // them. A wall the builder can draw and the store will hold, that the OCCUPANCY check
    // still refuses, is a wall the user cannot put a window in for no stated reason.
    it('a CURVED raked host ACCEPTS an opening — the conical sweep carves correctly', () => {
        let res!: ReturnType<typeof store.canPlace>;
        const curvedRaked = wall(75, { curve: { control: { x: 3, y: 0, z: 1 }, segments: 12 } });
        expect(() => { res = store.canPlace(curvedRaked, 1, 1.2); }).not.toThrow();
        expect(res.valid).toBe(true);
        expect(res.code).toBeUndefined();
    });

    it('a LAYERED raked host ACCEPTS an opening — that path has a shear now', () => {
        const layeredRaked = wall(75, { layers: [{ thickness: 0.1 }, { thickness: 0.1 }] });
        expect(store.canPlace(layeredRaked, 1, 1.2).valid).toBe(true);
    });

    it('an OUT-OF-RANGE rake DECLINES — without throwing', () => {
        expect(store.canPlace(wall(5), 1, 1.2).valid).toBe(false);
    });

    it('gives a reason a human can act on, naming the control to change', () => {
        // "Invalid placement" would be useless here — the user has no way to guess
        // that an unrelated property on the HOST is what refused them.
        //
        // ⚠ THE SUBJECT MOVED. This used a CURVED raked host, which is now ACCEPTED, so
        //   the assertion would have been reading the reason of a refusal that no longer
        //   happens — `undefined`, and `toContain` on undefined fails for the wrong
        //   reason. Re-pointed at the refusal that DOES survive, an out-of-range angle,
        //   which is the same rake-policy family and still names the same control.
        const { reason } = store.canPlace(wall(5), 1, 1.2);
        expect(reason).toBeTruthy();
        expect(reason!.toLowerCase()).toContain('angle');
        expect(reason).toContain('Vertical Angle');   // the exact panel control
        expect(reason).toContain('90');               // the value that fixes it
    });

    it('reports the rake refusal WITHOUT conflictIds — it is not an overlap', () => {
        // Callers branch on conflictIds to highlight the clashing opening. A
        // policy refusal has no conflicting element, and inventing one would send
        // the UI hunting for an opening that does not exist.
        expect(store.canPlace(wall(5), 1, 1.2).conflictIds).toEqual([]);
    });
});
