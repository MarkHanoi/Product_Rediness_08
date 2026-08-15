/**
 * §DIAG-WALL-MOVE-REBUILD-COST → §PERF-WALL-MOVE-INCREMENTAL-REBUILD — L-234.
 *
 * ── STATUS: the cliff this suite MEASURED is now FIXED. ───────────────────────
 * The suite is now a BEFORE/AFTER instrument: `measureMove(n, doors, incremental)`
 * replays the coordinator flush with the incremental build gate OFF (the pre-fix
 * unconditional `buildWall` at :1543) and ON, on the same real store / real command
 * / real `resolveLevel` / real `WallFragmentBuilder`, and asserts BOTH columns —
 * the old O(level) cliff stays pinned as the BEFORE column (it can never silently
 * come back) and the new O(affected) behaviour is asserted as the AFTER column.
 * The original diagnostic narrative follows unchanged.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The founder's recurrent report: "moving a wall with a hosted door FREEZES the
 * project, but the logs don't say much." Phase 1 refuted every infinite-loop
 * hypothesis from source (see WallJoinResolver.hostedDoorMoveNoHang.test.ts):
 * `resolveLevel` terminates, stays finite, and is a fixed point on the exact
 * hosted-door move. So the freeze is not a loop.
 *
 * The reframed hypothesis this suite MEASURES: a **perf cliff**. A gizmo wall move
 * is a BASELINE change, and ADR-057's openings-only fast path
 * (`WallDeltaClassifier.classifyWallDelta`) admits a batch only when
 * `joinGeometryChanged()` is FALSE for every entry — i.e. only when no baseline
 * moved. A move therefore ALWAYS classifies `whole-level`, and the whole-level
 * branch of `WallRebuildCoordinator._flush` runs, per affected level:
 *
 *     const levelWalls  = store.getAll().filter(w => w.levelId === levelId);   // :1221
 *     const adjustments = WallJoinResolver.resolveLevel(levelWalls, {…});      // :1232
 *     adjustments.forEach((adjustment, wallId) => {                            // :1291
 *         builder.buildWall(updated, adjustment, …);                           // :1543  ← UNCONDITIONAL
 *     });
 *
 * `buildWall` at :1543 is called directly — it does NOT consult the builder's
 * `_lastBuiltVersion` dirty cache (that guard lives in `updateWall`/
 * `_buildWallInternal`). So EVERY wall the resolver returns an adjustment for gets
 * its body re-extruded, and every opening-bearing one of those re-runs the
 * hole-extrude (CSG) pass — on the main thread, synchronously, inside one flush.
 *
 * ADR-0099 "Consequences" explicitly DEFERRED making `resolveLevel` incremental
 * for a single moved wall. This test puts a NUMBER on what that deferral costs.
 *
 * ── What is real here ─────────────────────────────────────────────────────────
 * Real `WallStore`, real `UpdateWallBaselineCommand` (the command the 3D gizmo
 * dispatches on drag-end), real `classifyWallDelta`, real
 * `WallJoinResolver.resolveLevel`, real `WallFragmentBuilder.buildWall`, real
 * `buildWallHoleBodyGeometry`. The only thing reconstructed locally is the
 * COORDINATOR LOOP itself (`replayWholeLevelFlush` below) — `WallRebuildCoordinator`
 * lives in `apps/editor` (L5) and an L1 package may not import it (P-layering).
 * The loop is transcribed line-for-line from `_flush` :1180–1602 and the line
 * numbers above are the citation; the pieces it drives are all the production ones.
 *
 * ── Deliverable ───────────────────────────────────────────────────────────────
 * Rows printed by the MEASUREMENT test: N walls on level → wall bodies rebuilt by
 * ONE wall move, CSG/hole-extrude passes, wall-clock ms. If `rebuilt` scales with
 * N rather than staying ≈1, the cliff is proven.
 *
 * The assertions below are the permanent regression guard: they pin the CURRENT
 * (pre-fix) O(N) behaviour so the eventual incremental-rebuild fix must flip them
 * deliberately, and can never silently regress back.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

// §CSG-COUNTER — wrap the REAL plain-wall hole-extrude entry point
// (`buildWallHoleBodyGeometry`, the Shape-with-holes ExtrudeGeometry pass that
// `WallFragmentBuilder._rebuildPlainWallBodyAsHoleExtrude` runs, :2319).
//
// NOTE (measured, not assumed): this pass fires ONLY for an opening-bearing wall
// with NO miter end (`_hasMiterEnd` gate, WallFragmentBuilder :1966-1971). A
// corner-mitered opening-bearing wall instead builds the before/sill/header/after
// box segments and runs `_mergeWallBodySegments` (mergeGeometries +
// toCreasedNormals) — a different, but equally per-wall-body, geometry pass. The
// honest "opening-body pass" count is therefore reported as `openBodies` (every
// opening-bearing wall body rebuilt), with `extrudes` as the hole-extrude subset.
const csgCalls = { n: 0 };
vi.mock('../src/WallHoleBodyBuilder', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/WallHoleBodyBuilder')>();
    return {
        ...actual,
        buildWallHoleBodyGeometry: (...args: Parameters<typeof actual.buildWallHoleBodyGeometry>) => {
            csgCalls.n += 1;
            return actual.buildWallHoleBodyGeometry(...args);
        },
    };
});

import { WallStore } from '../src/WallStore';
import { WallJoinResolver } from '../src/WallJoinResolver';
import { WallFragmentBuilder } from '../src/WallFragmentBuilder';
import { classifyWallDelta, type WallDeltaEntry } from '../src/WallDeltaClassifier';
import { composeWallGeometryHash } from '../src/composeWallGeometryHash';
import type { WallData } from '../src/WallTypes';
import type { JoinData } from '@pryzm/core-app-model';
import { ProjectContext } from '@pryzm/core-app-model';
import { UpdateWallBaselineCommand } from '@pryzm/command-registry';

const LEVEL_ID = 'level-0';

/** Minimal BimManager/ILevelProvider the WallStore + builder need. */
function makeLevelProvider() {
    const level = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
    return {
        getLevelById: (id: string) => (id === LEVEL_ID ? { ...level } : undefined),
        getLevels: () => [{ ...level }],
    };
}

