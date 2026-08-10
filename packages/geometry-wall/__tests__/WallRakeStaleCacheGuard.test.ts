// §WALL-RAKE-JOINT-STALE-CACHE (founder 2026-08-09, ADR-0312 follow-up) —
// a stale twin-solve cache must never override the wall's CURRENT angle.
//
// THE DEFECT: the founder set a joined wall's Vertical Angle 70 → 80 and saw
// "instead of changing it, it creates the join properly [from the PREVIOUS
// angles]" — the 80° itself did not apply. Mechanism: `buildWallV2Geometry`
// prefers `cache.rakedTopOffsets()` (the per-vertex loft) over the uniform
// ADR-0310 shear whenever the cache carries a probe solve. Those offsets are a
// function of the rakes the cache was REFRESHED with — so when the store's rake
// has moved but the cache has not been re-refreshed (the direct per-wall rebuild
// in `UpdateElementParameterCommand`, or any fast path that skips
// `refreshV2Cache`), the build renders the PREVIOUS angle's loft and silently
// discards the new angle. A success and a stale render looked identical
// (§CONTEXT-DATA-HONESTY, the L-813 class).
//
// THE CONTRACT PINNED HERE: `buildWallV2Geometry` consumes the cached loft ONLY
// when the cache's recorded rake for THIS wall matches the spec's rake. On a
// mismatch it degrades honestly to the uniform shear at the CURRENT angle
// (floor-exact, exactly ADR-0310) — the wall's own angle NEVER lags; only the
// joint refinement waits for the coordinator's cache-refresh-then-rebuild flush.

import { describe, it, expect } from 'vitest';
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    type LevelWallSpec,
} from '../src/WallPipelineV2';
import { rakeShearPerMetre } from '../src/WallRake';

const T = 0.2;
const H = 3;
const COT70 = rakeShearPerMetre(70);   // ≈ +0.36397
const COT80 = rakeShearPerMetre(80);   // ≈ +0.17633

/** Wall A along +X from the origin; wall B along +Z from the origin (a plain L). */
function lPair(rakeA?: number, rakeB?: number): LevelWallSpec[] {
    return [
        { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T, rakeAngleDeg: rakeA },
        { id: 'B', startXZ: { x: 0, z: 0 }, endXZ: { x: 0, z: 4 }, thickness: T, rakeAngleDeg: rakeB },
    ];
}

function cacheOf(walls: readonly LevelWallSpec[]): WallPipelineV2Cache {
    const c = new WallPipelineV2Cache();
    c.refresh(walls);
    return c;
}

/** Unique top-ring plan positions of an extruded wall (vertices at y ≈ yTop). */
function topRing(geometry: { getAttribute(n: string): { array: ArrayLike<number> } }, yTop: number): Array<{ x: number; z: number }> {
    const pos = geometry.getAttribute('position').array;
    const out: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < pos.length; i += 3) {
        if (Math.abs((pos[i + 1] as number) - yTop) > 1e-9) continue;
        const x = pos[i] as number, z = pos[i + 2] as number;
        if (!out.some(p => Math.hypot(p.x - x, p.z - z) < 1e-9)) out.push({ x, z });
    }
    return out;
}

function hasPoint(ring: ReadonlyArray<{ x: number; z: number }>, x: number, z: number, tol = 1e-6): boolean {
    return ring.some(p => Math.hypot(p.x - x, p.z - z) <= tol);
}

describe('§WALL-RAKE-JOINT-STALE-CACHE — the CURRENT angle always wins over a stale loft', () => {
    it('cache refreshed at 70°, spec now says 80°: the build renders the 80° shear, NOT the 70° loft', () => {
        // The cache was refreshed while A was at 70° (the previous edit).
        const cache = cacheOf(lPair(70, undefined));
        // The store has since moved A to 80°, but nobody re-refreshed the cache —
        // this is exactly the direct rebuild in UpdateElementParameterCommand.
        const staleSpec: LevelWallSpec = { id: 'A', startXZ: { x: 0, z: 0 }, endXZ: { x: 4, z: 0 }, thickness: T, rakeAngleDeg: 80 };
        const ring = topRing(buildWallV2Geometry(staleSpec, cache, { height: H }).geometry, H);

        // FREE end (x = 4): under the honest degrade, the top corners sit at the
        // 80° uniform shear. Under the bug they sit at the 70° loft.
        const d80 = H * COT80;   // ≈ 0.529
        const d70 = H * COT70;   // ≈ 1.092
        expect(hasPoint(ring,  4,  T / 2 + d80)).toBe(true);
        expect(hasPoint(ring,  4, -T / 2 + d80)).toBe(true);
        expect(hasPoint(ring,  4,  T / 2 + d70)).toBe(false);
        expect(hasPoint(ring,  4, -T / 2 + d70)).toBe(false);
    });

    it('a FRESH cache still lofts the joint (the guard must not disable ADR-0312)', () => {
        const walls = lPair(80, undefined);
        const cache = cacheOf(walls);
        const ringA = topRing(buildWallV2Geometry(walls[0]!, cache, { height: H }).geometry, H);
        const ringB = topRing(buildWallV2Geometry(walls[1]!, cache, { height: H }).geometry, H);
        // The ADR-0312 closed form (pinned in WallRakeJoint.test.ts): shared top
        // corners of the raked wall AND the vertical neighbour coincide.
        const d = H * COT80;
        expect(hasPoint(ringA,  T / 2,  T / 2 + d)).toBe(true);
        expect(hasPoint(ringB,  T / 2,  T / 2 + d)).toBe(true);
    });

    it('a wall UNKNOWN to the cache degrades to its own uniform shear (never throws)', () => {
        const cache = cacheOf(lPair(70, undefined));
        const stranger: LevelWallSpec = { id: 'Z', startXZ: { x: 10, z: 10 }, endXZ: { x: 14, z: 10 }, thickness: T, rakeAngleDeg: 80 };
        const ring = topRing(buildWallV2Geometry(stranger, cache, { height: H }).geometry, H);
        const d80 = H * COT80;
        expect(hasPoint(ring, 14, 10 + T / 2 + d80)).toBe(true);
    });
});
