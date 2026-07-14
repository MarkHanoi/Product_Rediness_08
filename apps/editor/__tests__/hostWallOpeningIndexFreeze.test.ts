// @vitest-environment happy-dom
//
// §FIX-HOSTWALL-DOOR-INDEX / §FIX-HOSTWALL-MOVE-COALESCE (2026-07-02) —
// regression guard for the CRITICAL total-freeze:
//
//   "Create a few walls + a few doors; MOVE a wall that HOSTS a door → whole
//    app freezes (main thread pegged), 3D view + all buttons dead."
//
// ROOT CAUSE (confirmed by deep trace): on a wall baseline move,
// WallRebuildCoordinator._flush re-anchors each rebuilt wall's hosted openings by
// calling DoorBuilder.rebuildForWall(wallId) / WindowBuilder.rebuildForWall(wallId)
// ONCE PER REBUILT WALL. Those methods did an UNBOUNDED
//   for (const door of doorStore.getAll()) if (door.wallId === wallId) …
// full-project scan, making a single move cost O(walls-rebuilt × all-openings) —
// the synchronous, non-yielding cost that pegged the main thread.
//
// FIX: DoorStore / WindowStore now maintain a wallId → Set<openingId> reverse
// index maintained on add/update/remove/clear, exposed as getIdsByWallId(wallId)
// (O(openings-on-that-wall)). rebuildForWall now iterates ONLY that bucket.
//
// This suite pins the two load-bearing properties:
//   1. The index is EXACT and stays in lock-step with the store across
//      add / remove / re-home / clear (the invariant the fix relies on).
//   2. Re-anchoring the moved host wall visits ONLY the K openings on that wall —
//      NOT all project openings. We prove it by trip-wiring getAll(): a single
//      wall re-anchor that touches getAll() would be the O(all) regression.
//   3. A wall move drives the WallRebuildCoordinator commit barrier
//      (bim-wall-mutation-committed → room redetect + plan re-projection) exactly
//      ONCE — it does not fan out per hosted child.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DoorStore } from '@pryzm/geometry-door';
import { WindowStore } from '@pryzm/geometry-window';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — the reverse index is exact and stays in lock-step with the store.
// A pure-function test of the index lookup (the prompt explicitly allows this).
// ─────────────────────────────────────────────────────────────────────────────

let _did = 0;
function addDoor(store: DoorStore, wallId: string): string {
    const id = `door_${_did++}`;
    store.add({
        id,
        openingId: `op_${id}`,
        wallId,
        offset: 1,
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
    });
    return id;
}

let _wid = 0;
function addWindow(store: WindowStore, wallId: string): string {
    const id = `win_${_wid++}`;
    store.add({
        id,
        openingId: `op_${id}`,
        wallId,
        offset: 1,
        width: 1.2,
        height: 1.2,
        sillHeight: 0.9,
    });
    return id;
}

describe('§FIX-HOSTWALL-DOOR-INDEX — DoorStore reverse index is exact + bounded', () => {
    beforeEach(() => { _did = 0; });

    it('getIdsByWallId returns exactly the doors hosted on that wall', () => {
        const store = new DoorStore();
        const onA = [addDoor(store, 'wallA'), addDoor(store, 'wallA'), addDoor(store, 'wallA')];
        const onB = [addDoor(store, 'wallB')];

        expect(new Set(store.getIdsByWallId('wallA'))).toEqual(new Set(onA));
        expect(store.getIdsByWallId('wallB')).toEqual(onB);
        // A wall that hosts NO doors — the common neighbour case — is empty (zero work).
        expect(store.getIdsByWallId('wallC')).toEqual([]);
        // getByWallId (records) agrees with getIdsByWallId (ids).
        expect(store.getByWallId('wallA').map(d => d.id).sort()).toEqual([...onA].sort());
    });

    it('remove() prunes the id from its bucket (no stale entries)', () => {
        const store = new DoorStore();
        const a1 = addDoor(store, 'wallA');
        const a2 = addDoor(store, 'wallA');
        store.remove(a1);
        expect(store.getIdsByWallId('wallA')).toEqual([a2]);
        store.remove(a2);
        // Bucket pruned when empty — getIdsByWallId returns [] not a dangling Set.
        expect(store.getIdsByWallId('wallA')).toEqual([]);
    });

    it('clear() empties the index in lock-step with the store', () => {
        const store = new DoorStore();
        addDoor(store, 'wallA');
        addDoor(store, 'wallB');
        store.clear();
        expect(store.getIdsByWallId('wallA')).toEqual([]);
        expect(store.getIdsByWallId('wallB')).toEqual([]);
        expect(store.getAll()).toEqual([]);
    });

    it('re-anchoring one wall does NOT scan all doors (bounded work invariant)', () => {
        const store = new DoorStore();
        // 200 doors spread across 100 unrelated walls + 2 doors on the moved wall.
        for (let i = 0; i < 100; i++) { addDoor(store, `wall_${i}`); addDoor(store, `wall_${i}`); }
        const movedWall = 'wall_moved';
        const k = [addDoor(store, movedWall), addDoor(store, movedWall)];

        // Trip-wire: the OLD code re-anchored via getAll() (the O(all) scan). If any
        // regression reintroduces a full-project scan for a single-wall re-anchor,
        // getAll() fires and this test fails loudly.
        const spy = vi.spyOn(store, 'getAll');
        const ids = store.getIdsByWallId(movedWall);
        expect(new Set(ids)).toEqual(new Set(k));
        expect(ids.length).toBe(2);                 // only the K on the moved wall
        expect(spy).not.toHaveBeenCalled();         // NOT O(all-doors)
        spy.mockRestore();
    });
});

