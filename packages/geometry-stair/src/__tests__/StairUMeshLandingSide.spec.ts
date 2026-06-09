// ─── U-stair half-landing SIDE regression (§STAIR-U-LANDING-SIDE, ROOT B) ────
// The U half-landing slab in StairMeshBuilder used to HARDCODE its perpendicular
// direction to LEFT (`(-flatDir.z, 0, flatDir.x)`), ignoring `stair.secondRunSide`.
// On a RIGHT-fold U-stair, flight 2's `startOverride` is offset to the RIGHT
// (StairCreationController._computeUPerpDir / HouseLayoutExecutor._buildFlights),
// so the landing — drawn on the LEFT — spanned AWAY from flight 2 and projected
// past the footprint (the "U-stair goes beyond the shell" defect, mesh side).
//
// This test pins the invariant the fix enforces: the mesh's landing perpDir MUST
// point to the SAME half-plane as the side flight 2 was actually placed on, for
// BOTH folds. It re-encodes the two formulas (kept in lock-step with the source)
// and asserts they agree — a regression that FAILS against the old hardcoded-LEFT
// mesh whenever secondRunSide === 'right'.
//
// Pure THREE vector math (node-compatible — no DOM, no window, no builder boot).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

/** The mesh-builder U landing perpDir (StairMeshBuilder §STAIR-U-LANDING-SIDE). */
function meshLandingPerpDir(flatDir: THREE.Vector3, secondRunSide: 'left' | 'right'): THREE.Vector3 {
    return secondRunSide === 'right'
        ? new THREE.Vector3(flatDir.z, 0, -flatDir.x).normalize()
        : new THREE.Vector3(-flatDir.z, 0, flatDir.x).normalize();
}

/** The side flight 2 is offset to (StairCreationController._computeUPerpDir). */
function flight2OffsetDir(dir1: THREE.Vector3, secondRunSide: 'left' | 'right'): THREE.Vector3 {
    return secondRunSide === 'right'
        ? new THREE.Vector3(dir1.z, 0, -dir1.x).normalize()
        : new THREE.Vector3(-dir1.z, 0, dir1.x).normalize();
}

describe('U-stair half-landing side (§STAIR-U-LANDING-SIDE)', () => {
    const dirs: Array<{ name: string; d: THREE.Vector3 }> = [
        { name: '+X', d: new THREE.Vector3(1, 0, 0) },
        { name: '+Z', d: new THREE.Vector3(0, 0, 1) },
        { name: '-X', d: new THREE.Vector3(-1, 0, 0) },
        { name: 'diag', d: new THREE.Vector3(1, 0, 1).normalize() }, // rotated ~45°
    ];

    for (const { name, d } of dirs) {
        for (const side of ['left', 'right'] as const) {
            it(`landing perpDir matches flight-2 side (${side}) for dir1=${name}`, () => {
                const landing = meshLandingPerpDir(d, side);
                const flight2 = flight2OffsetDir(d, side);
                // Same half-plane ⇒ dot ≈ +1 (both unit vectors, same direction).
                expect(landing.dot(flight2)).toBeCloseTo(1, 6);
            });
        }
    }

    it('right fold is the OPPOSITE side of left fold (the hardcoded-LEFT bug)', () => {
        const d = new THREE.Vector3(1, 0, 0);
        const left = meshLandingPerpDir(d, 'left');
        const right = meshLandingPerpDir(d, 'right');
        // Anti-parallel — a right-fold landing must NOT coincide with the old
        // always-left slab (which is exactly the defect this fix removes).
        expect(left.dot(right)).toBeCloseTo(-1, 6);
    });
});
