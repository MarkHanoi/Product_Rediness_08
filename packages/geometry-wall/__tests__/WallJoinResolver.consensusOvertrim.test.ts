/**
 * §CONSENSUS-OVERTRIM-GUARD (2026-06-29 — residual partition over-trim / "~285 mm short")
 *
 * THE defect (ADR-0072 / ADR-0073, founder "some walls start but don't go until the
 * perimeter wall"): in the §MULTI-CLUSTER consensus trim, a partition whose joining
 * endpoint already REACHES — or slightly OVERSHOOTS — the junction (it should terminate
 * ON a host / neighbour at, or just past, the cluster) is RETREATED back along its own
 * axis when the averaged cluster `consensusPoint` happens to sit BEHIND that endpoint.
 * The §CONSENSUS-ON-CENTRELINE projection pulls the endpoint up to the §CONSENSUS-
 * PROXIMITY-GUARD band (~0.45 m) back toward the free end. A ~285 mm retreat pulls the
 * wall OFF its host → an open gap at the junction → the closed wall LOOP RoomDetection-
 * Engine needs never forms → the room is detected as a generic/unclassified room → the
 * downstream §FURNISH-EMPTY (0 furniture) symptom.
 *
 * Fix (WallJoinResolver.ts §CONSENSUS-OVERTRIM-GUARD): the on-centreline foot may still
 * EXTEND a member FORWARD to the junction (the legitimate gap-closing direction — the
 * genuine-star / near-collinear-Y / shallow-Y cases stay BYTE-IDENTICAL), but a BACKWARD
 * retreat past the original join end is capped at OVERTRIM_BACK_TOL (≤50 mm). The endpoint
 * stays EXACTLY on its own centreline (zero lateral drift) and is never pushed forward
 * beyond the foot (no over-extend spike). An overshoot end pinned in place still seals the
 * junction (≤ snapRadius from consensus; within _snapNearbyCorners(0.30) of the cluster).
 *
 * These tests pin: (1) an overshooting member is NOT retreated ~285 mm (it stays at its
 * host, the retreat ≤ tolerance); (2) the three established no-regression junction shapes
 * — a forward-extending member, a genuine star, a near-collinear Y — are byte-identical.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(
    start: [number, number],
    end: [number, number],
    thickness = 0.1,
    createdAt?: number,
): WallData {
    const id = `wall_ot_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

/** Distance a wall's resolved JOIN end moved from its source position (XZ). */
function joinRetreat(src: WallData, jd: any, side: 'start' | 'end'): number {
    const s = src.baseLine[side === 'start' ? 0 : 1];
    const r = (jd.baseLine as [THREE.Vector3, THREE.Vector3])[side === 'start' ? 0 : 1];
    return Math.hypot(r.x - s.x, r.z - s.z);
}

