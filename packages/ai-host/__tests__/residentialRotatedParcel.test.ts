// §RESI-RIGID-TRANSFORM (2026-06-23) — the rotated-parcel acceptance test.
//
// THE BUG IT GUARDS: the founder draws the site boundary at an ANGLE on the map, so the
// parcel reaches the residential orchestrator as a ROTATED quadrilateral. The orchestrator
// used to HARD-reject anything that was not an axis-aligned rectangle (the
// "footprint must be an axis-aligned rectangle (stub)" path) → status:'rejected' → no
// geometry. The fix mirrors the HOUSE engine's §PRINCIPAL-AXIS: derive the parcel's oriented
// bounding box, run the WHOLE partition/packer/per-cell engine in the axis-aligned LOCAL
// frame, and carry a rigid transform back to WORLD.
//
// This test feeds a rotated (~25°) rectangle through the orchestrator and asserts:
//   (a) status is NOT 'rejected';
//   (b) apartments are placed on the upper levels;
//   (c) EVERY emitted element (the core, every apartment cell, every corridor band, and the
//       per-cell layout walls), after the rigid transform is applied, lies WITHIN the rotated
//       parcel polygon — i.e. the building is ALIGNED to the drawn boundary, not axis-aligned
//       and spilling outside it.
//
// PURE: drives the L2 orchestrator directly (no editor, no THREE, no DOM).

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
    type ResidentialRigidTransform,
} from '../src/workflows/residentialBuilding/residentialBuildingOrchestrator';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition';

/** Rotate a point about a pivot (CCW, plan {x,z}) — the SAME map the executor applies. */
function rot(p: Pt, thetaRad: number, pivot: { x: number; z: number }): Pt {
    if (!thetaRad) return { x: p.x, z: p.z };
    const c = Math.cos(thetaRad), s = Math.sin(thetaRad);
    const dx = p.x - pivot.x, dz = p.z - pivot.z;
    return { x: pivot.x + dx * c - dz * s, z: pivot.z + dx * s + dz * c };
}

/** Build an axis-aligned W×D rectangle (CCW), then rotate it by `thetaRad` about its centre
 *  and translate to `centre` — a parcel "drawn at an angle on the map". */
function rotatedRectParcel(W: number, D: number, thetaRad: number, centre: { x: number; z: number }): Pt[] {
    const local: Pt[] = [
        { x: -W / 2, z: -D / 2 },
        { x: W / 2, z: -D / 2 },
        { x: W / 2, z: D / 2 },
        { x: -W / 2, z: D / 2 },
    ];
    const c = Math.cos(thetaRad), s = Math.sin(thetaRad);
    return local.map(p => ({ x: centre.x + p.x * c - p.z * s, z: centre.z + p.x * s + p.z * c }));
}

/** Standard ray-cast point-in-polygon (inclusive within `tol` of an edge). */
function pointInPoly(pt: Pt, poly: readonly Pt[], tol = 0.05): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        // On-edge check (within tol) counts as inside.
        const dx = b.x - a.x, dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        if (len2 > 1e-12) {
            let t = ((pt.x - a.x) * dx + (pt.z - a.z) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
            const fx = a.x + t * dx, fz = a.z + t * dz;
            if (Math.hypot(pt.x - fx, pt.z - fz) <= tol) return true;
        }
        const intersect = ((a.z > pt.z) !== (b.z > pt.z)) &&
            (pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x);
        if (intersect) inside = !inside;
    }
    return inside;
}

/** The 4 LOCAL corners of an axis-aligned rect, rotated to WORLD. */
function rectCornersWorld(r: Rect, xf: ResidentialRigidTransform): Pt[] {
    return [
        rot({ x: r.x0, z: r.z0 }, xf.thetaRad, xf.pivot),
        rot({ x: r.x1, z: r.z0 }, xf.thetaRad, xf.pivot),
        rot({ x: r.x1, z: r.z1 }, xf.thetaRad, xf.pivot),
        rot({ x: r.x0, z: r.z1 }, xf.thetaRad, xf.pivot),
    ];
}

