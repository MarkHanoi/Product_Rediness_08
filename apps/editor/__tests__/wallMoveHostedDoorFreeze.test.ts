// @vitest-environment happy-dom
//
// §DIAG-L250-WALL-MOVE-HOSTED-DOOR — the founder's #1 open CRITICAL.
//
//   "A wall moved with a hosted door — FREEZES the app — everything gets stuck."
//
// Every prior investigation measured a PIECE of this in isolation and passed:
//   · WallJoinResolver.resolveLevel is a fixed point           (hostedDoorMoveNoHang, hostedDoorLengthEditNoHang)
//   · the rebuild is O(affected), not O(level)                 (WallMoveRebuildCost.measure)
//   · the flush no-progress guard terminates                   (wallFlushNoProgressGuard)
//   · the door re-anchor is O(K), not O(all doors)             (hostWallOpeningIndexFreeze)
//
// …and the founder still freezes. What NONE of them do is drive the REAL
// coordinator with a wall that ACTUALLY HOSTS A DOOR — every one of the
// coordinator-level suites builds its walls with `openings: []`. A wall with an
// empty opening list never enters `resolveOpeningRenderMap`, never takes the
// hole-extrude branch, and — critically — never exercises the openings-membership
// leg of the delta classifier. That is the exact gap this suite closes.
//
// This suite therefore asserts TERMINATION and BOUNDEDNESS on the real object
// graph, for BOTH gestures the founder can perform:
//   (A) the drag-commit  — a rigid translation of the whole baseline
//   (B) the property-panel `Length` edit — ONE endpoint moved, start pinned
//       (PropertyPanelSections.ts:98-123: newEnd = start + dir × newLength)
//
// COUNTS, NOT MILLISECONDS. A wall-clock threshold reds on a busy CI box and gets
// ignored; and a cost test cannot see a hang at all. So the load-bearing assertion
// here is: the gesture SETTLES — after a bounded number of frames, no further flush
// is scheduled — and the number of builder invocations does not scale with the
// number of walls on the level.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { doorStore } from '@pryzm/geometry-door';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

const LEVEL_ID = 'L';

function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

interface Counters {
    buildWall: number;
    updateWall: number;
    removeWall: number;
    doorReanchor: number;
    committed: number;
    flushes: number;
}

// The builder stub MUST model the one property the L-234 incremental memo reads:
// `getWallRoot(id)` is TRUTHY once the builder owns a mesh for that wall.
//
//     const _clean = _incrementalRebuildOn()
//         && this._lastBuildKey.get(wallId) === _buildKey
//         && !!builder.getWallRoot(wallId);        // ← a stub returning undefined KILLS the memo
//
// A stub that returns `undefined` can never satisfy `_clean`, so the coordinator
// re-extrudes EVERY wall the resolver adjusted and the harness "measures" an
// O(level) rebuild the product does not actually perform. That is a harness
// artefact masquerading as a product defect — the exact class of false positive
// that has kept this ticket alive through five attempts. Model it honestly.
function makeBuilderStub(c: Counters) {
    const roots = new Map<string, object>();
    return {
        removeWall(id: string): void { c.removeWall++; roots.delete(id); },
        buildWall(w: WallData, _a: unknown, _r: unknown, _y: number): void { c.buildWall++; roots.set(w.id, { id: w.id }); },
        recordBuiltVersion(_id: string, _w: WallData, _a: unknown, _s: number): void { /* render seam */ },
        updateWall(w: WallData, _j: unknown, _r: unknown, _s: number): void { c.updateWall++; roots.set(w.id, { id: w.id }); },
        getWallRoot(id: string): unknown { return roots.get(id); },
        getWallStore() { return undefined; },
    };
}

const fakeScene = { add() { /* noop */ }, remove() { /* noop */ } };

type P3 = { x: number; y: number; z: number };