let _seq = 0;

function mkWall(a: [number, number], b: [number, number], openings: unknown[] = []): WallData {
    return {
        id: `w_${_seq++}`,
        type: 'wall',
        levelId: LEVEL_ID,
        properties: {},
        childrenIds: openings.map((o: any) => o.elementId),
        baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        height: 3,
        thickness: 0.2,
        baseOffset: 0,
        openings,
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 't', version: 1 },
    } as unknown as WallData;
}

function door(i: number) {
    return { id: `op_${i}`, type: 'door', elementId: `door_${i}`, offset: 2, width: 0.9, height: 2.1, sillHeight: 0 };
}

/**
 * A realistic connected floor plate: a grid of rectangular rooms whose walls share
 * endpoints, so the resolver produces real L/T junctions (the production case —
 * every wall participates in at least one join).
 *
 * `doorEveryNth`: 1-in-N walls hosts a door. The MOVED wall always hosts one
 * (the founder's exact trigger).
 */
function buildLevel(n: number, doorEveryNth = 0): { walls: WallData[]; movedId: string } {
    const walls: WallData[] = [];
    const cell = 4;
    const cols = Math.max(2, Math.ceil(Math.sqrt(n / 2)));
    outer: for (let r = 0; ; r++) {
        for (let c = 0; c < cols; c++) {
            if (walls.length >= n) break outer;
            walls.push(mkWall([c * cell, r * cell], [(c + 1) * cell, r * cell]));
            if (walls.length >= n) break outer;
            walls.push(mkWall([c * cell, r * cell], [c * cell, (r + 1) * cell]));
        }
    }
    if (doorEveryNth > 0) {
        walls.forEach((w, i) => {
            if (i % doorEveryNth === 0) {
                (w as any).openings = [door(i)];
                (w as any).childrenIds = [`door_${i}`];
            }
        });
    }
    // The moved wall HOSTS a door — the founder's trigger.
    const moved = walls[Math.floor(walls.length / 2)]!;
    (moved as any).openings = [door(9999)];
    (moved as any).childrenIds = ['door_9999'];
    return { walls, movedId: moved.id };
}

