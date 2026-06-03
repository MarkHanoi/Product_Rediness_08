/**
 * §WJR-NAN-GUARD regression — diff-thickness project-open HANG (A.WJ.MULTICLUSTER)
 *
 * Reproduces the geometry from the field report: two walls of different
 * thickness (0.2 m dominant + 0.1 m subordinate) meeting at a shared endpoint
 * (both `start`), where the "option-B butt" diff-thickness branch laterally
 * offsets the thin wall's joining endpoint. Before the fix, a near-collinear /
 * short-subordinate configuration could push the moved endpoint PAST its free
 * end (direction reversal) or produce a non-finite point, yielding a NaN
 * baseline that froze the synchronous load-time rebuild downstream.
 *
 * Root-cause analysis:
 *   docs/03-execution/analysis/WALLJOINRESOLVER-DIFF-THICKNESS-HANG-2026-06-03.md
 *
 * The fix adds:
 *   • Producer guard (WallJoinResolver.ts §WJR-NAN-GUARD ~:1022): reject a
 *     non-finite OR direction-reversed lateral offset → fall back to a clean
 *     butt at sharedPt.
 *   • Consumer guard (WallFragmentBuilder.ts §WJR-NAN-GUARD): skip the geometry
 *     build + hide the mesh when the (post-trim) baseline is non-finite or
 *     shorter than MIN_WALL_LEN — so NaN geometry never reaches extrude/CSG/BVH.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function makeWall(
    start: [number, number],
    end: [number, number],
    thickness: number,
): WallData {
    const id = `wall_test_${_seq++}`;
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

/** True if any baseLine coordinate of any join result is non-finite. */
function anyNaN(result: Map<string, { baseLine: [THREE.Vector3, THREE.Vector3] }>): boolean {
    for (const [, jd] of result) {
        for (const p of jd.baseLine) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return true;
        }
    }
    return false;
}

describe('WallJoinResolver — diff-thickness §WJR-NAN-GUARD', () => {
    it('(a)+(b) degenerate 0.2/0.1 start+start join RETURNS and produces NO NaN baseline', () => {
        // Dominant: 0.2 m wall, horizontal along +X, start at the shared corner (0,0).
        const dominant = makeWall([0, 0], [4, 0], 0.2);
        // Subordinate: 0.1 m SHORT wall, start at the shared corner (0,0), at a
        // shallow ~6° angle and short length so the perpendicular lateral offset
        // (~0.099 m) is comparable to its own extent → drives the moved start past
        // the free end (direction reversal) in the unguarded path.
        const angle = (6 * Math.PI) / 180;
        const len = 0.12; // short — offset (~0.099) is a large fraction of this
        const subEnd: [number, number] = [len * Math.cos(angle), len * Math.sin(angle)];
        const subordinate = makeWall([0, 0], subEnd, 0.1);

        let result: Map<string, any> | undefined;
        // (a) MUST return (does not hang). If it hung pre-fix, it completes now.
        expect(() => {
            result = WallJoinResolver.resolveLevel([dominant, subordinate]) as any;
        }).not.toThrow();
        expect(result).toBeDefined();

        // (b) No NaN/Infinity in any produced baseline.
        expect(anyNaN(result as any)).toBe(false);

        // Every adjusted wall keeps a finite, non-degenerate baseline.
        for (const [, jd] of result as any) {
            const [s, e] = jd.baseLine;
            const dlen = s.distanceTo(e);
            expect(Number.isFinite(dlen)).toBe(true);
            expect(dlen).toBeGreaterThan(0);
        }
    });

    it('(c) NORMAL perpendicular 0.2/0.1 L-corner STILL trims to a valid finite join', () => {
        // Classic apartment-generator L-corner: 0.2 m exterior shell meeting a
        // 0.1 m interior partition at a clean right angle. This branch must remain
        // unaffected by the guard (no over-rejection).
        const dominant = makeWall([0, 0], [4, 0], 0.2);     // horizontal, joins at end (4,0)
        const subordinate = makeWall([4, 0], [4, 3], 0.1);  // vertical, joins at start (4,0)

        const result = WallJoinResolver.resolveLevel([dominant, subordinate]) as any;

        // The diff-thickness branch must have produced adjustments for both walls.
        expect(result.size).toBeGreaterThanOrEqual(1);
        expect(anyNaN(result)).toBe(false);

        // The subordinate must still be present with a finite, non-degenerate baseline
        // (it should be laterally offset to butt the dominant's near face — NOT skipped).
        const subAdj = result.get(subordinate.id);
        expect(subAdj).toBeDefined();
        const [ss, se] = subAdj.baseLine;
        const subLen = ss.distanceTo(se);
        expect(Number.isFinite(subLen)).toBe(true);
        expect(subLen).toBeGreaterThan(2.5); // ~3 m wall, lightly trimmed — not collapsed

        // Confirm the lateral trim actually happened: the joining (start) endpoint
        // moved off the raw shared corner (4,0) by ~dominantT/2 (≈0.099 m), proving
        // the normal option-B butt is preserved, not bypassed.
        const lateral = Math.hypot(ss.x - 4, ss.z - 0);
        expect(lateral).toBeGreaterThan(0.05);
        expect(lateral).toBeLessThan(0.15);
    });
});

