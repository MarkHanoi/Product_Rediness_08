// §WALL-RAKE-INVALIDATION (ADR-0310 follow-up) — a rake edit must DIRTY the wall.
//
// THE DEFECT (founder, 2026-08-09): "Vertical angle parameter works, but the wall
// only gets angled after another element is created or modified."
//
// `rakeAngleDeg` shipped as a genuine geometry input — `createWallBodyFragment`
// feeds it into `buildWallV2Geometry`, and the cross-session content hash
// (`composeWallGeometryHash`) folds it. But the two IN-PROCESS invalidation keys
// that decide whether the wall is rebuilt at all did NOT:
//
//   • `WallFragmentBuilder._composeCacheKey` — `${_renderVersion}|${joinHash}|${slab}`.
//     A rake-only edit arrives through the GENERIC bus path
//     (`element.updateParameters` → `UpdateElementParameterCommand` →
//     `WallStore.update(id, patch)`), and — unlike every DEDICATED wall command
//     (UpdateWallBaselineCommand:189, CascadeWallBaselineCommand:178,
//     JoinWallsCommand:96, CutWallCommand:121, ScaleElementCommand:89) — that path
//     never bumps `_renderVersion`. The key is therefore byte-identical, so
//     `_buildWallInternal` short-circuits and the wall keeps its VERTICAL mesh.
//     (This is the L-793 two-mutation-paths class: the legacy/dedicated path
//     invalidates, the bus path does not.)
//
//   • `WallFragmentBuilder._versionForBuild` — the `wallGroup.userData.version`
//     generation token that keys the EdgeProjector / NativeElementMeshExporter
//     plan-projection cache. Stale here = the founder's
//     `[VDT] §G3-STALE-EVENT` / `§DIAG-GRAFT-FALLTHROUGH` plan-view symptom.
//
// Folding the rake into BOTH keys is strictly additive: it can only cause a
// rebuild that was previously skipped, never suppress one. A vertical wall
// (absent rake or exactly 90) hashes identically to the pre-rake build, so no
// existing wall is re-versioned by this change.
//
// §CONTEXT-DATA-HONESTY: a wall the store believes is raked and the scene draws
// vertical is the exact "a refusal and a success look the same" failure ADR-0310
// was written to prevent — here in its rendering form.

import { describe, it, expect } from 'vitest';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';

/** `_versionForBuild` / `_composeCacheKey` read only these fields. */
function wall(id: string, renderVersion: number | undefined, rakeAngleDeg?: number): any {
    return { id, _renderVersion: renderVersion, rakeAngleDeg };
}

function join(
    b0: { x: number; z: number },
    b1: { x: number; z: number },
): any {
    return { baseLine: [b0, b1], startMN: null, endMN: null };
}

function makeBuilder(): any {
    return new WallFragmentBuilder({} as any, {} as any);
}

const J = join({ x: 0, z: 0 }, { x: 3, z: 0 });

describe('§WALL-RAKE-INVALIDATION — a rake-only edit must invalidate the render caches', () => {
    it('_composeCacheKey CHANGES when only rakeAngleDeg changes (same _renderVersion)', () => {
        const b = makeBuilder();
        const vertical = b._composeCacheKey(wall('wall_A', 7), J, 0);
        const raked    = b._composeCacheKey(wall('wall_A', 7, 80), J, 0);
        expect(vertical).not.toBeNull();
        expect(raked).not.toBe(vertical);
    });

    it('_composeCacheKey treats an ABSENT rake and an explicit 90 as the same wall', () => {
        const b = makeBuilder();
        expect(b._composeCacheKey(wall('wall_A', 7, 90), J, 0))
            .toBe(b._composeCacheKey(wall('wall_A', 7), J, 0));
    });

    it('_composeCacheKey distinguishes two DIFFERENT rake angles', () => {
        const b = makeBuilder();
        expect(b._composeCacheKey(wall('wall_A', 7, 80), J, 0))
            .not.toBe(b._composeCacheKey(wall('wall_A', 7, 100), J, 0));
    });

    it('_versionForBuild mints a FRESH plan-projection token when only the rake changes', () => {
        const b = makeBuilder();
        const v1 = b._versionForBuild(wall('wall_A', 7), J, 0);
        const v2 = b._versionForBuild(wall('wall_A', 7, 80), J, 0);
        expect(v2).not.toBe(v1);
    });

    it('_versionForBuild still REUSES the token for a genuine no-op rebuild of a raked wall', () => {
        const b = makeBuilder();
        const w = wall('wall_A', 7, 80);
        expect(b._versionForBuild(w, J, 0)).toBe(b._versionForBuild(w, J, 0));
    });
});
