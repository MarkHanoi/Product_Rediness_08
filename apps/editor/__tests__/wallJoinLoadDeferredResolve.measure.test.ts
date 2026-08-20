// @vitest-environment happy-dom
//
// MEASUREMENT ONLY (lane JOIN2, L-1490) — does the §WALL-JOIN-LOAD-SKIP deferred
// whole-level resolve actually RUN after a restore flush?
//
// The restore path builds every wall with `joinData = null` (square end caps) and
// promises "one whole-level resolve per level, deferred off the critical path".
// This suite pumps the frame scheduler after the restore flush and reports whether
// `WallJoinResolver.resolveLevel` is EVER called, per level.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore, WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };
type BL = [Pt, Pt];

function makeLevelProvider(levelIds: string[]) {
    const levels: Level[] = levelIds.map((id, i) => ({ id, name: id, elevation: i * 3, height: 3, childrenIds: [] }));
    return {
        getLevelById: (id: string): Level | undefined => levels.find(l => l.id === id),
        getLevels: (): Level[] => levels.map(l => ({ ...l })),
    };
}

function makeBuilderStub() {
    return {
        builds: 0,
        joinedBuilds: 0,   // buildWall() calls that received a NON-null joinData
        nullBuilds: 0,
        touches: 0,
        removeWall(_id: string): void { /* seam */ },
        buildWall(_w: WallData, adj: unknown, _rm: unknown, _y: number): void {
            this.builds++; this.touches++;
            if (adj) this.joinedBuilds++; else this.nullBuilds++;
        },
        recordBuiltVersion(): void { /* seam */ },
        updateWall(_w: WallData, adj: unknown, _rm: unknown, _s: number): void {
            this.touches++;
            if (adj) this.joinedBuilds++;
        },
        getWallRoot(): unknown { return undefined; },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

let _seq = 0;
function mkWall(levelId: string, bl: BL, thickness = 0.2): WallData {
    return {
        id: `wr_${_seq++}`,
        type: 'wall',
        levelId,
        properties: { mark: `WA-${_seq}` },
        childrenIds: [],
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness,
        baseOffset: 0,
        openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/** A closed rectangular room on `levelId` — four walls, four real mitred corners. */
function room(levelId: string, x0 = 0, z0 = 0, w = 5, d = 4): WallData[] {
    const p = (x: number, z: number): Pt => ({ x, y: 0, z });
    return [
        mkWall(levelId, [p(x0, z0), p(x0 + w, z0)]),
        mkWall(levelId, [p(x0 + w, z0), p(x0 + w, z0 + d)]),
        mkWall(levelId, [p(x0 + w, z0 + d), p(x0, z0 + d)]),
        mkWall(levelId, [p(x0, z0 + d), p(x0, z0)]),
    ];
}

describe('§WALL-JOIN-LOAD-SKIP — MEASURE: is the deferred whole-level resolve ever reached?', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;
    });

    it('MEASURE — pumps 30 frames after a 6-level restore and reports resolveLevel calls', () => {
        const levelIds = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
        const provider = makeLevelProvider(levelIds);
        const store = new WallStore(new ProjectContext(), provider as unknown as ConstructorParameters<typeof WallStore>[1]);
        const coord = new WallRebuildCoordinator();
        const builder = makeBuilderStub();
        coord.init({
            wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
            slabStore: { getAll: () => [] },
            bimManager: { getLevelById: (id: string) => ({ id, elevation: 0 }) },
            doorBuilder: { rebuildForWall: () => { /* noop */ } },
            windowBuilder: { rebuildForWall: () => { /* noop */ } },
            world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
        } as never);

        const orig = WallJoinResolver.resolveLevel.bind(WallJoinResolver);
        const spy = vi.spyOn(WallJoinResolver, 'resolveLevel').mockImplementation((...a: never[]) => orig(...(a as never)));

        // Start the scheduler on a FAKE rAF adapter so we control the frames.
        const fake = new FakeRafAdapter();
        getFrameScheduler().start(fake);

        window.__wallRebuildControl!.pause();
        for (const lid of levelIds) for (const w of room(lid)) store.add(w);

        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = true;
        window.__wallRebuildControl!.resumeAndFlush();
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;

        const syncResolves = spy.mock.calls.length;
        const syncBuilds = builder.builds;
        const syncJoined = builder.joinedBuilds;

        // Pump 30 frames — far more than the "a frame or two later" the comment promises.
        fake.pumpFrames(30);

        const afterResolves = spy.mock.calls.length;
        const afterJoined = builder.joinedBuilds;

        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            syncResolves, syncBuilds, syncJoined,
            deferredResolves: afterResolves - syncResolves,
            joinedBuildsAfterPump: afterJoined,
            totalBuilds: builder.builds,
            totalTouches: builder.touches,
        }, null, 1));

        spy.mockRestore();
        // The load-thread contract: every wall built, ZERO resolveLevel on the critical path.
        expect(syncBuilds).toBe(24);
        expect(syncResolves).toBe(0);
        expect(syncJoined).toBe(0);
        // THE GUARD (L-1490): 6 levels were restored, so the deferral owes EXACTLY 6 resolves,
        // and every one of the 24 walls must end up rebuilt WITH join data. A regression that
        // stops scheduling the deferral, stops firing it, or lets a guard discard it again
        // trips here — this is what nothing asserted between 2026-06-24 and 2026-08-20.
        expect(afterResolves - syncResolves).toBe(6);
        expect(afterJoined).toBe(24);
    });
});
