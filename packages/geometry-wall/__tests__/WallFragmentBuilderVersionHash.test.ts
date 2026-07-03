// §FIX-WALL-VERSION-CONTENT-HASH (L-52) — the wall geometry generation token
// (`wallGroup.userData.version`, the EdgeProjector / NativeElementMeshExporter
// plan-projection cache key) must only change when a wall's PROJECTED geometry
// inputs actually change.
//
// Before this fix, `buildWall()` bumped a monotonic `_geometrySeq` on EVERY call
// unconditionally. A whole-level rebuild (fired by a single-wall edit or a join
// re-resolve) then re-versioned every wall — including untouched ones — driving
// the plan-projection cache hit-rate to ~0 % (the L-06 storm mechanism). This
// suite locks the new contract on the token resolver `_versionForBuild`:
//   • a no-op rebuild of the SAME wall keeps the SAME token (cache HIT),
//   • a real change (own _renderVersion, a join miter/baseline delta, or worldY)
//     mints a fresh, unique token (cache BUST),
//   • building a DIFFERENT wall never disturbs another wall's token
//     (editing one wall leaves other walls' version unchanged — the L-52 ask),
//   • a wall with no _renderVersion falls back to always-fresh (legacy).

import { describe, it, expect } from 'vitest';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';

/** Minimal WallData-ish stub — `_versionForBuild` only reads `id` + `_renderVersion`. */
function wall(id: string, renderVersion: number | undefined): any {
    return { id, _renderVersion: renderVersion };
}

/** Minimal JoinData-ish stub matching what `_joinHash` reads. */
function join(
    b0: { x: number; z: number },
    b1: { x: number; z: number },
    startMN?: { nx: number; nz: number } | null,
    endMN?: { nx: number; nz: number } | null,
): any {
    return { baseLine: [b0, b1], startMN: startMN ?? null, endMN: endMN ?? null };
}

/** `_versionForBuild` ignores scene + bimManager, so stubs are fine. */
function makeBuilder(): any {
    return new WallFragmentBuilder({} as any, {} as any);
}

describe('§FIX-WALL-VERSION-CONTENT-HASH (L-52) — content-hashed geometry version', () => {
    it('a no-op rebuild of the same wall reuses the SAME token (cache HIT)', () => {
        const b = makeBuilder();
        const w = wall('wall_A', 1);
        const j = join({ x: 0, z: 0 }, { x: 3, z: 0 });
        const v1 = b._versionForBuild(w, j, 0);
        const v2 = b._versionForBuild(w, j, 0);
        expect(v2).toBe(v1);
    });

    it('bumping the wall’s own _renderVersion mints a fresh token (cache BUST)', () => {
        const b = makeBuilder();
        const j = join({ x: 0, z: 0 }, { x: 3, z: 0 });
        const v1 = b._versionForBuild(wall('wall_A', 1), j, 0);
        const v2 = b._versionForBuild(wall('wall_A', 2), j, 0);
        expect(v2).not.toBe(v1);
    });

    it('a join miter/baseline change mints a fresh token even at the same _renderVersion', () => {
        const b = makeBuilder();
        const w = wall('wall_A', 5);
        const v1 = b._versionForBuild(w, join({ x: 0, z: 0 }, { x: 3, z: 0 }, null, null), 0);
        // neighbour changed → this wall's end miter normal changed
        const v2 = b._versionForBuild(w, join({ x: 0, z: 0 }, { x: 3, z: 0 }, null, { nx: 0.7071, nz: 0.7071 }), 0);
        expect(v2).not.toBe(v1);
    });

    it('a worldY change (level elevation / slab base offset) mints a fresh token', () => {
        const b = makeBuilder();
        const w = wall('wall_A', 3);
        const j = join({ x: 0, z: 0 }, { x: 3, z: 0 });
        const v1 = b._versionForBuild(w, j, 0);
        const v2 = b._versionForBuild(w, j, 2.8);
        expect(v2).not.toBe(v1);
    });

    it('editing one wall leaves OTHER walls’ tokens unchanged (the L-52 contract)', () => {
        const b = makeBuilder();
        const jA = join({ x: 0, z: 0 }, { x: 3, z: 0 });
        const jB = join({ x: 0, z: 5 }, { x: 4, z: 5 });
        // Initial build of both walls.
        const a0 = b._versionForBuild(wall('wall_A', 1), jA, 0);
        const b0 = b._versionForBuild(wall('wall_B', 1), jB, 0);
        // Now EDIT wall B (bump its _renderVersion) — simulate a whole-level rebuild
        // that re-invokes buildWall for BOTH walls, but A's inputs are identical.
        const bEdited = b._versionForBuild(wall('wall_B', 2), jB, 0);
        const aUnchanged = b._versionForBuild(wall('wall_A', 1), jA, 0);
        expect(bEdited).not.toBe(b0);      // B re-versioned (it changed)
        expect(aUnchanged).toBe(a0);       // A keeps its token (it did not change)
    });

    it('a wall with no _renderVersion falls back to always-fresh (legacy behaviour)', () => {
        const b = makeBuilder();
        const w = wall('wall_legacy', undefined);
        const j = join({ x: 0, z: 0 }, { x: 3, z: 0 });
        const v1 = b._versionForBuild(w, j, 0);
        const v2 = b._versionForBuild(w, j, 0);
        expect(v2).not.toBe(v1); // no stable content signal → unique every call
    });

    it('tokens are globally unique across distinct changes (monotonic source preserved)', () => {
        const b = makeBuilder();
        const seen = new Set<number>();
        for (let rv = 1; rv <= 5; rv++) {
            seen.add(b._versionForBuild(wall('wall_A', rv), null, 0));
            seen.add(b._versionForBuild(wall('wall_B', rv), null, 0));
        }
        // 10 distinct changes → 10 distinct tokens.
        expect(seen.size).toBe(10);
    });
});
