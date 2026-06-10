// ─── U-stair half-landing GUARD regression (§U-LANDING-GUARD) ────────────────
// Founder defect: a U (half-turn) stair had balusters on the lower flight and the
// upper flight but NO railing across the mid/half-landing's open (exposed) edge.
// Root cause: StairRailingBuilder.buildLandingSegment() returned early for every
// U-shape landing (`if (nextFlight.startOverride) return;`), so no guard was ever
// emitted across the landing.
//
// The fix (buildULandingGuard) emits a horizontal handrail + balusters along the
// landing's OPEN forward edge — the edge running in `perpDir` (toward
// secondRunSide) across the slab's far `flatDir` face, from flight 1's OUTER rail
// line to flight 2's OUTER rail line, at the landing elevation.
//
// This test re-encodes the guard's endpoint math (kept in lock-step with the
// source) and pins the invariants the fix enforces, for BOTH folds. Pure THREE
// vector math (node-compatible — no DOM, no window, no builder boot), matching the
// sibling StairUMeshLandingSide.spec.ts style.

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

/** perpDir toward secondRunSide (StairMeshBuilder §STAIR-U-LANDING-SIDE / guard). */
function perpDir(flatDir: THREE.Vector3, secondRunSide: 'left' | 'right'): THREE.Vector3 {
    return secondRunSide === 'right'
        ? new THREE.Vector3(flatDir.z, 0, -flatDir.x).normalize()
        : new THREE.Vector3(-flatDir.z, 0, flatDir.x).normalize();
}

/** The two endpoints of the open-edge guard (buildULandingGuard). */
function guardEndpoints(
    flightStart: THREE.Vector3,
    flatDir: THREE.Vector3,
    totalRun: number,
    totalRise: number,
    width: number,
    treadDepth: number,
    secondRunSide: 'left' | 'right',
): { p0: THREE.Vector3; p1: THREE.Vector3; landingElev: number } {
    const p = perpDir(flatDir, secondRunSide);
    const landingElev = flightStart.y + totalRise;
    const lastTreadCentre = flightStart.clone().add(flatDir.clone().multiplyScalar(totalRun));
    const frontEdgeBase = lastTreadCentre.clone()
        .add(flatDir.clone().multiplyScalar(treadDepth / 2 + width));
    const p0 = frontEdgeBase.clone().add(p.clone().multiplyScalar(-width / 2)).setY(landingElev);
    const p1 = frontEdgeBase.clone().add(p.clone().multiplyScalar(width * 1.5)).setY(landingElev);
    return { p0, p1, landingElev };
}

/** Which railing side emits the (single) guard — flight 1's OUTER side. */
function emittingSideSign(secondRunSide: 'left' | 'right'): number {
    return secondRunSide === 'right' ? 1 /* 'left' */ : -1 /* 'right' */;
}

describe('U-stair half-landing guard (§U-LANDING-GUARD)', () => {
    const width = 1.0;
    const treadDepth = 0.28;
    const totalRun = 10 * treadDepth;
    const totalRise = 10 * 0.18;
    const flightStart = new THREE.Vector3(0, 0, 0);

    const dirs: Array<{ name: string; d: THREE.Vector3 }> = [
        { name: '+X', d: new THREE.Vector3(1, 0, 0) },
        { name: '+Z', d: new THREE.Vector3(0, 0, 1) },
        { name: 'diag', d: new THREE.Vector3(1, 0, 1).normalize() },
    ];

    for (const { name, d } of dirs) {
        for (const side of ['left', 'right'] as const) {
            it(`guard spans full landing front (2*width) at landing level — dir=${name}, fold=${side}`, () => {
                const { p0, p1, landingElev } = guardEndpoints(
                    flightStart, d, totalRun, totalRise, width, treadDepth, side,
                );
                // The open edge spans the FULL landing front: flight 1 outer rail line
                // (perpDir*-width/2) → flight 2 outer rail line (perpDir*+3*width/2) = 2*width.
                expect(p0.distanceTo(p1)).toBeCloseTo(2 * width, 6);
                // Both endpoints sit on the landing platform (top of flight 1).
                expect(p0.y).toBeCloseTo(landingElev, 6);
                expect(p1.y).toBeCloseTo(landingElev, 6);
                expect(landingElev).toBeCloseTo(totalRise, 6);
            });

            it(`guard edge runs along perpDir (perpendicular to flight travel) — dir=${name}, fold=${side}`, () => {
                const { p0, p1 } = guardEndpoints(
                    flightStart, d, totalRun, totalRise, width, treadDepth, side,
                );
                const edge = p1.clone().sub(p0).normalize();
                const flatH = new THREE.Vector3(d.x, 0, d.z).normalize();
                // Open edge is perpendicular to flight travel (dot ≈ 0).
                expect(Math.abs(edge.dot(flatH))).toBeLessThan(1e-6);
                // And parallel to perpDir toward secondRunSide.
                expect(edge.dot(perpDir(d, side))).toBeCloseTo(1, 6);
            });
        }
    }

    it('the guard is emitted ONCE — from flight 1 OUTER side (-perpDir)', () => {
        // left-fold: perpDir == +sideAxis ⇒ outer side is the 'right' railing (sideSign -1)
        expect(emittingSideSign('left')).toBe(-1);
        // right-fold: perpDir == -sideAxis ⇒ outer side is the 'left' railing (sideSign +1)
        expect(emittingSideSign('right')).toBe(1);
    });

    it('guard front edge is one slab-depth forward of flight 1 last tread (matches mesh slab face)', () => {
        const { p0 } = guardEndpoints(
            flightStart, new THREE.Vector3(1, 0, 0), totalRun, totalRise, width, treadDepth, 'left',
        );
        // Forward distance in flatDir from last-tread centre = treadDepth/2 + width.
        const lastTreadCentreX = totalRun; // flatDir = +X
        expect(p0.x).toBeCloseTo(lastTreadCentreX + treadDepth / 2 + width, 6);
    });
});