interface Measurement {
    n: number;
    classification: string;
    reason: string;
    /** Wall BODIES re-extruded by the one move (the `buildWall` fan-out). */
    rebuilt: number;
    /** Of those, how many were opening-bearing → ran an opening-body (CSG-class) pass. */
    openBodies: number;
    /** Of those, how many ran the Shape-with-holes ExtrudeGeometry pass specifically. */
    extrudes: number;
    ms: number;
    resolveMs: number;
}

/**
 * Transcription of `WallRebuildCoordinator._flush` :1180–1602 (the whole-level
 * branch), driving the real resolver + the real fragment builder. Returns the
 * number of wall bodies rebuilt.
 */
function replayWholeLevelFlush(
    batch: WallDeltaEntry[],
    store: WallStore,
    builder: WallFragmentBuilder,
    /**
     * §PERF-WALL-MOVE-INCREMENTAL-REBUILD — the coordinator's `_lastBuildKey` memo
     * (WallRebuildCoordinator :135ff). wallId → content hash of the exact arguments
     * `buildWall(wall, joinData, renderMap, worldY)` last consumed.
     */
    lastBuildKey: Map<string, string>,
    /** false → replay the PRE-FIX unconditional `buildWall` at :1543. */
    incremental: boolean,
): { classification: string; reason: string; rebuilt: number; openBodies: number; skippedClean: number; resolveMs: number } {
    let rebuilt = 0;
    let openBodies = 0;
    const build = (w: WallData, adj: unknown): void => {
        builder.buildWall(w, adj as never, undefined, 0);
        rebuilt += 1;
        if ((w.openings?.length ?? 0) > 0) openBodies += 1;
    };

    // ── ADR-057 gate (coordinator :1180) ──────────────────────────────────────
    const delta = classifyWallDelta(batch);
    if (delta.kind === 'openings-only') {
        // Fast path: rebuild ONLY the touched wall bodies; no resolveLevel.
        for (const id of delta.wallIds) {
            const w = store.getById(id);
            if (w) { lastBuildKey.delete(id); build(w as WallData, null); }
        }
        return { classification: 'openings-only', reason: '-', rebuilt, openBodies, skippedClean: 0, resolveMs: 0 };
    }

    // ── Whole-level path (coordinator :1211–1602) ─────────────────────────────
    // NB: 'moved-wall' does NOT get a fast path — it falls through to the FULL
    // whole-level solve, exactly as the coordinator does. The incrementality is in
    // the BUILD gate below, not in the resolve.
    const levelWalls = store.getAll().filter(w => w.levelId === LEVEL_ID);           // :1221
    const t0 = performance.now();
    const adjustments = WallJoinResolver.resolveLevel(levelWalls as WallData[]);      // :1232
    const resolveMs = performance.now() - t0;

    let skippedClean = 0;
    adjustments.forEach((adjustment, wallId) => {                                     // :1291
        const updated = store.getById(wallId);
        if (!updated) return;
        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — the fix (coordinator :1543). `buildWall`
        // is a deterministic function of (wall, joinData, renderMap, worldY); if the
        // content hash of those is unchanged the mesh it would emit is byte-identical to
        // the one already in the scene, so the call is a provable no-op. Skip it.
        const key = composeWallGeometryHash(updated as WallData, adjustment as JoinData, 0) + '|y0';
        if (incremental && lastBuildKey.get(wallId) === key) { skippedClean += 1; return; }
        build(updated as WallData, adjustment);
        lastBuildKey.set(wallId, key);
    });
    // Batch walls the resolver produced no adjustment for still get updateWall (:1610).
    for (const e of batch) {
        if (!adjustments.has(e.wall.id)) {
            const fresh = store.getById(e.wall.id);
            if (fresh) {
                lastBuildKey.delete(e.wall.id);
                builder.updateWall(fresh as WallData, null, undefined, 0);
                rebuilt += 1;
            }
        }
    }
    return { classification: delta.kind, reason: delta.kind === 'whole-level' ? delta.reason : '-', rebuilt, openBodies, skippedClean, resolveMs };
}

