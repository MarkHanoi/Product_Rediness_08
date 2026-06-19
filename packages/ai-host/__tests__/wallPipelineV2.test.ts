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

    it('returns true by default (Pascal pipeline is now the standard path)', () => {
        expect(isWallPipelineV2Enabled()).toBe(true);
    });

    it('returns false ONLY when globalThis.__pryzmWallPipelineV2 === false (literal-false escape hatch)', () => {
        g.__pryzmWallPipelineV2 = false;
        expect(isWallPipelineV2Enabled()).toBe(false);
        (g as any).__pryzmWallPipelineV2 = 0;       // falsy but not strictly `false`
        expect(isWallPipelineV2Enabled()).toBe(true);
        (g as any).__pryzmWallPipelineV2 = null;
        expect(isWallPipelineV2Enabled()).toBe(true);
        g.__pryzmWallPipelineV2 = true;
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

    it('T-junction: passthrough A stays a 4-vertex rectangle; B gets 5 verts', () => {
        const cache = new WallPipelineV2Cache();
        cache.refresh(T_WALLS);
        const A = buildWallV2Geometry(T_WALLS[0]!, cache, { height: HEIGHT });
        const B = buildWallV2Geometry(T_WALLS[1]!, cache, { height: HEIGHT });
        expect(A.footprint.polygon).toHaveLength(4);
        expect(B.footprint.polygon).toHaveLength(5);
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

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('WallPipelineV2 — determinism', () => {
    it('two refresh()es on the same input produce identical miters for every wall', () => {
        const a = new WallPipelineV2Cache(); a.refresh(L_WALLS);
        const b = new WallPipelineV2Cache(); b.refresh(L_WALLS);
        expect(JSON.stringify(a.getMiter('A'))).toBe(JSON.stringify(b.getMiter('A')));
        expect(JSON.stringify(a.getMiter('B'))).toBe(JSON.stringify(b.getMiter('B')));
    });
});
