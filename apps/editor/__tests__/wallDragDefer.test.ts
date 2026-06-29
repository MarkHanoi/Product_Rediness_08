// @vitest-environment happy-dom
//
// §PERF-WALL-DRAG-DEFER (ADR-061) — wall-drag rebuild deferral.
//
// Dragging a wall that hosts a door/window used to run the whole heavy cascade
// (WallJoinResolver.resolveLevel + per-wall buildWall re-cutting every hosted
// opening + room redetect + plan re-projection) SYNCHRONOUSLY on the commit,
// blocking the interaction frame. The fix defers WallRebuildCoordinator._flush
// while a wall drag is in flight (`window.__wallDragInProgress === true`) and
// drains it ONCE on release — mirroring the door-move pattern (ADR-057). The
// live mesh follows the gizmo visually during the drag (WallTransformController),
// so feedback stays smooth.
//
// This suite pins the DECISION: a wall store mutation that arrives WHILE the
// drag flag is set must NOT schedule a flush; once the flag clears + the drag-end
// drain runs, the deferred event flushes (builds the wall). With the flag UNSET
// (the normal commit), a mutation schedules the flush immediately — so the change
// is isolated to the active-drag window.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
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
        builds: 0,
        removeWall(_id: string): void { /* render seam */ },
        buildWall(_wall: WallData, _adj: unknown, _renderMap: unknown, _worldY: number): void { this.builds++; },
        recordBuiltVersion(_id: string, _wall: WallData, _adj: unknown, _slabOff: number): void { /* render seam */ },
        updateWall(_wall: WallData, _join: unknown, _renderMap: unknown, _slabOff: number): void { this.builds++; },
        getWallRoot(_id: string): unknown { return undefined; },
        getWallStore() { return undefined; },
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
function mkWall(bl: BL): WallData {
    return {
        id: `wd_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-${_seq.toString().padStart(3, '0')}` },
        childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/**
 * Drives the scheduler with a synchronous FakeRafAdapter so scheduled flushes can
 * be pumped deterministically. `builder.builds` is the observable signal: a wall
 * rebuild ran iff a flush was both scheduled AND pumped.
 */
function setup() {
    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);
    const provider = makeLevelProvider();
    const store = new WallStore(
        new ProjectContext(),
        provider as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const { builder } = makeCoordinator(store);
    const pump = (): void => { adapter.pumpFrames(3); };
    return { store, builder, pump };
}

describe('§PERF-WALL-DRAG-DEFER — wall rebuild defers while a wall drag is in flight', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
    });

    it('a wall mutation WHILE dragging does NOT rebuild; draining after release rebuilds once', () => {
        const { store, builder, pump } = setup();
        const w = mkWall([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }]);
        store.add({ ...w });
        pump(); // drain the add so we measure ONLY the drag mutation below
        const buildsAfterAdd = builder.builds;

        // ── Simulate an active wall drag ──────────────────────────────────────
        window.__wallDragInProgress = true;
        store.update(w.id, {
            baseLine: [{ x: 1, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            _renderVersion: 1,
        } as Partial<WallData>);
        pump(); // pump frames — nothing was scheduled, so no rebuild may occur
        expect(builder.builds).toBe(buildsAfterAdd); // deferred → no rebuild yet

        // ── Drag ends: clear flag + drain (mirrors registerTransformDragHandler) ─
        window.__wallDragInProgress = false;
        window.__wallRebuildControl!.resumeAndFlushDeferredDrag!();
        pump();
        expect(builder.builds).toBeGreaterThan(buildsAfterAdd); // settled on release
    });

    it('a wall mutation with NO drag in flight rebuilds normally (isolation)', () => {
        const { store, builder, pump } = setup();
        const w = mkWall([{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }]);
        store.add({ ...w });
        pump();
        const buildsAfterAdd = builder.builds;

        // No drag flag set — the normal commit path schedules + runs the flush.
        window.__wallDragInProgress = false;
        store.update(w.id, {
            baseLine: [{ x: 1, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
            _renderVersion: 1,
        } as Partial<WallData>);
        pump();
        expect(builder.builds).toBeGreaterThan(buildsAfterAdd);
    });

    it('resumeAndFlushDeferredDrag is a no-op when there are no pending wall events', () => {
        const { builder, pump } = setup();
        const before = builder.builds;
        window.__wallDragInProgress = false;
        // Nothing queued — must not throw and must not rebuild.
        expect(() => window.__wallRebuildControl!.resumeAndFlushDeferredDrag!()).not.toThrow();
        pump();
        expect(builder.builds).toBe(before);
    });
});
