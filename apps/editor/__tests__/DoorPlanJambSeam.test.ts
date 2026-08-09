// @vitest-environment happy-dom
//
// §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02) — plan-view door-in-wall symbol must be
// watertight: the door FRAME-CUT jamb ticks must land on the opening VOID EDGES
// (offset and offset+width along the wall) — exactly where the host wall's
// plan-projected face lines terminate (C15 §2: voidStart = baseLine[0] +
// offset·wallDir, voidEnd = baseLine[0] + (offset+width)·wallDir). Previously the
// ticks were inset by frameThick, leaving a ~50 mm gap between the wall-line
// terminus and the frame on both jambs — the reported plan defect.
//
// happy-dom env: the @pryzm/geometry-door barrel transitively loads modules that
// touch the DOM at module-eval time, so a `window` must exist (mirrors the
// MoveStairCommand test rationale).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeDoorFrameJambTicks } from '@pryzm/geometry-door';
// §FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST (2026-08-09) — the ticks are placed by the
// HOST's station mapper now, not by a chord `centre`/`dir`/`leftNormal` triple, so
// this test builds the mapper the same way the builder does: from the one resolver
// that also positions the 3-D door.
import { hostedElementFrame, arcFrameAt, type ArcHostWall } from '@pryzm/geometry-wall';

/** Signed distance of a world-XZ point from `start` along the unit `dir`. */
function alongWall(px: number, pz: number, start: THREE.Vector3, dir: THREE.Vector3): number {
    return (px - start.x) * dir.x + (pz - start.z) * dir.z;
}

describe('§FIX-PLAN-DOOR-JAMB-SEAM — door frame ticks close onto the wall opening edges', () => {
    // Axis-aligned wall along +X from (0,0) to (5,0). Opening: offset 2.0, width 0.9.
    // Per C15 §2 the void edges (= wall-line terminations) are at along = 2.0 and 2.9.
    const start = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3(1, 0, 0);
    const offset = 2.0;
    const width = 0.9;
    const halfWidth = width / 2;
    const wallThickness = 0.2;
    const halfThickness = wallThickness / 2;

    const WALL = { baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }], thickness: wallThickness };
    const host = hostedElementFrame(WALL, offset, width);

    const ticks = computeDoorFrameJambTicks({ at: host.at, halfWidth, halfThickness });

    it('returns exactly two jamb tick segments (4 vertices → 12 floats)', () => {
        expect(ticks).toHaveLength(12);
    });

    it('places both jamb ticks on the opening VOID EDGES (offset and offset+width)', () => {
        // Segment 1 = left jamb tick (verts 0,1); segment 2 = right jamb tick (verts 2,3).
        const leftAlong0 = alongWall(ticks[0], ticks[2], start, dir);
        const leftAlong1 = alongWall(ticks[3], ticks[5], start, dir);
        const rightAlong0 = alongWall(ticks[6], ticks[8], start, dir);
        const rightAlong1 = alongWall(ticks[9], ticks[11], start, dir);

        const TOL = 1e-6;
        // Left jamb tick sits at the void START edge = offset.
        expect(leftAlong0).toBeCloseTo(offset, 6);
        expect(leftAlong1).toBeCloseTo(offset, 6);
        // Right jamb tick sits at the void END edge = offset + width.
        expect(rightAlong0).toBeCloseTo(offset + width, 6);
        expect(rightAlong1).toBeCloseTo(offset + width, 6);
        expect(Math.abs(leftAlong0 - leftAlong1)).toBeLessThan(TOL);
        expect(Math.abs(rightAlong0 - rightAlong1)).toBeLessThan(TOL);
    });

    it('jamb tick coincides with the wall-line terminus (zero seam gap on both jambs)', () => {
        // The wall plan-line clip (_suppressPlanViewOpeningLines) terminates the
        // along-wall face lines at the void edges [offset, offset+width]. The frame
        // ticks must coincide with those termini so the symbol is watertight.
        const wallLineLeftTerminus = offset;            // left face line stops here
        const wallLineRightTerminus = offset + width;   // right face line stops here

        const leftTickAlong = alongWall(ticks[0], ticks[2], start, dir);
        const rightTickAlong = alongWall(ticks[6], ticks[8], start, dir);

        // Zero gap: |tick − wallTerminus| < 1 mm on both jambs.
        expect(Math.abs(leftTickAlong - wallLineLeftTerminus)).toBeLessThan(0.001);
        expect(Math.abs(rightTickAlong - wallLineRightTerminus)).toBeLessThan(0.001);
    });

    it('each tick spans the full wall thickness across the wall centreline', () => {
        // Perpendicular (leftNormal = +Z) extent of the left tick = wallThickness.
        const perp0 = ticks[2]; // z of left tick vertex A
        const perp1 = ticks[5]; // z of left tick vertex B
        expect(Math.abs(perp1 - perp0)).toBeCloseTo(wallThickness, 6);
        // Centred on the wall centreline (z = 0): the two ends are symmetric.
        expect(perp0 + perp1).toBeCloseTo(0, 6);
    });
});

describe('§FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST — the seam invariant survives a curved host', () => {
    // Same opening, same thickness, but the host is bowed. The void edges are now
    // ARC lengths 2.0 and 2.9 (C15 §2 generalised to the centreline), and the wall's
    // own face lines terminate there — so the ticks must too, and RADIALLY.
    const CURVED: ArcHostWall = {
        baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
        curve: { control: { x: 2.5, z: -3 }, segments: 24 },
    };
    const offset = 2.0;
    const width = 0.9;
    const halfThickness = 0.1;

    const host = hostedElementFrame(CURVED, offset, width);
    const ticks = computeDoorFrameJambTicks({ at: host.at, halfWidth: width / 2, halfThickness });

    it('each tick straddles the centreline point at its own ARC station', () => {
        for (const [i, s] of [offset, offset + width].entries()) {
            const f = arcFrameAt(CURVED, s);
            const a = { x: ticks[i * 6]!, z: ticks[i * 6 + 2]! };
            const b = { x: ticks[i * 6 + 3]!, z: ticks[i * 6 + 5]! };
            const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
            expect(Math.hypot(m.x - f.x, m.z - f.z)).toBeLessThan(1e-9);
            // …and is perpendicular to the LOCAL tangent (radial), not to the chord.
            const dx = b.x - a.x, dz = b.z - a.z;
            const len = Math.hypot(dx, dz);
            expect(len).toBeCloseTo(2 * halfThickness, 9);
            expect((dx / len) * f.tx + (dz / len) * f.tz).toBeCloseTo(0, 9);
        }
    });

    it('the tangent at the two jambs genuinely differs — the chord would be wrong', () => {
        const a = arcFrameAt(CURVED, offset);
        const b = arcFrameAt(CURVED, offset + width);
        expect(Math.abs(a.angleY - b.angleY)).toBeGreaterThan(0.05);
    });
});
