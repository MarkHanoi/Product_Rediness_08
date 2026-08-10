// @vitest-environment happy-dom
//
// §FIX-PLAN-OPENING-CLIP-ARC (2026-08-09) — the plan-view opening-line suppressor
// must measure opening zones in ARC length on a curved host.
//
// The defect (third location of the arc-vs-chord bug, after the door and window
// plan symbols fixed in 118367e2): `_suppressPlanViewOpeningLines` measured a
// projected point's along-wall coordinate as `dot(p − start, wallDir)` — the
// CHORD — while opening `offset`s are ARC lengths (WallOccupancyStore measures
// them on the centreline). On a curved wall the two diverge progressively, so the
// wall face lines were clipped at the wrong stations: the gap in the wall line
// did not sit under the door.
//
// happy-dom env: EdgeProjectorService transitively touches DOM-adjacent modules
// at eval time (mirrors DoorPlanJambSeam.test.ts rationale).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { _suppressPlanViewOpeningLines } from '../src/engine/views/EdgeProjectorService';
import { arcFrameAt, wallCentreline, arcLengthAtPointXZ, type ArcHostWall } from '@pryzm/geometry-wall';

/** Build a LineSegments whose position attribute holds the given XZ pairs (Y=0). */
function segsOf(pairs: Array<[number, number, number, number]>): THREE.LineSegments {
    const flat: number[] = [];
    for (const [x0, z0, x1, z1] of pairs) flat.push(x0, 0, z0, x1, 0, z1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    return new THREE.LineSegments(g);
}

/** Read back the kept segments as [x0,z0,x1,z1] tuples. */
function readSegs(ls: THREE.LineSegments): Array<[number, number, number, number]> {
    const p = ls.geometry.getAttribute('position') as THREE.BufferAttribute;
    const out: Array<[number, number, number, number]> = [];
    for (let i = 0; i + 1 < p.count; i += 2) {
        out.push([p.getX(i), p.getZ(i), p.getX(i + 1), p.getZ(i + 1)]);
    }
    return out;
}

/** Group carrying the userData the suppressor reads (as WallFragmentBuilder stamps it). */
function wallGroup(userData: Record<string, unknown>): THREE.Group {
    const g = new THREE.Group();
    Object.assign(g.userData, userData);
    return g;
}

// A door tall enough that a 1.2 m cut plane is inside it, sill 0.
const OPENING = { offset: 6.0, width: 0.9, sillHeight: 0, height: 2.1 };
const CUT_Y = 1.2;

describe('§FIX-PLAN-OPENING-CLIP-ARC — opening zones are ARC stations on a curved host', () => {
    // The proven-divergence host from CurvedHostPlanSymbolParity: chord 8 m,
    // quadratic control (4,−6), arc ≈ 10.39 m. At offset 6.0 the chord and arc
    // stations disagree by metres, so clipping in the wrong space is unmissable.
    const CURVED: ArcHostWall = {
        baseLine: [{ x: 0, z: 0 }, { x: 8, z: 0 }],
        curve: { control: { x: 4, z: -6 }, segments: 24 },
    };

    it('straight wall: behaviour unchanged — clipped exactly at offset / offset+width', () => {
        // 10 m wall along +X; one face line spanning the full length at z = +0.1.
        const group = wallGroup({
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
            openings: [OPENING],
        });
        const projected = segsOf([[0, 0.1, 10, 0.1]]);
        _suppressPlanViewOpeningLines(projected, {} as never, group, CUT_Y);

        const kept = readSegs(projected).sort((a, b) => a[0] - b[0]);
        expect(kept).toHaveLength(2);
        // Left remainder ends at the void edge, right remainder starts at it.
        expect(kept[0][2]).toBeCloseTo(6.0, 3);
        expect(kept[1][0]).toBeCloseTo(6.9, 3);
    });

    it('curved wall: the gap sits at the ARC stations, not the chord stations', () => {
        // Build the projected face line the way the real projection produces it:
        // short chords of the tessellated arc, offset half a thickness along the
        // local normal. Station range [4.5, 8.5] straddles the opening
        // [6.0, 6.9] in ARC space.
        const cl = wallCentreline(CURVED);
        const halfT = 0.1;
        const pairs: Array<[number, number, number, number]> = [];
        const S0 = 4.5, S1 = 8.5, N = 24;
        for (let k = 0; k < N; k++) {
            const sa = S0 + ((S1 - S0) * k) / N;
            const sb = S0 + ((S1 - S0) * (k + 1)) / N;
            const fa = arcFrameAt(CURVED, sa, cl);
            const fb = arcFrameAt(CURVED, sb, cl);
            pairs.push([
                fa.x + fa.nx * halfT, fa.z + fa.nz * halfT,
                fb.x + fb.nx * halfT, fb.z + fb.nz * halfT,
            ]);
        }
        const projected = segsOf(pairs);
        const group = wallGroup({
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }],
            curve: CURVED.curve,
            openings: [OPENING],
        });

        _suppressPlanViewOpeningLines(projected, {} as never, group, CUT_Y);

        // Every kept point, mapped back to ARC length, must lie OUTSIDE the
        // opening span (6.0..6.9), modulo the sub-segment the clip lands in.
        const kept = readSegs(projected);
        expect(kept.length).toBeGreaterThan(0);
        const INSIDE_TOL = 0.06; // one tessellation chord of slack at the cut
        for (const [x0, z0, x1, z1] of kept) {
            for (const [px, pz] of [[x0, z0], [x1, z1]] as const) {
                const s = arcLengthAtPointXZ(CURVED, px, pz, cl).s;
                const insideBy = Math.min(s - OPENING.offset, OPENING.offset + OPENING.width - s);
                expect(insideBy).toBeLessThan(INSIDE_TOL);
            }
        }
        // And the clip genuinely removed something around the opening: no kept
        // point sits DEEP inside the zone centre.
        const zoneCentre = OPENING.offset + OPENING.width / 2; // 6.45
        for (const [x0, z0, x1, z1] of kept) {
            const s0 = arcLengthAtPointXZ(CURVED, x0, z0, cl).s;
            const s1 = arcLengthAtPointXZ(CURVED, x1, z1, cl).s;
            const spanMin = Math.min(s0, s1), spanMax = Math.max(s0, s1);
            expect(spanMin > zoneCentre - 0.2 && spanMax < zoneCentre + 0.2).toBe(false);
        }
    });

    it('curved wall under the OLD chord measure would have mis-clipped (sanity of the fixture)', () => {
        // Documents WHY the fix matters: at arc station 6.45 (zone centre) the
        // CHORD coordinate of that world point is far from 6.45 — the old code
        // was clipping somewhere else entirely.
        const cl = wallCentreline(CURVED);
        const f = arcFrameAt(CURVED, 6.45, cl);
        const chordAlong = f.x; // wall runs (0,0)→(8,0): chord along = world X
        expect(Math.abs(chordAlong - 6.45)).toBeGreaterThan(0.5);
    });
});
