/**
 * §PARTITION-SHELL-COLLINEAR-GUARD (2026-06-30 — "120 elements failed" / over-trim collapse)
 *
 * THE defect (founder, 5-storey resi building re-open): the console showed
 *   `[WallJoinResolver] §PARTITION-SHELL-INNER-FACE REFUSED — clamp would collapse
 *    … newLen=0.0490 (MIN=0.05) curLen=6.2383`
 * — the inner-face clamp wanted to trim a 6.2 m wall down to ~49 mm.
 *
 * Root cause (in `_clampEndToShellInnerFace`): the clamp places the join endpoint at
 *   newJoin = hostContact + hostDir*along + sideNormal*targetLateral
 * where `along = (freePt − hostContact)·hostDir`. That is only correct when the
 * partition meets the host near-PERPENDICULARLY (then `along ≈ 0`). For a partition
 * running NEAR-COLLINEAR with / grazing the host, `along ≈ ±(full wall length)`, so
 * `newJoin` lands ~a wall-length down the host and only `hostHalfT` (≈0.049 m) off the
 * axis → `newLen ≈ hostHalfT`, collapsing a long wall. The host-selection loop had no
 * collinearity guard, so a long shell wall running parallel and within snap of an
 * interior partition's endpoint was wrongly chosen as that partition's "host."
 *
 * Fix (WallJoinResolver.ts §PARTITION-SHELL-COLLINEAR-GUARD): reject any candidate host
 * whose axis is within ~30° of THIS wall's axis (|hostDir·partDir| > cos 60° = 0.5). A
 * genuine partition-T is never collinear with its host. The existing inner-face clamp
 * tests are all near-perpendicular, so they are byte-identical.
 *
 * These tests pin: (1) a long wall running near-parallel to a shell is NOT collapsed /
 * flagged invalid by the inner-face clamp; (2) no-regression — a genuine perpendicular
 * partition-T still butts the shell inner face (clamp still fires).
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(
    start: [number, number],
    end: [number, number],
    thickness: number,
    createdAt?: number,
): WallData {
    const id = `wall_psc_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

function resolvedLen(jd: { baseLine: [{ x: number; z: number }, { x: number; z: number }] }): number {
    const [a, b] = jd.baseLine;
    return Math.hypot(b.x - a.x, b.z - a.z);
}

describe('WallJoinResolver — §PARTITION-SHELL-COLLINEAR-GUARD (long grazing wall not collapsed)', () => {
    it('a 6.2 m wall running NEAR-PARALLEL to a shell is NOT clamped to ~0.05 m / flagged invalid', () => {
        _seq = 0;
        // Long horizontal shell along z=0.
        const shell = mk([-10, 0], [10, 0], 0.2, 1);
        // A 6.2 m wall running ALMOST PARALLEL to the shell, ~0.045 m above it, whose
        // JOIN end (the right end, at x≈0) lands within snap of the shell BODY interior.
        // This is the grazing geometry that mis-fires the inner-face clamp: pre-fix,
        // along = (freePt − hostContact)·hostDir ≈ 6.2 m → newJoin ~6.2 m down the host,
        // newLen ≈ hostHalfT ≈ 0.049 m (the founder's collapse).
        const graze = mk([6.2, 0.045], [0.0, 0.05], 0.1, 2);   // join end at x≈0, near-collinear with shell
        const res = WallJoinResolver.resolveLevel([shell, graze], { snapRadius: 0.5 });

        // With the guard, the inner-face clamp never selects the parallel shell as a host
        // for this grazing wall, so the wall is left UNADJUSTED — either absent from the
        // result map (untouched), or present but neither invalid nor collapsed. Pre-fix it
        // was collapsed to ~0.049 m. Assert: NOT flagged invalid, and length stays ~6.2 m.
        const jg = res.get(graze.id);
        const srcLen = Math.hypot(graze.baseLine[1].x - graze.baseLine[0].x, graze.baseLine[1].z - graze.baseLine[0].z);
        if (jg) {
            expect(jg.invalid, 'grazing wall must NOT be flagged invalid').toBeFalsy();
            expect(resolvedLen(jg as any), `grazing wall length ${resolvedLen(jg as any).toFixed(3)}m`).toBeGreaterThan(6.0);
        } else {
            // Untouched — its source baseline (~6.2 m) is what renders. That is the pass.
            expect(srcLen, `grazing source length ${srcLen.toFixed(3)}m`).toBeGreaterThan(6.0);
        }
    });

    it('no-regression: a genuine PERPENDICULAR partition-T still butts the shell inner face', () => {
        _seq = 0;
        // Long horizontal shell along z=0, thickness 0.2 (inner face at z = ±0.1).
        const shell = mk([-10, 0], [10, 0], 0.2, 1);
        // A perpendicular partition coming UP from below; its top (end) endpoint sits on
        // the shell CENTRELINE (z=0). The clamp should pull that end back to the inner
        // face (z ≈ −0.1 + 1mm overlap), i.e. it should still FIRE (this is the intended
        // behaviour the guard must not regress).
        const partition = mk([0, -4], [0, 0], 0.1, 2);   // vertical, join end at the shell centreline
        const res = WallJoinResolver.resolveLevel([shell, partition], { snapRadius: 0.5 });

        const jp = res.get(partition.id)!;
        expect(jp.invalid, 'perpendicular partition must not be flagged invalid').toBeFalsy();
        // Its end must have been pulled to (just inside) the shell inner face — its
        // resolved length shrinks from 4.0 m to ~3.9 m (clamp fired), NOT collapsed.
        const len = resolvedLen(jp);
        expect(len, `partition length ${len.toFixed(3)}m`).toBeGreaterThan(3.5);
        expect(len, `partition length ${len.toFixed(3)}m`).toBeLessThan(3.95);
        // The resolved join end z is at/near the inner face (≈ −0.099), not the centreline (0).
        const endZ = jp.baseLine[1].z;
        expect(Math.abs(endZ - (-0.099)), `end z ${endZ.toFixed(4)} near inner face`).toBeLessThan(0.02);
    });
});
