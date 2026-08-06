// @vitest-environment happy-dom
//
// §FIX-HOSTWALL-CASCADE-SET-REENTRANCY — the founder's "create a wall → place a
// door on it → MOVE the wall → the whole screen freezes" (issue-log lineage
// L-01 → L-97 → L-234 → L-250, ADR-0099).
//
// WHAT EVERY PRIOR SUITE MISSED. All of them measured the wall pipeline:
//   · WallJoinResolver.hostedDoorMoveNoHang / hostedDoorLengthEditNoHang — the resolver converges
//   · WallMoveRebuildCost.measure                                        — the rebuild is O(affected)
//   · wallFlushNoProgressGuard / hostWallOpeningIndexFreeze              — the flush terminates, the re-anchor is O(K)
//   · wallMoveHostedDoorFreeze                                           — the real coordinator settles
// …and the founder still froze, because the hang is NOT in the wall pipeline.
// It is in the C15 wall→opening CASCADE, and NO suite ever put
// `DoorDependencyTracker` / `WindowDependencyTracker` in the object graph.
//
// THE MECHANISM (proven, see the note in DoorDependencyTracker):
//   wallStore.update(baseLine)                        ← inside UpdateWallBaselineCommand.execute()
//     └─ synchronous listener fan-out
//        └─ DoorDependencyTracker wall subscriber
//           └─ for (const doorId of ids)              ← `ids` is the LIVE index Set
//              └─ doorStore.touch(doorId)             ← synchronous re-emit
//                 └─ DoorDependencyTracker door subscriber → register()
//                    └─ set.delete(doorId); bucket.add(doorId)
//   Deleting and re-adding an element of a Set DURING a `for…of` over that Set
//   re-appends it, so the iterator visits it again — forever. One hosted door is
//   enough. A BARE wall never enters the loop (`ids` is empty) — which is exactly
//   why the freeze is hosted-opening-specific.
//
// The hang is synchronous, so it blocks the JS thread entirely: vitest's
// testTimeout cannot interrupt it and the process just stops. A test that merely
// "moves a wall and asserts" would therefore HANG rather than FAIL. So the guard
// below COUNTS the cascade emissions and, on exceeding what a correct cascade can
// possibly produce, DISPOSES the trackers — which removes the listener that keeps
// re-appending to the Set under iteration, letting the runaway loop finish. The
// regression then surfaces as a clean `tripped === true` assertion failure that
// can never be mistaken for an infrastructure stall.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import type { WallData, Level } from '@pryzm/geometry-wall';
import { doorStore, DoorDependencyTracker } from '@pryzm/geometry-door';
import { windowStore, WindowDependencyTracker } from '@pryzm/geometry-window';
import { ProjectContext } from '@pryzm/core-app-model';
import { _resetFrameSchedulerForTest, getFrameScheduler, FakeRafAdapter } from '@pryzm/frame-scheduler';
import { WallRebuildCoordinator } from '../src/engine/WallRebuildCoordinator';

const LEVEL_ID = 'L';
type P3 = { x: number; y: number; z: number };

function makeLevelProvider() {
    const level: Level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string): Level | undefined => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: (): Level[] => [{ ...level }],
    };
}

/** The resolved layer stack a chokepoint-created wall carries today (L-239). */
const LAYERS = [
    { name: 'Render',       thickness: 0.015, function: 'finish-exterior' },
    { name: 'Blockwork',    thickness: 0.100, function: 'structure' },
    { name: 'Insulation',   thickness: 0.050, function: 'insulation' },
    { name: 'Plasterboard', thickness: 0.015, function: 'finish-interior' },
];

let _seq = 0;

interface OpeningRec {
    id: string; elementId: string; type: string;
    offset: number; width: number; height: number; sillHeight: number;
}