describe('§WJR-NAN-GUARD — guard conditions (direct, consumer-side logic)', () => {
    // Mirror of the consumer guard predicate in WallFragmentBuilder.buildWall:
    //   skip when any coord is non-finite OR baseline length < MIN_WALL_LEN.
    const MIN_WALL_LEN = 1e-3;
    function isDegenerate(start: THREE.Vector3, end: THREE.Vector3): boolean {
        const finite =
            Number.isFinite(start.x) && Number.isFinite(start.y) && Number.isFinite(start.z) &&
            Number.isFinite(end.x) && Number.isFinite(end.y) && Number.isFinite(end.z);
        return !finite || start.distanceTo(end) < MIN_WALL_LEN;
    }

    it('non-finite (NaN) endpoint → flagged degenerate (skipped)', () => {
        const start = new THREE.Vector3(0, 0, 0);
        const end = new THREE.Vector3(NaN, 0, 0);
        expect(isDegenerate(start, end)).toBe(true);
    });

    it('Infinity endpoint → flagged degenerate (skipped)', () => {
        const start = new THREE.Vector3(0, 0, 0);
        const end = new THREE.Vector3(Infinity, 0, 0);
        expect(isDegenerate(start, end)).toBe(true);
    });

    it('zero-length baseline → flagged degenerate (skipped)', () => {
        const start = new THREE.Vector3(1, 0, 1);
        const end = new THREE.Vector3(1, 0, 1);
        expect(isDegenerate(start, end)).toBe(true);
    });

    it('valid finite baseline → NOT degenerate (passes)', () => {
        const start = new THREE.Vector3(0, 0, 0);
        const end = new THREE.Vector3(4, 0, 0);
        expect(isDegenerate(start, end)).toBe(false);
    });
});

describe('§WJR-INVALID — durable flag-INVALID-and-skip (A.WJ.MULTICLUSTER)', () => {
    // The durable layer turns the interim "silently leave untrimmed + rely on the
    // consumer NaN sniff" behaviour into an explicit, intentful contract: the
    // resolver FLAGS a wall it cannot validly join as `invalid` (+ reason) on its
    // JoinData record, and the mesh builder skips it BY INTENT (consulting the
    // flag), so we KNOW which walls were skipped. These cases assert the producer
    // (resolver) side of that contract.

    it('(d) self-cluster wall (BOTH endpoints in one junction) → flagged invalid', () => {
        // Two long walls forming an L-corner at the origin, PLUS a short wall whose
        // BOTH endpoints sit within snapRadius (0.5 m) of that corner. Union-Find
        // pulls all four endpoints (A.start, B.start, short.start, short.end) into
        // ONE cluster → the short wall contributes 2 endpoints → §SELF-CLUSTER. The
        // durable layer must FLAG the short wall invalid rather than silently skip.
        const wallA = makeWall([0, 0], [4, 0], 0.1);     // start at corner
        const wallB = makeWall([0, 0], [0, 4], 0.1);     // start at corner
        const shortSelfCluster = makeWall([0.05, 0.05], [0.12, 0.12], 0.1); // both ends near corner

        const result = WallJoinResolver.resolveLevel([wallA, wallB, shortSelfCluster]) as any;

        const shortAdj = result.get(shortSelfCluster.id);
        expect(shortAdj).toBeDefined();
        expect(shortAdj.invalid).toBe(true);
        expect(typeof shortAdj.invalidReason).toBe('string');
        expect(shortAdj.invalidReason).toBe('self-cluster');

        // The flagged record is still well-formed (finite baseline preserved) so
        // store write-back of { baseLine } is a no-op rather than a NaN write.
        for (const p of shortAdj.baseLine) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect(Number.isFinite(p.z)).toBe(true);
        }

        // No NaN anywhere in the result (the long walls join normally).
        expect(anyNaN(result)).toBe(false);
    });

    it('(e) a normal L-corner wall is NOT flagged invalid (no over-flagging)', () => {
        // Two perpendicular same-thickness walls forming a clean corner. Neither
        // is a self-cluster, neither collapses → neither may be flagged invalid.
        const wallA = makeWall([0, 0], [4, 0], 0.1);
        const wallB = makeWall([4, 0], [4, 4], 0.1);

        const result = WallJoinResolver.resolveLevel([wallA, wallB]) as any;

        for (const [, jd] of result) {
            expect(jd.invalid).toBeFalsy();
        }
        // Both walls still produce a finite, non-degenerate adjusted baseline.
        for (const [, jd] of result) {
            const [s, e] = jd.baseLine;
            expect(s.distanceTo(e)).toBeGreaterThan(2.5);
        }
    });
});

describe('§WJR-INVALID — consumer skip predicate (mirrors WallFragmentBuilder.buildWall)', () => {
    // The builder consults JoinData.invalid FIRST (before the NaN sniff) and skips
    // the geometry build by intent, logging once. This mirrors that predicate.
    function shouldSkipBuild(joinData?: { invalid?: boolean } | null): boolean {
        return !!joinData?.invalid;
    }

    it('invalid:true JoinData → build skipped', () => {
        expect(shouldSkipBuild({ invalid: true })).toBe(true);
    });

    it('valid JoinData (no invalid flag) → build proceeds', () => {
        expect(shouldSkipBuild({})).toBe(false);
        expect(shouldSkipBuild(undefined)).toBe(false);
        expect(shouldSkipBuild(null)).toBe(false);
        expect(shouldSkipBuild({ invalid: false })).toBe(false);
    });
});