const THETA = (25 * Math.PI) / 180; // ~25° off-axis parcel.
const CENTRE = { x: 50, z: 40 };

function rotatedInput(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: rotatedRectParcel(30, 18, THETA, CENTRE),
        upperLevels: 3,
        coreWidthM: 5,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 80,
        maxApartmentAreaM2: 110,
        typologies: { T1: false, T2: true, T3: false, T4: false },
        ...over,
    };
}

describe('§RESI-RIGID-TRANSFORM — residential building accepts a ROTATED parcel', () => {
    it('(a) does NOT reject a ~25° rotated rectangular parcel', () => {
        const r = orchestrateResidentialBuilding(rotatedInput());
        expect(r.status).not.toBe('rejected');
    });

    it('(b) places apartments on every upper level + carries the rigid transform', () => {
        const r = orchestrateResidentialBuilding(rotatedInput({ upperLevels: 3 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        // The transform was derived from the rotated parcel — θ ≈ 25° (sign/quadrant
        // normalised into (−π/4, π/4], so the magnitude matches the drawn tilt).
        expect(Math.abs(r.transform.thetaRad)).toBeGreaterThan(0.05);
        const upper = r.perLevelApartments.slice(1);
        expect(upper.length).toBe(3);
        let placed = 0;
        for (const lvl of upper) {
            expect(lvl.apartments.length).toBeGreaterThanOrEqual(1);
            placed += lvl.apartments.length;
        }
        expect(placed).toBeGreaterThanOrEqual(3);
    });

    it('(c) EVERY emitted element lies within the rotated parcel (aligned, not spilling)', () => {
        const parcel = rotatedRectParcel(30, 18, THETA, CENTRE);
        const r = orchestrateResidentialBuilding(rotatedInput({ upperLevels: 2 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const xf = r.transform;

        // A generous tolerance (the partition rounds to 4 dp + the parcel edge is the cell's
        // own façade edge, so cells sit exactly on the boundary).
        const TOL = 0.10;

        // The centred core — all 4 world corners inside the parcel.
        for (const c of rectCornersWorld(r.core, xf)) {
            expect(pointInPoly(c, parcel, TOL)).toBe(true);
        }

        for (const lvl of r.perLevelApartments.slice(1)) {
            // Every public-corridor band inside the parcel.
            for (const band of lvl.publicCorridor) {
                for (const c of rectCornersWorld(band, xf)) {
                    expect(pointInPoly(c, parcel, TOL)).toBe(true);
                }
            }
            // Every apartment cell + its per-cell layout walls inside the parcel.
            for (const apt of lvl.apartments) {
                for (const c of rectCornersWorld(apt.cell.rect, xf)) {
                    expect(pointInPoly(c, parcel, TOL)).toBe(true);
                }
                if (apt.status !== 'ok' || !apt.layout) continue;
                // The layout walls are plan-mm in the LOCAL cell frame; map mm→m then rotate
                // to world (the SAME transform the executor applies via planToWorldXZ).
                for (const w of apt.layout.walls) {
                    for (const end of [w.start, w.end]) {
                        const localM = { x: end.x / 1000, z: end.y / 1000 };
                        const world = rot(localM, xf.thetaRad, xf.pivot);
                        expect(pointInPoly(world, parcel, TOL)).toBe(true);
                    }
                }
            }
        }
    });

    it('an AXIS-ALIGNED parcel keeps θ = 0 (identity — no behavioural change)', () => {
        const r = orchestrateResidentialBuilding(
            rotatedInput({ footprint: rotatedRectParcel(30, 18, 0, CENTRE) }),
        );
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.transform.thetaRad).toBe(0);
    });

    it('is deterministic on the rotated parcel — same input twice → identical output', () => {
        const a = orchestrateResidentialBuilding(rotatedInput({ upperLevels: 2 }));
        const b = orchestrateResidentialBuilding(rotatedInput({ upperLevels: 2 }));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