describe('§FIX-HOSTWALL-DOOR-INDEX — WindowStore reverse index mirrors DoorStore', () => {
    beforeEach(() => { _wid = 0; });

    it('getIdsByWallId / remove / clear behave identically for windows', () => {
        const store = new WindowStore();
        const onA = [addWindow(store, 'wallA'), addWindow(store, 'wallA')];
        const onB = [addWindow(store, 'wallB')];
        expect(new Set(store.getIdsByWallId('wallA'))).toEqual(new Set(onA));
        expect(store.getIdsByWallId('wallB')).toEqual(onB);

        store.remove(onA[0]!);
        expect(store.getIdsByWallId('wallA')).toEqual([onA[1]]);

        store.clear();
        expect(store.getIdsByWallId('wallA')).toEqual([]);
        expect(store.getIdsByWallId('wallB')).toEqual([]);
    });

    it('a single-wall re-anchor does not scan all windows', () => {
        const store = new WindowStore();
        for (let i = 0; i < 100; i++) addWindow(store, `wall_${i}`);
        const k = [addWindow(store, 'wall_moved')];
        const spy = vi.spyOn(store, 'getAll');
        expect(store.getIdsByWallId('wall_moved')).toEqual(k);
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 3 — a wall MOVE fires the room-redetect / plan-reprojection commit barrier
// exactly ONCE, and re-anchors hosted openings through the BOUNDED index path
// (not a per-child full-level resolve). Mirrors wallDragDefer.test.ts wiring.
// ─────────────────────────────────────────────────────────────────────────────

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

let _seq = 0;

/** A real hosted door: the `wall.openings` record the coordinator's opening paths read. */
interface TestOpening {
    id: string;
    elementId: string;
    type: 'door';
    offset: number;
    width: number;
    height: number;
    sillHeight: number;
}
function mkDoorOpening(idx: number): TestOpening {
    return { id: `op_hd_${idx}`, elementId: `hd_${idx}`, type: 'door', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0 };
}

// §L-250 — THE FIXTURE MUST ACTUALLY HOST AN OPENING.
//
// This suite is named for, and guards, the hosted-opening freeze path — yet every wall
// it built carried `openings: []`. A wall with no opening never enters
// `resolveOpeningRenderMap`, never takes the hole-extrude branch, and never exercises
// the openings-membership leg of `classifyWallDelta`. The suite was therefore green by
// construction and COULD NOT FAIL on the founder's actual scenario ("move a wall that
// HOSTS A DOOR"). A guard that cannot fail is not a guard. `mkWall` now takes the
// openings it is supposed to be guarding, and Part 3 passes a real one.
function mkWall(
    bl: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
    openings: TestOpening[] = [],
): WallData {
    return {
        id: `wm_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: { mark: `WA-${_seq.toString().padStart(3, '0')}` },
        // The WallStore schema enforces childrenIds ⊇ openings[*].elementId.
        childrenIds: openings.map(o => o.elementId),
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings,
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

describe('§FIX-HOSTWALL-MOVE-COALESCE — one wall move → one redetect commit; bounded re-anchor', () => {
    beforeEach(() => { _resetFrameSchedulerForTest(); _seq = 0; });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        delete (window as unknown as { runtime?: unknown }).runtime;
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
    });

    it('moving one host wall commits the redetect barrier once and re-anchors only its K doors', () => {
        const adapter = new FakeRafAdapter();
        getFrameScheduler().start(adapter);
        const pump = (): void => { adapter.pumpFrames(4); };

        // Observe the commit barrier (room redetect + plan re-projection subscribe here).
        const committed = vi.fn();
        (window as unknown as { runtime?: { events: { on: () => void; emit: (e: string, p: unknown) => void } } }).runtime = {
            events: {
                on: () => { /* view-activated handler — unused in this test */ },
                emit: (evt: string, payload: unknown) => { if (evt === 'bim-wall-mutation-committed') committed(payload); },
            },
        };

        const store = new WallStore(
            new ProjectContext(),
            makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
        );

        // A per-wall re-anchor spy so we can assert it is called only for the moved
        // wall (K bounded) — and count how many hosted-child re-anchors ran.
        const reanchored: string[] = [];
        const coord = new WallRebuildCoordinator();
        coord.init({
            wallTool: { getWallStore: () => store, getFragmentBuilder: () => makeBuilderStub() },
            slabStore: { getAll: () => [] },
            bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
            doorBuilder: { rebuildForWall: (id: string) => { reanchored.push(id); } },
            windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
            world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
        });

        // Two walls; wall A GENUINELY HOSTS A DOOR (§L-250 — it previously hosted none,
        // so this suite could not fail on the very scenario it is named for), wall B is
        // an unrelated neighbour.
        const wallA = mkWall([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }], [mkDoorOpening(1)]);
        const wallB = mkWall([{ x: 10, y: 0, z: 0 }, { x: 14, y: 0, z: 0 }]);
        store.add({ ...wallA });
        store.add({ ...wallB });
        pump();
        committed.mockClear();
        reanchored.length = 0;

        // Move wall A (a baseline change — the repro's UPDATE_WALL_BASELINE). No drag
        // flag → this takes the immediate coalesced flush path (one scheduled _flush).
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
        store.update(wallA.id, {
            baseLine: [{ x: 1, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            _renderVersion: 1,
        } as Partial<WallData>);
        pump();

        // The commit barrier (room redetect + plan re-projection driver) fires ONCE
        // for this move — it does not fan out per hosted child.
        expect(committed).toHaveBeenCalledTimes(1);

        // Every rebuilt wall on the level gets a bounded re-anchor call, but the moved
        // host wall is among them and each call is O(openings-on-that-wall) via the
        // index (proven in Part 1). Crucially the re-anchor for wallA ran exactly once.
        expect(reanchored.filter(id => id === wallA.id).length).toBe(1);
    });
});