let _seq = 0;
function mkWall(bl: [P3, P3], openings: Array<{ id: string; elementId: string; type: string; offset: number; width: number; height: number; sillHeight: number }> = []): WallData {
    return {
        id: `w_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: openings.map(o => o.elementId),
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings,
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/**
 * A REALISTIC plate: a closed `rooms × rooms` grid of rectangular rooms on a 5 m
 * module. Every interior partition genuinely T- and X-junctions with its
 * neighbours (the topology the join resolver actually has to work at), and every
 * `doorEvery`-th wall HOSTS A REAL DOOR — both in `wall.openings` (what the
 * classifier, the render map and the hole-extrude read) and in the `doorStore`
 * (what `DoorBuilder.rebuildForWall` re-anchors). This is the fixture the prior
 * suites did not build.
 */
function buildPlate(store: WallStore, rooms: number, doorEvery: number): { wallIds: string[]; doorWallIds: string[] } {
    const M = 5;
    const segs: Array<[P3, P3]> = [];
    // Horizontal runs (constant z), one segment per module so junctions are real.
    for (let j = 0; j <= rooms; j++) {
        for (let i = 0; i < rooms; i++) {
            segs.push([{ x: i * M, y: 0, z: j * M }, { x: (i + 1) * M, y: 0, z: j * M }]);
        }
    }
    // Vertical runs (constant x).
    for (let i = 0; i <= rooms; i++) {
        for (let j = 0; j < rooms; j++) {
            segs.push([{ x: i * M, y: 0, z: j * M }, { x: i * M, y: 0, z: (j + 1) * M }]);
        }
    }

    const wallIds: string[] = [];
    const doorWallIds: string[] = [];
    segs.forEach((bl, idx) => {
        const hostsDoor = idx % doorEvery === 0;
        const wallId = `w_${_seq}`; // mkWall will consume this seq
        const openings = hostsDoor
            ? [{ id: `op_door_${idx}`, elementId: `door_${idx}`, type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 }]
            : [];
        const w = mkWall(bl, openings);
        expect(w.id).toBe(wallId);
        store.add({ ...w } as WallData);
        wallIds.push(w.id);
        if (hostsDoor) {
            doorWallIds.push(w.id);
            doorStore.add({
                id: `door_${idx}`,
                openingId: `op_door_${idx}`,
                wallId: w.id,
                offset: 2.0,
                width: 0.9,
                height: 2.1,
                sillHeight: 0,
            } as never);
        }
    });
    return { wallIds, doorWallIds };
}

/**
 * Zero EVERY counter. This exists as a named helper because forgetting ONE of them is
 * how this harness first "found" a doubled commit barrier that did not exist: the
 * initial plate build legitimately emits one `bim-wall-mutation-committed`, and a
 * per-gesture count that was never zeroed reads 1 + 1 = 2 and looks like a
 * door-conditional defect. Reset all, or measure nothing.
 */
function resetCounters(c: Counters): void {
    c.buildWall = 0; c.updateWall = 0; c.removeWall = 0;
    c.doorReanchor = 0; c.committed = 0; c.flushes = 0;
}

interface Harness {
    store: WallStore;
    coord: WallRebuildCoordinator;
    counters: Counters;
    adapter: FakeRafAdapter;
    /**
     * Pump frames ONE AT A TIME until the pipeline goes quiet (a full `quietFrames`
     * run with no flush) or `cap` frames elapse. Returns the frame index of the LAST
     * flush; `settled === false` means the gesture NEVER TERMINATED — the flush was
     * still re-arming when we gave up. THIS is the assertion a cost test cannot make.
     */
    pumpUntilQuiet(cap?: number, quietFrames?: number): { settled: boolean; frames: number; flushes: number };
}

function setup(rooms: number, doorEvery: number): Harness & { wallIds: string[]; doorWallIds: string[] } {
    const counters: Counters = { buildWall: 0, updateWall: 0, removeWall: 0, doorReanchor: 0, committed: 0, flushes: 0 };

    (window as unknown as { runtime?: unknown }).runtime = {
        events: {
            on: () => { /* view-activated — unused */ },
            emit: (e: string) => { if (e === 'bim-wall-mutation-committed') counters.committed++; },
        },
    };

    const adapter = new FakeRafAdapter();
    getFrameScheduler().start(adapter);

    const store = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );

    const coord = new WallRebuildCoordinator();
    // Count every ACTUAL drain of the coordinator's flush — the quantity the L-97
    // freeze narrative is written in ("the flush re-arms EVERY rAF frame and never
    // converges"). Patched on the instance, restored by the caller's afterEach.
    const proto = WallRebuildCoordinator.prototype as unknown as { _flush: () => void };
    const realFlush = proto._flush;
    (coord as unknown as { _flush: () => void })._flush = function patched(this: unknown) {
        counters.flushes++;
        return realFlush.call(this);
    };

    coord.init({
        wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
        slabStore: { getAll: () => [] },
        bimManager: { getLevelById: (_id: string) => ({ id: LEVEL_ID, elevation: 0 }) },
        doorBuilder: { rebuildForWall: (_id: string) => { counters.doorReanchor++; } },
        windowBuilder: { rebuildForWall: (_id: string) => { /* noop */ } },
        world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: fakeScene } },
    } as never);
    const builder = makeBuilderStub(counters);

    const { wallIds, doorWallIds } = buildPlate(store, rooms, doorEvery);

    const pumpUntilQuiet = (cap = 400, quietFrames = 6): { settled: boolean; frames: number; flushes: number } => {
        let quiet = 0;
        for (let f = 0; f < cap; f++) {
            const before = counters.flushes;
            adapter.pumpFrames(1);
            if (counters.flushes === before) {
                quiet++;
                if (quiet >= quietFrames) return { settled: true, frames: f + 1, flushes: counters.flushes };
            } else {
                quiet = 0;
            }
        }
        return { settled: false, frames: cap, flushes: counters.flushes };
    };

    return { store, coord, counters, adapter, pumpUntilQuiet, wallIds, doorWallIds };
}

/** The 3D-gizmo / MovePlanTool gesture: a RIGID TRANSLATION of the whole baseline. */
function dragCommit(store: WallStore, wallId: string, dx: number, dz: number): void {
    const w = store.getById(wallId)!;
    const bl = w.baseLine;
    const next: [P3, P3] = [
        { x: bl[0].x + dx, y: bl[0].y ?? 0, z: bl[0].z + dz },
        { x: bl[1].x + dx, y: bl[1].y ?? 0, z: bl[1].z + dz },
    ];
    // Exactly what UpdateWallBaselineCommand.execute() writes (:187-194).
    store.update(wallId, {
        baseLine: next,
        _renderVersion: ((w as unknown as { _renderVersion?: number })._renderVersion ?? 0) + 1,
        _sourceBaseLine: [{ ...next[0] }, { ...next[1] }],
    } as never);
}

/** The property-panel gesture: ONE endpoint moved, start pinned (PropertyPanelSections:98-123). */
function lengthEdit(store: WallStore, wallId: string, newLength: number): void {
    const w = store.getById(wallId)!;
    const bl = w.baseLine;
    const dx = bl[1].x - bl[0].x, dz = bl[1].z - bl[0].z;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const next: [P3, P3] = [
        { x: bl[0].x, y: bl[0].y ?? 0, z: bl[0].z },
        { x: bl[0].x + ux * newLength, y: bl[0].y ?? 0, z: bl[0].z + uz * newLength },
    ];
    store.update(wallId, {
        baseLine: next,
        _renderVersion: ((w as unknown as { _renderVersion?: number })._renderVersion ?? 0) + 1,
        _sourceBaseLine: [{ ...next[0] }, { ...next[1] }],
    } as never);
}

describe('§DIAG-L250 — moving a wall that HOSTS A DOOR must TERMINATE and stay bounded', () => {
    beforeEach(() => {
        _resetFrameSchedulerForTest();
        _seq = 0;
        doorStore.clear?.();
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
    });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        doorStore.clear?.();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    // ── (1) TERMINATION — the property the user actually cares about ──────────
    // A cost test cannot see a hang. These two can: they pump frames ONE AT A TIME and
    // only declare victory when the flush has stopped re-arming for six consecutive
    // frames. A non-terminating gesture exhausts the 400-frame cap and reds.
    it('TERMINATES: drag-commit of a door-bearing wall settles (the flush stops re-arming)', () => {
        const h = setup(3, 4);            // 3×3 rooms = 24 walls, every 4th hosts a door
        h.pumpUntilQuiet();               // drain the initial build
        resetCounters(h.counters);

        dragCommit(h.store, h.doorWallIds[0], 0.35, 0);
        const r = h.pumpUntilQuiet();

        // eslint-disable-next-line no-console
        console.log(`[L250] DRAG  door-wall: settled=${r.settled} frames=${r.frames} flushes=${r.flushes} ` +
            `buildWall=${h.counters.buildWall} updateWall=${h.counters.updateWall} doorReanchor=${h.counters.doorReanchor} committed=${h.counters.committed}`);

        expect(r.settled).toBe(true);
        // ONE gesture ⇒ ONE commit barrier. `bim-wall-mutation-committed` is what drives
        // room re-detection AND plan re-projection over the whole storey; a second emit
        // silently doubles that entire downstream cascade. Pin it at one.
        expect(h.counters.committed).toBe(1);
    });

    it('TERMINATES: property-panel Length edit of a door-bearing wall settles', () => {
        const h = setup(3, 4);
        h.pumpUntilQuiet();
        resetCounters(h.counters);

        lengthEdit(h.store, h.doorWallIds[0], 3.4);   // shrink 5.0 → 3.4: destroys a corner junction
        const r = h.pumpUntilQuiet();

        // eslint-disable-next-line no-console
        console.log(`[L250] LEN   door-wall: settled=${r.settled} frames=${r.frames} flushes=${r.flushes} ` +
            `buildWall=${h.counters.buildWall} updateWall=${h.counters.updateWall} doorReanchor=${h.counters.doorReanchor} committed=${h.counters.committed}`);

        expect(r.settled).toBe(true);
        expect(h.counters.committed).toBe(1);
    });

    // ── (2) BLAST RADIUS — bounded, and INDEPENDENT of the level's element count ──
    // This is the assertion that would catch case (b): a BOUNDED-BUT-ENORMOUS rebuild
    // (a whole-level re-extrude per hosted opening). It is stated in COUNTS, and — the
    // load-bearing part — as INDEPENDENCE FROM LEVEL SIZE, so it cannot be satisfied by
    // a level that merely happens to be small.
    it('BOUNDED: the builder work for one door-wall move does not scale with the level size', () => {
        const small = setup(2, 3);         // 12 walls
        small.pumpUntilQuiet();
        resetCounters(small.counters);
        dragCommit(small.store, small.doorWallIds[0], 0.35, 0);
        const rs = small.pumpUntilQuiet();
        const smallBuilds = small.counters.buildWall + small.counters.updateWall;
        const smallWalls = small.wallIds.length;

        _resetFrameSchedulerForTest();
        doorStore.clear?.();
        _seq = 0;

        const big = setup(6, 3);           // 84 walls — 7× the plate
        big.pumpUntilQuiet();
        resetCounters(big.counters);
        dragCommit(big.store, big.doorWallIds[0], 0.35, 0);
        const rb = big.pumpUntilQuiet();
        const bigBuilds = big.counters.buildWall + big.counters.updateWall;
        const bigWalls = big.wallIds.length;

        // eslint-disable-next-line no-console
        console.log(`[L250] BLAST small: walls=${smallWalls} settled=${rs.settled} flushes=${rs.flushes} builds=${smallBuilds} doorReanchor=${small.counters.doorReanchor} committed=${small.counters.committed}`);
        // eslint-disable-next-line no-console
        console.log(`[L250] BLAST big:   walls=${bigWalls} settled=${rb.settled} flushes=${rb.flushes} builds=${bigBuilds} doorReanchor=${big.counters.doorReanchor} committed=${big.counters.committed}`);

        expect(rs.settled).toBe(true);
        expect(rb.settled).toBe(true);

        // The plate grew 7×. The work for ONE wall move must NOT grow with it.
        // Stated as independence, not as a magic constant: the big plate may not cost
        // more than the small one by more than a small additive slack (junction
        // neighbours), and certainly not proportionally.
        expect(bigBuilds).toBeLessThanOrEqual(smallBuilds + 2);
        expect(bigBuilds).toBeLessThan(bigWalls / 4);

        // Same for the hosted-child re-anchor: O(walls actually rebuilt), not O(level).
        expect(big.counters.doorReanchor).toBeLessThanOrEqual(small.counters.doorReanchor + 2);

        // And one gesture is still one downstream cascade on the big plate.
        expect(rb.flushes).toBe(1);
        expect(big.counters.committed).toBe(1);
    });

    // ── (3) THE GUARD ABOVE CAN ACTUALLY FAIL ─────────────────────────────────
    // A guard that cannot fail is not a guard (Lesson L-J). The blast-radius test only
    // means something if an O(level) rebuild would RED it. The coordinator ships a
    // documented escape hatch — `__pryzmWallIncrementalRebuild = false` (:210-213) —
    // that restores the pre-L-234 UNCONDITIONAL `buildWall` for every wall the resolver
    // adjusted. That is precisely case (b): a bounded-but-enormous whole-level rebuild.
    //
    // Turning it off here re-creates the defect on demand and shows the numbers the
    // guard is watching for. This pins the BEFORE column so the O(level) cliff can never
    // silently return, and proves the AFTER column is not vacuously green.
    it('RED-FIRST: with the incremental gate OFF the rebuild IS O(level) — so the guard has teeth', () => {
        const g = globalThis as unknown as { __pryzmWallIncrementalRebuild?: boolean };
        g.__pryzmWallIncrementalRebuild = false;
        try {
            const h = setup(6, 3);          // 84 walls
            h.pumpUntilQuiet();
            resetCounters(h.counters);
            dragCommit(h.store, h.doorWallIds[0], 0.35, 0);
            const r = h.pumpUntilQuiet();
            const builds = h.counters.buildWall + h.counters.updateWall;

            // eslint-disable-next-line no-console
            console.log(`[L250] RED-FIRST (gate OFF): walls=${h.wallIds.length} settled=${r.settled} flushes=${r.flushes} builds=${builds} doorReanchor=${h.counters.doorReanchor}`);

            // The cliff: one wall move re-extrudes ~every wall on the plate.
            expect(builds).toBeGreaterThan(h.wallIds.length / 2);
            // …and it would BREAK the bound the guard above asserts — which is the point.
            expect(builds).toBeGreaterThan(1 + 2);
            // Note it STILL terminates. Case (b) is slow, not hung — which is exactly why
            // a termination test alone could never have found it, and why both assertions exist.
            expect(r.settled).toBe(true);
        } finally {
            delete g.__pryzmWallIncrementalRebuild;
        }
    });
});