function mkWall(bl: [P3, P3], openings: OpeningRec[] = [], layered = true): WallData {
    return {
        id: `w_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: openings.map(o => o.elementId),
        baseLine: [{ ...bl[0] }, { ...bl[1] }],
        height: 3,
        thickness: 0.18,
        baseOffset: 0,
        openings,
        ...(layered ? { layers: LAYERS.map(l => ({ ...l })) } : {}),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as unknown as WallData;
}

/**
 * A closed `rooms × rooms` plate on a 5 m module, rotated by `tiltRad` so no wall
 * is exactly axis-aligned — the founder's gizmo log reports the moved wall's
 * direction as `x:-0.9997 z:0.0244` (≈1.4°), and a termination argument that only
 * holds on a perfectly orthogonal plate is not an argument about his model.
 */
function buildPlate(store: WallStore, rooms: number, tiltRad: number) {
    const M = 5;
    const cos = Math.cos(tiltRad), sin = Math.sin(tiltRad);
    const rot = (x: number, z: number): P3 => ({ x: x * cos - z * sin, y: 0, z: x * sin + z * cos });

    const segs: Array<[P3, P3]> = [];
    for (let j = 0; j <= rooms; j++) for (let i = 0; i < rooms; i++) segs.push([rot(i * M, j * M), rot((i + 1) * M, j * M)]);
    for (let i = 0; i <= rooms; i++) for (let j = 0; j < rooms; j++) segs.push([rot(i * M, j * M), rot(i * M, (j + 1) * M)]);

    const wallIds: string[] = [];
    const doorWallIds: string[] = [];
    const windowWallIds: string[] = [];

    segs.forEach((bl, idx) => {
        const hosts = idx % 4 === 0;
        const isWindow = hosts && idx % 8 === 0;
        const openings: OpeningRec[] = hosts
            ? [{
                id: `op_${idx}`,
                elementId: isWindow ? `win_${idx}` : `door_${idx}`,
                type: isWindow ? 'window' : 'door',
                offset: 2.0, width: 0.9,
                height: isWindow ? 1.2 : 2.1,
                sillHeight: isWindow ? 0.9 : 0,
            }]
            : [];
        const w = mkWall(bl, openings);
        store.add({ ...w } as WallData);
        wallIds.push(w.id);
        if (hosts) {
            if (isWindow) {
                windowWallIds.push(w.id);
                windowStore.add({ id: `win_${idx}`, openingId: `op_${idx}`, wallId: w.id, offset: 2.0, width: 0.9, height: 1.2, sillHeight: 0.9 } as never);
            } else {
                doorWallIds.push(w.id);
                doorStore.add({ id: `door_${idx}`, openingId: `op_${idx}`, wallId: w.id, offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 } as never);
            }
        }
    });

    return { wallIds, doorWallIds, windowWallIds };
}

/**
 * THE TRIP-WIRE — and it must do more than count.
 *
 * A correct wall→opening cascade emits ONE opening 'update' per hosted opening
 * per wall geometry change; the re-entrancy bug emits them without bound, on the
 * JS thread, so no test timeout can interrupt it. Throwing from a listener does
 * not help either — `DoorStore.notify` / `WindowStore.notify` CATCH listener
 * errors by design.
 *
 * So on tripping we DISPOSE the trackers. That unsubscribes the tracker's own
 * opening-store listener, which is the thing re-adding the id to the Set being
 * iterated; without it the next `touch()` mutates nothing and the runaway
 * `for…of` reaches its end. The hang therefore becomes a bounded, ordinary
 * assertion failure (`tripped === true`) instead of a stalled worker.
 */
function armCascadeTripWire(cap: number, trackers: Array<{ dispose(): void }>) {
    const counts = { door: 0, window: 0 };
    const state = { tripped: false };
    const trip = (): void => {
        if (state.tripped) return;
        state.tripped = true;
        for (const t of trackers) { try { t.dispose(); } catch { /* noop */ } }
    };
    const unsubD = doorStore.subscribe((ev: string) => {
        if (ev === 'update' && ++counts.door > cap) trip();
    });
    const unsubW = windowStore.subscribe((ev: string) => {
        if (ev === 'update' && ++counts.window > cap) trip();
    });
    return { counts, state, dispose: () => { unsubD?.(); unsubW?.(); } };
}

function setup(rooms: number, tiltRad: number) {
    const counters = { flushes: 0, builds: 0, committed: 0, doorRebuilds: 0, windowRebuilds: 0 };
    // Which wall ids the coordinator asked the opening builders to re-anchor. The
    // §HEAVY-LEVEL guard below asserts this is the MOVED wall only — the property that
    // makes the cascade O(edited walls), not O(level).
    const reanchored: string[] = [];

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

    const roots = new Map<string, object>();
    const builder = {
        removeWall(id: string): void { roots.delete(id); },
        buildWall(w: WallData): void { counters.builds++; roots.set(w.id, { id: w.id }); },
        recordBuiltVersion(): void { /* render seam */ },
        updateWall(w: WallData): void { counters.builds++; roots.set(w.id, { id: w.id }); },
        getWallRoot(id: string): unknown { return roots.get(id); },
        getWallStore() { return undefined; },
    };

    const coord = new WallRebuildCoordinator();
    const realFlush = (WallRebuildCoordinator.prototype as unknown as { _flush: () => void })._flush;
    (coord as unknown as { _flush: () => void })._flush = function patched(this: unknown) {
        counters.flushes++;
        return realFlush.call(this);
    };
    coord.init({
        wallTool: { getWallStore: () => store, getFragmentBuilder: () => builder },
        slabStore: { getAll: () => [] },
        bimManager: { getLevelById: () => ({ id: LEVEL_ID, elevation: 0 }) },
        doorBuilder: { rebuildForWall: (id: string) => { counters.doorRebuilds++; reanchored.push(id); } },
        windowBuilder: { rebuildForWall: () => { counters.windowRebuilds++; } },
        world: { camera: { three: null }, renderer: { three: { domElement: undefined } }, scene: { three: { add() {}, remove() {} } } },
    } as never);

    // ── The C15 cascade — in the object graph for the first time. ────────────
    const doorTracker = new DoorDependencyTracker({ current: undefined }, store as never);
    doorTracker.bootstrap();
    const windowTracker = new WindowDependencyTracker({ current: undefined } as never, store as never);

    const plate = buildPlate(store, rooms, tiltRad);
    windowTracker.bootstrap();

    const pumpUntilQuiet = (cap = 120, quietFrames = 6) => {
        let quiet = 0;
        for (let f = 0; f < cap; f++) {
            const before = counters.flushes;
            adapter.pumpFrames(1);
            if (counters.flushes === before) { quiet++; if (quiet >= quietFrames) return { settled: true, frames: f + 1 }; }
            else quiet = 0;
        }
        return { settled: false, frames: cap };
    };

    const trackers = [doorTracker, windowTracker];
    const dispose = (): void => {
        doorTracker.dispose();
        windowTracker.dispose();
    };

    return { store, coord, counters, adapter, pumpUntilQuiet, dispose, trackers, reanchored, ...plate };
}

/** The 3D-gizmo drag-commit: exactly what UpdateWallBaselineCommand.execute() writes. */
function dragCommit(store: WallStore, wallId: string, dx: number, dz: number): void {
    const w = store.getById(wallId)!;
    const bl = w.baseLine;
    const next: [P3, P3] = [
        { x: bl[0].x + dx, y: bl[0].y ?? 0, z: bl[0].z + dz },
        { x: bl[1].x + dx, y: bl[1].y ?? 0, z: bl[1].z + dz },
    ];
    store.update(wallId, {
        baseLine: next,
        _renderVersion: ((w as unknown as { _renderVersion?: number })._renderVersion ?? 0) + 1,
        _sourceBaseLine: [{ ...next[0] }, { ...next[1] }],
    } as never);
}

const TILT = 0.0244;   // ≈1.4° — the founder's `x:-0.9997 z:0.0244` regime.

describe('§FIX-HOSTWALL-CASCADE-SET-REENTRANCY — moving a wall that hosts an opening must not hang', () => {
    beforeEach(() => {
        _resetFrameSchedulerForTest();
        _seq = 0;
        doorStore.clear?.();
        windowStore.clear?.();
        (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = false;
    });
    afterEach(() => {
        _resetFrameSchedulerForTest();
        doorStore.clear?.();
        windowStore.clear?.();
        delete (window as unknown as { __wallRebuildControl?: unknown }).__wallRebuildControl;
        delete (window as unknown as { __engineTeardown?: unknown }).__engineTeardown;
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    // ── (1) THE ROOT CAUSE, ISOLATED ──────────────────────────────────────────
    // No coordinator, no frame scheduler, no builder — just the wall store, one
    // wall, one hosted door and the tracker. This is the smallest object graph
    // that reproduces the founder's freeze, and pre-fix it never returns.
    it('the wall→door cascade emits exactly ONE touch per hosted door (pre-fix: unbounded)', () => {
        const store = new WallStore(
            new ProjectContext(),
            makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
        );
        const tracker = new DoorDependencyTracker({ current: undefined }, store as never);

        const op: OpeningRec = { id: 'op_1', elementId: 'door_1', type: 'door', offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 };
        const wall = mkWall([{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0.122 }], [op]);
        store.add({ ...wall } as WallData);
        doorStore.add({ id: 'door_1', openingId: 'op_1', wallId: wall.id, offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 } as never);
        tracker.bootstrap();

        const trip = armCascadeTripWire(8, [tracker]);

        const bl = store.getById(wall.id)!.baseLine;
        store.update(wall.id, {
            baseLine: [
                { x: bl[0].x + 0.35, y: bl[0].y ?? 0, z: bl[0].z },
                { x: bl[1].x + 0.35, y: bl[1].y ?? 0, z: bl[1].z },
            ],
        } as never);

        // ONE hosted door, ONE geometry change ⇒ EXACTLY one re-anchor emission.
        expect(trip.state.tripped).toBe(false);
        expect(trip.counts.door).toBe(1);

        // …and the index is still exact afterwards (the early-return in register()
        // must not silently stop maintaining the graph).
        expect(tracker.getDoorIdsForWall(wall.id)).toEqual(['door_1']);

        trip.dispose();
        tracker.dispose();
    });

    // §FIX-HOSTWALL-TRACKER-REHOME-SEMANTICS — this test previously asserted that
    // `doorStore.update('d1', { wallId: 'wallB' })` re-homes the door, and it FAILED on
    // main: `DoorStore.update()` (and its `WindowStore` twin) pin identity —
    //     merged = { ...existing, ...patch, id, wallId, openingId }  ← from `existing`
    // — so a `wallId` in the patch is silently discarded. That pinning is CORRECT under
    // C15: a hosted element is "fully owned by a single wall" (§1) and re-hosting has to
    // rewrite BOTH walls' `openings[]` + `childrenIds` atomically (§6), which only the
    // Remove/Add command pair can express (§8). A merge-patch cannot. The old test was
    // asserting behaviour the contract forbids, so it could never have gone green.
    //
    // What the tracker's re-home path must actually survive is therefore tested here:
    // (a) `update()` provably CANNOT move a door between hosts, and (b) the real
    // re-home channel — remove-then-add — moves it exactly, leaving no stale bucket.
    it('a door cannot be re-homed by update() (C15 identity pinning) and IS re-homed by remove+add', () => {
        const store = new WallStore(
            new ProjectContext(),
            makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
        );
        const tracker = new DoorDependencyTracker({ current: undefined }, store as never);

        doorStore.add({ id: 'd1', openingId: 'o1', wallId: 'wallA', offset: 1, width: 0.9, height: 2.1, sillHeight: 0 } as never);
        expect(tracker.getDoorIdsForWall('wallA')).toEqual(['d1']);

        // (a) Identity pinning — the patch is discarded by the STORE, so the tracker
        // (which only ever sees the post-merge record) correctly keeps d1 on wallA.
        doorStore.update('d1', { wallId: 'wallB' } as never);
        expect(doorStore.getById('d1')!.wallId).toBe('wallA');
        expect(tracker.getDoorIdsForWall('wallA')).toEqual(['d1']);
        expect(tracker.getDoorIdsForWall('wallB')).toEqual([]);

        // (b) The real re-home channel (RemoveDoorCommand + AddDoorCommand, C15 §8).
        doorStore.remove('d1');
        expect(tracker.getDoorIdsForWall('wallA')).toEqual([]);
        doorStore.add({ id: 'd1', openingId: 'o1', wallId: 'wallB', offset: 1, width: 0.9, height: 2.1, sillHeight: 0 } as never);
        expect(tracker.getDoorIdsForWall('wallA')).toEqual([]);   // no stale bucket entry
        expect(tracker.getDoorIdsForWall('wallB')).toEqual(['d1']);

        tracker.dispose();
    });

    // §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — the tracker's own `wallId → Set<id>` index
    // was maintained by SCANNING EVERY BUCKET on each register/unregister
    // (`for (const set of this.graph.values()) set.delete(id)`). That is O(walls) per
    // opening, so `bootstrap()` and the project-teardown `clear()` cascade were
    // O(openings × walls) — measured on this harness pre-fix at 44.65 ms for 2000 doors
    // and 213.97 ms for 4000 (4.8× for a 2× input: quadratic, on the main thread).
    // The fix adds an `id → wallId` pointer so both are O(1).
    //
    // The guard is deliberately NOT a wall-clock assertion — a post-fix bootstrap is
    // sub-millisecond, so a timing ratio would be pure noise. It COUNTS the work
    // instead, by instrumenting `Set.prototype.delete` for the duration of the call.
    // That is exactly the operation the removed bucket scan performed, so the count is
    // a direct, deterministic measurement of the algorithm: N per opening pre-fix
    // (≈N²/2 total), ZERO for a fresh bootstrap post-fix.
    it('index maintenance is LINEAR in the opening count (pre-fix: quadratic bucket scan)', () => {
        const store = new WallStore(
            new ProjectContext(),
            makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
        );

        const N = 800;                 // pre-fix this is ~320 000 Set.delete calls
        doorStore.clear();
        for (let i = 0; i < N; i++) {
            doorStore.add({ id: `d${i}`, openingId: `o${i}`, wallId: `w${i}`, offset: 1, width: 0.9, height: 2.1, sillHeight: 0 } as never);
        }

        const tracker = new DoorDependencyTracker({ current: undefined }, store as never);

        const realDelete = Set.prototype.delete;
        let deletes = 0;
        // Deliberate, scoped builtin patch — restored in the `finally` below.
        Set.prototype.delete = function counted(this: Set<unknown>, v: unknown) { deletes++; return realDelete.call(this, v); };
        const t0 = performance.now();
        try { tracker.bootstrap(); }
        finally { Set.prototype.delete = realDelete; }
        const elapsed = performance.now() - t0;

        // eslint-disable-next-line no-console
        console.log(`[TRACKER-INDEX] bootstrap doors=${N} setDeletes=${deletes} elapsedMs=${elapsed.toFixed(2)} (pre-fix ≈${(N * (N - 1)) / 2})`);

        // O(1) per registration ⇒ the total must stay proportional to N, never N².
        expect(deletes).toBeLessThan(2 * N);
        // …and the index it produced is still EXACT (the fast path must not skip work).
        expect(tracker.getDoorIdsForWall('w0')).toEqual(['d0']);
        expect(tracker.getDoorIdsForWall(`w${N - 1}`)).toEqual([`d${N - 1}`]);

        tracker.dispose();
        doorStore.clear();
    });

    // ── (2) THE FOUNDER'S GESTURE, END TO END ─────────────────────────────────
    it('TERMINATES: dragging a layered, near-axis, door-bearing wall settles and the opening survives', () => {
        const h = setup(3, TILT);          // 24 walls, 1-in-4 hosts a door or window
        h.pumpUntilQuiet();                // drain the initial build

        const trip = armCascadeTripWire(64, h.trackers);
        h.counters.flushes = 0; h.counters.builds = 0; h.counters.committed = 0;

        const wallId = h.doorWallIds[0]!;
        const opBefore = h.store.getById(wallId)!.openings![0]!;

        dragCommit(h.store, wallId, 0.35, 0);
        const r = h.pumpUntilQuiet();

        // eslint-disable-next-line no-console
        console.log(`[CASCADE] drag: settled=${r.settled} frames=${r.frames} flushes=${h.counters.flushes} ` +
            `builds=${h.counters.builds} committed=${h.counters.committed} doorTouches=${trip.counts.door}`);

        expect(trip.state.tripped).toBe(false);
        expect(r.settled).toBe(true);
        expect(h.counters.committed).toBe(1);

        // C15: the hosted opening survives the host move — same id, same offset.
        const after = h.store.getById(wallId)!;
        expect(after.openings).toHaveLength(1);
        expect(after.openings![0]!.id).toBe(opBefore.id);
        expect(after.openings![0]!.elementId).toBe(opBefore.elementId);
        expect(after.openings![0]!.offset).toBeCloseTo(opBefore.offset, 9);
        expect(doorStore.getById(opBefore.elementId!)).toBeDefined();

        trip.dispose();
        h.dispose();
    });

    it('TERMINATES: the same gesture on a WINDOW-bearing wall (the twin tracker)', () => {
        const h = setup(3, TILT);
        h.pumpUntilQuiet();

        const trip = armCascadeTripWire(64, h.trackers);
        h.counters.flushes = 0; h.counters.committed = 0;

        const wallId = h.windowWallIds[0]!;
        const opBefore = h.store.getById(wallId)!.openings![0]!;

        dragCommit(h.store, wallId, 0, 0.35);
        const r = h.pumpUntilQuiet();

        // eslint-disable-next-line no-console
        console.log(`[CASCADE] window drag: settled=${r.settled} frames=${r.frames} flushes=${h.counters.flushes} ` +
            `windowTouches=${trip.counts.window}`);

        expect(trip.state.tripped).toBe(false);
        expect(r.settled).toBe(true);
        expect(h.counters.committed).toBe(1);

        const after = h.store.getById(wallId)!;
        expect(after.openings).toHaveLength(1);
        expect(after.openings![0]!.id).toBe(opBefore.id);
        expect(after.openings![0]!.offset).toBeCloseTo(opBefore.offset, 9);
        expect(windowStore.getById(opBefore.elementId!)).toBeDefined();

        trip.dispose();
        h.dispose();
    });

    // ── (3) §HEAVY-LEVEL-BOUNDED-CASCADE ──────────────────────────────────────
    // The two gestures above each move a wall hosting ONE opening on a 24-wall
    // plate. That proves TERMINATION, but not BOUNDEDNESS: a cascade that is
    // O(level × openings) also terminates — it just freezes a real model. This
    // test moves ONE wall carrying SIX openings on a ~220-wall level and pins the
    // three quantities that a re-introduced storm would blow up:
    //
    //   · opening touches   — must be exactly the 6 openings on the MOVED wall
    //                          (K, not all openings on the level)
    //   · builder re-anchor — the MOVED wall plus its immediate adjacency, each
    //                          visited AT MOST ONCE. MEASURED: 5 walls out of 220
    //                          (§PERF-WALL-MOVE-INCREMENTAL-REBUILD / L-234 keeps the
    //                          rebuild off the whole level; the neighbours are there
    //                          because their MITRES change when the wall moves, which
    //                          is required, not waste). Pre-§FIX-HOSTWALL-DOOR-INDEX
    //                          each of those calls additionally ran a full-project door
    //                          scan, so the cost was 5 × 32 rather than 5 × K.
    //   · commit barriers   — exactly ONE per drag (ADR-061 coalescing)
    //
    // The touch and commit counts are exact equalities. The re-anchor count is
    // asserted as "a bounded neighbourhood, no wall twice, and far below the level" —
    // an exact number there would encode the join resolver's adjacency rule into a
    // cascade test, which is not this test's subject.
    it('BOUNDED: one wall with SIX openings on a heavy level costs O(K), not O(level)', () => {
        const h = setup(10, TILT);                        // 220 walls, ~55 hosting an opening
        h.pumpUntilQuiet();

        const levelWallCount = h.wallIds.length;
        const totalDoorsOnLevel = doorStore.getAll().length;
        expect(levelWallCount).toBeGreaterThan(200);       // genuinely heavy
        expect(totalDoorsOnLevel).toBeGreaterThan(20);     // many doors NOT on the moved wall

        // Load the moved wall up with six openings — the founder's real case is a
        // façade wall with a door and a run of windows, not a single opening.
        // NOTE: they go in through `addOpening`, not a `update({ openings })` patch —
        // C15 §6 requires `openings[*].elementId` and `childrenIds` to move in ONE
        // atomic store transaction, and `WallStore.update()` rejects a direct openings
        // patch precisely to enforce that. (Writing this test the wrong way is how the
        // §WALL-AUDIT-2026-M8 assertion earns its keep.)
        const wallId = h.doorWallIds[0]!;
        const base = h.store.getById(wallId)!;
        const seed = base.openings![0]!;                   // the plate's own door — keep it
        const SIX: OpeningRec[] = [seed as OpeningRec];
        for (let i = 1; i < 6; i++) {
            const rec: OpeningRec = { id: `heavy_op_${i}`, elementId: `heavy_door_${i}`, type: 'door', offset: 0.3 + i * 0.6, width: 0.4, height: 2.1, sillHeight: 0 };
            SIX.push(rec);
            h.store.addOpening(wallId, rec as never);
            doorStore.add({ id: rec.elementId, openingId: rec.id, wallId, offset: rec.offset, width: rec.width, height: rec.height, sillHeight: 0 } as never);
        }
        h.pumpUntilQuiet();                                // drain the opening-add work

        // ── measure the MOVE only ────────────────────────────────────────────
        const trip = armCascadeTripWire(64, h.trackers);
        h.counters.flushes = 0; h.counters.committed = 0; h.counters.doorRebuilds = 0;
        h.reanchored.length = 0;

        dragCommit(h.store, wallId, 0.35, 0.11);
        const r = h.pumpUntilQuiet();

        const uniqueReanchored = new Set(h.reanchored);
        // eslint-disable-next-line no-console
        console.log(`[HEAVY] levelWalls=${levelWallCount} doorsOnLevel=${doorStore.getAll().length} openingsOnMovedWall=6 → ` +
            `settled=${r.settled} flushes=${h.counters.flushes} committed=${h.counters.committed} ` +
            `doorTouches=${trip.counts.door} doorRebuildForWall=${h.counters.doorRebuilds} uniqueWallsReanchored=${uniqueReanchored.size}`);

        expect(trip.state.tripped).toBe(false);
        expect(r.settled).toBe(true);

        // ONE commit barrier for the whole gesture (room redetect + plan re-projection).
        expect(h.counters.committed).toBe(1);

        // The cascade touched exactly the SIX openings hosted on the moved wall —
        // not the ~25 other doors on the level, and not one of them repeatedly.
        expect(trip.counts.door).toBe(6);

        // The re-anchor set is a bounded NEIGHBOURHOOD around the moved wall — it must
        // contain the moved wall, must never revisit a wall, and must stay a small
        // fraction of the level. This is the assertion that would have caught the
        // original O(walls-rebuilt × all-openings) storm.
        expect(uniqueReanchored.has(wallId)).toBe(true);
        expect(h.counters.doorRebuilds).toBe(uniqueReanchored.size);   // no wall visited twice
        expect(uniqueReanchored.size).toBeLessThanOrEqual(12);         // measured 5
        expect(uniqueReanchored.size).toBeLessThan(levelWallCount / 10);

        // C15 §2 — all six openings survive the host move with their offsets intact.
        const after = h.store.getById(wallId)!;
        expect(after.openings).toHaveLength(6);
        for (let i = 0; i < 6; i++) {
            expect(after.openings![i]!.elementId).toBe(SIX[i]!.elementId);
            expect(after.openings![i]!.offset).toBeCloseTo(SIX[i]!.offset, 9);
            expect(doorStore.getById(SIX[i]!.elementId)).toBeDefined();
        }
        // …and the wall genuinely moved (the guard is not passing on a no-op).
        expect(after.baseLine[0].x).not.toBeCloseTo(base.baseLine[0].x, 6);

        trip.dispose();
        h.dispose();
    });
});
