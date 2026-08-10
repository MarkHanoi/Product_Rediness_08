// @vitest-environment happy-dom
//
// §WALL-RAKE-JOINT-ONE-EDIT-BEHIND (founder 2026-08-09, ADR-0312 follow-up) —
// REAL coordinator integration: a rake edit must refresh the V2 cache AND
// rebuild the NEIGHBOUR in the SAME mutation cycle.
//
// THE DEFECT: "the joint geometry is correct but arrives ONE EDIT LATE." Two
// stacked gates produced it:
//
//   1. `classifyWallDelta` treated a rake-only edit as `openings-only`
//      (rakeAngleDeg was invisible to `joinGeometryChangedExcludingBaseline`),
//      so `_flush` took `_flushOpeningsOnly` — which by design NEVER calls
//      `refreshV2Cache` and NEVER rebuilds a neighbour. The edited wall rebuilt
//      against the STALE twin-solve cache: the loft of the PREVIOUS edit.
//
//   2. Even on the whole-level path, the §PERF-WALL-MOVE-INCREMENTAL-REBUILD
//      memo (`_buildKey` ← `composeWallGeometryHash`) did not fold the level's
//      rake-joint signature, so the NEIGHBOUR of a raked wall hashed identically
//      and was skipped as "clean" — its lofted top never followed the new mitre
//      line.
//
// This suite drives the REAL WallRebuildCoordinator + REAL WallStore + REAL
// WallJoinResolver through the same public entries the engine uses (mirroring
// postResolvePreserveLoadFlush.test.ts), with only the render seam stubbed —
// and the stub keeps a REAL WallPipelineV2Cache so the rake-joint signature is
// the production one, not a fake.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore, WallPipelineV2Cache, type LevelWallSpec } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

const LEVEL_ID = 'L';

function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

/**
 * Render-seam stub that records WHAT was rebuilt and IN WHAT ORDER relative to
 * the V2-cache refresh. It holds a real `WallPipelineV2Cache` so the
 * coordinator's neighbour-rake signature read is exercised against production
 * logic (not a hand-written stand-in).
 */
function makeBuilderStub() {
    const cache = new WallPipelineV2Cache();
    return {
        /** Chronological log: 'refresh' | 'build:<wallId>'. */
        log: [] as string[],
        /** rakeAngleDeg per wall id captured from the LAST refreshV2Cache call. */
        lastRefreshRakes: null as Map<string, number | undefined> | null,
        removeWall(_id: string): void { /* render seam */ },
        buildWall(w: WallData): void { this.log.push(`build:${w.id}`); },
        updateWall(w: WallData): void { this.log.push(`build:${w.id}`); },
        recordBuiltVersion(): void { /* render seam */ },
        // The incremental gate consults this — a truthy root means "mesh exists".
        getWallRoot(_id: string): unknown { return {}; },
        refreshV2Cache(specs: ReadonlyArray<LevelWallSpec>): void {
            this.log.push('refresh');
            this.lastRefreshRakes = new Map(specs.map(s => [s.id, s.rakeAngleDeg]));
            cache.refresh(specs);
        },
        // The coordinator folds this into its per-wall build memo so a neighbour
        // of a raked wall is re-keyed. Delegates to the REAL cache.
        get rakeJointSignature(): string { return cache.rakeJointSignature; },
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

function mkWall(id: string, bl: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }]): WallData {
    return {
        id,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-${id}` },
        childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** Two walls joined in an L at (4, 0): A along +X, B along +Z from the joint. */
function seedScene(store: WallStore): void {
    window.__wallRebuildControl!.pause();
    store.add(mkWall('wall_A', [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]));
    store.add(mkWall('wall_B', [{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }]));
    window.__wallRebuildControl!.resumeAndFlush();
}

/** Apply one property-panel edit and drive exactly ONE flush cycle for it. */
function editAndFlush(store: WallStore, wallId: string, patch: Partial<WallData>): void {
    window.__wallRebuildControl!.pause();
    store.update(wallId, patch);
    window.__wallRebuildControl!.resumeAndFlush();
}

describe('§WALL-RAKE-JOINT-ONE-EDIT-BEHIND — the rake edit cycle is cache-refresh-then-rebuild, neighbours included', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
    });

    it('setting rake on A REFRESHES the V2 cache with the NEW angle in the SAME cycle', () => {
        const store = new WallStore(new ProjectContext(), makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1]);
        const { builder } = makeCoordinator(store);
        seedScene(store);

        builder.log.length = 0;
        builder.lastRefreshRakes = null;
        editAndFlush(store, 'wall_A', { rakeAngleDeg: 70 } as Partial<WallData>);

        // The flush for THIS edit must have re-run refreshV2Cache — and with the
        // freshly-written angle, so the twin-solve probe is for 70, not stale.
        expect(builder.log).toContain('refresh');
        expect(builder.lastRefreshRakes?.get('wall_A')).toBe(70);
    });

    it('the edited wall is rebuilt AFTER the cache refresh (never against the stale probe)', () => {
        const store = new WallStore(new ProjectContext(), makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1]);
        const { builder } = makeCoordinator(store);
        seedScene(store);

        builder.log.length = 0;
        editAndFlush(store, 'wall_A', { rakeAngleDeg: 70 } as Partial<WallData>);

        const refreshAt = builder.log.lastIndexOf('refresh');
        const builtAAt  = builder.log.lastIndexOf('build:wall_A');
        expect(refreshAt).toBeGreaterThanOrEqual(0);
        expect(builtAAt).toBeGreaterThan(refreshAt);
    });

    it('the JOINED NEIGHBOUR B is rebuilt in the SAME mutation cycle (its lofted top follows the new mitre line)', () => {
        const store = new WallStore(new ProjectContext(), makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1]);
        const { builder } = makeCoordinator(store);
        seedScene(store);

        // First rake edit — B's top corners must travel to meet A's new lean.
        builder.log.length = 0;
        editAndFlush(store, 'wall_A', { rakeAngleDeg: 70 } as Partial<WallData>);
        expect(builder.log).toContain('build:wall_B');

        // The founder's exact reproduction: change the SAME wall again (70 → 80).
        // B must follow again in this cycle too — not one edit later.
        builder.log.length = 0;
        editAndFlush(store, 'wall_A', { rakeAngleDeg: 80 } as Partial<WallData>);
        const refreshAt = builder.log.lastIndexOf('refresh');
        expect(refreshAt).toBeGreaterThanOrEqual(0);
        expect(builder.lastRefreshRakes?.get('wall_A')).toBe(80);
        expect(builder.log.lastIndexOf('build:wall_A')).toBeGreaterThan(refreshAt);
        expect(builder.log.lastIndexOf('build:wall_B')).toBeGreaterThan(refreshAt);
    });

    it('clearing the rake (80 → 90) also rebuilds BOTH walls once (the loft must flatten)', () => {
        const store = new WallStore(new ProjectContext(), makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1]);
        const { builder } = makeCoordinator(store);
        seedScene(store);
        editAndFlush(store, 'wall_A', { rakeAngleDeg: 80 } as Partial<WallData>);

        builder.log.length = 0;
        editAndFlush(store, 'wall_A', { rakeAngleDeg: 90 } as Partial<WallData>);
        expect(builder.log).toContain('build:wall_A');
        expect(builder.log).toContain('build:wall_B');
    });
});
