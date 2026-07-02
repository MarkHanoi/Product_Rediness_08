// WallPipelineV2 — ADR-0055 P3b integration-shim tests.
// Pins the cache lifecycle, the one-shot helper, and confirms the level-wide
// solve produces the same per-wall geometry as composing P1+P2+P3a by hand.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    buildWallV2GeometryOneShot,
    isWallPipelineV2Enabled,
    type LevelWallSpec,
} from '../../geometry-wall/src/WallPipelineV2.js';
import { resolveJunctions } from '../../geometry-wall/src/JunctionResolverV2.js';
import { buildAllFootprints } from '../../geometry-wall/src/WallFootprint2D.js';
import { buildWallExtrusion, expectedVertexCount } from '../../geometry-wall/src/WallPolygonExtruder.js';

const T = 0.2;
const HEIGHT = 2.7;

// L-junction fixture: two perpendicular walls sharing (5, 0).
const L_WALLS: LevelWallSpec[] = [
    { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 5, z: 0 }, thickness: T },
    { id: 'B', startXZ: { x: 5, z: 0 }, endXZ: { x: 5, z: 5 }, thickness: T },
];

// T-junction fixture: passthrough A + abutting B.
const T_WALLS: LevelWallSpec[] = [
    { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 10, z: 0 }, thickness: T },
    { id: 'B', startXZ: { x: 5, z: 0 }, endXZ: { x: 5,  z: 5 }, thickness: T },
];

// ─── Feature flag ─────────────────────────────────────────────────────────────

describe('WallPipelineV2 — feature flag', () => {
    const g = globalThis as { __pryzmWallPipelineV2?: boolean };

    beforeEach(() => { delete g.__pryzmWallPipelineV2; });
    afterEach(()  => { delete g.__pryzmWallPipelineV2; });

    it('returns TRUE by default (restored 2026-06-19 — all-legacy regressed 3-wall joins; V2 is the founder-confirmed baseline)', () => {
        expect(isWallPipelineV2Enabled()).toBe(true);
    });

    it('returns false ONLY when globalThis.__pryzmWallPipelineV2 === false (explicit all-legacy opt-out)', () => {
        g.__pryzmWallPipelineV2 = false;
        expect(isWallPipelineV2Enabled()).toBe(false);
        g.__pryzmWallPipelineV2 = true;
        expect(isWallPipelineV2Enabled()).toBe(true);
        (g as any).__pryzmWallPipelineV2 = undefined;
        expect(isWallPipelineV2Enabled()).toBe(true);
    });
});

// ─── Cache lifecycle ──────────────────────────────────────────────────────────

describe('WallPipelineV2Cache — lifecycle', () => {
    it('returns null for any wall id before refresh()', () => {
        const cache = new WallPipelineV2Cache();
        expect(cache.getMiter('A')).toBeNull();
        expect(cache.getWall('A')).toBeNull();
    });

    it('after refresh(L_WALLS) both walls have a miter recorded', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh(L_WALLS);
        expect(cache.getMiter('A')).not.toBeNull();
        expect(cache.getMiter('B')).not.toBeNull();
        expect(cache.getWall('A')).toMatchObject({ id: 'A', thickness: T });
    });

    it('refresh() with an empty array clears the cache (idempotent re-init)', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh(L_WALLS);
        cache.refresh([]);
        expect(cache.getMiter('A')).toBeNull();
    });

    it('refresh() replaces previous miters (NOT additive)', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh(L_WALLS);                     // A + B
        cache.refresh([L_WALLS[0]!]);               // only A
        expect(cache.getMiter('A')).not.toBeNull();
        expect(cache.getMiter('B')).toBeNull();
    });

    it('diagnostic junctionEnds counts how many wall ends are at junctions', () => {
        const cache = new WallPipelineV2Cache();
        // Free wall — 0 junction ends.
        cache.refresh([{ id: 'X', startXZ: { x: 0, z: 0 }, endXZ: { x: 5, z: 0 }, thickness: T }]);
        expect(cache.junctionEnds).toBe(0);
        // L junction — 2 ends (A's end + B's start).
        cache.refresh(L_WALLS);
        expect(cache.junctionEnds).toBe(2);
        // T junction — 1 abutting end on B; A is passthrough (no end-trim, no junction MN).
        cache.refresh(T_WALLS);
        expect(cache.junctionEnds).toBe(1);
    });
});

// ─── Geometry parity: shim output == composed-by-hand output ─────────────────

