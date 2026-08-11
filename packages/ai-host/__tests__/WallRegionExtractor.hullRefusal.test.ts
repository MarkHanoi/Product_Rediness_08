/**
 * §W2A-HULL-IS-NOT-A-PERIMETER (W2-A defect 5) — the probe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `WallRegionExtractor`'s own header has always said "a convex hull cannot
 * represent L-shaped, U-shaped, or courtyard buildings". It said so and returned
 * the hull anyway, and `AIService.CREATE_ROOF_BY_REGION` committed it as the
 * building perimeter via `CreateRoofCommand`. On a non-convex building the hull
 * BRIDGES THE NOTCH — roof over open air — and that wrong ring then becomes the
 * input to the eave offset and the hip/mansard inward offsets (defects 1 and 2),
 * so a wrong perimeter is elaborated into a confidently wrong roof.
 *
 * At the time this stream ran, NOTHING in `packages/ai-host` exercised this file
 * at all: `grep -rl "WallRegionExtractor\|extractOutermostRegion" __tests__ src`
 * matched no test. The refusal was written but unproven. This is the proof.
 *
 * THE ASSERTION IS THE DISCRIMINATOR, NOT THE OUTCOME. The honest test is not
 * "is anything inside the hull" — interior partition walls legitimately sit
 * inside a perimeter, so that would refuse on every real building. It is the
 * claim the geometry actually makes: IF the hull is the perimeter, every hull
 * EDGE runs along a WALL. So this file pins BOTH directions:
 *   • a convex building must still PASS (no false refusal), and
 *   • an L-shaped building must REFUSE, naming the bridging edge.
 * A test that only pinned the refusal would be satisfied by a function that
 * refuses everything.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallRegionExtractor } from '../src/WallRegionExtractor.js';
import type { AIWall } from '../src/AITypes.js';

type Seg = [number, number, number, number]; // x1,z1,x2,z2

/** Minimal stand-in for the `window.wallStore` the extractor reads directly
 *  (its documented TODO(TASK-08) contract violation — not this stream's to fix). */
function installWallStore(segs: Seg[]): void {
    (globalThis as unknown as { window: unknown }).window = {
        wallStore: {
            getByLevel: () => segs.map(([x1, z1, x2, z2], i) => ({
                id: `w${i}`,
                baseLine: [{ x: x1, y: 0, z: z1 }, { x: x2, y: 0, z: z2 }],
            })),
        },
    };
}

/** The extractor only reads `levelId` off these. */
function wallsStub(n: number): AIWall[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `w${i}`, type: 'wall', levelId: 'L0',
        length: 1, height: 3, thickness: 0.2, baseOffset: 0, openingCount: 0,
    })) as unknown as AIWall[];
}

/** Ring → closed list of wall segments. */
function ringToSegs(ring: Array<[number, number]>): Seg[] {
    return ring.map((a, i) => {
        const b = ring[(i + 1) % ring.length]!;
        return [a[0], a[1], b[0], b[1]] as Seg;
    });
}

const RECT: Array<[number, number]> = [[0, 0], [10, 0], [10, 6], [0, 6]];
/** The notch corner is (5,3): the hull will bridge (10,6)→(0,6) style diagonals. */
const L_SHAPE: Array<[number, number]> = [
    [0, 0], [10, 0], [10, 3], [5, 3], [5, 8], [0, 8],
];

afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe('§W2A-HULL-IS-NOT-A-PERIMETER — the hull is refused when it bridges open air', () => {
    it('CONVEX building: the hull IS the perimeter, so it is ACCEPTED (no false refusal)', () => {
        installWallStore(ringToSegs(RECT));
        const r = WallRegionExtractor.extractOutermostRegionResult(wallsStub(4));
        expect(r.kind).toBe('perimeter');
        if (r.kind !== 'perimeter') throw new Error('unreachable');
        expect(r.polygon.length).toBeGreaterThanOrEqual(3);
    });

    it('THE DEFECT: an L-shaped building is REFUSED — the old path committed the hull', () => {
        installWallStore(ringToSegs(L_SHAPE));

        // 1. The underlying hull still exists and is still WRONG — it bridges the
        //    notch. That is the value the old code returned and committed.
        const hull = WallRegionExtractor.extractOutermostRegion(wallsStub(6));
        expect(hull).not.toBeNull();
        // The L's own boundary never passes through (10,8), but the hull's
        // bridging edge spans the notch: the hull encloses strictly more area.
        const hullArea = Math.abs(
            hull!.reduce((a, p, i) => {
                const q = hull![(i + 1) % hull!.length]!;
                return a + (p.x * q.y - q.x * p.y);
            }, 0) / 2,
        );
        const trueArea = Math.abs(
            L_SHAPE.reduce((a, p, i) => {
                const q = L_SHAPE[(i + 1) % L_SHAPE.length]!;
                return a + (p[0] * q[1] - q[0] * p[1]);
            }, 0) / 2,
        );
        expect(hullArea).toBeGreaterThan(trueArea); // roof over open air

        // 2. The discriminated form REFUSES rather than returning it.
        const r = WallRegionExtractor.extractOutermostRegionResult(wallsStub(6));
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') throw new Error('unreachable');

        // 3. The refusal NAMES THE OFFENDING EDGE — failure and emptiness are not
        //    the same value, and a reason the user cannot act on is not a reason.
        expect(r.reason).toContain('bridges open air');
        expect(r.reason).toMatch(/\(-?\d+\.\d{2}, -?\d+\.\d{2}\)/);
    });

    it('refuses with a DISTINCT reason when no wall centrelines are readable', () => {
        // Emptiness (no readable geometry) must not be reported as the same thing
        // as a measured bridge across open air.
        installWallStore(ringToSegs(RECT));
        const bridged = WallRegionExtractor.extractOutermostRegionResult(wallsStub(4));
        expect(bridged.kind).toBe('perimeter');

        (globalThis as unknown as { window: unknown }).window = { wallStore: { getByLevel: () => [] } };
        const r = WallRegionExtractor.extractOutermostRegionResult(wallsStub(4));
        expect(r.kind).toBe('refused');
        if (r.kind !== 'refused') throw new Error('unreachable');
        expect(r.reason).not.toContain('bridges open air');
    });

    it('refuses when the walls do not form a region at all', () => {
        installWallStore([[0, 0, 1, 0]]);
        const r = WallRegionExtractor.extractOutermostRegionResult(wallsStub(2));
        expect(r.kind).toBe('refused');
    });
});
