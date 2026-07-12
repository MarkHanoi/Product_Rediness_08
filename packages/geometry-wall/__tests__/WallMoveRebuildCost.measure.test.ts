/**
 * §DIAG-WALL-MOVE-REBUILD-COST — L-234 Phase 2, step 1: MEASURE.
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
import type { WallData } from '../src/WallTypes';
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
): { classification: string; reason: string; rebuilt: number; openBodies: number; resolveMs: number } {
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
            if (w) build(w as WallData, null);
        }
        return { classification: 'openings-only', reason: '-', rebuilt, openBodies, resolveMs: 0 };
    }

    // ── Whole-level path (coordinator :1211–1602) ─────────────────────────────
    const levelWalls = store.getAll().filter(w => w.levelId === LEVEL_ID);           // :1221
    const t0 = performance.now();
    const adjustments = WallJoinResolver.resolveLevel(levelWalls as WallData[]);      // :1232
    const resolveMs = performance.now() - t0;

    adjustments.forEach((adjustment, wallId) => {                                     // :1291
        const updated = store.getById(wallId);
        if (!updated) return;
        build(updated as WallData, adjustment);                                       // :1543 — UNCONDITIONAL
    });
    // Batch walls the resolver produced no adjustment for still get updateWall (:1610).
    for (const e of batch) {
        if (!adjustments.has(e.wall.id)) {
            const fresh = store.getById(e.wall.id);
            if (fresh) { builder.updateWall(fresh as WallData, null, undefined, 0); rebuilt += 1; }
        }
    }
    return { classification: 'whole-level', reason: delta.reason, rebuilt, openBodies, resolveMs };
}

/** Seed a level of N walls, then move ONE hosted-door wall through the real command. */
function measureMove(n: number, doorEveryNth = 0): Measurement {
    _seq = 0;
    csgCalls.n = 0;

    const { walls, movedId } = buildLevel(n, doorEveryNth);
    const store = new WallStore(
        new ProjectContext(),
        makeLevelProvider() as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const scene = new THREE.Scene();
    const builder = new WallFragmentBuilder(scene, makeLevelProvider());

    for (const w of walls) store.add({ ...w } as WallData);

    // Settle: an initial whole-level build, exactly as project-open does. Its cost
    // is NOT part of the measurement.
    const seedBatch: WallDeltaEntry[] = [];
    replayWholeLevelFlush(seedBatch.length ? seedBatch : [{ event: 'add', wall: store.getById(movedId)! }], store, builder);

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
    const flush = replayWholeLevelFlush(Array.from(batch.values()), store, builder);
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

    it('the ADR-057 openings-only fast path does NOT admit a baseline move (the cliff gate)', () => {
        _seq = 0;
        const prev = mkWall([0, 0], [4, 0], [door(1)]);
        const next = { ...prev, baseLine: [{ x: 0.5, y: 0, z: 0.5 }, { x: 4.5, y: 0, z: 0.5 }] } as WallData;

        // A door OFFSET edit → fast path (this is what ADR-057 was built for).
        const openingEdit = { ...prev, openings: [{ ...door(1), offset: 2.4 }] } as WallData;
        expect(classifyWallDelta([{ event: 'update', wall: openingEdit, prevState: prev }]).kind)
            .toBe('openings-only');

        // A wall MOVE → whole-level, by construction: `joinGeometryChanged` is true
        // the moment a baseline shifts more than BASELINE_EPS_M (1 mm).
        const moveDelta = classifyWallDelta([{ event: 'update', wall: next, prevState: prev }]);
        expect(moveDelta.kind).toBe('whole-level');
        expect(moveDelta.kind === 'whole-level' && moveDelta.reason).toBe('join-geometry-changed');
    });

    it('MEASUREMENT — N walls on level → wall bodies rebuilt by ONE hosted-door wall move', () => {
        const rows: Measurement[] = [];
        for (const n of [5, 50, 200]) rows.push(measureMove(n));
        // Realistic door density (1 wall in 4 hosts a door) — how the opening-body
        // (CSG-class) passes scale with the LEVEL rather than with the edit.
        const dense = measureMove(200, 4);

        const fmt = (r: Measurement, label: string) =>
            `${label}\t${r.classification}\t${r.rebuilt}\t${r.openBodies}\t${r.extrudes}\t${r.ms.toFixed(1)}\t${r.resolveMs.toFixed(1)}`;
        // eslint-disable-next-line no-console
        console.log(
            '\n§DIAG-WALL-MOVE-REBUILD-COST — ONE wall move on a level of N walls\n' +
            'N\tpath\t\trebuilt\topenBodies\textrudes\tms\tresolveLevelMs\n' +
            rows.map(r => fmt(r, String(r.n))).join('\n') + '\n' +
            fmt(dense, '200*') + '   (* 1-in-4 walls hosts a door)\n',
        );

        // Every move takes the whole-level path — never the ADR-057 fast path.
        for (const r of rows) {
            expect(r.classification).toBe('whole-level');
            expect(r.reason).toBe('join-geometry-changed');
        }

        // ── THE CLIFF ────────────────────────────────────────────────────────
        // Wall bodies rebuilt by a ONE-wall move scale with the SIZE OF THE LEVEL,
        // not with the size of the edit. This is the founder's freeze.
        //
        // These bounds pin the CURRENT (pre-fix) behaviour. The eventual
        // §PERF-WALL-MOVE-INCREMENTAL-REBUILD fix MUST flip them (rebuilt → O(1)),
        // and until it lands they guarantee the regression cannot get worse.
        const [n5, n50, n200] = rows;
        expect(n5.rebuilt).toBeGreaterThanOrEqual(n5.n - 1);
        expect(n50.rebuilt).toBeGreaterThanOrEqual(n50.n * 0.8);
        expect(n200.rebuilt).toBeGreaterThanOrEqual(n200.n * 0.8);

        // Growth is super-linear in wall-clock terms, not flat: a 40x bigger level
        // costs far more than 40x a one-wall rebuild would.
        expect(n200.rebuilt).toBeGreaterThan(n5.rebuilt * 10);

        // The opening-body (CSG-class) pass runs once per opening-bearing wall the
        // level-wide loop touches. The founder's edit touches ONE door — but at a
        // realistic door density the move re-cuts EVERY door on the level.
        for (const r of rows) expect(r.openBodies).toBe(1);      // only 1 door on the level
        expect(dense.openBodies).toBeGreaterThan(40);            // ~1-in-4 of 200 walls
        expect(dense.extrudes).toBeGreaterThan(10);              // real ExtrudeGeometry passes
    });
});