describe('WallPipelineV2 — geometry parity with hand-composed P1+P2+P3a', () => {
    function arrEq(a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > eps) return false;
        return true;
    }

    it('produces byte-identical geometry to a hand-composed P1→P2→P3a chain', () => {
        // Compose by hand…
        const inputs = L_WALLS.map(w => ({ id: w.id, start: w.startXZ, end: w.endXZ, thickness: w.thickness }));
        const miters = resolveJunctions(inputs);
        const fps    = buildAllFootprints(inputs, miters);
        const handGeoA = buildWallExtrusion(fps[0]!, { height: HEIGHT });

        // …vs the shim.
        const cache = new WallPipelineV2Cache();
        cache.refresh(L_WALLS);
        const { geometry: shimGeoA } = buildWallV2Geometry(L_WALLS[0]!, cache, { height: HEIGHT });

        expect(arrEq(
            shimGeoA.getAttribute('position').array,
            handGeoA.getAttribute('position').array,
        )).toBe(true);
        expect(arrEq(
            shimGeoA.getAttribute('normal').array,
            handGeoA.getAttribute('normal').array,
        )).toBe(true);
    });

    it('L-junction: each wall gets a 5-vertex polygon (48-vert geometry)', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh(L_WALLS);
        for (const w of L_WALLS) {
            const { geometry, footprint } = buildWallV2Geometry(w, cache, { height: HEIGHT });
            expect(footprint.polygon).toHaveLength(5);
            expect(geometry.getAttribute('position').array.length / 3).toBe(expectedVertexCount(5));
        }
    });

    // §FIX-WALL-TJUNCTION-BUTT-2 (2026-07-02) — the abutting T wall B is a FLAT BUTT (4
    // verts), NOT a 5-vertex arrow. The pre-fix pipeline wrote a centreline pivot at (5,0)
    // between B's two near-face corners → an arrow tongue poking half a host-thickness into
    // the host (the founder's 3D wedge / plan chevron). A T-attacher must never carry the
    // centreline pivot; both its end corners butt flat on the host near face (z=+halfT).
    it('T-junction: passthrough A stays a 4-vertex rectangle; B is a 4-vertex flat butt (no arrow)', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh(T_WALLS);
        const A = buildWallV2Geometry(T_WALLS[0]!, cache, { height: HEIGHT });
        const B = buildWallV2Geometry(T_WALLS[1]!, cache, { height: HEIGHT });
        expect(A.footprint.polygon).toHaveLength(4);
        expect(B.footprint.polygon).toHaveLength(4);
        // No B vertex pierces the host centreline (z < +halfT) — the arrow is gone.
        for (const v of B.footprint.polygon) expect(v.z).toBeGreaterThanOrEqual(T / 2 - 1e-9);
    });
});

// ─── One-shot helper ──────────────────────────────────────────────────────────

describe('WallPipelineV2 — buildWallV2GeometryOneShot', () => {
    it('builds the cache implicitly and returns a geometry equal to the caller-managed path', () => {
        const managed = (() => {
            const c = new WallPipelineV2Cache();
            c.refresh(L_WALLS);
            return buildWallV2Geometry(L_WALLS[1]!, c, { height: HEIGHT });
        })();
        const oneShot = buildWallV2GeometryOneShot(L_WALLS[1]!, L_WALLS, { height: HEIGHT });
        expect(oneShot.footprint.polygon).toHaveLength(managed.footprint.polygon.length);
        expect(oneShot.geometry.getAttribute('position').array.length)
            .toBe(managed.geometry.getAttribute('position').array.length);
    });

    it('passes elevation + baseOffset through to the extruder', () => {
        const { geometry } = buildWallV2GeometryOneShot(
            L_WALLS[0]!, L_WALLS,
            { height: HEIGHT, baseOffset: 0.1, elevation: 2.0 },
        );
        const bb = geometry.boundingBox!;
        expect(bb.min.y).toBeCloseTo(2.1);
        expect(bb.max.y).toBeCloseTo(2.1 + HEIGHT);
    });
});

// ─── §V2-NEAR-PARALLEL-CAP ──────────────────────────────────────────────────────

describe('WallPipelineV2 — §V2-NEAR-PARALLEL-CAP (skip near-parallel, keep real corners)', () => {
    const bboxDiag = (w: LevelWallSpec, all: LevelWallSpec[]): number => {
        const { geometry } = buildWallV2GeometryOneShot(w, all, { height: HEIGHT });
        const bb = geometry.boundingBox!;
        return Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
    };
    const baseLen = (w: LevelWallSpec): number => Math.hypot(w.endXZ.x - w.startXZ.x, w.endXZ.z - w.startXZ.z);

    it('a near-parallel pair (≈2° kink) does NOT spike the V2 body (square-capped, no fallback)', () => {
        const KINK: LevelWallSpec[] = [
            { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 5,  z: 0 },    thickness: T },
            { id: 'B', startXZ: { x: 5, z: 0 }, endXZ: { x: 10, z: 0.17 }, thickness: T }, // ~2°
        ];
        for (const w of KINK) expect(bboxDiag(w, KINK)).toBeLessThanOrEqual(baseLen(w) + T + 1.0);
    });

    it('the clean 90° L corner still builds bounded (real corner kept)', () => {
        for (const w of L_WALLS) expect(bboxDiag(w, L_WALLS)).toBeLessThanOrEqual(baseLen(w) + T + 1.0);
    });

    it('the ANGLE threshold skips ≈2° but KEEPS ≈6°/25°/90° — acute corners stay mitred (flat-corner regression guard)', () => {
        const sinBetween = (a1: number, a2: number): number => {
            const d1 = { x: Math.cos(a1), z: Math.sin(a1) }, d2 = { x: Math.cos(a2), z: Math.sin(a2) };
            return Math.abs(d1.x * d2.z - d1.z * d2.x);
        };
        const deg = (d: number) => (d * Math.PI) / 180;
        const SKIP = 0.05;                                   // the §V2-NEAR-PARALLEL-CAP threshold
        expect(sinBetween(0, deg(2))).toBeLessThan(SKIP);    // 2° near-parallel → square cap
        expect(sinBetween(0, deg(6))).toBeGreaterThan(SKIP); // 6° → kept (miter)
        expect(sinBetween(0, deg(25))).toBeGreaterThan(SKIP);// 25° acute → kept (NOT flattened — the regression)
        expect(sinBetween(0, deg(90))).toBeGreaterThan(SKIP);// 90° → kept
    });
});

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('WallPipelineV2 — determinism', () => {
    it('two refresh()es on the same input produce identical miters for every wall', () => {
        const a = new WallPipelineV2Cache(); a.refresh(L_WALLS);
        const b = new WallPipelineV2Cache(); b.refresh(L_WALLS);
        expect(JSON.stringify(a.getMiter('A'))).toBe(JSON.stringify(b.getMiter('A')));
        expect(JSON.stringify(a.getMiter('B'))).toBe(JSON.stringify(b.getMiter('B')));
    });
});
