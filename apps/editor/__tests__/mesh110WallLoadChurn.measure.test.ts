// @vitest-environment happy-dom
//
// §MESH110 (L-11567 #3) — MEASURE the post-restore join churn at the FOUNDER'S
// SCALE: 5 levels × (19 + 8 + 3 + 4 = 34 walls, his per-level counts) = 170
// walls. The restore path builds every wall square-capped (joinData = null) and
// defers ONE whole-level WallJoinResolver.resolveLevel per level; this suite
// times those resolves and counts the per-wall rebuild touches they cause, so
// the "re-resolves + rebuilds N walls per level WITH mitred caps" line has a
// millisecond cost attached instead of an adjective. Same harness shape as
// wallJoinLoadDeferredResolve.measure.test.ts (lane JOIN2), builder stubbed —
// so the number is the SOLVE + coordination cost, not mesh construction.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore, WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

type Pt = { x: number; y: number; z: number };

function makeLevelProvider(levelIds: string[]) {
    const levels: Level[] = levelIds.map((id, i) => ({ id, name: id, elevation: i * 3, height: 3, childrenIds: [] }));
    return {
        getLevelById: (id: string): Level | undefined => levels.find(l => l.id === id),
        getLevels: (): Level[] => levels.map(l => ({ ...l })),
    };
}

function makeBuilderStub() {
    return {
        builds: 0, joinedBuilds: 0, touches: 0,
        removeWall(_id: string): void { /* seam */ },
        buildWall(_w: WallData, adj: unknown): void { this.builds++; this.touches++; if (adj) this.joinedBuilds++; },
        recordBuiltVersion(): void { /* seam */ },
        updateWall(_w: WallData, adj: unknown): void { this.touches++; if (adj) this.joinedBuilds++; },
        getWallRoot(): unknown { return undefined; },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

let _seq = 0;
function mkWall(levelId: string, a: Pt, b: Pt): WallData {
    return {
        id: `wr_${_seq++}`, type: 'wall', levelId, properties: { mark: `WA-${_seq}` }, childrenIds: [],
        baseLine: [{ ...a }, { ...b }], height: 3, thickness: 0.2, baseOffset: 0, openings: [],
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/**
 * The founder's storey: a 19-wall outer ring + three rooms (8 + 3 + 4 walls).
 * Every wall shares corners with neighbours so every corner is a real mitre
 * for the resolver to solve.
 */
function founderLevel(levelId: string): WallData[] {
    const p = (x: number, z: number): Pt => ({ x, y: 0, z });
    const walls: WallData[] = [];
    const poly = (pts: Pt[]): void => {
        for (let i = 0; i < pts.length; i++) walls.push(mkWall(levelId, pts[i]!, pts[(i + 1) % pts.length]!));
    };
    const ring: Pt[] = [];
    for (let i = 0; i < 19; i++) { const t = (i / 19) * Math.PI * 2; ring.push(p(12 * Math.cos(t), 12 * Math.sin(t))); }
    poly(ring);
    poly([p(-6, -6), p(0, -6), p(0, -3), p(2, -3), p(2, 0), p(-2, 0), p(-2, -2), p(-6, -2)]);
    poly([p(3, 3), p(8, 3), p(3, 8)]);
    poly([p(-8, 2), p(-3, 2), p(-3, 6), p(-8, 6)]);
    return walls;
}

describe('§MESH110 — MEASURE: post-restore join churn at the founder scale (5 levels x 34 walls)', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;
    });

    it('MEASURE — resolveLevel ms per level, rebuild touches per wall, store updates, after a 170-wall restore', () => {
        const levelIds = ['L0', 'L1', 'L2', 'L3', 'L4'];
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
        const resolveMs: number[] = [];
        const spy = vi.spyOn(WallJoinResolver, 'resolveLevel').mockImplementation((...a: never[]) => {
            const t0 = performance.now();
            const r = orig(...(a as never));
            resolveMs.push(performance.now() - t0);
            return r;
        });
        // Every store 'update' emitted during the deferred resolve reaches the
        // finish trackers as a "wall moved" — item 3a's subject.
        let storeUpdates = 0;
        const unsub = store.subscribe((ev) => { if (ev === 'update') storeUpdates++; });

        const fake = new FakeRafAdapter();
        getFrameScheduler().start(fake);

        window.__wallRebuildControl!.pause();
        let wallCount = 0;
        for (const lid of levelIds) for (const w of founderLevel(lid)) { store.add(w); wallCount++; }

        const tFlush0 = performance.now();
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = true;
        window.__wallRebuildControl!.resumeAndFlush();
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;
        const flushMs = performance.now() - tFlush0;

        const syncBuilds = builder.builds;
        const syncTouches = builder.touches;
        const updatesBeforePump = storeUpdates;

        const tPump0 = performance.now();
        fake.pumpFrames(30);
        const pumpMs = performance.now() - tPump0;

        unsub();
        spy.mockRestore();

        const totalResolveMs = resolveMs.reduce((a, b) => a + b, 0);
        const report = {
            walls: wallCount, levels: levelIds.length,
            restoreFlushMs: +flushMs.toFixed(1), syncBuilds, syncTouches,
            deferredResolves: resolveMs.length,
            resolveMsPerLevel: resolveMs.map(m => +m.toFixed(2)),
            totalResolveMs: +totalResolveMs.toFixed(1),
            pumpMs30Frames: +pumpMs.toFixed(1),
            rebuildTouchesAfterResolve: builder.touches - syncTouches,
            joinedBuilds: builder.joinedBuilds,
            storeUpdatesDuringResolve: storeUpdates - updatesBeforePump,
        };
        // eslint-disable-next-line no-console
        process.stdout.write('[MESH110-WALL-LOAD-CHURN] ' + JSON.stringify(report) + '\n');

        expect(wallCount).toBe(170);
        expect(syncBuilds).toBe(170);
        expect(resolveMs.length).toBe(5);          // one deferred resolve per level (L-1490 contract)
        expect(builder.joinedBuilds).toBe(170);    // every wall re-touched WITH join data
    });
});
