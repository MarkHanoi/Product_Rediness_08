/**
 * §ARC-DENSITY — the slab "By Region" tracer at adaptive chord density.
 *
 * Second half of the founder's roof-by-region report (2026-08-07): after
 * §FIX-REGION-RING-PRETRIM-FRAME the ring is CORRECT but was tessellated at a
 * curvature-blind chord count (schema default 16 ⇒ ~10–15 mm mid-chord
 * departure at 10 m scale — the "not organic" facets). The tracer now resolves
 * density from THE ONE authority (`resolveArcSegmentCount`,
 * @pryzm/core-app-model §ARC-DENSITY) with the weld-survival bound as its
 * `minChordLength`.
 *
 * The load-bearing assertions:
 *   1. the founder's shape class meets the sagitta target (measured, not assumed);
 *   2. densifying does NOT re-introduce a self-intersecting ring at ANY density
 *      in the sweep (the §REFUSE-NONSIMPLE-SLAB-RING precondition);
 *   3. every chord stays longer than the weld tolerance, so the loop builder
 *      cannot dissolve the arc it was just given;
 *   4. the ceiling is LOUD when it bites (ADR-0299 — no silent truncation).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    wallPlanCenterline,
    findRegionAtPoint,
    pointInPolygon,
    REGION_WELD_TOLERANCE_M,
    type RegionWallLike,
    type RegionPoint2D,
} from '../src/SlabRegionTracer';
import {
    ARC_SAGITTA_TARGET_M,
    ARC_MAX_SEGMENTS,
} from '@pryzm/core-app-model/curved-wall-tessellation';
import { isSimpleRing } from '@pryzm/core-app-model/ring-simplicity';

// ── Founder shape class: 10 m × 8 m room, south side a 10 m arc, 2.5 m bulge ──
const ARC_A = { x: 0, z: 0 };
const ARC_B = { x: 10, z: 0 };
const ARC_CTRL = { x: 5, z: -5 }; // quadratic apex at (5, −2.5); |P0−2C+P1| = 10 m

function founderWalls(segments?: number): RegionWallLike[] {
    return [
        { baseLine: [ARC_A, ARC_B], curve: { control: ARC_CTRL, ...(segments !== undefined ? { segments } : {}) } },
        { baseLine: [{ x: 10, z: 0 }, { x: 10, z: 8 }] },
        { baseLine: [{ x: 10, z: 8 }, { x: 0, z: 8 }] },
        { baseLine: [{ x: 0, z: 8 }, { x: 0, z: 0 }] },
    ];
}

// Dense-reference sagitta measurement of a traced polyline against the true arc.
function bez(t: number): RegionPoint2D {
    const mt = 1 - t;
    return {
        x: mt * mt * ARC_A.x + 2 * mt * t * ARC_CTRL.x + t * t * ARC_B.x,
        y: mt * mt * ARC_A.z + 2 * mt * t * ARC_CTRL.z + t * t * ARC_B.z,
    };
}
function distToSeg(p: RegionPoint2D, a: RegionPoint2D, b: RegionPoint2D): number {
    const abx = b.x - a.x, aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}
function maxDepartureFromArc(poly: RegionPoint2D[]): number {
    let worst = 0;
    for (let i = 0; i <= 2048; i++) {
        const p = bez(i / 2048);
        let best = Infinity;
        for (let s = 0; s + 1 < poly.length; s++) best = Math.min(best, distToSeg(p, poly[s]!, poly[s + 1]!));
        worst = Math.max(worst, best);
    }
    return worst;
}

afterEach(() => vi.restoreAllMocks());

describe('§ARC-DENSITY — wallPlanCenterline adaptive density', () => {
    it('meets the sagitta target on the founder shape even with the coarse schema-default segments:16', () => {
        const pts = wallPlanCenterline([ARC_A, ARC_B], { control: ARC_CTRL, segments: 16 });
        // 16 chords would depart 9.8 mm; the target requires 23.
        expect(pts.length - 1).toBeGreaterThanOrEqual(23);
        expect(maxDepartureFromArc(pts)).toBeLessThanOrEqual(ARC_SAGITTA_TARGET_M * 1.01);
    });

    it('honours a user-authored higher density as a floor', () => {
        const pts = wallPlanCenterline([ARC_A, ARC_B], { control: ARC_CTRL, segments: 40 });
        expect(pts.length - 1).toBe(40);
    });

    it('keeps every chord longer than the weld tolerance at the new density', () => {
        const pts = wallPlanCenterline([ARC_A, ARC_B], { control: ARC_CTRL, segments: 16 });
        for (let i = 0; i + 1 < pts.length; i++) {
            const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
            expect(d).toBeGreaterThan(REGION_WELD_TOLERANCE_M);
        }
    });

    it('a pathological arc is capped at ARC_MAX_SEGMENTS and the cap is LOUD', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const pts = wallPlanCenterline(
            [ARC_A, ARC_B],
            { control: { x: 5, z: -200 } }, // |P0−2C+P1| ≈ 400 m ⇒ needs 142 chords
        );
        expect(pts.length - 1).toBeLessThanOrEqual(ARC_MAX_SEGMENTS);
        expect(warn).toHaveBeenCalled();
        expect(String(warn.mock.calls[0]![0])).toContain('§ARC-DENSITY');
    });
});

describe('§ARC-DENSITY — the founder region stays SIMPLE across the density range', () => {
    it('traces a closed, simple, curve-following ring at the adaptive default', () => {
        const ring = findRegionAtPoint(founderWalls(16), 5, 4);
        expect(ring).not.toBeNull();
        expect(pointInPolygon({ x: 5, y: 4 }, ring!)).toBe(true);
        expect(isSimpleRing(ring!)).toBe(true);
        // The ring follows the bulge: samples exist beyond the straight chord z=0.
        expect(ring!.filter((p) => p.y < -0.5).length).toBeGreaterThan(3);
    });

    it('ring remains simple for every authored density 4..64 (§REFUSE-NONSIMPLE-SLAB-RING precondition)', () => {
        for (let segments = 4; segments <= 64; segments += 4) {
            const ring = findRegionAtPoint(founderWalls(segments), 5, 4);
            expect(ring, `segments=${segments}`).not.toBeNull();
            expect(isSimpleRing(ring!), `segments=${segments}`).toBe(true);
        }
    });

    it('trimmed arc (pre-trim frame + clip) also yields a simple ring at adaptive density', () => {
        // The b431a17b defect class: post-trim endpoints + pre-trim control.
        const walls = founderWalls(16);
        // Trim must stay within REGION_WELD_TOLERANCE_M of the junction corners so
        // the loop still closes (a real resolver trim lands on the shared
        // junction node). Points lie ON the arc (t ≈ 0.01 / 0.99).
        walls[0] = {
            ...walls[0],
            baseLine: [{ x: 0.1, z: -0.099 }, { x: 9.9, z: -0.099 }],
            _sourceBaseLine: [ARC_A, ARC_B],
        };
        const ring = findRegionAtPoint(walls, 5, 4);
        expect(ring).not.toBeNull();
        expect(isSimpleRing(ring!)).toBe(true);
    });
});