/** Seed a level of N walls, then move ONE hosted-door wall through the real command. */
function measureMove(n: number, doorEveryNth = 0, incremental = true): Measurement {
    _seq = 0;
    csgCalls.n = 0;

    const { walls, movedId } = buildLevel(n, doorEveryNth);
    const store = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, makeLevelProvider());
    const lastBuildKey = new Map<string, string>();

    // §WALL-JOIN-INTENT (L-927) — seed under HYDRATION, because that is what this
    // fixture models. `buildLevel` emits a synthetic 200-wall GRID in loop order, and the
    // settle step below states its own intent: "an initial whole-level build, exactly as
    // project-open does". Project-open IS hydration.
    //
    // Without this, `WallStore.add()` would read the loop's emission order as an
    // AUTHORING GESTURE and stamp `joinIntent: 'butt'` across the grid's 3- and 4-way
    // junctions — freezing those corners, skipping their mitre-prism extrusions, and
    // quietly dropping `denseBefore.extrudes` from >10 to 4. That would not be a cheaper
    // BEFORE column, it would be a DIFFERENT one: the cliff this test exists to pin is
    // the pre-fix rebuild cost, and it must not move because a fixture's array order was
    // reinterpreted as intent. A loaded project carries no derived stamps by design (see
    // WallStore._hydrating), so this also matches what the measured scenario really is.
    store.hydrate(() => {
        for (const w of walls) store.add({ ...w } as WallData);
    });

    // Settle: an initial whole-level build, exactly as project-open does. Its cost
    // is NOT part of the measurement. It also primes the `_lastBuildKey` memo — which
    // is exactly what happens in production (the first flush after a project open
    // builds every wall and records what it built).
    const seedBatch: WallDeltaEntry[] = [];
    replayWholeLevelFlush(
        seedBatch.length ? seedBatch : [{ event: 'add', wall: store.getById(movedId)! }],
        store, builder, lastBuildKey, incremental,
    );

    // ── The founder's edit ───────────────────────────────────────────────────
    // Collect the store delta exactly as WallRebuildCoordinator's subscriber does
    // (`subscribe((event, wall, prevState) => …)`, coordinator :299).
    const batch = new Map<string, WallDeltaEntry>();
    const unsub = store.subscribe((event, wall, prevState) => {
        batch.set(wall.id, { event: event as WallDeltaEntry['event'], wall, prevState });
    });

    const before = store.getById(movedId)!;
    const bl = before.baseLine;
    // The 3D gizmo drag-end dispatch: a pure TRANSLATION of both endpoints.
    const cmd = new UpdateWallBaselineCommand({
        wallId: movedId,
        newBaseLine: [
            { x: bl[0].x + 0.5, y: bl[0].y, z: bl[0].z + 0.5 },
            { x: bl[1].x + 0.5, y: bl[1].y, z: bl[1].z + 0.5 },
        ],
    });

    csgCalls.n = 0;
    const t0 = performance.now();
    const res = cmd.execute({ stores: { wallStore: store } } as any);
    const flush = replayWholeLevelFlush(Array.from(batch.values()), store, builder, lastBuildKey, incremental);
    const ms = performance.now() - t0;
    unsub();

    expect(res.success).toBe(true);

    return {
        n,
        classification: flush.classification,
        reason: flush.reason,
        rebuilt: flush.rebuilt,
        openBodies: flush.openBodies,
        extrudes: csgCalls.n,
        ms,
        resolveMs: flush.resolveMs,
    };
}

