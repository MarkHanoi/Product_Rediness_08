// @vitest-environment happy-dom
//
// §WALL-JOIN-LOAD-MULTILEVEL (lane WALL1, L-1950) — the founder's "on project
// opening the mitred joins don't resolve; as soon as an element is created in
// the precise level they go well mitred".
//
// L-1490 established that the deferred post-restore resolve DOES fire. This
// suite is about what happens NEXT, inside the single `_flush` that all six
// per-level `_rebuildWalls` calls funnel into.
//
// `_flush` loops `for (const levelId of affectedLevelIds)`. Inside that loop it
// resolves ONE level (`adjustments` covers only that level's walls) and then
// walks the ENTIRE cross-level `batch`, rebuilding every wall NOT in this
// level's `adjustments` with `joinData = null` — i.e. UNJOINED, square-capped.
// On a project open the batch is every wall of every level, so each level
// iteration un-mitres every OTHER level that was just mitred. Only the LAST
// level in the set survives.
//
// A single-level edit ("create an element in the precise level") produces a
// single-level batch, where the loop runs once and there is no other level to
// clobber — which is exactly the repair the founder observed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore, WallJoinResolver } from '@pryzm/geometry-wall';
import type { WallData, Level, JoinData } from '@pryzm/geometry-wall';
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

/**
 * Builder stub that records, per wall id, the join data of the LAST call that
 * touched it — the state the renderer is actually left holding. Counting calls
 * (what the L-1490 measure suite does) cannot see a wall that was mitred and
 * then rebuilt square two iterations later.
 */
function makeBuilderStub() {
    const lastJoin = new Map<string, JoinData | null>();
    return {
        lastJoin,
        calls: 0,
        removeWall(_id: string): void { /* seam */ },
        buildWall(w: WallData, adj: JoinData | null | undefined, _rm: unknown, _y: number): void {
            this.calls++; lastJoin.set(w.id, adj ?? null);
        },
        recordBuiltVersion(): void { /* seam */ },
        updateWall(w: WallData, adj: JoinData | null | undefined, _rm: unknown, _s: number): void {
            this.calls++; lastJoin.set(w.id, adj ?? null);
        },
        getWallRoot(): unknown { return undefined; },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

let _seq = 0;
function mkWall(levelId: string, bl: BL, thickness = 0.2): WallData {
    return {
        id: `${levelId}_w${_seq++}`,
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

interface Harness {
    store: WallStore;
    builder: ReturnType<typeof makeBuilderStub>;
    fake: FakeRafAdapter;
    spy: ReturnType<typeof vi.spyOn>;
}

function boot(levelIds: string[]): Harness {
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

    const fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);

    window.__wallRebuildControl!.pause();
    for (const lid of levelIds) for (const w of room(lid)) store.add(w);

    (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = true;
    window.__wallRebuildControl!.resumeAndFlush();
    (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;

    return { store, builder, fake, spy };
}

/** ids whose LAST builder call carried NO join data → square end caps on screen. */
function unmitred(h: Harness): string[] {
    return h.store.getAll()
        .map(w => w.id)
        .filter(id => !h.builder.lastJoin.get(id));
}

describe('§WALL-JOIN-LOAD-MULTILEVEL (L-1950) — a multi-level restore must leave EVERY level mitred', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        (globalThis as unknown as { __pryzmWallRestoreFlush?: boolean }).__pryzmWallRestoreFlush = false;
        vi.restoreAllMocks();
    });

    it('SINGLE level — the control. One level restored, one level mitred.', () => {
        const h = boot(['L0']);
        h.fake.pumpFrames(30);
        expect(unmitred(h)).toEqual([]);
        h.spy.mockRestore();
    });

    it('THREE levels — every wall on every level must end mitred, not just the last one', () => {
        const h = boot(['L0', 'L1', 'L2']);
        h.fake.pumpFrames(30);

        const bad = unmitred(h);
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({
            walls: h.store.getAll().length,
            builderCalls: h.builder.calls,
            unmitredCount: bad.length,
            unmitred: bad,
        }, null, 1));

        h.spy.mockRestore();
        // THE GUARD: 12 walls, 3 closed rooms, 12 real corners. After the deferred
        // post-restore resolve every one of them is joined. A regression that lets one
        // level's flush iteration rebuild ANOTHER level's walls with `joinData = null`
        // leaves 8 of the 12 square-capped — the founder's reopened project.
        expect(bad).toEqual([]);
    });

    it('SIX levels — the founder shape (59 walls / 6 levels): no level may be left square-capped', () => {
        const h = boot(['L0', 'L1', 'L2', 'L3', 'L4', 'L5']);
        h.fake.pumpFrames(30);
        const bad = unmitred(h);
        h.spy.mockRestore();
        expect(bad).toEqual([]);
    });
});