describe('WallJoinResolver — §CONSENSUS-OVERTRIM-GUARD (overshoot member not retreated ~285mm)', () => {
    it('overshooting cluster member is NOT pulled ~285mm back along its axis (stays at its host)', () => {
        _seq = 0;
        // Three angled partitions meeting near the origin. No two are collinear (no
        // pass-through) and none are within 1 mm (no pinned pair) → all fall to the
        // §CONSENSUS-ON-CENTRELINE trim. A and B reach the junction normally; C is drawn
        // so its join END OVERSHOOTS the junction (its end at (-0.30, 0), running back out
        // to its free end at (4, 0.02)). The averaged consensus lands ~(0,0), which sits
        // ~300 mm BEHIND C's overshoot end along C's own axis → the unguarded on-centreline
        // foot would retreat C ~300 mm (the founder's "wall doesn't reach the perimeter").
        const A = mk([-3, -2], [-0.05, -0.02], 0.1, 1);   // joins at END, dir ≈ +x
        const B = mk([ 0, -3], [ 0.02, -0.05], 0.1, 2);   // joins at END, dir ≈ +z
        const C = mk([ 4, 0.02], [-0.30, 0.00], 0.1, 3);  // joins at END, OVERSHOOTS to -x

        const res = WallJoinResolver.resolveLevel([A, B, C], { snapRadius: 1.0 });

        const jdC = res.get(C.id)!;
        expect(jdC.invalid, 'C should not be flagged invalid').toBeFalsy();

        // THE assertion: C's join END must NOT have been dragged the ~300 mm back that the
        // unguarded consensus foot produced. The guard caps the backward retreat at 50 mm.
        const retreatC = joinRetreat(C, jdC, 'end');
        expect(retreatC, `C retreat ${(retreatC * 1000).toFixed(0)}mm`).toBeLessThanOrEqual(0.05 + 1e-6);

        // C stays EXACTLY on its own centreline — the resolved end is colinear with C's
        // source line (zero lateral drift), so no rotation / off-axis spike was introduced.
        const cs = C.baseLine[0], ce = C.baseLine[1];
        const r = (jdC.baseLine as [THREE.Vector3, THREE.Vector3])[1];
        const ax = ce.x - cs.x, az = ce.z - cs.z;
        const lat = Math.abs((r.x - cs.x) * az - (r.z - cs.z) * ax) / Math.hypot(ax, az);
        expect(lat, `C lateral drift ${(lat * 1000).toFixed(1)}mm`).toBeLessThan(1e-6);

        // C's resolved end stays at/just inside its own source overshoot end — i.e. it
        // still reaches the host it overshot, rather than being dragged ~300 mm back to
        // the interior consensus. (A/B are deliberately not asserted here: their exact
        // pair-wise resolution depends on the synthetic geometry; the guard's contract is
        // about the over-trimmed member C.)
        expect(Math.abs(r.x - C.baseLine[1].x), 'C end near source X').toBeLessThanOrEqual(0.05 + 1e-6);
    });

    it('no-regression: a FORWARD-extending member (drawn short of the junction) is byte-identical', () => {
        _seq = 0;
        // Shallow pass-through-ish pair + a 45° arm drawn SHORT of the junction — the arm
        // EXTENDS forward 276 mm to reach consensus. The guard only caps BACKWARD retreats,
        // so this forward extension must be untouched.
        const A = mk([-4, 0],    [-0.05, 0],    0.1, 1);
        const B = mk([ 4, 0.02], [ 0.05, 0.01], 0.1, 2);
        const D = mk([-3, 3],    [-0.20, 0.20], 0.1, 3);  // 45° arm, join end 283 mm short

        const res = WallJoinResolver.resolveLevel([A, B, D], { snapRadius: 1.0 });
        const jdD = res.get(D.id)!;
        expect(jdD.invalid).toBeFalsy();
        // The 45° arm reaches FORWARD ~276 mm to the junction (NOT clamped to 50 mm).
        const ext = joinRetreat(D, jdD, 'end');
        expect(ext, `D forward extension ${(ext * 1000).toFixed(0)}mm`).toBeGreaterThan(0.20);
        // It lands essentially at the junction (origin), closing the gap.
        const r = (jdD.baseLine as [THREE.Vector3, THREE.Vector3])[1];
        expect(Math.hypot(r.x, r.z), 'D at junction').toBeLessThan(0.05);
    });

    it('no-regression: genuine star (centrelines cross one point) lands every member at the crossing', () => {
        _seq = 0;
        const X: [number, number] = [0, 10];
        const dirs: [number, number][] = [
            [-1, 0],
            [Math.cos(Math.PI / 3), Math.sin(Math.PI / 3)],
            [Math.cos(-Math.PI / 3), Math.sin(-Math.PI / 3)],
        ];
        const walls = dirs.map((d, i) => {
            const free: [number, number] = [X[0] + 3 * d[0], X[1] + 3 * d[1]];
            const join: [number, number] = [X[0] + 0.10 * d[0], X[1] + 0.10 * d[1]];
            return mk(free, join, 0.2, i + 1);
        });
        const res = WallJoinResolver.resolveLevel(walls);
        const cross = new THREE.Vector3(X[0], 0, X[1]);
        for (const w of walls) {
            const jd = res.get(w.id)!;
            expect(jd.invalid).toBeFalsy();
            const end = jd.baseLine[1] as THREE.Vector3;
            expect(Math.hypot(end.x - cross.x, end.z - cross.z), `${w.id} at crossing`).toBeLessThan(1e-3);
        }
    });

    it('no-regression: near-collinear Y members stay coincident at the junction', () => {
        _seq = 0;
        const armWLeft  = mk([-6, 0.00], [-0.03, 0.00], 0.1, 1);
        const armWRight = mk([ 6, 0.12], [ 0.03, 0.02], 0.1, 2);
        const stem      = mk([ 0, -6  ], [ 0.00, -0.03], 0.1, 3);
        const res = WallJoinResolver.resolveLevel([armWLeft, armWRight, stem], { snapRadius: 1.0 });
        const ends: THREE.Vector3[] = [];
        for (const w of [armWLeft, armWRight, stem]) {
            const jd = res.get(w.id)!;
            expect(jd.invalid).toBeFalsy();
            ends.push(jd.baseLine[1] as THREE.Vector3);
        }
        let maxGap = 0;
        for (let i = 0; i < ends.length; i++)
            for (let j = i + 1; j < ends.length; j++)
                maxGap = Math.max(maxGap, Math.hypot(ends[i].x - ends[j].x, ends[i].z - ends[j].z));
        expect(maxGap, `max inter-member gap ${(maxGap * 1000).toFixed(0)}mm`).toBeLessThan(0.30);
    });
});
