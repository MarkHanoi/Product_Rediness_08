/**
 * §PARTITION-SHELL-DEGENERATE-STUB regression — build/generate HANG on a
 * near-0.1 m partition stub that the inner-face clamp cannot rescue.
 *
 * Field report (prod console, last lines before the freeze):
 *   [WallJoinResolver] §PARTITION-SHELL-INNER-FACE REFUSED — clamp would
 *   collapse wall_X(end) newLen=0.0490 (MIN=0.05)
 *   …inside markDirty → tick → _flush → resolveLevel →
 *   _clampPartitionEndsToShellInnerFace → _clampEndToShellInnerFace, then FREEZE.
 *
 * Mechanism (a): the REFUSED branch used to bare-`return`, leaving the stub at
 * its un-clamped baseline (its end protruding through the shell). Downstream
 * WallFragmentBuilder.buildWall then fed that ~0.1 m degenerate overlapping
 * geometry into the heavy extrude/CSG/BVH path → computeBoundingSphere/BVH spins
 * → tab freeze. The §WJR-NAN-GUARD near-zero sniff (1e-3 m) does NOT catch a
 * 0.1 m stub, so the durable `invalid` flag is the only thing that keeps it out
 * of the build.
 *
 * Fix (WallJoinResolver.ts §PARTITION-SHELL-DEGENERATE-STUB): in the REFUSED
 * branch, when the wall's CURRENT (un-trimmed) length is itself below
 * DEGENERATE_STUB_LENGTH (0.15 m) it is an unusable stub → _flagInvalid so the
 * mesh builder SKIPS it. A LONG partition whose single end-clamp is refused is
 * left un-clamped (rendered), NOT dropped.
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function makeWall(
    start: [number, number],
    end: [number, number],
    thickness: number,
): WallData {
    const id = `wall_stub_${_seq++}`;
    return {
        id,
        type: 'wall',
        levelId: 'level-0',
        properties: {},
        childrenIds: [],
        baseLine: [
            { x: start[0], y: 0, z: start[1] },
            { x: end[0], y: 0, z: end[1] },
        ],
        height: 3,
        thickness,
        baseOffset: 0,
        openings: [],
    } as WallData;
}

describe('WallJoinResolver — §PARTITION-SHELL-DEGENERATE-STUB', () => {
    it('(a) a degenerate ~0.1 m partition stub whose inner-face clamp is REFUSED is flagged invalid (mesh build skipped)', () => {
        // Long 0.2 m exterior shell, horizontal at z=0 (the "through host").
        const shell = makeWall([0, 0], [6, 0], 0.2);
        // A SHORT partition stub perpendicular to the shell, meeting its BODY
        // mid-span at x=3. Its join (start) endpoint sits on the shell centreline
        // (z=0); its free end is at z=0.12 (room side). Clamping the join end out
        // to the inner face (z ≈ hostHalfT − 1 mm = 0.099) would leave only
        // ~0.021 m → below the 0.05 m minimum → the clamp is REFUSED. Because the
        // stub's CURRENT length (0.12 m) is itself below 0.15 m, it is a
        // degenerate stub and must be flagged invalid.
        const stub = makeWall([3, 0], [3, 0.12], 0.1);

        let result: Map<string, any> | undefined;
        // Terminates (does not hang) — pure data, but assert the call returns.
        expect(() => {
            result = WallJoinResolver.resolveLevel([shell, stub]) as any;
        }).not.toThrow();
        expect(result).toBeDefined();

        const stubAdj = (result as any).get(stub.id);
        expect(stubAdj).toBeDefined();
        // THE FIX: the unclampable degenerate stub is flagged invalid so
        // WallFragmentBuilder.buildWall skips it (no geometry → no hang).
        expect(stubAdj.invalid).toBe(true);
        expect(typeof stubAdj.invalidReason).toBe('string');
        expect(stubAdj.invalidReason).toContain('degenerate stub');

        // The record is still well-formed (finite baseline preserved).
        for (const p of stubAdj.baseLine) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect(Number.isFinite(p.z)).toBe(true);
        }

        // The shell joins/renders normally — never flagged invalid.
        const shellAdj = (result as any).get(shell.id);
        if (shellAdj) expect(shellAdj.invalid).toBeFalsy();
    });

    it('(b) resolveLevel reaches a FIXED POINT — re-running on the same input is idempotent (no infinite re-resolve)', () => {
        const shell = makeWall([0, 0], [6, 0], 0.2);
        const stub = makeWall([3, 0], [3, 0.12], 0.1);

        const r1 = WallJoinResolver.resolveLevel([shell, stub]) as any;
        const a1 = r1.get(stub.id);
        // Feed the same walls again (the coordinator re-flushes on a dirty mark);
        // the stub must STAY flagged invalid — a stable, terminating result, not a
        // configuration that flips and re-dirties the level forever.
        const r2 = WallJoinResolver.resolveLevel([shell, stub]) as any;
        const a2 = r2.get(stub.id);

        expect(a1.invalid).toBe(true);
        expect(a2.invalid).toBe(true);
        expect(a2.invalidReason).toBe(a1.invalidReason);
    });

    it('(c) a LONG partition whose single end-clamp is refused is NOT dropped (stays un-clamped, rendered)', () => {
        // Long 0.2 m shell, and a LONG (3 m) partition that butts the shell body.
        // Even if its inner-face clamp were ever refused, a long wall must remain
        // present and valid — only its trim is foregone, never the whole wall.
        const shell = makeWall([0, 0], [6, 0], 0.2);
        const longPartition = makeWall([3, 0], [3, 3], 0.1);

        const result = WallJoinResolver.resolveLevel([shell, longPartition]) as any;

        const adj = result.get(longPartition.id);
        expect(adj).toBeDefined();
        // NOT flagged invalid — a single refused trim never drops a usable wall.
        expect(adj.invalid).toBeFalsy();
        const [s, e] = adj.baseLine;
        // Still a long, finite, non-degenerate wall.
        expect(Number.isFinite(s.distanceTo(e))).toBe(true);
        expect(s.distanceTo(e)).toBeGreaterThan(2.5);
    });

    it('(d) a NORMAL partition→shell T-join still clamps to the inner face (common case unregressed)', () => {
        // The §PARTITION-SHELL-INNER-FACE clamp for a normal-length partition must
        // be preserved: the join endpoint lands on the shell inner face, the wall
        // is finite and long, and it is NEVER flagged invalid.
        const shell = makeWall([0, 0], [6, 0], 0.2);
        // Partition whose join (start) endpoint starts ON the shell centreline
        // (z=0) and runs to the room side — long enough to clamp cleanly.
        const partition = makeWall([3, 0], [3, 3], 0.1);

        const result = WallJoinResolver.resolveLevel([shell, partition]) as any;
        const adj = result.get(partition.id);
        expect(adj).toBeDefined();
        expect(adj.invalid).toBeFalsy();
        // The join endpoint should have moved off the raw centreline toward the
        // inner face (lateral ≈ hostHalfT ≈ 0.099) — proving the clamp ran.
        const joinZ = Math.min(adj.baseLine[0].z, adj.baseLine[1].z);
        expect(joinZ).toBeGreaterThan(0.05);
        expect(joinZ).toBeLessThan(0.15);
    });
});