describe('§DIAG-WALL-MOVE-REBUILD-COST — cost of moving ONE wall on a level of N (L-234)', () => {
    beforeEach(() => { _seq = 0; csgCalls.n = 0; });

    it('a baseline move classifies as `moved-wall` — NOT the ADR-057 openings-only fast path', () => {
        _seq = 0;
        const prev = mkWall([0, 0], [4, 0], [door(1)]);
        const next = { ...prev, baseLine: [{ x: 0.5, y: 0, z: 0.5 }, { x: 4.5, y: 0, z: 0.5 }] } as WallData;

        // A door OFFSET edit → fast path (this is what ADR-057 was built for). UNCHANGED.
        const openingEdit = { ...prev, openings: [{ ...door(1), offset: 2.4 }] } as WallData;
        expect(classifyWallDelta([{ event: 'update', wall: openingEdit, prevState: prev }]).kind)
            .toBe('openings-only');

        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD — a wall MOVE is now classified
        // `moved-wall`. It is STILL NOT admitted to the openings-only fast path (a move
        // genuinely changes junction geometry, so `resolveLevel` + the V2 miter cache
        // MUST still run whole-level); the new kind exists so the consumer can name the
        // moved wall and apply the incremental BUILD gate.
        const moveDelta = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(moveDelta.kind).toBe('moved-wall');
        expect(moveDelta.kind === 'moved-wall' && moveDelta.movedWallIds).toEqual([prev.id]);

        // NOT relaxed: a thickness change is still whole-level/join-geometry-changed.
        const thicker = { ...prev, thickness: 0.3 } as WallData;
        const thickDelta = classifyWallDelta([{ event: 'update', wall: thicker, prevState: prev }]);
        expect(thickDelta.kind).toBe('whole-level');
        expect(thickDelta.kind === 'whole-level' && thickDelta.reason).toBe('join-geometry-changed');
    });

    it('MEASUREMENT — N walls on level → wall bodies rebuilt by ONE hosted-door wall move', () => {
        // BEFORE = the pre-fix unconditional `buildWall` at coordinator :1543.
        // AFTER  = the same flush with §PERF-WALL-MOVE-INCREMENTAL-REBUILD's build gate.
        // Everything else (real store, real command, real resolveLevel, real builder) is
        // identical between the two columns.
        const before: Measurement[] = [];
        const after:  Measurement[] = [];
        for (const n of [5, 50, 200]) {
            before.push(measureMove(n, 0, /* incremental */ false));
            after .push(measureMove(n, 0, /* incremental */ true));
        }
        // Realistic door density (1 wall in 4 hosts a door) — how the opening-body
        // (CSG-class) passes scale with the LEVEL rather than with the edit.
        const denseBefore = measureMove(200, 4, false);
        const denseAfter  = measureMove(200, 4, true);

        const fmt = (b: Measurement, a: Measurement, label: string) =>
            `${label}\t${b.rebuilt}\t→ ${a.rebuilt}\t\t${b.openBodies}\t→ ${a.openBodies}\t\t` +
            `${b.extrudes}\t→ ${a.extrudes}\t\t${b.ms.toFixed(0)}\t→ ${a.ms.toFixed(0)}\t\t` +
            `${b.resolveMs.toFixed(0)}\t→ ${a.resolveMs.toFixed(0)}`;
        // eslint-disable-next-line no-console
        console.log(
            '\n§PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234) — ONE hosted-door wall move on a level of N walls' +
            '\n            BEFORE → AFTER on every column\n' +
            'N\trebuilt\t\topenBodies\textrudes\t\tms\t\tresolveLevelMs\n' +
            before.map((b, i) => fmt(b, after[i]!, String(b.n))).join('\n') + '\n' +
            fmt(denseBefore, denseAfter, '200*') + '   (* 1-in-4 walls hosts a door)\n',
        );

        // Every move classifies `moved-wall` and STILL takes the full whole-level solve.
        for (const r of [...before, ...after]) expect(r.classification).toBe('moved-wall');

        // ── THE CLIFF — pinned as the BEFORE column, so it can never come back ──────
        const [b5, b50, b200] = before;
        expect(b5.rebuilt).toBeGreaterThanOrEqual(b5.n - 1);
        expect(b50.rebuilt).toBeGreaterThanOrEqual(b50.n * 0.8);
        expect(b200.rebuilt).toBeGreaterThanOrEqual(b200.n * 0.8);
        expect(denseBefore.openBodies).toBeGreaterThan(40);   // re-cut ~1-in-4 of 200 doors
        expect(denseBefore.extrudes).toBeGreaterThan(10);

        // ── THE FIX — rebuilt is now O(affected), NOT O(level) ─────────────────────
        // A one-wall drag touches the moved wall plus the handful of walls whose join
        // geometry it actually perturbs. It must NOT scale with the size of the plate.
        const [a5, a50, a200] = after;
        const AFFECTED_MAX = 8;
        for (const r of after) {
            expect(r.rebuilt).toBeGreaterThanOrEqual(1);       // the moved wall itself, always
            expect(r.rebuilt).toBeLessThanOrEqual(AFFECTED_MAX);
        }
        // FLAT in N — the whole point. A 40× bigger level costs the same rebuild count.
        expect(a200.rebuilt).toBeLessThanOrEqual(a5.rebuilt + 2);
        expect(a50.rebuilt).toBeLessThan(b50.rebuilt / 5);
        expect(a200.rebuilt).toBeLessThan(b200.rebuilt / 20);

        // The founder's edit touches ONE door — and now re-cuts ONE door, even on a
        // level where 1 wall in 4 hosts one. This is the hosted-door freeze, gone.
        for (const r of after) expect(r.openBodies).toBeLessThanOrEqual(2);
        expect(denseAfter.openBodies).toBeLessThanOrEqual(AFFECTED_MAX);
        expect(denseAfter.openBodies).toBeLessThan(denseBefore.openBodies / 5);

        // §GATE-TEST-ESTATE-NOT-A-CI-GATE (L-247) — THIS ASSERTION USED TO BE A WALL-CLOCK
        // RATIO, AND IT WAS FLAKY BY CONSTRUCTION:
        //
        //     expect(a200.resolveMs).toBeLessThan(b200.resolveMs * 1.25);
        //
        // It passed when the file ran alone and FAILED under full-suite load — because it
        // compares two timings taken on a shared, contended runner. That is not a property of
        // the code; it is a property of the machine that happened to run it. A gate that goes
        // red when the CI box is busy teaches everyone to ignore the gate, which is precisely
        // the disease L-247 exists to cure — so it does not get to live here.
        //
        // Wall-clock stays in the printed table above, where it belongs: as an OBSERVATION a
        // human reads, not an assertion a machine enforces. Every claim this suite actually
        // makes is a COUNT — wall bodies rebuilt, opening bodies re-cut, CSG extrudes — and
        // counts are deterministic, machine-independent, and exactly what L-234 set out to
        // bound. The O(level) cliff cannot silently return, because the counts above forbid it.
        //
        // If a future change needs to guard resolve COST, guard the thing that CAUSES it — the
        // number of `resolveLevel` invocations, or the allocations inside it — never the
        // milliseconds it took on someone's laptop. Deliberately NO replacement assertion here:
        // a green-by-construction stand-in would be worse than nothing, because it would look
        // like a guard while guarding nothing.
    });
});
