// ─── computeStairFootprintRect — landing-extent regression tests ─────────────
// Locks the invariant that the stair footprint rectangle is a TRUE BOUND of the
// mesh built by StairMeshBuilder — i.e. it must NEVER be smaller than the extent
// implied by (flight run + landing depth). The founder reported a U-stair whose
// long section "goes beyond" the shell, hypothesising the calculator omitted the
// half-landing depth. These tests pin down exactly what the footprint covers:
//   - I-stair (no landing): rect length == flight run, width == stair width.
//   - L-stair (corner landing): rect grows to include the landing along dir1.
//   - U-stair (180° switchback, parallel return + half-landing): rect length
//     covers flight-1 run + the landing, and the across-width covers BOTH runs.
//
// All math is in the stair-local (u = first-flight forward, v = perpendicular)
// frame, so the assertions are rotation-invariant; we use an axis-aligned +X
// first flight for clarity.

import { describe, it, expect } from 'vitest';
import { computeStairFootprintRect, type StairFootprintInput } from '../StairFootprintUtils';

/** Oriented-rect length/width in the first-flight's local frame. */
function localExtents(rect: { x: number; z: number }[]) {
    const o = rect[0];
    // edge0 = rect[0]→rect[1] is the "length" axis (along first-flight dir),
    // edge1 = rect[1]→rect[2] is the "width" axis (perpendicular). The rect is
    // returned CCW so opposite edges are equal; measure the two edge lengths.
    const len = Math.hypot(rect[1].x - rect[0].x, rect[1].z - rect[0].z);
    const wid = Math.hypot(rect[2].x - rect[1].x, rect[2].z - rect[1].z);
    return { len, wid, o };
}

describe('computeStairFootprintRect', () => {
    const width = 1.0;
    const tread = 0.25;

    it('I-stair: footprint length == flight run, width == stair width (no landing)', () => {
        const riserCount = 12;
        const input: StairFootprintInput = {
            shape: 'I',
            width,
            treadDepth: tread,
            startPosition: { x: 0, y: 0, z: 0 },
            flights: [{ direction: { x: 1, y: 0, z: 0 }, riserCount }],
        };
        const rect = computeStairFootprintRect(input);
        expect(rect).not.toBeNull();
        const { len, wid } = localExtents(rect!);
        expect(len).toBeCloseTo(riserCount * tread, 6); // 3.0
        expect(wid).toBeCloseTo(width, 6);
    });

    it('U-stair: footprint COVERS the half-landing (length >= flight run + landing reach)', () => {
        // Mirror HouseLayoutExecutor._buildFlights for shape 'U':
        //   flight 1: dir +X, run = before*tread
        //   flight 2: dir -X, startOverride pinned at (firstLen+tread) along +X,
        //             offset by +width perpendicular (parallel return run)
        //   landing : depth = 2*width (spans both runs)
        const before = 8;
        const after = 8;
        const firstLen = before * tread; // 2.0
        const perp = { x: 0, z: 1 };       // left of flight 1 = (-d1.z, d1.x)
        const secondStart = {
            x: 0 + 1 * (firstLen + tread) + perp.x * width,
            y: 0,
            z: 0 + 0 * (firstLen + tread) + perp.z * width,
        };
        const input: StairFootprintInput = {
            shape: 'U',
            width,
            treadDepth: tread,
            startPosition: { x: 0, y: 0, z: 0 },
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: before },
                { direction: { x: -1, y: 0, z: 0 }, riserCount: after, startOverride: secondStart },
            ],
            landings: [{ depth: 2 * width }],
        };
        const rect = computeStairFootprintRect(input);
        expect(rect).not.toBeNull();
        const { len, wid } = localExtents(rect!);

        // The mesh's U half-landing extends past the last tread of flight 1 along
        // the flight direction by (tread/2 + width). The footprint MUST cover at
        // least flightRun + landing reach — it must NOT stop at the bare riser run.
        const flightRun = firstLen;            // 2.0  (bare risers/steps only)
        const meshLandingReach = tread / 2 + width; // 1.125 past the last tread
        expect(len).toBeGreaterThanOrEqual(flightRun + meshLandingReach - 1e-6); // >= 3.125

        // Sanity: it is NOT the bare flight run (the bug the founder feared).
        expect(len).toBeGreaterThan(flightRun + 1e-3);

        // Across-width must cover BOTH parallel runs (>= 2*width).
        expect(wid).toBeGreaterThanOrEqual(2 * width - 1e-6);
    });

    it('L-stair: footprint length includes the corner landing along dir1', () => {
        // L: flight 1 +X (run), corner landing depth = width, flight 2 +Z.
        // The footprint must extend past flight-1's run by the landing depth.
        const before = 8;
        const after = 6;
        const input: StairFootprintInput = {
            shape: 'L',
            width,
            treadDepth: tread,
            startPosition: { x: 0, y: 0, z: 0 },
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: before },
                { direction: { x: 0, y: 0, z: 1 }, riserCount: after },
            ],
            landings: [{ depth: width }],
        };
        const rect = computeStairFootprintRect(input);
        expect(rect).not.toBeNull();
        const { len } = localExtents(rect!);
        // Along dir1 (+X) the rect must reach flight-1 run + landing depth.
        expect(len).toBeGreaterThanOrEqual(before * tread + width - 1e-6); // >= 3.0
    });
});
