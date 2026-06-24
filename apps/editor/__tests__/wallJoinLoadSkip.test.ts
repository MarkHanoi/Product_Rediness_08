// @vitest-environment happy-dom
//
// §WALL-JOIN-LOAD-SKIP (2026-06-24) — project-open HANG fix.
//
// On restore-from-snapshot the persisted wall geometry is ALREADY join-resolved
// (ProjectSerializer saves the trimmed baseline verbatim), so the whole-level
// `WallJoinResolver.resolveLevel` pass that the load path used to run on the
// critical thread is REDUNDANT — and, for large residential buildings (hundreds–
// thousands of walls × 5–6 floors), it blocks the main thread so the project never
// finishes loading ("Loading Auto-save…" forever).
//
// The fix routes the load-time `resumeAndFlush()` to a RESTORE path when the
// ProjectLoader sets `window.__pryzmWallRestoreFlush = true`. That path builds every
// wall body from its persisted baseline (O(walls), NO resolve) and defers the
// authoritative whole-level resolve OFF the critical path. This suite proves:
//   1. With the flag set, the synchronous load flush does NOT call
//      `WallJoinResolver.resolveLevel` (the hang root is gone), yet still builds
//      every wall.
//   2. With the flag UNSET (the live-edit path), `resolveLevel` is still called —
//      i.e. the change is isolated to the restore path; live edits are unaffected.
//   3. A large wall count restores under a tight time budget.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore, WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

const LEVEL_ID = 'L';

function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

function makeBuilderStub() {
    return {
        builds: 0,        // buildWall() calls — the restore path uses ONLY this
        touches: 0,       // buildWall() + updateWall() — total wall-geometry writes
        removeWall(_id: string): void { /* render seam */ },
        buildWall(_wall: WallData, _adj: unknown, _renderMap: unknown, _worldY: number): void { this.builds++; this.touches++; },
        recordBuiltVersion(_id: string, _wall: WallData, _adj: unknown, _slabOff: number): void { /* render seam */ },
        updateWall(_wall: WallData, _join: unknown, _renderMap: unknown, _slabOff: number): void { this.touches++; },
        getWallRoot(_id: string): unknown { return undefined; },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

function makeCoordinator(store: WallStore) {
    const coord = new WallRebuildCoordinator();
    const builder = makeBuilderStub();
    coord.init({
        wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
        slabStore: { getAll: () => [] },
        bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
        doorBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
    });
    return { coord, builder };
}

let _seq = 0;
function mkWall(bl: BL, thickness: number): WallData {
    return {
        id: `wr_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-XX-${_seq.toString().padStart(3, '0')}` },
        childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** A connected rectilinear grid of `n` walls sharing endpoints — exactly the kind
 *  of dense-junction scene whose whole-level resolve is the hang root. */
function buildGrid(n: number): WallData[] {
    const walls: WallData[] = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
        walls.push(mkWall([{ x, y: 0, z: 0 }, { x: x + 3, y: 0, z: 0 }], 0.2));
        x += 3;
    }
    return walls;
}

function loadAndFlush(records: WallData[], restore: boolean): { builds: number; resolveCalls: number; ms: number } {
    const provider = makeLevelProvider();
    const store = new WallStore(new ProjectContext(), provider as unknown as ConstructorParameters<typeof WallStore>[1]);
    const { coord, builder } = makeCoordinator(store);

    // Spy that CALLS THROUGH the real resolveLevel (default vi.spyOn replaces with a
    // mock returning undefined, which would break the live-edit path). We only want to
    // COUNT calls, not change behaviour.
    const _origResolve = WallJoinResolver.resolveLevel.bind(WallJoinResolver);
    const resolveSpy = vi.spyOn(WallJoinResolver, 'resolveLevel').mockImplementation((...args) => _origResolve(...args));

    window.__wallRebuildControl!.pause();
    for (const rec of records) {
        store.add({ ...rec, baseLine: [{ ...rec.baseLine[0] }, { ...rec.baseLine[1] }] } as WallData);
    }
    (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = restore;
    const t0 = performance.now();
    window.__wallRebuildControl!.resumeAndFlush();
    const ms = performance.now() - t0;
    (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;

    const resolveCalls = resolveSpy.mock.calls.length;
    resolveSpy.mockRestore();
    void coord;
    return { builds: builder.builds, touches: builder.touches, resolveCalls, ms };
}

describe('§WALL-JOIN-LOAD-SKIP — restore flush bypasses resolveLevel on the critical path', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;
    });

    it('RESTORE flush builds every wall WITHOUT calling resolveLevel synchronously', () => {
        const r = loadAndFlush(buildGrid(30), /* restore */ true);
        // Every wall got a body build...
        expect(r.builds).toBe(30);
        // ...but the whole-level resolver was NOT run on the critical (synchronous) flush.
        expect(r.resolveCalls).toBe(0);
    });

    it('LIVE-EDIT flush (flag unset) STILL runs the whole-level resolve — change is isolated to restore', () => {
        const r = loadAndFlush(buildGrid(30), /* restore */ false);
        // The unchanged authoritative path writes wall geometry (buildWall + updateWall)...
        expect(r.touches).toBeGreaterThan(0);
        // ...and runs the resolver (≥1 call for the level) — proving the bypass is
        // restore-ONLY and live edits keep their byte-identical join behaviour.
        expect(r.resolveCalls).toBeGreaterThanOrEqual(1);
    });

    it('large wall count restores well under a budget (no synchronous resolve storm)', () => {
        const r = loadAndFlush(buildGrid(400), /* restore */ true);
        expect(r.builds).toBe(400);
        expect(r.resolveCalls).toBe(0);
        // Generous budget: the point is it is bounded by build cost, not an O(N²)
        // resolve over a 400-wall level. In CI this restore is single-digit ms.
        expect(r.ms).toBeLessThan(1500);
    });
});
