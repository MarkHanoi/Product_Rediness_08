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
    const id = `wall_repro_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

describe('REPRO §MULTI-CLUSTER pass-through partition over-run', () => {
    it('4-way: collinear pair + 2 off-consensus perpendicular partitions', () => {
        _seq = 0;
        const J = new THREE.Vector3(15.964, 0, 2.815);
        // Collinear through-wall pair: A ends at J from the left, B starts at J to the right.
        const wallA = mk([10.0, 2.815], [15.964, 2.815], 0.2, 1);   // end @ J  (dir +x)
        const wallB = mk([15.964, 2.815], [22.0, 2.815], 0.2, 2);   // start @ J (dir +x)
        // Two perpendicular partition ends, off-consensus (~145mm, ~290mm), perpendicular arms.
        const wallC = mk([15.828, 6.0], [15.828, 2.866], 0.1, 3);   // end @ (15.828, 2.866) → 145mm off J
        const wallD = mk([15.693, 2.917], [15.693, -2.0], 0.1, 4);  // start @ (15.693, 2.917) → 290mm off J

        const res = WallJoinResolver.resolveLevel([wallA, wallB, wallC, wallD], { snapRadius: 0.5 });

        const endC = res.get(wallC.id)!.baseLine[1] as THREE.Vector3;   // C joins at END
        const startD = res.get(wallD.id)!.baseLine[0] as THREE.Vector3; // D joins at START

        const overrunC = Math.hypot(endC.x - J.x, endC.z - J.z);
        const overrunD = Math.hypot(startD.x - J.x, startD.z - J.z);

        // eslint-disable-next-line no-console
        console.log(`REPRO overrunC=${(overrunC*1000).toFixed(1)}mm overrunD=${(overrunD*1000).toFixed(1)}mm`);
        console.log(`  endC=(${endC.x.toFixed(3)},${endC.z.toFixed(3)}) startD=(${startD.x.toFixed(3)},${startD.z.toFixed(3)})`);

        // What we WANT: both pulled onto the junction line (overrun → ~0).
        expect(overrunC).toBeLessThan(0.02);
        expect(overrunD).toBeLessThan(0.02);
    });

    it('4-way WITH SHELL: partition off-ends sit on a non-cluster shell body', () => {
        _seq = 0;
        const J = new THREE.Vector3(15.964, 0, 2.815);
        const wallA = mk([10.0, 2.815], [15.964, 2.815], 0.2, 1);   // end @ J
        const wallB = mk([15.964, 2.815], [22.0, 2.815], 0.2, 2);   // start @ J
        const wallC = mk([15.828, 6.0], [15.828, 2.866], 0.1, 3);   // end @ (15.828, 2.866)
        const wallD = mk([15.693, 2.917], [15.693, -2.0], 0.1, 4);  // start @ (15.693, 2.917)
        // A long perimeter shell wall whose BODY passes within snapRadius of the partition off-ends.
        const shell = mk([15.7, -8.0], [15.7, 10.0], 0.2, 0);       // vertical, x≈15.7

        const res = WallJoinResolver.resolveLevel([wallA, wallB, wallC, wallD, shell], { snapRadius: 0.5 });

        const endC = res.get(wallC.id)!.baseLine[1] as THREE.Vector3;
        const startD = res.get(wallD.id)!.baseLine[0] as THREE.Vector3;
        const overrunC = Math.hypot(endC.x - J.x, endC.z - J.z);
        const overrunD = Math.hypot(startD.x - J.x, startD.z - J.z);
        // eslint-disable-next-line no-console
        console.log(`SHELL overrunC=${(overrunC*1000).toFixed(1)}mm overrunD=${(overrunD*1000).toFixed(1)}mm`);
        console.log(`  endC=(${endC.x.toFixed(3)},${endC.z.toFixed(3)}) startD=(${startD.x.toFixed(3)},${startD.z.toFixed(3)})`);
        // §MULTI-CLUSTER-PARTITION-TRIM regression guard: before the fix the angled
        // arm over-ran ~4.8m past the junction (deferred to the shell T-join). The
        // trim now caps it within the shell-clamp band (~inner-face half-thickness),
        // FAR below the bug. The residual is the separate partition→shell inner-face
        // clamp (correct), not the cluster over-run.
        expect(overrunC).toBeLessThan(0.5);
        expect(overrunD).toBeLessThan(0.5);
    });
});
